import type { SchedulerRecord } from "./scheduler-record";

const ONE_HOUR_MS = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const SLO_WINDOW_MS = 90 * 60 * 1000;

type LastSuccess = SchedulerRecord["lastSuccess"];
type LastMiss = SchedulerRecord["lastMiss"];
type DispatchPendingState = Extract<SchedulerRecord["state"], { kind: "dispatch-pending" }>;
type TrackingState = Extract<SchedulerRecord["state"], { kind: "tracking" }>;
type SloMissedState = Extract<SchedulerRecord["state"], { kind: "slo-missed" }>;

type SchedulerStorage = {
  read: () => Promise<SchedulerRecord | null>;
  setAlarm: (scheduledTime: number) => Promise<void>;
  write: (record: SchedulerRecord) => Promise<void>;
};

type GitHubSchedulerClient = {
  dispatch: (input: { dispatchId: string; scheduledFor: string }) => Promise<GitHubRunReference>;
  findRun: (dispatchId: string) => Promise<GitHubRunReference | null>;
  getRun: (runId: number) => Promise<GitHubRunStatus>;
};

type GitHubRunReference = {
  id: number;
  url: string;
};

type GitHubRunStatus =
  | { kind: "failed"; conclusion: string; completedAt: number }
  | { kind: "pending" }
  | { kind: "succeeded"; completedAt: number };

export type AlarmOutcome =
  | { kind: "armed" }
  | { completedAt: number; kind: "completed"; runId: number }
  | { kind: "retry-scheduled"; retryAt: number }
  | { dueAt: number; kind: "slo-missed"; missedAt: number }
  | { kind: "tracking" }
  | { kind: "waiting" };

type LastSuccessHealth = null | {
  completedAt: string;
  dueAt: string;
  runId: number;
  runUrl: string;
};

type LastMissHealth = null | {
  dueAt: string;
  evidence: SloMissedState["evidence"];
  missedAt: string;
};

type SchedulerHealthState =
  | { status: "unarmed" }
  | { nextDueAt: string; status: "waiting" }
  | {
      active: {
        attempt: number;
        deadlineAt: string;
        dispatchId: string;
        dueAt: string;
      };
      retryAt: string;
      status: "dispatch-pending";
    }
  | {
      active: {
        attempt: number;
        deadlineAt: string;
        dispatchId: string;
        dueAt: string;
        runId: number;
        runUrl: string;
      };
      status: "tracking";
    }
  | {
      dueAt: string;
      missedAt: string;
      nextDueAt: string;
      status: "slo-missed";
    };

export type SchedulerHealth = SchedulerHealthState & {
  lastMiss: LastMissHealth;
  lastSuccess: LastSuccessHealth;
};

export function nextHourlySlot(now: number): number {
  const slot = new Date(now);
  slot.setUTCMinutes(17, 0, 0);

  return slot.getTime() > now ? slot.getTime() : slot.getTime() + ONE_HOUR_MS;
}

export class SchedulerService {
  readonly #github: GitHubSchedulerClient;
  readonly #storage: SchedulerStorage;

  constructor({ github, storage }: { github: GitHubSchedulerClient; storage: SchedulerStorage }) {
    this.#github = github;
    this.#storage = storage;
  }

  async ensureArmed(now: number): Promise<void> {
    const record = await this.#storage.read();
    if (record) {
      await this.#storage.setAlarm(alarmTimeFor(record.state));
      return;
    }

    const nextDueAt = nextHourlySlot(now);
    await this.#storage.write({
      lastMiss: { kind: "none" },
      lastSuccess: { kind: "none" },
      state: { kind: "waiting", nextDueAt },
    });
    await this.#storage.setAlarm(nextDueAt);
  }

  async getHealth(): Promise<SchedulerHealth> {
    const record = await this.#storage.read();
    if (!record) {
      return { lastMiss: null, lastSuccess: null, status: "unarmed" };
    }

    const lastSuccess = lastSuccessHealth(record.lastSuccess);
    const lastMiss = lastMissHealth(record.lastMiss);
    switch (record.state.kind) {
      case "waiting":
        return {
          lastMiss,
          lastSuccess,
          nextDueAt: new Date(record.state.nextDueAt).toISOString(),
          status: "waiting",
        };
      case "dispatch-pending":
        return {
          active: {
            attempt: record.state.attempt,
            deadlineAt: new Date(record.state.deadlineAt).toISOString(),
            dispatchId: record.state.dispatchId,
            dueAt: new Date(record.state.dueAt).toISOString(),
          },
          lastMiss,
          lastSuccess,
          retryAt: new Date(record.state.nextAttemptAt).toISOString(),
          status: "dispatch-pending",
        };
      case "tracking":
        return {
          active: {
            attempt: record.state.attempt,
            deadlineAt: new Date(record.state.deadlineAt).toISOString(),
            dispatchId: record.state.dispatchId,
            dueAt: new Date(record.state.dueAt).toISOString(),
            runId: record.state.runId,
            runUrl: record.state.runUrl,
          },
          lastMiss,
          lastSuccess,
          status: "tracking",
        };
      case "slo-missed":
        return {
          dueAt: new Date(record.state.dueAt).toISOString(),
          lastMiss,
          lastSuccess,
          missedAt: new Date(record.state.missedAt).toISOString(),
          nextDueAt: new Date(record.state.nextDueAt).toISOString(),
          status: "slo-missed",
        };
      default: {
        const exhaustive: never = record.state;
        return exhaustive;
      }
    }
  }

  async handleAlarm(now: number): Promise<AlarmOutcome> {
    const record = await this.#storage.read();
    if (!record) {
      await this.ensureArmed(now);
      return { kind: "armed" };
    }

    if (record.state.kind === "waiting") {
      if (record.state.nextDueAt > now) {
        await this.#storage.setAlarm(record.state.nextDueAt);
        return { kind: "waiting" };
      }

      return this.#startSlot(record, record.state.nextDueAt, now);
    }

    if (record.state.kind === "dispatch-pending") {
      if (record.state.nextAttemptAt > now) {
        await this.#storage.setAlarm(record.state.nextAttemptAt);
        return { kind: "waiting" };
      }

      return this.#startOrFindRun(
        { lastMiss: record.lastMiss, lastSuccess: record.lastSuccess, state: record.state },
        now,
      );
    }

    if (record.state.kind === "slo-missed") {
      if (record.state.nextDueAt > now) {
        await this.#storage.setAlarm(record.state.nextDueAt);
        return { kind: "waiting" };
      }

      return this.#startSlot(record, record.state.nextDueAt, now);
    }

    return this.#pollRun(
      { lastMiss: record.lastMiss, lastSuccess: record.lastSuccess, state: record.state },
      now,
    );
  }

  async #startSlot(
    prior: Pick<SchedulerRecord, "lastMiss" | "lastSuccess">,
    dueAt: number,
    now: number,
  ): Promise<AlarmOutcome> {
    const attempt = 1;
    const pending: DispatchPendingState = {
      attempt,
      deadlineAt: dueAt + SLO_WINDOW_MS,
      dispatchId: `crowdin-export-${dueAt}-attempt-${attempt}`,
      dueAt,
      kind: "dispatch-pending",
      nextAttemptAt: now,
    };
    const record = { ...prior, state: pending };
    await this.#storage.write(record);
    return this.#startOrFindRun(record, now);
  }

  async #startOrFindRun(
    record: SchedulerRecord & { state: DispatchPendingState },
    now: number,
  ): Promise<AlarmOutcome> {
    if (now >= record.state.deadlineAt) {
      return this.#markSloMissed(record, now, {
        attempt: record.state.attempt,
        dispatchId: record.state.dispatchId,
        kind: "dispatch",
      });
    }

    let run: GitHubRunReference;
    try {
      const existingRun = await this.#github.findRun(record.state.dispatchId);
      run =
        existingRun ??
        (await this.#github.dispatch({
          dispatchId: record.state.dispatchId,
          scheduledFor: new Date(record.state.dueAt).toISOString(),
        }));
    } catch {
      const retryAt = Math.min(now + RETRY_INTERVAL_MS, record.state.deadlineAt);
      await this.#storage.write({
        ...record,
        state: { ...record.state, nextAttemptAt: retryAt },
      });
      await this.#storage.setAlarm(retryAt);
      return { kind: "retry-scheduled", retryAt };
    }

    const nextPollAt = now + POLL_INTERVAL_MS;
    await this.#storage.write({
      ...record,
      state: {
        attempt: record.state.attempt,
        deadlineAt: record.state.deadlineAt,
        dispatchId: record.state.dispatchId,
        dueAt: record.state.dueAt,
        kind: "tracking",
        nextPollAt,
        runId: run.id,
        runUrl: run.url,
      },
    });
    await this.#storage.setAlarm(nextPollAt);
    return { kind: "tracking" };
  }

  async #pollRun(
    record: SchedulerRecord & { state: TrackingState },
    now: number,
  ): Promise<AlarmOutcome> {
    let status: GitHubRunStatus;
    try {
      status = await this.#github.getRun(record.state.runId);
    } catch {
      if (now >= record.state.deadlineAt) {
        return this.#markSloMissed(record, now, {
          attempt: record.state.attempt,
          kind: "run",
          runId: record.state.runId,
          runUrl: record.state.runUrl,
        });
      }

      const retryAt = Math.min(now + RETRY_INTERVAL_MS, record.state.deadlineAt);
      await this.#storage.write({
        ...record,
        state: { ...record.state, nextPollAt: retryAt },
      });
      await this.#storage.setAlarm(retryAt);
      return { kind: "retry-scheduled", retryAt };
    }

    if (status.kind === "succeeded" && status.completedAt <= record.state.deadlineAt) {
      const nextDueAt = nextHourlySlot(status.completedAt);
      await this.#storage.write({
        lastMiss: record.lastMiss,
        lastSuccess: {
          completedAt: status.completedAt,
          dueAt: record.state.dueAt,
          kind: "recorded",
          runId: record.state.runId,
          runUrl: record.state.runUrl,
        },
        state: { kind: "waiting", nextDueAt },
      });
      await this.#storage.setAlarm(nextDueAt);
      return { completedAt: status.completedAt, kind: "completed", runId: record.state.runId };
    }

    if (status.kind === "succeeded") {
      return this.#markSloMissed(record, status.completedAt, {
        attempt: record.state.attempt,
        kind: "run",
        runId: record.state.runId,
        runUrl: record.state.runUrl,
      });
    }

    if (status.kind === "failed") {
      const retryAt = Math.min(now + RETRY_INTERVAL_MS, record.state.deadlineAt);
      const attempt = record.state.attempt + 1;
      await this.#storage.write({
        ...record,
        state: {
          attempt,
          deadlineAt: record.state.deadlineAt,
          dispatchId: `crowdin-export-${record.state.dueAt}-attempt-${attempt}`,
          dueAt: record.state.dueAt,
          kind: "dispatch-pending",
          nextAttemptAt: retryAt,
        },
      });
      await this.#storage.setAlarm(retryAt);
      return { kind: "retry-scheduled", retryAt };
    }

    if (now >= record.state.deadlineAt) {
      return this.#markSloMissed(record, now, {
        attempt: record.state.attempt,
        kind: "run",
        runId: record.state.runId,
        runUrl: record.state.runUrl,
      });
    }

    const nextPollAt = now + POLL_INTERVAL_MS;
    await this.#storage.write({
      ...record,
      state: { ...record.state, nextPollAt },
    });
    await this.#storage.setAlarm(nextPollAt);
    return { kind: "tracking" };
  }

  async #markSloMissed(
    record: SchedulerRecord,
    missedAt: number,
    evidence: SloMissedState["evidence"],
  ): Promise<AlarmOutcome> {
    const dueAt =
      record.state.kind === "waiting" || record.state.kind === "slo-missed"
        ? record.state.nextDueAt
        : record.state.dueAt;
    const nextDueAt = nextHourlySlot(missedAt);
    await this.#storage.write({
      ...record,
      lastMiss: { dueAt, evidence, kind: "recorded", missedAt },
      state: { dueAt, evidence, kind: "slo-missed", missedAt, nextDueAt },
    });
    await this.#storage.setAlarm(nextDueAt);
    return { dueAt, kind: "slo-missed", missedAt };
  }
}

function lastSuccessHealth(lastSuccess: LastSuccess): LastSuccessHealth {
  if (lastSuccess.kind === "none") {
    return null;
  }

  return {
    completedAt: new Date(lastSuccess.completedAt).toISOString(),
    dueAt: new Date(lastSuccess.dueAt).toISOString(),
    runId: lastSuccess.runId,
    runUrl: lastSuccess.runUrl,
  };
}

function lastMissHealth(lastMiss: LastMiss): LastMissHealth {
  if (lastMiss.kind === "none") {
    return null;
  }

  return {
    dueAt: new Date(lastMiss.dueAt).toISOString(),
    evidence: lastMiss.evidence,
    missedAt: new Date(lastMiss.missedAt).toISOString(),
  };
}

function alarmTimeFor(state: SchedulerRecord["state"]): number {
  switch (state.kind) {
    case "waiting":
      return state.nextDueAt;
    case "dispatch-pending":
      return state.nextAttemptAt;
    case "tracking":
      return state.nextPollAt;
    case "slo-missed":
      return state.nextDueAt;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
