import { describe, expect, test, vi } from "vitest";

import { armScheduler, handleSchedulerRequest } from "./worker";

describe("scheduler Worker", () => {
  test("serves redacted scheduler health without caching", async () => {
    const health = { lastMiss: null, lastSuccess: null, status: "unarmed" } as const;
    const scheduler = {
      getHealth: vi.fn().mockResolvedValue(health),
      triggerCanary: vi.fn(),
    };

    const response = await handleSchedulerRequest({
      canaryToken: undefined,
      credentialsReady: false,
      now: vi.fn(),
      request: new Request("https://scheduler.test/health"),
      scheduler,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(health);
    expect(scheduler.getHealth).toHaveBeenCalledOnce();
  });

  test("rejects an unauthenticated fast canary", async () => {
    const scheduler = {
      getHealth: vi.fn(),
      triggerCanary: vi.fn(),
    };

    const response = await handleSchedulerRequest({
      canaryToken: "canary-secret",
      credentialsReady: true,
      now: vi.fn(),
      request: new Request("https://scheduler.test/canary", { method: "POST" }),
      scheduler,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(scheduler.triggerCanary).not.toHaveBeenCalled();
  });

  test("rejects a fast canary with the wrong bearer token", async () => {
    const scheduler = {
      getHealth: vi.fn(),
      triggerCanary: vi.fn(),
    };

    const response = await handleSchedulerRequest({
      canaryToken: "canary-secret",
      credentialsReady: true,
      now: vi.fn(),
      request: new Request("https://scheduler.test/canary", {
        headers: { Authorization: "Bearer wrong--secret" },
        method: "POST",
      }),
      scheduler,
    });

    expect(response.status).toBe(401);
    expect(scheduler.triggerCanary).not.toHaveBeenCalled();
  });

  test("keeps the fast canary disabled without both secrets", async () => {
    const scheduler = {
      getHealth: vi.fn(),
      triggerCanary: vi.fn(),
    };

    const response = await handleSchedulerRequest({
      canaryToken: undefined,
      credentialsReady: true,
      now: vi.fn(),
      request: new Request("https://scheduler.test/canary", {
        headers: { Authorization: "Bearer canary-secret" },
        method: "POST",
      }),
      scheduler,
    });

    expect(response.status).toBe(503);
    expect(scheduler.triggerCanary).not.toHaveBeenCalled();
  });

  test("starts an authenticated fast canary immediately", async () => {
    const now = Date.parse("2026-09-04T00:10:00Z");
    const scheduler = {
      getHealth: vi.fn(),
      triggerCanary: vi.fn().mockResolvedValue({ kind: "tracking" }),
    };

    const response = await handleSchedulerRequest({
      canaryToken: "canary-secret",
      credentialsReady: true,
      now: () => now,
      request: new Request("https://scheduler.test/canary", {
        headers: { Authorization: "Bearer canary-secret" },
        method: "POST",
      }),
      scheduler,
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ kind: "tracking" });
    expect(scheduler.triggerCanary).toHaveBeenCalledWith(now);
  });

  test("reports a conflicting fast canary without dispatching another run", async () => {
    const scheduler = {
      getHealth: vi.fn(),
      triggerCanary: vi.fn().mockResolvedValue({ kind: "busy" }),
    };

    const response = await handleSchedulerRequest({
      canaryToken: "canary-secret",
      credentialsReady: true,
      now: vi.fn().mockReturnValue(Date.now()),
      request: new Request("https://scheduler.test/canary", {
        headers: { Authorization: "Bearer canary-secret" },
        method: "POST",
      }),
      scheduler,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ kind: "busy" });
  });

  test("the watchdog arms the named scheduler at its scheduled time", async () => {
    const scheduledTime = Date.parse("2026-09-04T00:15:00Z");
    const scheduler = { ensureArmed: vi.fn().mockResolvedValue(undefined) };

    await armScheduler({ credentialsReady: true, scheduler, scheduledTime });

    expect(scheduler.ensureArmed).toHaveBeenCalledWith(scheduledTime);
  });

  test("the watchdog leaves the scheduler unarmed without credentials", async () => {
    const scheduler = { ensureArmed: vi.fn() };

    await armScheduler({ credentialsReady: false, scheduler, scheduledTime: Date.now() });

    expect(scheduler.ensureArmed).not.toHaveBeenCalled();
  });
});
