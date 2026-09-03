import { describe, expect, test } from "vitest";

import { parseSchedulerRecord, schedulerRecordSchema } from "./scheduler-record";

describe("scheduler record boundary", () => {
  test("rejects an unknown persisted state without echoing its contents", () => {
    expect(() =>
      parseSchedulerRecord(
        schedulerRecordSchema.safeParse({
          credential: "must-not-leak",
          lastSuccess: { kind: "none" },
          state: { kind: "invented" },
        }),
      ),
    ).toThrow("Stored scheduler state is invalid");

    try {
      parseSchedulerRecord(
        schedulerRecordSchema.safeParse({
          credential: "must-not-leak",
          state: { kind: "invented" },
        }),
      );
    } catch (error) {
      expect(String(error)).not.toContain("must-not-leak");
    }
  });

  test("normalizes a stored active run from before schedule sources were recorded", () => {
    const dueAt = Date.parse("2026-09-04T00:17:00Z");
    const record = parseSchedulerRecord(
      schedulerRecordSchema.safeParse({
        lastMiss: { kind: "none" },
        lastSuccess: { kind: "none" },
        state: {
          attempt: 1,
          deadlineAt: Date.parse("2026-09-04T01:47:00Z"),
          dispatchId: `crowdin-export-${dueAt}-attempt-1`,
          dueAt,
          kind: "tracking",
          nextPollAt: Date.parse("2026-09-04T00:17:30Z"),
          runId: 42,
          runUrl: "https://github.test/runs/42",
        },
      }),
    );

    expect(record.state).toMatchObject({
      kind: "tracking",
      schedule: { kind: "hourly" },
    });
  });
});
