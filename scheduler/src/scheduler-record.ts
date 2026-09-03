import * as z from "zod/v4-mini";

const timestampSchema = z.int().check(z.nonnegative());
const positiveIntegerSchema = z.int().check(z.positive());
const nonEmptyStringSchema = z.string().check(z.minLength(1));
const runUrlSchema = z.url({ protocol: /^https$/ });

const lastSuccessSchema = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({
    completedAt: timestampSchema,
    dueAt: timestampSchema,
    kind: z.literal("recorded"),
    runId: positiveIntegerSchema,
    runUrl: runUrlSchema,
  }),
]);

const missEvidenceSchema = z.union([
  z.object({
    attempt: positiveIntegerSchema,
    dispatchId: nonEmptyStringSchema,
    kind: z.literal("dispatch"),
  }),
  z.object({
    attempt: positiveIntegerSchema,
    kind: z.literal("run"),
    runId: positiveIntegerSchema,
    runUrl: runUrlSchema,
  }),
]);

const lastMissSchema = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({
    dueAt: timestampSchema,
    evidence: missEvidenceSchema,
    kind: z.literal("recorded"),
    missedAt: timestampSchema,
  }),
]);

const runScheduleSchema = z.union([
  z.object({ kind: z.literal("hourly") }),
  z.object({ kind: z.literal("canary"), resumeAt: timestampSchema }),
]);

const schedulerStateSchema = z.union([
  z.object({
    kind: z.literal("waiting"),
    nextDueAt: timestampSchema,
  }),
  z.object({
    attempt: positiveIntegerSchema,
    deadlineAt: timestampSchema,
    dispatchId: nonEmptyStringSchema,
    dueAt: timestampSchema,
    kind: z.literal("dispatch-pending"),
    nextAttemptAt: timestampSchema,
    schedule: z.optional(runScheduleSchema),
  }),
  z.object({
    attempt: positiveIntegerSchema,
    deadlineAt: timestampSchema,
    dispatchId: nonEmptyStringSchema,
    dueAt: timestampSchema,
    kind: z.literal("tracking"),
    nextPollAt: timestampSchema,
    runId: positiveIntegerSchema,
    runUrl: runUrlSchema,
    schedule: z.optional(runScheduleSchema),
  }),
  z.object({
    dueAt: timestampSchema,
    evidence: missEvidenceSchema,
    kind: z.literal("slo-missed"),
    missedAt: timestampSchema,
    nextDueAt: timestampSchema,
  }),
]);

export const schedulerRecordSchema = z.object({
  lastMiss: lastMissSchema,
  lastSuccess: lastSuccessSchema,
  state: schedulerStateSchema,
});

type StoredSchedulerRecord = z.infer<typeof schedulerRecordSchema>;
type StoredSchedulerState = StoredSchedulerRecord["state"];
type RunSchedule = z.infer<typeof runScheduleSchema>;
type ActiveSchedulerState =
  | (Omit<Extract<StoredSchedulerState, { kind: "dispatch-pending" }>, "schedule"> & {
      schedule: RunSchedule;
    })
  | (Omit<Extract<StoredSchedulerState, { kind: "tracking" }>, "schedule"> & {
      schedule: RunSchedule;
    });
type IdleSchedulerState = Exclude<
  StoredSchedulerState,
  { kind: "dispatch-pending" } | { kind: "tracking" }
>;

export type SchedulerRecord = Omit<StoredSchedulerRecord, "state"> & {
  state: ActiveSchedulerState | IdleSchedulerState;
};
type SchedulerRecordParseResult = ReturnType<typeof schedulerRecordSchema.safeParse>;

export function parseSchedulerRecord(result: SchedulerRecordParseResult): SchedulerRecord {
  if (!result.success) {
    throw new Error("Stored scheduler state is invalid");
  }

  const { lastMiss, lastSuccess, state } = result.data;
  switch (state.kind) {
    case "dispatch-pending":
    case "tracking":
      return {
        lastMiss,
        lastSuccess,
        state: { ...state, schedule: state.schedule ?? { kind: "hourly" } },
      };
    case "slo-missed":
    case "waiting":
      return { lastMiss, lastSuccess, state };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
