/**
 * Unit tests for event-journal fold and crash-safety guarantees.
 *
 * TC-003: cursor 書き込み中の crash で event が失われない
 *         events.jsonl complete + state.json stale counters → load() fold-recovers all events
 * TC-004: 末尾 partial 行を捨ててそれ以前を復元する
 *         fold() on jsonl with partial last line → all prior records returned
 * TC-005: code-review approved + fixableCount>0 の routing が fold 経由で従来同値
 *         toolResult.fixableCount preserved through append → fold (journal round-trip)
 * TC-006: fixer-empty 検出の再開が fold 経由で従来同値
 *         fixer attempt count from fold feeds resolveResumeStep fixer-empty detection
 * TC-028: attempt が 1-origin 連番で出現順から導出される
 *         3 step-attempt records for same step → fold → attempt 1, 2, 3
 * TC-030: delta-append crash 後の冪等リカバリ（load 時）
 *         state.json counter < fold count → persist() appends no duplicates
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fold, appendEventRecord, stepRunToRecord } from "../../src/store/event-journal.js";
import type { StepAttemptRecord, TransitionRecord, FoldCorruption } from "../../src/store/event-journal.js";
import type { StepRun } from "../../src/state/schema.js";
import { makeStoreFactory } from "../helpers/store-factory.js";
import { resolveResumeStep } from "../../src/core/resume/resolve-step.js";
import type { BaseReportResult } from "../../src/kernel/report-result.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "event-journal-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransitionRecord(step: string, message: string, ts: string): TransitionRecord {
  return {
    type: "transition",
    ts,
    step,
    status: "started",
    message,
  };
}

function makeStepAttemptRecord(
  step: string,
  verdict: "approved" | "needs-fix" | null,
  overrides: Partial<StepAttemptRecord["outcome"]> = {},
): StepAttemptRecord {
  return {
    type: "step-attempt",
    step,
    sessionId: null,
    outcome: {
      verdict,
      findingsPath: null,
      error: null,
      ...overrides,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
  };
}

/**
 * Write a minimal split-layout state.json for a given jobId with given _journal counters.
 * Does NOT include history or steps (those come from events.jsonl).
 */
async function writeStateJson(
  jobId: string,
  historyCount: number,
  stepCounts: Record<string, number> = {},
): Promise<void> {
  const jobDir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
  await fs.mkdir(jobDir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: null },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    error: null,
    pid: null,
    _journal: { historyCount, stepCounts },
  };
  await fs.writeFile(
    path.join(jobDir, "state.json"),
    JSON.stringify(stateJson, null, 2),
  );
}

/**
 * Return events.jsonl path for a jobId in tempDir.
 */
function eventsPath(jobId: string): string {
  return path.join(tempDir, ".specrunner", "test-jobs", jobId, "events.jsonl");
}

/**
 * Count non-empty lines in events.jsonl.
 */
async function countEventLines(jobId: string): Promise<number> {
  const content = await fs.readFile(eventsPath(jobId), "utf-8");
  return content.split("\n").filter((l) => l.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// TC-004: 末尾 partial 行を捨ててそれ以前を復元する
// ---------------------------------------------------------------------------
describe("TC-004: fold — partial tail line is dropped, prior records restored", () => {
  it("drops a truncated last line and returns all 3 complete prior records", () => {
    const r1 = JSON.stringify(makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));
    const r2 = JSON.stringify(makeTransitionRecord("design", "design started", "2026-01-01T00:01:00.000Z"));
    const r3 = JSON.stringify(makeTransitionRecord("design", "design done", "2026-01-01T00:02:00.000Z"));
    const partial = '{"type":"transition","ts":"2026-01-01T00:03';  // truncated — invalid JSON

    const content = [r1, r2, r3, partial].join("\n");
    const result = fold(content);

    expect(result.historyCount).toBe(3);
    expect(result.history).toHaveLength(3);
    expect(result.history[0]!.step).toBe("init");
    expect(result.history[1]!.step).toBe("design");
    expect(result.history[2]!.step).toBe("design");
    expect(result.history[2]!.message).toBe("design done");
  });

  it("returns empty result when only line is partial", () => {
    const content = '{"type":"transition","ts":"2026';
    const result = fold(content);
    expect(result.historyCount).toBe(0);
    expect(result.history).toHaveLength(0);
    expect(result.stepsTotal).toBe(0);
  });

  it("returns all records when there is no partial tail", () => {
    const r1 = JSON.stringify(makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));
    const r2 = JSON.stringify(makeTransitionRecord("design", "done", "2026-01-01T00:01:00.000Z"));
    // Trailing newline (standard for JSONL) — last line after split is empty, not partial
    const content = r1 + "\n" + r2 + "\n";
    const result = fold(content);
    expect(result.historyCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-028: attempt が 1-origin 連番で出現順から導出される
// ---------------------------------------------------------------------------
describe("TC-028: fold — attempt assigned as 1-origin sequential per step", () => {
  it("3 step-attempt records for same step → attempt 1, 2, 3", () => {
    const records = [
      makeStepAttemptRecord("code-review", "needs-fix"),
      makeStepAttemptRecord("code-review", "needs-fix"),
      makeStepAttemptRecord("code-review", "approved"),
    ].map((r) => JSON.stringify(r)).join("\n");

    const result = fold(records);

    const runs = result.steps["code-review"];
    expect(runs).toHaveLength(3);
    expect(runs![0]!.attempt).toBe(1);
    expect(runs![1]!.attempt).toBe(2);
    expect(runs![2]!.attempt).toBe(3);
  });

  it("attempt numbering is independent per step", () => {
    const records = [
      makeStepAttemptRecord("spec-review", "needs-fix"),
      makeStepAttemptRecord("spec-fixer", "approved"),
      makeStepAttemptRecord("spec-review", "approved"),
    ].map((r) => JSON.stringify(r)).join("\n");

    const result = fold(records);

    const specReviewRuns = result.steps["spec-review"];
    const specFixerRuns = result.steps["spec-fixer"];
    expect(specReviewRuns).toHaveLength(2);
    expect(specReviewRuns![0]!.attempt).toBe(1);
    expect(specReviewRuns![1]!.attempt).toBe(2);
    expect(specFixerRuns).toHaveLength(1);
    expect(specFixerRuns![0]!.attempt).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-005: toolResult.fixableCount preserved through journal round-trip
// ---------------------------------------------------------------------------
describe("TC-005: fold round-trip — toolResult.fixableCount preserved", () => {
  it("toolResult with fixableCount:3 survives append → fold", async () => {
    const filePath = path.join(tempDir, "events.jsonl");
    const toolResult: BaseReportResult & { fixableCount: number } = {
      ok: true,
      fixableCount: 3,
    };
    const record = makeStepAttemptRecord("code-review", "approved", { toolResult });
    await appendEventRecord(filePath, record);

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    const runs = result.steps["code-review"];
    expect(runs).toHaveLength(1);
    const outcome = runs![0]!.outcome;
    expect(outcome.verdict).toBe("approved");
    expect(outcome.toolResult).toBeDefined();
    expect((outcome.toolResult as unknown as Record<string, unknown>)["fixableCount"]).toBe(3);
  });

  it("toolResult with fixableCount:0 preserved (routing: no fixer needed)", async () => {
    const filePath = path.join(tempDir, "events.jsonl");
    const toolResult: BaseReportResult & { fixableCount: number } = {
      ok: true,
      fixableCount: 0,
    };
    const record = makeStepAttemptRecord("code-review", "approved", { toolResult });
    await appendEventRecord(filePath, record);

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    const runs = result.steps["code-review"];
    const fixableCount = (runs![0]!.outcome.toolResult as unknown as Record<string, unknown> | null | undefined)?.[
      "fixableCount"
    ];
    expect(fixableCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-006: fold round-trip — fold step counts are correct; resolveResumeStep returns verbatim
// ---------------------------------------------------------------------------
describe("TC-006: fold round-trip — step counts correct; resolveResumeStep verbatim", () => {
  it("0 code-fixer attempts in journal → code-fixer absent → resolveResumeStep returns code-fixer (verbatim)", async () => {
    const filePath = path.join(tempDir, "events.jsonl");

    // code-review ran and ended with needs-fix; code-fixer never ran
    await appendEventRecord(filePath, makeStepAttemptRecord("code-review", "needs-fix"));

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    // fold result: code-fixer is absent / empty
    const fixerRuns = result.steps["code-fixer"] ?? [];
    expect(fixerRuns).toHaveLength(0);

    // resolveResumeStep: returns resumePoint.step verbatim (no fixer-empty detection)
    const resumePoint = {
      step: "code-fixer" as const,
      reason: "killed before fixer ran",
      iterationsExhausted: 0,
    };
    const resolved = resolveResumeStep(undefined, resumePoint);
    expect(resolved).toBe("code-fixer");
  });

  it("N code-fixer attempts in journal → count correct → resolveResumeStep returns code-fixer", async () => {
    const filePath = path.join(tempDir, "events.jsonl");

    await appendEventRecord(filePath, makeStepAttemptRecord("code-review", "needs-fix"));
    await appendEventRecord(filePath, makeStepAttemptRecord("code-fixer", "approved"));

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    const fixerRuns = result.steps["code-fixer"] ?? [];
    expect(fixerRuns).toHaveLength(1);
    expect(fixerRuns[0]!.attempt).toBe(1);

    // resolveResumeStep: returns resumePoint.step verbatim
    const resumePoint = {
      step: "code-fixer" as const,
      reason: "crash after fixer ran",
      iterationsExhausted: 0,
    };
    const resolved = resolveResumeStep(undefined, resumePoint);
    expect(resolved).toBe("code-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-003: cursor 書き込み中の crash で event が失われない
// ---------------------------------------------------------------------------
describe("TC-003: crash safety — events.jsonl complete, state.json has stale counters", () => {
  it("load() fold-recovers all transition records even when state.json historyCount is 0", async () => {
    const jobId = "tc003-crash-job";
    const ep = eventsPath(jobId);

    // Write 2 transition records to events.jsonl
    await appendEventRecord(ep, makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));
    await appendEventRecord(ep, makeTransitionRecord("design", "design started", "2026-01-01T00:01:00.000Z"));

    // Write state.json with stale historyCount: 0 (simulates crash after append, before cursor update)
    await writeStateJson(jobId, 0);

    const store = makeStoreFactory(tempDir)(jobId);
    const state = await store.load();

    // load() must fold-recover both records despite stale counter
    expect(state.history).toHaveLength(2);
    expect(state.history[0]!.step).toBe("init");
    expect(state.history[1]!.step).toBe("design");
  });

  it("load() fold-recovers step-attempt records when state.json stepCounts are stale", async () => {
    const jobId = "tc003-crash-steps";
    const ep = eventsPath(jobId);

    await appendEventRecord(ep, makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));
    await appendEventRecord(ep, makeStepAttemptRecord("spec-review", "needs-fix"));
    await appendEventRecord(ep, makeStepAttemptRecord("spec-review", "approved"));

    // state.json says 0 steps (stale — crash before cursor update)
    await writeStateJson(jobId, 1, {});

    const store = makeStoreFactory(tempDir)(jobId);
    const state = await store.load();

    const specReviewRuns = state.steps["spec-review"];
    expect(specReviewRuns).toHaveLength(2);
    expect(specReviewRuns![0]!.attempt).toBe(1);
    expect(specReviewRuns![0]!.outcome.verdict).toBe("needs-fix");
    expect(specReviewRuns![1]!.attempt).toBe(2);
    expect(specReviewRuns![1]!.outcome.verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-030: delta-append crash 後の冪等リカバリ — persist() で二重 append なし
// ---------------------------------------------------------------------------
describe("TC-030: delta-append crash recovery — no double-append after persist()", () => {
  it("persist() with stale counter appends only the true delta, not all records", async () => {
    const jobId = "tc030-idempotent";
    const ep = eventsPath(jobId);

    // Write 2 transition records to events.jsonl
    await appendEventRecord(ep, makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));
    await appendEventRecord(ep, makeTransitionRecord("design", "design started", "2026-01-01T00:01:00.000Z"));

    // state.json with stale historyCount: 0 (crash before cursor update)
    await writeStateJson(jobId, 0);

    const store = makeStoreFactory(tempDir)(jobId);
    const state = await store.load();

    // load() returns 2 history entries
    expect(state.history).toHaveLength(2);

    // Verify events.jsonl has exactly 2 lines before persist
    expect(await countEventLines(jobId)).toBe(2);

    // persist() should not double-append existing records
    await store.persist(state);

    // events.jsonl must still have exactly 2 lines (delta = 0)
    expect(await countEventLines(jobId)).toBe(2);
  });

  it("persist() after crash recovery correctly appends only genuinely new records (TC-030-2)", async () => {
    const jobId = "tc030-new-delta";
    const ep = eventsPath(jobId);

    // Write 1 transition record to events.jsonl
    await appendEventRecord(ep, makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));

    // state.json with stale historyCount: 0
    await writeStateJson(jobId, 0);

    const store = makeStoreFactory(tempDir)(jobId);
    const loaded = await store.load();

    // Add 1 genuinely new history entry to in-memory state
    const { appendHistoryEntry } = await import("../../src/state/schema.js");
    const updated = appendHistoryEntry(loaded, {
      ts: "2026-01-01T00:05:00.000Z",
      step: "design",
      status: "started",
      message: "design started",
    });

    expect(await countEventLines(jobId)).toBe(1);

    await store.persist(updated);

    // events.jsonl should now have 2 lines: the original 1 + 1 new delta
    expect(await countEventLines(jobId)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// T-01 tests: fold() corruption detection contract
// ---------------------------------------------------------------------------

describe("T-01: fold() — mid-journal corruption detection", () => {
  // Helpers
  function makeTransition(step: string): string {
    return JSON.stringify({
      type: "transition",
      ts: "2026-01-01T00:00:00.000Z",
      step,
      status: "started",
      message: "msg",
    });
  }

  it("mid-journal invalid-json line sets corruption, valid records still folded", () => {
    const r1 = makeTransition("init");
    const corrupt = "NOT VALID JSON {{{";
    const r3 = makeTransition("design");

    const content = [r1, corrupt, r3].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeDefined();
    const c = result.corruption as FoldCorruption;
    expect(c.reason).toBe("invalid-json");
    expect(c.lineIndex).toBe(1); // 0-based; first corrupt line is at index 1
    expect(c.snippet).toContain("NOT VALID JSON");

    // Valid records are still folded
    expect(result.historyCount).toBe(2);
    expect(result.history[0]!.step).toBe("init");
    expect(result.history[1]!.step).toBe("design");
  });

  it("corruption lineIndex is 0 when the very first committed line is invalid JSON", () => {
    const corrupt = "GARBAGE";
    const r2 = makeTransition("design");
    const content = [corrupt, r2].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeDefined();
    expect(result.corruption!.lineIndex).toBe(0);
    // r2 still folded
    expect(result.historyCount).toBe(1);
  });

  it("only FIRST corruption is recorded when multiple corrupt lines exist", () => {
    const r1 = makeTransition("init");
    const bad1 = "BAD LINE ONE";
    const bad2 = "BAD LINE TWO";
    const r4 = makeTransition("design");
    const content = [r1, bad1, bad2, r4].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeDefined();
    expect(result.corruption!.lineIndex).toBe(1); // first corrupt line
    expect(result.corruption!.snippet).toContain("BAD LINE ONE");
  });

  it("not-an-object: committed line that parses as array sets corruption", () => {
    const r1 = makeTransition("init");
    const arrayLine = JSON.stringify(["array", "not", "object"]);
    const r3 = makeTransition("design");
    const content = [r1, arrayLine, r3].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeDefined();
    expect(result.corruption!.reason).toBe("not-an-object");
    expect(result.corruption!.lineIndex).toBe(1);
    // Valid records still folded
    expect(result.historyCount).toBe(2);
  });

  it("not-an-object: committed line that parses as null sets corruption", () => {
    const r1 = makeTransition("init");
    const nullLine = "null";
    const content = [r1, nullLine].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeDefined();
    expect(result.corruption!.reason).toBe("not-an-object");
  });

  it("not-an-object: committed line that parses as a string sets corruption", () => {
    const stringLine = JSON.stringify("just a string");
    const r2 = makeTransition("init");
    const content = [stringLine, r2].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeDefined();
    expect(result.corruption!.reason).toBe("not-an-object");
  });

  it("forward compat: unknown object type does NOT set corruption", () => {
    const r1 = makeTransition("init");
    const unknownType = JSON.stringify({ type: "future-record-type", data: "something" });
    const r3 = makeTransition("design");
    const content = [r1, unknownType, r3].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeUndefined();
    expect(result.historyCount).toBe(2); // both valid records folded
  });

  it("tail partial only (single truncated last line) does NOT set corruption", () => {
    const r1 = makeTransition("init");
    const partial = '{"type":"transition","ts":"2026-01-01T00:05'; // truncated
    const content = [r1, partial].join("\n");
    const result = fold(content);

    expect(result.corruption).toBeUndefined();
    expect(result.historyCount).toBe(1);
  });

  it("empty content does NOT set corruption", () => {
    const result = fold("");
    expect(result.corruption).toBeUndefined();
    expect(result.historyCount).toBe(0);
  });

  it("whitespace-only content does NOT set corruption", () => {
    const result = fold("   \n  \n  ");
    expect(result.corruption).toBeUndefined();
  });

  it("valid records only (no tail partial) does NOT set corruption", () => {
    const r1 = makeTransition("init");
    const r2 = makeTransition("design");
    const result = fold([r1, r2].join("\n") + "\n");
    expect(result.corruption).toBeUndefined();
    expect(result.historyCount).toBe(2);
  });

  it("snippet is truncated to 120 chars for very long corrupt lines", () => {
    const longBadLine = "X".repeat(200);
    const result = fold(longBadLine);
    // Last line is treated as tail partial (single non-empty line that fails parse)
    // so corruption is NOT set for a single corrupt line
    expect(result.corruption).toBeUndefined();

    // But if there's a valid line after it, then the long bad line is a committed line
    const validAfter = JSON.stringify({ type: "transition", ts: "t", step: "s", status: "started", message: "m" });
    const result2 = fold(longBadLine + "\n" + validAfter);
    // Now the long bad line is committed (first line) and the validAfter is the last
    expect(result2.corruption).toBeDefined();
    expect(result2.corruption!.snippet.length).toBeLessThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------
// TC-040: fold → resumePoint materialized from interruption record via load()
// ---------------------------------------------------------------------------
describe("TC-040: load() materializes resumePoint from last interruption record", () => {
  it("appendInterruption → store.load() → state.resumePoint.reason matches", async () => {
    const jobId = "tc040-interruption";
    const ep = eventsPath(jobId);

    // Write one transition record so fold history count starts at 1
    await appendEventRecord(ep, makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));

    // Write state.json (step = "code-fixer", so resumePoint.step will be derived from cursor)
    await writeStateJson(jobId, 1);

    // Append an interruption record directly (simulates appendInterruption() in exit guard)
    const interruptionRecord = {
      type: "interruption" as const,
      reason: "signal" as const,
      ts: "2026-01-01T00:10:00.000Z",
    };
    await appendEventRecord(ep, interruptionRecord);

    // load() must materialize resumePoint from the interruption record
    const store = makeStoreFactory(tempDir)(jobId);
    const state = await store.load();

    expect(state.resumePoint).toBeDefined();
    expect(state.resumePoint!.reason).toBe("signal");
  });

  it("last interruption wins when multiple interruption records present", async () => {
    const jobId = "tc040-multi-interruption";
    const ep = eventsPath(jobId);

    await appendEventRecord(ep, makeTransitionRecord("init", "job created", "2026-01-01T00:00:00.000Z"));
    await writeStateJson(jobId, 1);

    // Two interruption records; last one should win
    await appendEventRecord(ep, {
      type: "interruption" as const,
      reason: "timeout" as const,
      ts: "2026-01-01T00:05:00.000Z",
    });
    await appendEventRecord(ep, {
      type: "interruption" as const,
      reason: "exhaustion" as const,
      exhaustionPhase: "review-after-final-fix",
      ts: "2026-01-01T00:10:00.000Z",
    });

    const store = makeStoreFactory(tempDir)(jobId);
    const state = await store.load();

    expect(state.resumePoint).toBeDefined();
    expect(state.resumePoint!.reason).toBe("exhaustion");
  });
});

// ---------------------------------------------------------------------------
// T-01 (added-turns-persist-and-review-trim): addedTurns journal round-trip
// ---------------------------------------------------------------------------

describe("addedTurns journal round-trip — fold restores addedTurns losslessly", () => {
  it("addedTurns object survives append → fold (raw record path)", async () => {
    const filePath = path.join(tempDir, "events.jsonl");
    const addedTurns = { reportRetry: 2, postWork: 1, outputRepair: 3 };
    const record = makeStepAttemptRecord("implementer", "approved", { addedTurns });
    await appendEventRecord(filePath, record);

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    const runs = result.steps["implementer"];
    expect(runs).toHaveLength(1);
    expect(runs![0]!.outcome.addedTurns).toEqual(addedTurns);
  });

  it("addedTurns survives round-trip via stepRunToRecord → appendEventRecord → fold", async () => {
    const filePath = path.join(tempDir, "events.jsonl");
    const addedTurns = { reportRetry: 1, postWork: 2, outputRepair: 0 };
    const stepRun: StepRun = {
      attempt: 1,
      sessionId: "sess-abc",
      outcome: {
        verdict: "needs-fix",
        findingsPath: "specrunner/changes/my-slug/review-feedback-001.md",
        error: null,
        addedTurns,
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    };

    const record = stepRunToRecord("code-review", stepRun);
    await appendEventRecord(filePath, record);

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    const runs = result.steps["code-review"];
    expect(runs).toHaveLength(1);
    expect(runs![0]!.outcome.addedTurns).toEqual(addedTurns);
  });

  it("all-zero addedTurns round-trips correctly", async () => {
    const filePath = path.join(tempDir, "events.jsonl");
    const addedTurns = { reportRetry: 0, postWork: 0, outputRepair: 0 };
    const record = makeStepAttemptRecord("spec-review", "approved", { addedTurns });
    await appendEventRecord(filePath, record);

    const content = await fs.readFile(filePath, "utf-8");
    const result = fold(content);

    expect(result.steps["spec-review"]![0]!.outcome.addedTurns).toEqual(addedTurns);
  });
});

describe("addedTurns backward compat — old records without addedTurns fold without exception", () => {
  it("step-attempt record without addedTurns key → fold succeeds and outcome.addedTurns is undefined", () => {
    // Simulate a legacy record (no addedTurns field)
    const legacyRecord: StepAttemptRecord = {
      type: "step-attempt",
      step: "code-review",
      sessionId: null,
      outcome: {
        verdict: "approved",
        findingsPath: null,
        error: null,
        // addedTurns intentionally omitted
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    };
    const line = JSON.stringify(legacyRecord);
    const result = fold(line);

    const runs = result.steps["code-review"];
    expect(runs).toHaveLength(1);
    // addedTurns absent in legacy record → fold must not set it (undefined, not null or 0)
    expect(runs![0]!.outcome.addedTurns).toBeUndefined();
  });

  it("raw JSON line without addedTurns → fold does not throw and outcome.addedTurns is undefined", () => {
    const rawLine = JSON.stringify({
      type: "step-attempt",
      step: "spec-review",
      sessionId: null,
      outcome: {
        verdict: "needs-fix",
        findingsPath: "/some/path.md",
        error: null,
        followUpAttempts: 1,
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:05:00.000Z",
    });

    let result: ReturnType<typeof fold> | undefined;
    expect(() => { result = fold(rawLine); }).not.toThrow();
    const runs = result!.steps["spec-review"];
    expect(runs![0]!.outcome.addedTurns).toBeUndefined();
  });
});
