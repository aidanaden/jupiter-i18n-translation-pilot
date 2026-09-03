import { describe, expect, test, vi } from "vitest";

import { SchedulerService, nextHourlySlot } from "./scheduler-service";

describe("Crowdin export scheduler", () => {
  test("arms for the next minute 17 UTC slot", () => {
    expect(nextHourlySlot(Date.parse("2026-09-04T00:10:00Z"))).toBe(
      Date.parse("2026-09-04T00:17:00Z"),
    );
    expect(nextHourlySlot(Date.parse("2026-09-04T00:17:00Z"))).toBe(
      Date.parse("2026-09-04T01:17:00Z"),
    );
  });

  test("the watchdog arms an empty scheduler without dispatching", async () => {
    const now = Date.parse("2026-09-04T00:10:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await scheduler.ensureArmed(now);

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        kind: "waiting",
        nextDueAt: Date.parse("2026-09-04T00:17:00Z"),
      },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(Date.parse("2026-09-04T00:17:00Z"));
    expect(github.dispatch).not.toHaveBeenCalled();
  });

  test("a fast canary starts immediately and preserves the next hourly cadence", async () => {
    const now = Date.parse("2026-09-04T00:10:00Z");
    const resumeAt = Date.parse("2026-09-04T00:17:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          kind: "waiting",
          nextDueAt: resumeAt,
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn().mockResolvedValue({ id: 42, url: "https://github.test/runs/42" }),
      findRun: vi.fn().mockResolvedValue(null),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.triggerCanary(now)).resolves.toEqual({ kind: "tracking" });

    const dispatchId = `crowdin-export-${now}-attempt-1`;
    expect(github.dispatch).toHaveBeenCalledWith({
      dispatchId,
      scheduledFor: "2026-09-04T00:10:00.000Z",
    });
    expect(storage.write).toHaveBeenLastCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        attempt: 1,
        deadlineAt: Date.parse("2026-09-04T01:40:00Z"),
        dispatchId,
        dueAt: now,
        kind: "tracking",
        nextPollAt: Date.parse("2026-09-04T00:10:30Z"),
        runId: 42,
        runUrl: "https://github.test/runs/42",
        schedule: { kind: "canary", resumeAt },
      },
    });
  });

  test("a canary completed after minute 17 restores the pending hourly run", async () => {
    const dueAt = Date.parse("2026-09-04T00:10:00Z");
    const resumeAt = Date.parse("2026-09-04T00:17:00Z");
    const completedAt = Date.parse("2026-09-04T00:18:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt: Date.parse("2026-09-04T01:40:00Z"),
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: completedAt,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "canary", resumeAt },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn().mockResolvedValue({ completedAt, kind: "succeeded" }),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.handleAlarm(completedAt)).resolves.toEqual({
      completedAt,
      kind: "completed",
      runId: 42,
    });

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: {
        completedAt,
        dueAt,
        kind: "recorded",
        runId: 42,
        runUrl: "https://github.test/runs/42",
      },
      state: { kind: "waiting", nextDueAt: resumeAt },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(resumeAt);
  });

  test("a canary SLO miss restores the pending hourly run", async () => {
    const dueAt = Date.parse("2026-09-04T00:10:00Z");
    const resumeAt = Date.parse("2026-09-04T00:17:00Z");
    const deadlineAt = Date.parse("2026-09-04T01:40:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: deadlineAt,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "canary", resumeAt },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn().mockResolvedValue({ kind: "pending" }),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.handleAlarm(deadlineAt)).resolves.toEqual({
      dueAt,
      kind: "slo-missed",
      missedAt: deadlineAt,
    });

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: {
        dueAt,
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        kind: "recorded",
        missedAt: deadlineAt,
      },
      lastSuccess: { kind: "none" },
      state: {
        dueAt,
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        kind: "slo-missed",
        missedAt: deadlineAt,
        nextDueAt: resumeAt,
      },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(resumeAt);
  });

  test("a fast canary refuses to overlap an active run", async () => {
    const now = Date.parse("2026-09-04T00:10:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt: Date.parse("2026-09-04T01:47:00Z"),
          dispatchId: "crowdin-export-active-attempt-1",
          dueAt: Date.parse("2026-09-04T00:17:00Z"),
          kind: "tracking",
          nextPollAt: now,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn(),
      setAlarm: vi.fn(),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.triggerCanary(now)).resolves.toEqual({ kind: "busy" });

    expect(storage.write).not.toHaveBeenCalled();
    expect(github.dispatch).not.toHaveBeenCalled();
  });

  test("a due alarm persists its dispatch ID before starting one GitHub run", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: { kind: "waiting", nextDueAt: dueAt },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn().mockResolvedValue({ id: 42, url: "https://github.test/runs/42" }),
      findRun: vi.fn().mockResolvedValue(null),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await scheduler.handleAlarm(dueAt);

    const dispatchId = `crowdin-export-${dueAt}-attempt-1`;
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    expect(storage.write).toHaveBeenNthCalledWith(1, {
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        attempt: 1,
        deadlineAt,
        dispatchId,
        dueAt,
        kind: "dispatch-pending",
        nextAttemptAt: dueAt,
        schedule: { kind: "hourly" },
      },
    });
    expect(github.findRun).toHaveBeenCalledWith(dispatchId);
    expect(github.dispatch).toHaveBeenCalledWith({
      dispatchId,
      scheduledFor: "2026-09-04T00:17:00.000Z",
    });
    expect(storage.write).toHaveBeenNthCalledWith(2, {
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        attempt: 1,
        deadlineAt,
        dispatchId,
        dueAt,
        kind: "tracking",
        nextPollAt: Date.parse("2026-09-04T00:17:30Z"),
        runId: 42,
        runUrl: "https://github.test/runs/42",
        schedule: { kind: "hourly" },
      },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(Date.parse("2026-09-04T00:17:30Z"));
  });

  test("a retried alarm adopts an existing run instead of dispatching twice", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const now = Date.parse("2026-09-04T00:22:00Z");
    const dispatchId = `crowdin-export-${dueAt}-attempt-1`;
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId,
          dueAt,
          kind: "dispatch-pending",
          nextAttemptAt: now,
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn().mockResolvedValue({ id: 42, url: "https://github.test/runs/42" }),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await scheduler.handleAlarm(now);

    expect(github.findRun).toHaveBeenCalledWith(dispatchId);
    expect(github.dispatch).not.toHaveBeenCalled();
    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        attempt: 1,
        deadlineAt,
        dispatchId,
        dueAt,
        kind: "tracking",
        nextPollAt: Date.parse("2026-09-04T00:22:30Z"),
        runId: 42,
        runUrl: "https://github.test/runs/42",
        schedule: { kind: "hourly" },
      },
    });
  });

  test("a transient GitHub failure keeps the stable ID and schedules another attempt", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const now = Date.parse("2026-09-04T00:22:00Z");
    const dispatchId = `crowdin-export-${dueAt}-attempt-1`;
    const pendingState = {
      attempt: 1,
      deadlineAt: Date.parse("2026-09-04T01:47:00Z"),
      dispatchId,
      dueAt,
      kind: "dispatch-pending",
      nextAttemptAt: now,
      schedule: { kind: "hourly" },
    };
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: pendingState,
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn().mockRejectedValue(new Error("request failed with a sensitive response")),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.handleAlarm(now)).resolves.toEqual({
      kind: "retry-scheduled",
      retryAt: Date.parse("2026-09-04T00:27:00Z"),
    });

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        ...pendingState,
        nextAttemptAt: Date.parse("2026-09-04T00:27:00Z"),
      },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(Date.parse("2026-09-04T00:27:00Z"));
    expect(JSON.stringify(storage.write.mock.calls)).not.toContain("sensitive");
  });

  test("a successful tracked run records the SLO result and advances the clock", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const completedAt = Date.parse("2026-09-04T00:18:00Z");
    const trackingState = {
      attempt: 1,
      deadlineAt: Date.parse("2026-09-04T01:47:00Z"),
      dispatchId: `crowdin-export-${dueAt}-attempt-1`,
      dueAt,
      kind: "tracking",
      nextPollAt: Date.parse("2026-09-04T00:17:30Z"),
      runId: 42,
      runUrl: "https://github.test/runs/42",
      schedule: { kind: "hourly" },
    };
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: trackingState,
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn().mockResolvedValue({ completedAt, kind: "succeeded" }),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.handleAlarm(completedAt)).resolves.toEqual({
      completedAt,
      kind: "completed",
      runId: 42,
    });

    expect(github.getRun).toHaveBeenCalledWith(42);
    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: {
        completedAt,
        dueAt,
        kind: "recorded",
        runId: 42,
        runUrl: "https://github.test/runs/42",
      },
      state: {
        kind: "waiting",
        nextDueAt: Date.parse("2026-09-04T01:17:00Z"),
      },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(Date.parse("2026-09-04T01:17:00Z"));
  });

  test("a failed run schedules a new non-overlapping attempt before the deadline", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const failedAt = Date.parse("2026-09-04T00:20:00Z");
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: failedAt,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn().mockResolvedValue({
        completedAt: failedAt,
        conclusion: "failure",
        kind: "failed",
      }),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.handleAlarm(failedAt)).resolves.toEqual({
      kind: "retry-scheduled",
      retryAt: Date.parse("2026-09-04T00:25:00Z"),
    });

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: {
        attempt: 2,
        deadlineAt,
        dispatchId: `crowdin-export-${dueAt}-attempt-2`,
        dueAt,
        kind: "dispatch-pending",
        nextAttemptAt: Date.parse("2026-09-04T00:25:00Z"),
        schedule: { kind: "hourly" },
      },
    });
  });

  test("a run still pending at 90 minutes records an SLO miss", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: deadlineAt,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn(),
      findRun: vi.fn(),
      getRun: vi.fn().mockResolvedValue({ kind: "pending" }),
    };
    const scheduler = new SchedulerService({ github, storage });

    await expect(scheduler.handleAlarm(deadlineAt)).resolves.toEqual({
      dueAt,
      kind: "slo-missed",
      missedAt: deadlineAt,
    });

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: {
        dueAt,
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        kind: "recorded",
        missedAt: deadlineAt,
      },
      lastSuccess: { kind: "none" },
      state: {
        dueAt,
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        kind: "slo-missed",
        missedAt: deadlineAt,
        nextDueAt: Date.parse("2026-09-04T02:17:00Z"),
      },
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(Date.parse("2026-09-04T02:17:00Z"));
  });

  test("health reports the active run and deadline without transport details", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: {
          completedAt: Date.parse("2026-09-03T23:18:00Z"),
          dueAt: Date.parse("2026-09-03T23:17:00Z"),
          kind: "recorded",
          runId: 40,
          runUrl: "https://github.test/runs/40",
        },
        state: {
          attempt: 1,
          deadlineAt: Date.parse("2026-09-04T01:47:00Z"),
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: Date.parse("2026-09-04T00:18:30Z"),
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn(),
      setAlarm: vi.fn(),
    };
    const scheduler = new SchedulerService({
      github: { dispatch: vi.fn(), findRun: vi.fn(), getRun: vi.fn() },
      storage,
    });

    await expect(scheduler.getHealth()).resolves.toEqual({
      active: {
        attempt: 1,
        deadlineAt: "2026-09-04T01:47:00.000Z",
        dispatchId: `crowdin-export-${dueAt}-attempt-1`,
        dueAt: "2026-09-04T00:17:00.000Z",
        runId: 42,
        runUrl: "https://github.test/runs/42",
      },
      lastMiss: null,
      lastSuccess: {
        completedAt: "2026-09-03T23:18:00.000Z",
        dueAt: "2026-09-03T23:17:00.000Z",
        runId: 40,
        runUrl: "https://github.test/runs/40",
      },
      status: "tracking",
    });
  });

  test("health keeps the latest SLO miss after the scheduler advances", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const missedAt = Date.parse("2026-09-04T01:47:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: {
          dueAt,
          evidence: {
            attempt: 1,
            kind: "run",
            runId: 42,
            runUrl: "https://github.test/runs/42",
          },
          kind: "recorded",
          missedAt,
        },
        lastSuccess: { kind: "none" },
        state: {
          kind: "waiting",
          nextDueAt: Date.parse("2026-09-04T03:17:00Z"),
        },
      }),
      write: vi.fn(),
      setAlarm: vi.fn(),
    };
    const scheduler = new SchedulerService({
      github: { dispatch: vi.fn(), findRun: vi.fn(), getRun: vi.fn() },
      storage,
    });

    await expect(scheduler.getHealth()).resolves.toEqual({
      lastMiss: {
        dueAt: "2026-09-04T00:17:00.000Z",
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        missedAt: "2026-09-04T01:47:00.000Z",
      },
      lastSuccess: null,
      nextDueAt: "2026-09-04T03:17:00.000Z",
      status: "waiting",
    });
  });

  test("an SLO miss does not stop the next hourly export", async () => {
    const priorDueAt = Date.parse("2026-09-04T00:17:00Z");
    const nextDueAt = Date.parse("2026-09-04T02:17:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: {
          dueAt: priorDueAt,
          evidence: {
            attempt: 1,
            kind: "run",
            runId: 42,
            runUrl: "https://github.test/runs/42",
          },
          kind: "recorded",
          missedAt: Date.parse("2026-09-04T01:47:00Z"),
        },
        lastSuccess: { kind: "none" },
        state: {
          dueAt: priorDueAt,
          evidence: {
            attempt: 1,
            kind: "run",
            runId: 42,
            runUrl: "https://github.test/runs/42",
          },
          kind: "slo-missed",
          missedAt: Date.parse("2026-09-04T01:47:00Z"),
          nextDueAt,
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      dispatch: vi.fn().mockResolvedValue({ id: 43, url: "https://github.test/runs/43" }),
      findRun: vi.fn().mockResolvedValue(null),
      getRun: vi.fn(),
    };
    const scheduler = new SchedulerService({ github, storage });

    await scheduler.handleAlarm(nextDueAt);

    expect(github.dispatch).toHaveBeenCalledWith({
      dispatchId: `crowdin-export-${nextDueAt}-attempt-1`,
      scheduledFor: "2026-09-04T02:17:00.000Z",
    });
    expect(storage.setAlarm).toHaveBeenLastCalledWith(Date.parse("2026-09-04T02:17:30Z"));
  });

  test("a run completed after its deadline remains an SLO miss", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    const completedAt = deadlineAt + 1;
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: completedAt,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new SchedulerService({
      github: {
        dispatch: vi.fn(),
        findRun: vi.fn(),
        getRun: vi.fn().mockResolvedValue({ completedAt, kind: "succeeded" }),
      },
      storage,
    });

    await expect(scheduler.handleAlarm(completedAt)).resolves.toEqual({
      dueAt,
      kind: "slo-missed",
      missedAt: completedAt,
    });

    expect(storage.write).toHaveBeenCalledWith({
      lastMiss: {
        dueAt,
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        kind: "recorded",
        missedAt: completedAt,
      },
      lastSuccess: { kind: "none" },
      state: {
        dueAt,
        evidence: {
          attempt: 1,
          kind: "run",
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
        kind: "slo-missed",
        missedAt: completedAt,
        nextDueAt: Date.parse("2026-09-04T02:17:00Z"),
      },
    });
  });

  test("a transport retry near the deadline wakes at the deadline", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const now = Date.parse("2026-09-04T01:46:00Z");
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "dispatch-pending",
          nextAttemptAt: now,
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new SchedulerService({
      github: {
        dispatch: vi.fn(),
        findRun: vi.fn().mockRejectedValue(new Error("network unavailable")),
        getRun: vi.fn(),
      },
      storage,
    });

    await expect(scheduler.handleAlarm(now)).resolves.toEqual({
      kind: "retry-scheduled",
      retryAt: deadlineAt,
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(deadlineAt);
  });

  test("a polling transport failure at the deadline records an SLO miss", async () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const deadlineAt = Date.parse("2026-09-04T01:47:00Z");
    const storage = {
      read: vi.fn().mockResolvedValue({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt,
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: deadlineAt,
          runId: 42,
          runUrl: "https://github.test/runs/42",
          schedule: { kind: "hourly" },
        },
      }),
      write: vi.fn().mockResolvedValue(undefined),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = new SchedulerService({
      github: {
        dispatch: vi.fn(),
        findRun: vi.fn(),
        getRun: vi.fn().mockRejectedValue(new Error("network unavailable")),
      },
      storage,
    });

    await expect(scheduler.handleAlarm(deadlineAt)).resolves.toEqual({
      dueAt,
      kind: "slo-missed",
      missedAt: deadlineAt,
    });
    expect(storage.setAlarm).toHaveBeenCalledWith(Date.parse("2026-09-04T02:17:00Z"));
  });
});
