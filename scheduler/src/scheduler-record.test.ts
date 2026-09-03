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
});
