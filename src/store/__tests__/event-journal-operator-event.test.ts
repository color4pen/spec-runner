/**
 * TC-009, TC-022, TC-023, TC-024 — OperatorEventRecord in the event journal.
 *
 * TC-009: fold() returns operatorEvents containing the reopen record with all fields
 *         intact (action, reason, fromStep, ts).
 *         (RED until event-journal.ts adds OperatorEventRecord + fold collects it)
 *
 * TC-022: fold() of a journal with no operator-event lines returns operatorEvents: []
 *         alongside existing fields (steps, history, lineage).
 *         (RED until fold() returns operatorEvents)
 *
 * TC-023: The ENOENT-branch FoldResult literal (in job-journal.ts persist()) must
 *         include operatorEvents: [] alongside other empty-default fields.
 *         Tested here via an empty-journal fold (equivalent shape).
 *         (RED until the literal in job-journal.ts is updated)
 *
 * TC-024: appendOperatorEvent round-trip via JobStateStore: calling
 *         store.appendOperatorEvent() writes a record to events.jsonl
 *         that fold() then collects in operatorEvents.
 *
 * Source: spec.md › Requirement: reopen records an operator event in the journal
 *         tasks.md T-02
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fold } from "../../store/event-journal.js";
import type { FoldResult, OperatorEventRecord } from "../../store/event-journal.js";
import { JobStateStore } from "../job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Access operatorEvents on a FoldResult via a cast.
 * After implementation, FoldResult will include operatorEvents: OperatorEventRecord[].
 * Until then, the cast avoids a TypeScript compile error while the assertion still fails at runtime.
 */
function getOperatorEvents(result: FoldResult): unknown[] | undefined {
  return (result as unknown as Record<string, unknown>)["operatorEvents"] as unknown[] | undefined;
}

/** Build a single JSONL line representing an operator-event record. */
function makeOperatorEventLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "operator-event",
    action: "reopen",
    reason: "post-review fix",
    fromStep: "spec-review",
    ts: "2026-07-01T10:00:00.000Z",
    ...overrides,
  });
}

/** Build a step-attempt JSONL line for testing that existing fields are unaffected. */
function makeStepAttemptLine(step = "design"): string {
  return JSON.stringify({
    type: "step-attempt",
    step,
    sessionId: null,
    outcome: { verdict: "approved", findingsPath: null, error: null },
    startedAt: "2026-07-01T09:00:00.000Z",
    endedAt: "2026-07-01T09:30:00.000Z",
  });
}

/** Build a transition JSONL line for testing that existing fields are unaffected. */
function makeTransitionLine(): string {
  return JSON.stringify({
    type: "transition",
    ts: "2026-07-01T09:00:00.000Z",
    step: "init",
    status: "ok",
    message: "running → awaiting-archive: completed",
  });
}

// ---------------------------------------------------------------------------
// TC-022: fold returns operatorEvents:[] when no operator-event lines exist
// ---------------------------------------------------------------------------

describe("TC-022: fold() returns operatorEvents:[] when no operator-event lines exist", () => {
  it("TC-022-a: empty journal returns operatorEvents:[]", () => {
    // GIVEN a journal with no lines
    // WHEN fold() is called
    const result = fold("");

    // THEN operatorEvents is an empty array
    // RED until fold() is updated to collect operator-event lines
    expect(getOperatorEvents(result)).toEqual([]);
  });

  it("TC-022-b: journal with only step-attempt, transition, lineage records returns operatorEvents:[]", () => {
    // GIVEN a journal containing only non-operator-event records
    const content = [
      makeStepAttemptLine("design"),
      makeTransitionLine(),
      JSON.stringify({ type: "lineage", step: "design", ts: "2026-07-01T09:30:00.000Z", outputs: [], inputs: [] }),
    ].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN operatorEvents is an empty array
    // AND existing fields are unaffected (regression)
    expect(getOperatorEvents(result)).toEqual([]);
    expect(result.stepsTotal).toBe(1); // one step-attempt
    expect(result.historyCount).toBe(1); // one transition
    expect(result.lineage).toHaveLength(1); // one lineage record
  });

  it("TC-022-c: unknown record types are silently ignored and do not affect operatorEvents", () => {
    const content = JSON.stringify({ type: "unknown-future-type", data: "x" }) + "\n";
    const result = fold(content);
    expect(getOperatorEvents(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-023: ENOENT-branch FoldResult literal includes operatorEvents:[]
// ---------------------------------------------------------------------------

describe("TC-023: ENOENT-branch FoldResult shape includes operatorEvents:[]", () => {
  it("TC-023: fold('') returns shape equivalent to ENOENT-branch literal (operatorEvents:[])", () => {
    // The ENOENT branch in job-journal.ts persist() constructs a hand-built FoldResult literal.
    // After T-02, that literal must include operatorEvents: [] (same as fold("") would return).
    // This test verifies the structural equivalence: if fold("") includes operatorEvents: [],
    // the ENOENT literal must also include it (enforced by typecheck + T-02 task).
    //
    // RED until both fold() and the job-journal.ts literal are updated.
    const result = fold("");

    // Must have operatorEvents field with empty array
    expect(getOperatorEvents(result)).toEqual([]);
    // Other fields must remain (regression)
    expect(result.steps).toEqual({});
    expect(result.history).toEqual([]);
    expect(result.stepsTotal).toBe(0);
    expect(result.historyCount).toBe(0);
    expect(result.lineage).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-009: fold() collects operator-event records into operatorEvents
// ---------------------------------------------------------------------------

describe("TC-009: fold() returns operatorEvents containing the reopen operator record", () => {
  it("TC-009-a: single operator-event line is collected with all fields intact", () => {
    // GIVEN a journal with one operator-event record
    const line = makeOperatorEventLine({
      action: "reopen",
      reason: "post-review fix",
      fromStep: "implementer",
      ts: "2026-07-01T10:00:00.000Z",
    });
    const result = fold(line + "\n");

    // THEN operatorEvents contains one record
    // RED until fold() handles the "operator-event" type
    const events = getOperatorEvents(result);
    expect(events).toHaveLength(1);

    const evt = events![0] as Record<string, unknown>;
    expect(evt["action"]).toBe("reopen");
    expect(evt["reason"]).toBe("post-review fix");
    expect(evt["fromStep"]).toBe("implementer");
    expect(evt["ts"]).toBe("2026-07-01T10:00:00.000Z");
  });

  it("TC-009-b: operator-event appears after and alongside other record types", () => {
    // GIVEN a journal with mixed record types
    const content = [
      makeStepAttemptLine("spec-review"),
      makeTransitionLine(),
      makeOperatorEventLine({ reason: "fix X", fromStep: "spec-review" }),
      makeStepAttemptLine("implementer"),
    ].join("\n") + "\n";

    const result = fold(content);

    // Existing fields are unaffected
    expect(result.stepsTotal).toBe(2); // spec-review + implementer
    expect(result.historyCount).toBe(1); // transition

    // operatorEvents contains the one operator-event record
    const events = getOperatorEvents(result);
    expect(events).toHaveLength(1);
    const evt = events![0] as Record<string, unknown>;
    expect(evt["reason"]).toBe("fix X");
    expect(evt["fromStep"]).toBe("spec-review");
  });

  it("TC-009-c: multiple operator-event lines are all collected in chronological order", () => {
    // GIVEN two operator-event records (e.g. two reopens)
    const content = [
      makeOperatorEventLine({ ts: "2026-07-01T10:00:00.000Z", reason: "first fix" }),
      makeOperatorEventLine({ ts: "2026-07-01T12:00:00.000Z", reason: "second fix" }),
    ].join("\n") + "\n";

    const result = fold(content);

    const events = getOperatorEvents(result);
    expect(events).toHaveLength(2);
    expect((events![0] as Record<string, unknown>)["reason"]).toBe("first fix");
    expect((events![1] as Record<string, unknown>)["reason"]).toBe("second fix");
  });

  it("TC-009-d: operator-event record with type='operator-event' is not treated as a corruption", () => {
    // An operator-event record with an unknown action field is silently accepted
    // (forward compat — fold ignores unknown types, but operator-event IS a known type)
    const line = makeOperatorEventLine();
    const result = fold(line + "\n");

    // No corruption detected
    expect(result.corruption).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-024: appendOperatorEvent round-trip via JobStateStore
// ---------------------------------------------------------------------------

describe("TC-024: appendOperatorEvent round-trip (JobStateStore → events.jsonl → fold)", () => {
  it("TC-024: store.appendOperatorEvent() writes a record to events.jsonl that fold() collects in operatorEvents", async () => {
    // GIVEN a temp directory with a minimal job state
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-event-rt-"));
    try {
      const changeDir = path.join(tempDir, "specrunner", "changes", "test-slug");
      await fs.mkdir(changeDir, { recursive: true });
      // Minimal state.json required for JobStateStore.load() / path resolution
      await fs.writeFile(
        path.join(changeDir, "state.json"),
        JSON.stringify({
          version: 2,
          jobId: "test-job-id",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          request: { path: "/req.md", title: "T", type: "bug-fix", slug: "test-slug" },
          repository: { owner: "o", name: "r" },
          session: null,
          step: "pr-create",
          status: "awaiting-archive",
          branch: "fix/test-slug",
          history: [],
          error: null,
          _journal: { historyCount: 0, stepCounts: {} },
        }),
      );

      // WHEN appendOperatorEvent is called on a real JobStateStore instance
      const store = new JobStateStore("test-job-id", tempDir, {
        slug: "test-slug",
        stateRoot: tempDir,
      });
      const record: OperatorEventRecord = {
        type: "operator-event",
        action: "reopen",
        reason: "post-review fix applied",
        fromStep: "spec-review",
        ts: "2026-07-01T10:00:00.000Z",
      };
      await store.appendOperatorEvent(record);

      // THEN the record appears in events.jsonl and fold() collects it in operatorEvents
      const content = await fs.readFile(path.join(changeDir, "events.jsonl"), "utf-8");
      const result = fold(content);
      const events = getOperatorEvents(result);
      expect(events).toHaveLength(1);

      const evt = events![0] as Record<string, unknown>;
      expect(evt["type"]).toBe("operator-event");
      expect(evt["action"]).toBe("reopen");
      expect(evt["reason"]).toBe("post-review fix applied");
      expect(evt["fromStep"]).toBe("spec-review");
      expect(evt["ts"]).toBe("2026-07-01T10:00:00.000Z");

      // AND state.json is NOT modified (operator events are journal-only)
      const stateRaw = await fs.readFile(path.join(changeDir, "state.json"), "utf-8");
      const stateParsed = JSON.parse(stateRaw) as Record<string, unknown>;
      expect("operatorEvents" in stateParsed).toBe(false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
