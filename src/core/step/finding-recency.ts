/**
 * finding-recency.ts — Finding recency classification for spec-review.
 *
 * Provides:
 *   - `classifyFindingRecency()` — pure function, 3-valued classification
 *   - `computeFindingRecency()` — async, per-finding classification with revision content resolution
 *   - `recordFindingRecency()` — async, orchestrates compute + journal append + stderr summary
 *
 * Design D4 (spec-review-full-enumeration):
 *   - Semantic completeness cannot be machine-verified directly.
 *   - Late-detection is a verifiable approximation: if a finding's target line existed
 *     in the prior revision, it was available in the prior round (classifies as "late").
 *   - Detection is observation-only; it does NOT change verdict or escalation reason.
 */

import type { Finding, FindingSeverity } from "../../kernel/report-result.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import { stderrWrite } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Three-valued classification of a finding's recency.
 *
 * - "late":          The finding's target line was already present in the prior revision.
 *                    The agent could have reported this in the previous round.
 * - "not-late":      The finding's target line is not in the prior revision (new code).
 * - "indeterminate": Cannot determine (missing line number, prior revision unavailable,
 *                    blank target line, or any other resolution failure).
 */
export type FindingRecency = "late" | "not-late" | "indeterminate";

/**
 * Per-finding result from computeFindingRecency().
 */
export interface FindingRecencyResult {
  file: string;
  line?: number;
  title: string;
  severity: FindingSeverity;
  recency: FindingRecency;
}

/**
 * Journal record schema for a finding-recency evaluation round.
 * Append-only; never materialized into NormalizedJobState.
 */
export interface FindingRecencyRecord {
  type: "finding-recency";
  step: string;
  ts: string;
  iteration: number;
  priorOid: string | null;
  findings: Array<{
    file: string;
    line?: number;
    title: string;
    severity: FindingSeverity;
    recency: FindingRecency;
  }>;
}

/**
 * Minimal store interface required by recordFindingRecency().
 * JobStateStore implements this after T-05.
 */
export interface FindingRecencyStore {
  appendFindingRecency(record: FindingRecencyRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// T-02: classifyFindingRecency — pure function
// ---------------------------------------------------------------------------

/**
 * Classify whether a finding's target line existed in the prior file revision.
 *
 * Algorithm (D4):
 *   1. `targetLineContent === null` → indeterminate (line number missing or out-of-range).
 *   2. `priorFileContent === null`  → indeterminate (prior revision unavailable).
 *   3. `needle = targetLineContent.trim()`; needle === "" → indeterminate (blank line).
 *   4. Split `priorFileContent` into lines, trim each; if needle matches any → "late".
 *   5. Otherwise → "not-late".
 *
 * Pure function: no I/O, no side effects.
 */
export function classifyFindingRecency(
  targetLineContent: string | null,
  priorFileContent: string | null,
): FindingRecency {
  if (targetLineContent === null) return "indeterminate";
  if (priorFileContent === null) return "indeterminate";

  const needle = targetLineContent.trim();
  if (needle === "") return "indeterminate";

  const priorLines = priorFileContent.split("\n");
  for (const line of priorLines) {
    if (line.trim() === needle) return "late";
  }
  return "not-late";
}

// ---------------------------------------------------------------------------
// T-04: computeFindingRecency — async per-finding classification
// ---------------------------------------------------------------------------

/**
 * Compute recency classification for each finding by reading the prior revision's
 * file content via `runtimeStrategy.readRevisionContent`.
 *
 * Fail-to-indeterminate contract:
 *   - `priorOid === null` → all indeterminate (no prior revision to compare).
 *   - `runtimeStrategy.readRevisionContent` absent → all indeterminate.
 *   - `finding.line === undefined` → indeterminate for that finding.
 *   - `readRevisionContent` throws → `{ current: null, prior: null }` (indeterminate).
 *   - `current` content line at `finding.line` out of range → targetLineContent = null (indeterminate).
 *
 * @param findings       - Agent findings to classify (scope findings pre-filtered by caller).
 * @param priorOid       - CommitOid of the prior spec-review round, or null.
 * @param cwd            - Working directory for the runtime.
 * @param branch         - Current branch name, or null.
 * @param runtimeStrategy - RuntimeStrategy instance.
 */
export async function computeFindingRecency(
  findings: Finding[],
  priorOid: string | null,
  cwd: string,
  branch: string | null,
  runtimeStrategy: RuntimeStrategy,
): Promise<FindingRecencyResult[]> {
  // Cache of per-file revision content to avoid redundant reads
  const contentCache = new Map<string, { current: string | null; prior: string | null }>();

  const results: FindingRecencyResult[] = [];

  for (const finding of findings) {
    // Guard: readRevisionContent not available → indeterminate
    if (typeof runtimeStrategy.readRevisionContent !== "function") {
      results.push({
        file: finding.file,
        line: finding.line,
        title: finding.title,
        severity: finding.severity,
        recency: "indeterminate",
      });
      continue;
    }

    // Guard: no prior OID → indeterminate
    if (priorOid === null) {
      results.push({
        file: finding.file,
        line: finding.line,
        title: finding.title,
        severity: finding.severity,
        recency: "indeterminate",
      });
      continue;
    }

    // Guard: no line number → indeterminate
    if (finding.line === undefined) {
      results.push({
        file: finding.file,
        line: finding.line,
        title: finding.title,
        severity: finding.severity,
        recency: "indeterminate",
      });
      continue;
    }

    // Resolve file content (cached per file)
    let pair = contentCache.get(finding.file);
    if (!pair) {
      try {
        pair = await runtimeStrategy.readRevisionContent!(finding.file, priorOid, cwd, branch);
      } catch {
        pair = { current: null, prior: null };
      }
      contentCache.set(finding.file, pair);
    }

    // Extract target line from current content (1-indexed line number)
    let targetLineContent: string | null = null;
    if (pair.current !== null) {
      const lines = pair.current.split("\n");
      const lineIndex = finding.line - 1; // convert to 0-indexed
      if (lineIndex >= 0 && lineIndex < lines.length) {
        targetLineContent = lines[lineIndex]!;
      }
    }

    const recency = classifyFindingRecency(targetLineContent, pair.prior);

    results.push({
      file: finding.file,
      line: finding.line,
      title: finding.title,
      severity: finding.severity,
      recency,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// T-04: recordFindingRecency — orchestrates compute + journal append + stderr
// ---------------------------------------------------------------------------

/**
 * Parameters for recordFindingRecency.
 */
export interface RecordFindingRecencyParams {
  store: FindingRecencyStore;
  stepName: string;
  iteration: number;
  priorOid: string | null;
  findings: Finding[];
  cwd: string;
  branch: string | null;
  runtimeStrategy: RuntimeStrategy;
}

/**
 * Compute finding recency and record the result to the journal.
 *
 * Contract:
 *   - `iteration < 2` → immediate return (no prior round to compare against).
 *   - `findings` empty (after caller's scope filtering) → return without append.
 *   - Calls `computeFindingRecency` for all findings.
 *   - Appends exactly one `FindingRecencyRecord` to the store.
 *   - If any finding is "late", writes a summary line to stderr.
 *   - Does NOT modify verdict, escalationReason, or any other state field.
 *   - All errors from compute/append are caller-responsibility (best-effort wrapper at call site).
 */
export async function recordFindingRecency(params: RecordFindingRecencyParams): Promise<void> {
  const { store, stepName, iteration, priorOid, findings, cwd, branch, runtimeStrategy } = params;

  // Gate: no prior round to compare against
  if (iteration < 2) return;

  // Gate: nothing to record
  if (findings.length === 0) return;

  const results = await computeFindingRecency(findings, priorOid, cwd, branch, runtimeStrategy);

  const record: FindingRecencyRecord = {
    type: "finding-recency",
    step: stepName,
    ts: new Date().toISOString(),
    iteration,
    priorOid,
    findings: results.map((r) => ({
      file: r.file,
      ...(r.line !== undefined ? { line: r.line } : {}),
      title: r.title,
      severity: r.severity,
      recency: r.recency,
    })),
  };

  await store.appendFindingRecency(record);

  // Emit stderr summary when late findings are present
  const lateCount = results.filter((r) => r.recency === "late").length;
  if (lateCount > 0) {
    const notLateCount = results.filter((r) => r.recency === "not-late").length;
    const indeterminateCount = results.filter((r) => r.recency === "indeterminate").length;
    stderrWrite(
      `[spec-review] 後出し検出: iteration ${iteration} で ${lateCount} 件の late finding` +
        ` (not-late: ${notLateCount}, indeterminate: ${indeterminateCount})`,
    );
  }
}
