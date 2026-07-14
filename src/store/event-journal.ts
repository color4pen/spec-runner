/**
 * Event journal module for specrunner job state.
 *
 * Implements the event journal (events.jsonl) for T-01:
 * - Tagged union record types (StepAttemptRecord | TransitionRecord)
 * - fold(): parse all valid records from a jsonl file, ignoring partial tail
 * - appendEventRecord(): append a single record via fs.appendFile (never rewrites)
 *
 * Design D2: 1 line = 1 record, partial tail is silently dropped.
 * Design D3: append uses fs.appendFile only — never rewrites existing lines.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StepRun, HistoryEntry, ErrorInfo } from "../state/schema.js";
import type { BaseReportResult } from "../kernel/report-result.js";
import type { CompletionReportDiagnostic } from "../kernel/completion-report-diagnostic.js";
import type { Verdict } from "../state/schema.js";
import type { ArtifactRef } from "../state/artifact-types.js";
export type { ArtifactRef } from "../state/artifact-types.js";

// ---------------------------------------------------------------------------
// Record types (tagged union)
// ---------------------------------------------------------------------------

/**
 * Records a single execution attempt of a named step.
 * Equivalent to StepRun (excluding attempt — derived from fold position).
 * Stage 1 includes modelUsage; Stage 2 removes it when finish-batch-derive is abolished.
 */
export interface StepAttemptRecord {
  type: "step-attempt";
  /** Step name (e.g. "spec-review", "code-fixer"). */
  step: string;
  sessionId: string | null;
  outcome: {
    verdict: Verdict | string | null;
    findingsPath: string | null;
    error: ErrorInfo | null;
    /** Result from report_result tool call. */
    toolResult?: BaseReportResult | null;
    /** Follow-up retry attempts to get tool call. */
    followUpAttempts?: number;
    /** Transient-error auto-retry attempts. */
    transientRetryAttempts?: number;
    /** Human-readable reason when verdict === "skipped". */
    skipReason?: string;
    /** Completion-report extraction diagnostics (Codex adapter only). Absent on success. */
    completionReportDiagnostics?: CompletionReportDiagnostic[];
    /**
     * Added-turn metrics broken down by type (local runtime only).
     * addedTurns なしの旧 record は fold で undefined（後方互換）。
     * Added in added-turns-persist-and-review-trim.
     */
    addedTurns?: { reportRetry: number; postWork: number; outputRepair: number };
  };
  startedAt: string;
  endedAt: string;
}

/**
 * Records a single status/lifecycle transition (equivalent to HistoryEntry).
 */
export interface TransitionRecord {
  type: "transition";
  ts: string;
  step: string;
  status: "started" | "ok" | "error" | "warning";
  message: string;
}

/**
 * Records a job interruption event (Stage 2, T-11).
 * Recorded when a job is interrupted by timeout / signal / failure / exhaustion.
 */
export interface InterruptionRecord {
  type: "interruption";
  reason: "timeout" | "signal" | "failure" | "exhaustion";
  /** Error code for failure (optional). */
  errorCode?: string;
  /** Phase name for exhaustion (optional). */
  exhaustionPhase?: string;
  ts: string;
}

/**
 * Records the lineage of a step's outputs: which inputs produced which outputs.
 * Appended to events.jsonl on step completion (best-effort).
 * NOT materialized into state.json / NormalizedJobState.
 *
 * D1 (artifact-observability): lineage is journal-only, projection is not increased.
 */
export interface LineageRecord {
  type: "lineage";
  /** Producer step name (e.g. "design", "implementer"). */
  step: string;
  /** ISO 8601 timestamp (step's completedAt). */
  ts: string;
  /** Step outputs (from step.writes()). */
  outputs: ArtifactRef[];
  /** Step inputs (from step.reads()). */
  inputs: ArtifactRef[];
}

/** All valid event record types. */
export type EventRecord = StepAttemptRecord | TransitionRecord | InterruptionRecord | LineageRecord;

// ---------------------------------------------------------------------------
// Fold corruption
// ---------------------------------------------------------------------------

/**
 * Describes a mid-journal corruption detected by fold().
 * Only the FIRST corruption in the committed lines is recorded.
 */
export interface FoldCorruption {
  /** 0-based index within the committed lines (after tail-partial is dropped). */
  lineIndex: number;
  /** Why the line is considered corrupt. */
  reason: "invalid-json" | "not-an-object";
  /** First ~120 chars of the offending line (for diagnostics). */
  snippet: string;
}

// ---------------------------------------------------------------------------
// Fold result
// ---------------------------------------------------------------------------

export interface FoldResult {
  /** Reconstructed steps journal: Record<stepName, StepRun[]> */
  steps: Record<string, StepRun[]>;
  /** Reconstructed history: HistoryEntry[] in chronological order */
  history: HistoryEntry[];
  /** Total step-attempt records parsed (used for delta tracking). */
  stepsTotal: number;
  /** Per-step counts (stepName → count). Used for precise delta tracking. */
  stepCounts: Record<string, number>;
  /** Total transition records parsed (used for delta tracking). */
  historyCount: number;
  /**
   * Last interruption record seen in the journal, if any (Stage 2 / T-11).
   * Used to materialize resumePoint cache in state.json on load.
   */
  lastInterruption?: InterruptionRecord;
  /**
   * All lineage records in chronological order (D1, artifact-observability).
   * NOT materialized into state.json / NormalizedJobState — journal-only.
   * Empty array if no lineage records have been appended.
   */
  lineage: LineageRecord[];
  /**
   * Present when a mid-journal corruption was detected (a committed line that is
   * not valid JSON or not a plain object). Absent when the journal is clean.
   *
   * Only the FIRST corruption is recorded; fold() continues building best-effort
   * results from the remaining valid lines even when corruption is set.
   * Tail-partial (dropped last line) is NOT a corruption and does not set this.
   */
  corruption?: FoldCorruption;
}

// ---------------------------------------------------------------------------
// fold — parse events.jsonl
// ---------------------------------------------------------------------------

/**
 * Fold all valid records from a jsonl string (file contents).
 *
 * Algorithm:
 * 1. Split into lines.
 * 2. Drop the last non-empty line if it fails JSON.parse (benign tail partial write).
 *    The remaining non-empty lines are the "committed" lines.
 * 3. For each committed line:
 *    - If JSON.parse throws → record corruption { reason: "invalid-json" } (first only).
 *    - If parsed value is null, an array, or a primitive → record corruption { reason: "not-an-object" } (first only).
 *    - Object records dispatch by `type`; unknown `type` values are silently ignored (forward compat).
 * 4. step-attempt records: group by step, assign attempt = groupIndex + 1.
 * 5. transition records: append to history array.
 * 6. interruption records: tracked (Stage 2 T-11).
 *
 * Corruption: only the FIRST offending committed line is recorded in `result.corruption`.
 * Folding continues on all remaining lines to produce best-effort steps/history.
 * Tail partial (the dropped last line) is NOT a corruption.
 * fold() never throws for any input string.
 */
export function fold(content: string): FoldResult {
  const lines = content.split("\n");

  // Collect non-empty lines
  const nonEmptyLines: string[] = [];
  for (const line of lines) {
    if (line.trim().length > 0) {
      nonEmptyLines.push(line);
    }
  }

  // Determine committed lines: drop the last non-empty line if it fails JSON.parse (tail partial).
  let committedLines: string[];
  if (nonEmptyLines.length === 0) {
    committedLines = [];
  } else {
    const lastLine = nonEmptyLines[nonEmptyLines.length - 1]!;
    let lastLineValid = true;
    try {
      JSON.parse(lastLine);
    } catch {
      lastLineValid = false;
    }
    if (lastLineValid) {
      committedLines = nonEmptyLines;
    } else {
      // Drop partial tail
      committedLines = nonEmptyLines.slice(0, -1);
    }
  }

  // Group step attempts by step name (in order of appearance)
  const stepGroups: Record<string, StepAttemptRecord[]> = {};
  const historyRecords: TransitionRecord[] = [];
  let lastInterruption: InterruptionRecord | undefined;
  const lineageRecords: LineageRecord[] = [];
  let corruption: FoldCorruption | undefined;

  for (let i = 0; i < committedLines.length; i++) {
    const line = committedLines[i]!;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      // Mid-journal invalid JSON — record first corruption, continue folding
      if (!corruption) {
        corruption = {
          lineIndex: i,
          reason: "invalid-json",
          snippet: line.slice(0, 120),
        };
      }
      continue;
    }

    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      // Committed line parsed but is not a plain object (null, array, or a primitive).
      // Note: typeof null === "object" and typeof [] === "object" in JS,
      // so we check both explicitly.
      if (!corruption) {
        corruption = {
          lineIndex: i,
          reason: "not-an-object",
          snippet: line.slice(0, 120),
        };
      }
      continue;
    }

    const obj = record as Record<string, unknown>;

    if (obj["type"] === "step-attempt") {
      const stepName = typeof obj["step"] === "string" ? obj["step"] : null;
      if (stepName === null) continue;
      if (!stepGroups[stepName]) stepGroups[stepName] = [];
      stepGroups[stepName]!.push(obj as unknown as StepAttemptRecord);
    } else if (obj["type"] === "transition") {
      historyRecords.push(obj as unknown as TransitionRecord);
    } else if (obj["type"] === "interruption") {
      // Track last interruption record (Stage 2 T-11: used for resumePoint materialization)
      lastInterruption = obj as unknown as InterruptionRecord;
    } else if (obj["type"] === "lineage") {
      // Collect lineage records in chronological order (D1, artifact-observability)
      lineageRecords.push(obj as unknown as LineageRecord);
    }
    // Unknown / legacy types (e.g. "history") are silently ignored for forward compat.
    // Unknown type is NOT a corruption — forward compatibility.
  }

  // Build steps: Record<stepName, StepRun[]>
  const steps: Record<string, StepRun[]> = {};
  const stepCounts: Record<string, number> = {};
  let stepsTotal = 0;

  for (const [stepName, records] of Object.entries(stepGroups)) {
    steps[stepName] = records.map((r, idx): StepRun => ({
      attempt: idx + 1,
      sessionId: r.sessionId,
      outcome: {
        verdict: r.outcome.verdict,
        findingsPath: r.outcome.findingsPath,
        error: r.outcome.error,
        ...(r.outcome.toolResult !== undefined ? { toolResult: r.outcome.toolResult } : {}),
        ...(r.outcome.followUpAttempts !== undefined ? { followUpAttempts: r.outcome.followUpAttempts } : {}),
        ...(r.outcome.transientRetryAttempts !== undefined ? { transientRetryAttempts: r.outcome.transientRetryAttempts } : {}),
        ...(r.outcome.skipReason !== undefined ? { skipReason: r.outcome.skipReason } : {}),
        ...(r.outcome.completionReportDiagnostics !== undefined ? { completionReportDiagnostics: r.outcome.completionReportDiagnostics } : {}),
        ...(r.outcome.addedTurns !== undefined ? { addedTurns: r.outcome.addedTurns } : {}),
      },
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    }));
    stepCounts[stepName] = records.length;
    stepsTotal += records.length;
  }

  // Build history: HistoryEntry[]
  const history: HistoryEntry[] = historyRecords.map((r) => ({
    ts: r.ts,
    step: r.step,
    status: r.status,
    message: r.message,
  }));

  return {
    steps,
    history,
    stepsTotal,
    stepCounts,
    historyCount: historyRecords.length,
    lineage: lineageRecords,
    ...(lastInterruption !== undefined ? { lastInterruption } : {}),
    ...(corruption !== undefined ? { corruption } : {}),
  };
}

// ---------------------------------------------------------------------------
// appendEventRecord — append a single record to events.jsonl
// ---------------------------------------------------------------------------

/**
 * Append a single event record to the given events.jsonl file.
 * Uses fs.appendFile to add exactly one line — never rewrites existing content.
 *
 * Creates parent directories if they don't exist.
 *
 * Design D3: fs.appendFile only. No reads, no rewrites.
 */
export async function appendEventRecord(
  filePath: string,
  record: EventRecord,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(record) + "\n";
  await fs.appendFile(filePath, line, "utf-8");
}

// ---------------------------------------------------------------------------
// stateRecordToEventRecord — convert StepRun to StepAttemptRecord
// ---------------------------------------------------------------------------

/**
 * Convert a StepRun to a StepAttemptRecord for journal append.
 * Note: `attempt` is NOT stored in the record — it is derived from fold position.
 */
export function stepRunToRecord(step: string, run: StepRun): StepAttemptRecord {
  const outcome = run.outcome ?? { verdict: null, findingsPath: null, error: null };
  return {
    type: "step-attempt",
    step,
    sessionId: run.sessionId,
    outcome: {
      verdict: outcome.verdict,
      findingsPath: outcome.findingsPath,
      error: outcome.error,
      ...(outcome.toolResult !== undefined ? { toolResult: outcome.toolResult } : {}),
      ...(outcome.followUpAttempts !== undefined ? { followUpAttempts: outcome.followUpAttempts } : {}),
      ...(outcome.transientRetryAttempts !== undefined ? { transientRetryAttempts: outcome.transientRetryAttempts } : {}),
      ...(outcome.skipReason !== undefined ? { skipReason: outcome.skipReason } : {}),
      ...(outcome.completionReportDiagnostics !== undefined ? { completionReportDiagnostics: outcome.completionReportDiagnostics } : {}),
      ...(outcome.addedTurns !== undefined ? { addedTurns: outcome.addedTurns } : {}),
    },
    startedAt: run.startedAt,
    endedAt: run.endedAt,
  };
}

/**
 * Convert a HistoryEntry to a TransitionRecord for journal append.
 */
export function historyEntryToRecord(entry: HistoryEntry): TransitionRecord {
  return {
    type: "transition",
    ts: entry.ts,
    step: entry.step,
    status: entry.status,
    message: entry.message,
  };
}
