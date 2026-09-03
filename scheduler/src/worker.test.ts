import { describe, expect, test, vi } from "vitest";

import { armScheduler, handleSchedulerRequest } from "./worker";

describe("scheduler Worker", () => {
  test("serves redacted scheduler health without caching", async () => {
    const health = { lastMiss: null, lastSuccess: null, status: "unarmed" } as const;
    const scheduler = { getHealth: vi.fn().mockResolvedValue(health) };

    const response = await handleSchedulerRequest(
      new Request("https://scheduler.test/health"),
      scheduler,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(health);
    expect(scheduler.getHealth).toHaveBeenCalledOnce();
  });

  test("the watchdog arms the named scheduler at its scheduled time", async () => {
    const scheduledTime = Date.parse("2026-09-04T00:15:00Z");
    const scheduler = { ensureArmed: vi.fn().mockResolvedValue(undefined) };

    await armScheduler(scheduler, scheduledTime);

    expect(scheduler.ensureArmed).toHaveBeenCalledWith(scheduledTime);
  });
});
