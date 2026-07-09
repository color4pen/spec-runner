/**
 * `job stats` — aggregate run-level statistics (cost, convergence, duration).
 *
 * Architecture:
 *   - Pure derivation / aggregation: deriveRunStat, buildJobStatsReport (no I/O)
 *   - Pure renderers: renderJobStatsTable, renderJobStatsJson (no I/O)
 *   - IO orchestrator: runJobStats (reads files, calls above, writes stdout)
 *
 * Reuses existing mechanisms:
 *   - computeCostUsd / formatUsd (pricing.ts)
 *   - getJobSlug (state/job-slug.ts)
 *   - resolveChangeDir (core/job-access/resolve-change-dir.ts)
 *   - readUsageFile (core/usage/store.ts)
 *   - JobStateStore.list (store/job-state-store.ts)
 */

import * as path from "node:path";
import type { NormalizedJobState } from "../../store/job-state-store.js";
import type { UsageFile } from "../usage/types.js";
import { computeCostUsd, formatUsd } from "../usage/pricing.js";
import { getJobSlug } from "../../state/job-slug.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { resolveChangeDir } from "../job-access/resolve-change-dir.js";
import { readUsageFile } from "../usage/store.js";
import { stdoutWrite, stderrWrite } from "../../logger/stdout.js";
import { detectSpecrunnerWorktree } from "../worktree/detection.js";
import { worktreeGuardError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobStatRow {
  slug: string;
  date: string | null;
  durationSec: number | null;
  convergence: number | null;
  costUsd: number | null;
  outcome: string;
}

export interface JobStatsSummary {
  runCount: number;
  costUsdTotal: number | null;
  costUsdMedian: number | null;
  durationSecMedian: number | null;
  convergenceMean: number | null;
}

export interface JobStatsReport {
  runs: JobStatRow[];
  summary: JobStatsSummary;
}

// ---------------------------------------------------------------------------
// Built-in review-loop step names
// ---------------------------------------------------------------------------

const BUILTIN_REVIEW_STEPS = new Set(["spec-review", "code-review"]);

/**
 * Derive the set of review-loop step names for a given job state.
 * Includes built-in steps {"spec-review", "code-review"} plus any custom reviewer names.
 */
function reviewLoopStepNames(state: NormalizedJobState): Set<string> {
  const names = new Set(BUILTIN_REVIEW_STEPS);
  if (state.reviewers) {
    for (const r of state.reviewers) {
      names.add(r.name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Pure derivation
// ---------------------------------------------------------------------------

/**
 * Derive a single run stat row from job state and its usage file.
 *
 * - slug: from getJobSlug(state)
 * - date: YYYY-MM-DD part of state.createdAt; null if invalid
 * - durationSec: min(startedAt)..max(endedAt) across all StepRuns; null if no valid timestamps
 * - convergence: total non-skipped StepRun entries for review-loop steps;
 *     null if steps is empty (no step data), 0 if no review steps ran
 * - costUsd: sum of computeCostUsd for all non-null modelUsage entries; null if no priced pairs
 * - outcome: state.status
 */
export function deriveRunStat(state: NormalizedJobState, usageFile: UsageFile | null): JobStatRow {
  const slug = getJobSlug(state);

  // ── date ──────────────────────────────────────────────────────────────────
  let date: string | null = null;
  if (state.createdAt) {
    const d = new Date(state.createdAt);
    if (!isNaN(d.getTime())) {
      date = state.createdAt.slice(0, 10);
    }
  }

  // ── durationSec ───────────────────────────────────────────────────────────
  let minStartedAt: number | null = null;
  let maxEndedAt: number | null = null;

  for (const runs of Object.values(state.steps)) {
    for (const run of runs) {
      if (run.startedAt) {
        const t = new Date(run.startedAt).getTime();
        if (!isNaN(t)) {
          if (minStartedAt === null || t < minStartedAt) minStartedAt = t;
        }
      }
      if (run.endedAt) {
        const t = new Date(run.endedAt).getTime();
        if (!isNaN(t)) {
          if (maxEndedAt === null || t > maxEndedAt) maxEndedAt = t;
        }
      }
    }
  }

  const durationSec =
    minStartedAt !== null && maxEndedAt !== null
      ? Math.max(0, (maxEndedAt - minStartedAt) / 1000)
      : null;

  // ── convergence ───────────────────────────────────────────────────────────
  let convergence: number | null;
  const stepKeys = Object.keys(state.steps);

  if (stepKeys.length === 0) {
    convergence = null;
  } else {
    const reviewSteps = reviewLoopStepNames(state);
    let count = 0;
    for (const [stepName, runs] of Object.entries(state.steps)) {
      if (!reviewSteps.has(stepName)) continue;
      for (const run of runs) {
        if (run.outcome?.verdict !== "skipped") {
          count++;
        }
      }
    }
    convergence = count;
  }

  // ── costUsd ───────────────────────────────────────────────────────────────
  let costUsd: number | null = null;

  if (usageFile !== null) {
    let total = 0;
    let hasAny = false;
    const stateJobId = state.jobId;

    for (const inv of usageFile.commandInvocations) {
      // Exclude invocations that belong to a different job.
      // Invocations without a jobId (legacy format) are always included.
      if (inv.jobId !== undefined && inv.jobId !== stateJobId) continue;
      if (!inv.modelUsage) continue;
      for (const [model, usage] of Object.entries(inv.modelUsage)) {
        const c = computeCostUsd(model, usage);
        if (c !== null) {
          total += c;
          hasAny = true;
        }
      }
    }

    if (hasAny) {
      costUsd = total;
    }
  }

  // ── outcome ───────────────────────────────────────────────────────────────
  const outcome = state.status;

  return { slug, date, durationSec, convergence, costUsd, outcome };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Build an aggregated report from a flat list of run stat rows.
 *
 * - Sorts rows: date ascending (nulls last), then slug ascending.
 * - summary fields exclude null rows from their populations.
 * - median uses the even-count average-of-two-middle rule.
 */
export function buildJobStatsReport(rows: JobStatRow[]): JobStatsReport {
  // Sort: date asc (nulls last), then slug asc
  const sorted = [...rows].sort((a, b) => {
    if (a.date === null && b.date === null) return a.slug.localeCompare(b.slug);
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.slug.localeCompare(b.slug);
  });

  const runCount = sorted.length;

  const costValues = sorted.map((r) => r.costUsd).filter((v): v is number => v !== null);
  const durationValues = sorted.map((r) => r.durationSec).filter((v): v is number => v !== null);
  const convergenceValues = sorted.map((r) => r.convergence).filter((v): v is number => v !== null);

  const costUsdTotal = costValues.length > 0 ? costValues.reduce((a, b) => a + b, 0) : null;
  const costUsdMedian = medianOf(costValues);
  const durationSecMedian = medianOf(durationValues);
  const convergenceMean = meanOf(convergenceValues);

  return {
    runs: sorted,
    summary: {
      runCount,
      costUsdTotal,
      costUsdMedian,
      durationSecMedian,
      convergenceMean,
    },
  };
}

// ---------------------------------------------------------------------------
// Renderers (pure — no I/O)
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as a human-readable string.
 * null → "-"
 */
function formatDuration(sec: number | null): string {
  if (sec === null) return "-";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format a number to at most 1 decimal place, or "-" for null. */
function fmt1(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(1);
}

/**
 * Render a stats report as a human-readable table with summary footer.
 *
 * Columns: slug / date / duration / convergence / cost / outcome
 * Null values shown as "-".
 * No runs → shows a message.
 */
export function renderJobStatsTable(report: JobStatsReport): string {
  const { runs, summary } = report;

  const lines: string[] = [];

  if (runs.length === 0) {
    lines.push("No runs found.");
    lines.push("");
    lines.push("Summary: 0 runs");
    return lines.join("\n");
  }

  // Build table rows
  const headers = ["Slug", "Date", "Duration", "Convergence", "Cost", "Outcome"];
  const dataRows = runs.map((r) => [
    r.slug || "-",
    r.date ?? "-",
    formatDuration(r.durationSec),
    r.convergence !== null ? String(r.convergence) : "-",
    r.costUsd !== null ? formatUsd(r.costUsd) : "-",
    r.outcome,
  ]);

  // Compute column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...dataRows.map((row) => (row[i] ?? "").length)),
  );

  const separator = widths.map((w) => "─".repeat(w)).join("  ");

  // Header row
  lines.push(headers.map((h, i) => h.padEnd(widths[i]!)).join("  "));
  lines.push(separator);

  // Data rows
  for (const row of dataRows) {
    lines.push(row.map((cell, i) => (cell ?? "").padEnd(widths[i]!)).join("  "));
  }

  lines.push("");

  // Summary block
  const costTotalStr = summary.costUsdTotal !== null ? formatUsd(summary.costUsdTotal) : "-";
  const costMedianStr = summary.costUsdMedian !== null ? formatUsd(summary.costUsdMedian) : "-";
  const durationMedianStr = formatDuration(summary.durationSecMedian);
  const convergenceMeanStr = fmt1(summary.convergenceMean);

  lines.push(`Summary: ${summary.runCount} run${summary.runCount === 1 ? "" : "s"}`);
  lines.push(`  Cost:        total ${costTotalStr}  median ${costMedianStr}`);
  lines.push(`  Duration:    median ${durationMedianStr}`);
  lines.push(`  Convergence: mean ${convergenceMeanStr}`);

  return lines.join("\n");
}

/**
 * Render a stats report as JSON.
 *
 * Top-level keys: { runs, summary }
 * Row keys: slug / date / durationSec / convergence / costUsd / outcome
 * Summary keys: runCount / costUsdTotal / costUsdMedian / durationSecMedian / convergenceMean
 * Null values are preserved as null (not omitted).
 */
export function renderJobStatsJson(report: JobStatsReport): string {
  return JSON.stringify(report, null, 2);
}

// ---------------------------------------------------------------------------
// IO orchestrator
// ---------------------------------------------------------------------------

/**
 * List all runs (active + archived), compute stats, and print output.
 * Resilient: data-absent runs are not dropped; missing fields become null cells.
 * Always returns exit code 0.
 */
export async function runJobStats(opts: { cwd: string; json: boolean }): Promise<number> {
  const { cwd, json } = opts;

  // Worktree guard: reject from inside a specrunner job worktree
  const wtResult = await detectSpecrunnerWorktree(cwd);
  if (wtResult.isSpecrunnerWorktree) {
    const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
    const guardErr = worktreeGuardError("job stats", mainPath);
    stderrWrite(guardErr.message);
    stderrWrite(`Hint: ${guardErr.hint}`);
    return 2;
  }

  const states = await JobStateStore.list(cwd, { includeArchived: true });

  const rows: JobStatRow[] = [];

  for (const state of states) {
    try {
      // Normalize optional `steps` field to always be a Record
      const normalizedState: NormalizedJobState = {
        ...state,
        steps: state.steps ?? {},
      };

      // Resolve the change directory for usage.json
      const slug = getJobSlug(normalizedState);
      let usageFile: UsageFile | null = null;

      try {
        const changeDir = await resolveChangeDir(slug, cwd);
        if (changeDir) {
          const usagePath = path.join(changeDir, "usage.json");
          const read = await readUsageFile(usagePath);
          // readUsageFile returns { commandInvocations: [] } when ENOENT — treat as null
          if (read.commandInvocations.length > 0) {
            usageFile = read;
          }
        }
      } catch {
        // Usage file read error — treat as absent
      }

      rows.push(deriveRunStat(normalizedState, usageFile));
    } catch {
      // Entire state derivation failed — skip this run (do not drop, but can't produce row)
    }
  }

  const report = buildJobStatsReport(rows);

  const output = json ? renderJobStatsJson(report) : renderJobStatsTable(report);
  stdoutWrite(output + "\n");

  return 0;
}
