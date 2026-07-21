/**
 * Unit tests for src/store/journal-integrity.ts
 *
 * T-02-A: detectCounterReversal — history reversal, step reversal, no-reversal
 * T-02-B: inspectJournalDir — absent journal → null, corrupt → corrupt-record,
 *          truncated → counter-reversal, intact → null, never throws
 * T-02-C: describeJournalIssue — correct one-line descriptions
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectCounterReversal,
  describeJournalIssue,
  inspectJournalDir,
} from "../../src/store/journal-integrity.js";
import type { CounterReversal, JournalIntegrityIssue } from "../../src/store/journal-integrity.js";
import type { FoldResult } from "../../src/store/event-journal.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "journal-integrity-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFoldResult(overrides: Partial<FoldResult> = {}): FoldResult {
  return {
    steps: {},
    history: [],
    operatorEvents: [],
    stepsTotal: 0,
    stepCounts: {},
    historyCount: 0,
    lineage: [],
    ...overrides,
  };
}

function makeStoredCounters(
  historyCount: number,
  stepCounts: Record<string, number> = {},
): { historyCount: number; stepCounts: Record<string, number> } {
  return { historyCount, stepCounts };
}

async function writeEvents(dir: string, lines: string[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "events.jsonl"), lines.join("\n") + (lines.length > 0 ? "\n" : ""));
}

async function writeStateJson(dir: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(data));
}

function makeTransitionLine(step: string): string {
  return JSON.stringify({
    type: "transition",
    ts: "2026-01-01T00:00:00.000Z",
    step,
    status: "started",
    message: "msg",
  });
}

// ---------------------------------------------------------------------------
// T-02-A: detectCounterReversal
// ---------------------------------------------------------------------------

describe("T-02-A: detectCounterReversal", () => {
  it("returns null when fold counts equal stored counts (no reversal)", () => {
    const stored = makeStoredCounters(3, { design: 2 });
    const fold = makeFoldResult({ historyCount: 3, stepCounts: { design: 2 } });
    expect(detectCounterReversal(stored, fold)).toBeNull();
  });

  it("returns null when fold is ahead of stored (crash recovery — not a reversal)", () => {
    const stored = makeStoredCounters(2, { design: 1 });
    const fold = makeFoldResult({ historyCount: 4, stepCounts: { design: 2 } });
    expect(detectCounterReversal(stored, fold)).toBeNull();
  });

  it("returns history reversal when fold.historyCount < stored.historyCount", () => {
    const stored = makeStoredCounters(5, {});
    const fold = makeFoldResult({ historyCount: 3 });
    const result = detectCounterReversal(stored, fold);
    expect(result).not.toBeNull();
    const r = result as CounterReversal;
    expect(r.field).toBe("history");
    expect(r.stored).toBe(5);
    expect(r.actual).toBe(3);
  });

  it("returns step reversal when fold.stepCounts[step] < stored.stepCounts[step]", () => {
    const stored = makeStoredCounters(0, { implementer: 3 });
    const fold = makeFoldResult({ historyCount: 0, stepCounts: { implementer: 1 } });
    const result = detectCounterReversal(stored, fold);
    expect(result).not.toBeNull();
    const r = result as CounterReversal;
    expect(r.field).toBe("step");
    expect(r.step).toBe("implementer");
    expect(r.stored).toBe(3);
    expect(r.actual).toBe(1);
  });

  it("returns step reversal when a step is missing from fold (absent = 0)", () => {
    const stored = makeStoredCounters(0, { design: 2 });
    const fold = makeFoldResult({ historyCount: 0, stepCounts: {} });
    const result = detectCounterReversal(stored, fold);
    expect(result).not.toBeNull();
    const r = result as CounterReversal;
    expect(r.field).toBe("step");
    expect(r.step).toBe("design");
    expect(r.stored).toBe(2);
    expect(r.actual).toBe(0);
  });

  it("history reversal takes priority over step reversal", () => {
    // Both history and a step are below stored
    const stored = makeStoredCounters(5, { design: 3 });
    const fold = makeFoldResult({ historyCount: 2, stepCounts: { design: 1 } });
    const result = detectCounterReversal(stored, fold);
    expect(result).not.toBeNull();
    expect(result!.field).toBe("history"); // history checked first
  });

  it("step from fold not in stored is not a reversal (new step added since last persist)", () => {
    const stored = makeStoredCounters(0, { design: 1 });
    const fold = makeFoldResult({ historyCount: 0, stepCounts: { design: 1, implementer: 2 } });
    expect(detectCounterReversal(stored, fold)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-02-C: describeJournalIssue
// ---------------------------------------------------------------------------

describe("T-02-C: describeJournalIssue", () => {
  it("corrupt-record invalid-json", () => {
    const issue: JournalIntegrityIssue = {
      kind: "corrupt-record",
      corruption: { lineIndex: 3, reason: "invalid-json", snippet: "BAD JSON" },
    };
    const desc = describeJournalIssue(issue);
    expect(desc).toContain("corrupt record");
    expect(desc).toContain("line 3");
    expect(desc).toContain("invalid-json");
    expect(desc).toContain("BAD JSON");
  });

  it("corrupt-record not-an-object", () => {
    const issue: JournalIntegrityIssue = {
      kind: "corrupt-record",
      corruption: { lineIndex: 0, reason: "not-an-object", snippet: "[1,2,3]" },
    };
    const desc = describeJournalIssue(issue);
    expect(desc).toContain("not-an-object");
    expect(desc).toContain("line 0");
  });

  it("counter-reversal history", () => {
    const issue: JournalIntegrityIssue = {
      kind: "counter-reversal",
      reversal: { field: "history", stored: 10, actual: 5 },
    };
    const desc = describeJournalIssue(issue);
    expect(desc).toContain("journal truncated");
    expect(desc).toContain("history count 5 < recorded 10");
  });

  it("counter-reversal step", () => {
    const issue: JournalIntegrityIssue = {
      kind: "counter-reversal",
      reversal: { field: "step", step: "implementer", stored: 3, actual: 1 },
    };
    const desc = describeJournalIssue(issue);
    expect(desc).toContain("journal truncated");
    expect(desc).toContain("step 'implementer'");
    expect(desc).toContain("count 1 < recorded 3");
  });
});

// ---------------------------------------------------------------------------
// T-02-B: inspectJournalDir
// ---------------------------------------------------------------------------

describe("T-02-B: inspectJournalDir", () => {
  it("returns null when events.jsonl is absent (ENOENT)", async () => {
    const dir = path.join(tempDir, "no-journal");
    await fs.mkdir(dir, { recursive: true });
    // No events.jsonl
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns null when the directory itself does not exist", async () => {
    const dir = path.join(tempDir, "nonexistent");
    // Do not create dir
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns null for an empty events.jsonl (no records)", async () => {
    const dir = path.join(tempDir, "empty-journal");
    await writeEvents(dir, []);
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns null for a journal with only a tail partial (no mid-journal corruption)", async () => {
    const dir = path.join(tempDir, "tail-partial");
    const good = makeTransitionLine("init");
    const partial = '{"type":"transition","ts":"2026-01-01T00:05'; // truncated
    await writeEvents(dir, [good, partial]);
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns corrupt-record for a journal with a mid-journal invalid-json line", async () => {
    const dir = path.join(tempDir, "corrupt-journal");
    const good = makeTransitionLine("init");
    const bad = "NOT JSON AT ALL";
    const good2 = makeTransitionLine("design");
    await writeEvents(dir, [good, bad, good2]);
    const result = await inspectJournalDir(dir);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("corrupt-record");
    if (result !== null && result.kind === "corrupt-record") {
      expect(result.corruption.reason).toBe("invalid-json");
      expect(result.corruption.lineIndex).toBe(1);
    }
  });

  it("returns null for an intact journal with matching _journal counters", async () => {
    const dir = path.join(tempDir, "intact");
    const good = makeTransitionLine("init");
    await writeEvents(dir, [good]);
    // state.json with matching historyCount
    await writeStateJson(dir, {
      version: 1,
      _journal: { historyCount: 1, stepCounts: {} },
    });
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns counter-reversal when stored _journal counters exceed fold counts", async () => {
    const dir = path.join(tempDir, "truncated");
    const good = makeTransitionLine("init");
    await writeEvents(dir, [good]);
    // state.json says 5 history records, but fold only finds 1
    await writeStateJson(dir, {
      version: 1,
      _journal: { historyCount: 5, stepCounts: {} },
    });
    const result = await inspectJournalDir(dir);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("counter-reversal");
    if (result !== null && result.kind === "counter-reversal") {
      expect(result.reversal.field).toBe("history");
      expect(result.reversal.stored).toBe(5);
      expect(result.reversal.actual).toBe(1);
    }
  });

  it("returns null when state.json is absent (tolerate missing state.json — skip reversal check)", async () => {
    const dir = path.join(tempDir, "no-state");
    const good = makeTransitionLine("init");
    await writeEvents(dir, [good]);
    // No state.json
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns null when state.json is malformed JSON (tolerate malformed — skip reversal check)", async () => {
    const dir = path.join(tempDir, "bad-state");
    const good = makeTransitionLine("init");
    await writeEvents(dir, [good]);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "state.json"), "NOT JSON {{{{");
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("returns null when state.json has no _journal field", async () => {
    const dir = path.join(tempDir, "no-_journal");
    const good = makeTransitionLine("init");
    await writeEvents(dir, [good]);
    await writeStateJson(dir, { version: 1, jobId: "test" });
    const result = await inspectJournalDir(dir);
    expect(result).toBeNull();
  });

  it("never throws for any input (missing dir, malformed file, etc.)", async () => {
    // Non-existent dir
    await expect(inspectJournalDir(path.join(tempDir, "ghost"))).resolves.toBeNull();

    // Directory without any files
    const emptyDir = path.join(tempDir, "empty-dir");
    await fs.mkdir(emptyDir, { recursive: true });
    await expect(inspectJournalDir(emptyDir)).resolves.toBeNull();
  });

  it("corrupt-record takes priority over counter-reversal (corruption detected before counters are checked)", async () => {
    const dir = path.join(tempDir, "corrupt-and-truncated");
    // 3 lines: good, bad (committed mid-journal), good — so the bad line is NOT the tail partial
    const good = makeTransitionLine("init");
    const bad = "BAD JSON";
    const good2 = makeTransitionLine("design");
    await writeEvents(dir, [good, bad, good2]);
    // State says 10 history records — also a reversal, but corruption should be reported first
    await writeStateJson(dir, {
      version: 1,
      _journal: { historyCount: 10, stepCounts: {} },
    });
    const result = await inspectJournalDir(dir);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("corrupt-record");
  });
});
