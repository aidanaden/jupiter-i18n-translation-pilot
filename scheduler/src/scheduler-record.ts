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

export type SchedulerRecord = z.infer<typeof schedulerRecordSchema>;
type SchedulerRecordParseResult = ReturnType<typeof schedulerRecordSchema.safeParse>;

export function parseSchedulerRecord(result: SchedulerRecordParseResult): SchedulerRecord {
  if (!result.success) {
    throw new Error("Stored scheduler state is invalid");
  }

  return result.data;
}
