/**
 * Operations view model for `job ls`.
 *
 * Pure functions — no I/O, no fs, no GitHub client.
 * Imports are restricted to: state/schema.js types and state/job-slug.js.
 *
 * Design decisions: D1–D7 in design.md.
 */

import type { JobState, JobStatus } from "../../state/schema.js";
import { getJobSlug } from "../../state/job-slug.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobCategoryId =
  | "running"
  | "awaiting-response"
  | "awaiting-archive"
  | "failed"
  | "terminal";

export interface JobViewRow {
  jobId: string;
  slug: string;
  step: string;
  status: JobStatus;
  stale: boolean;
  prMerged: boolean | null;
  escalationStep: string | null;
  nextAction: string | null;
  branch: string | null;
  createdAt: string;
}

export interface CategoryGroup {
  category: JobCategoryId;
  label: string;
  jobs: JobViewRow[];
}

export interface OperationsView {
  categories: CategoryGroup[];
}

export interface ViewEntry {
  job: JobState;
  isStale: boolean;
  prMerged: boolean | null;
}

// ---------------------------------------------------------------------------
// Category metadata — single source of truth for id / label / status mapping / order
// ---------------------------------------------------------------------------

interface CategoryMeta {
  id: JobCategoryId;
  label: string;
  /** Which JobStatus values belong to this category. */
  statuses: ReadonlySet<JobStatus>;
}

const CATEGORY_META: CategoryMeta[] = [
  {
    id: "running",
    label: "実行中",
    statuses: new Set<JobStatus>(["running"]),
  },
  {
    id: "awaiting-response",
    label: "対応待ち",
    statuses: new Set<JobStatus>(["awaiting-resume"]),
  },
  {
    id: "awaiting-archive",
    label: "merge・archive 待ち",
    statuses: new Set<JobStatus>(["awaiting-archive"]),
  },
  {
    id: "failed",
    label: "失敗・停止",
    statuses: new Set<JobStatus>(["failed", "terminated"]),
  },
  {
    id: "terminal",
    label: "終了済み",
    statuses: new Set<JobStatus>(["archived", "canceled"]),
  },
];

// Compile-time exhaustiveness: this will fail at runtime if any JobStatus is unmapped.
// We verify at module load that all 7 statuses are covered.
const ALL_STATUSES: JobStatus[] = [
  "running",
  "awaiting-resume",
  "awaiting-archive",
  "failed",
  "terminated",
  "archived",
  "canceled",
];

// Build a lookup map: JobStatus → CategoryMeta
const STATUS_TO_CATEGORY: ReadonlyMap<JobStatus, CategoryMeta> = (() => {
  const map = new Map<JobStatus, CategoryMeta>();
  for (const meta of CATEGORY_META) {
    for (const status of meta.statuses) {
      map.set(status, meta);
    }
  }
  // Verify exhaustiveness at module initialization
  for (const s of ALL_STATUSES) {
    if (!map.has(s)) {
      throw new Error(`BUG: JobStatus "${s}" is not mapped to any category in operations-view.ts`);
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// categorizeStatus
// ---------------------------------------------------------------------------

/**
 * Map a JobStatus to a JobCategoryId.
 * Covers all 7 values of JobStatus exhaustively.
 */
export function categorizeStatus(status: JobStatus): JobCategoryId {
  const meta = STATUS_TO_CATEGORY.get(status);
  if (meta === undefined) {
    // Should never happen given compile-time coverage; guard for safety.
    throw new Error(`Unknown JobStatus: "${status}"`);
  }
  return meta.id;
}

// ---------------------------------------------------------------------------
// deriveEscalationSourceStep
// ---------------------------------------------------------------------------

/**
 * Find the step name of the most recent escalation verdict.
 *
 * Scans all StepRun entries in state.steps.
 * Among runs with outcome.verdict === "escalation", picks the one with
 * the greatest endedAt (falls back to startedAt when endedAt is absent).
 * Returns null when no such run exists.
 */
export function deriveEscalationSourceStep(state: JobState): string | null {
  const steps = state.steps ?? {};
  let bestStepName: string | null = null;
  let bestTs: string | null = null;

  for (const [stepName, runs] of Object.entries(steps)) {
    for (const run of runs) {
      if (run.outcome.verdict !== "escalation") continue;
      const ts = run.endedAt ?? run.startedAt;
      if (bestTs === null || ts > bestTs) {
        bestTs = ts;
        bestStepName = stepName;
      }
    }
  }

  return bestStepName;
}

// ---------------------------------------------------------------------------
// deriveNextAction
// ---------------------------------------------------------------------------

/**
 * Compute the recommended next CLI action for a job row.
 *
 * Returns a command string or null when no action is recommended.
 * Mapping (design.md D4):
 *   running + not stale   → null
 *   running + stale       → "job resume <slug>"
 *   awaiting-resume       → "job resume <slug>"
 *   awaiting-archive + prMerged===true  → "job archive <slug>"
 *   awaiting-archive + other            → null
 *   failed                → "job resume <slug>"
 *   terminated            → "job resume <slug>"
 *   archived              → null
 *   canceled              → null
 */
export function deriveNextAction(input: {
  status: JobStatus;
  isStale: boolean;
  prMerged: boolean | null;
  slug: string;
}): string | null {
  const { status, isStale, prMerged, slug } = input;
  switch (status) {
    case "running":
      return isStale ? `job resume ${slug}` : null;
    case "awaiting-resume":
      return `job resume ${slug}`;
    case "awaiting-archive":
      return prMerged === true ? `job archive ${slug}` : null;
    case "failed":
      return `job resume ${slug}`;
    case "terminated":
      return `job resume ${slug}`;
    case "archived":
      return null;
    case "canceled":
      return null;
    default: {
      // Exhaustive check — TypeScript will error if a case is missing
      const _exhaustive: never = status;
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// buildOperationsView
// ---------------------------------------------------------------------------

/**
 * Assemble an OperationsView from a list of enriched entries.
 *
 * - Converts each ViewEntry to a JobViewRow.
 * - escalationStep is set only for awaiting-resume jobs; otherwise null.
 * - Categorizes each row by status.
 * - Within each category, rows are sorted by createdAt descending.
 * - Empty categories are excluded.
 * - Categories are in fixed order per CATEGORY_META.
 */
export function buildOperationsView(entries: ViewEntry[]): OperationsView {
  // Accumulate rows per category id
  const buckets = new Map<JobCategoryId, JobViewRow[]>();
  for (const meta of CATEGORY_META) {
    buckets.set(meta.id, []);
  }

  for (const entry of entries) {
    const { job, isStale, prMerged } = entry;
    const slug = getJobSlug(job);
    const categoryId = categorizeStatus(job.status);

    // escalationStep only for awaiting-resume
    const escalationStep =
      job.status === "awaiting-resume"
        ? deriveEscalationSourceStep(job)
        : null;

    const nextAction = deriveNextAction({
      status: job.status,
      isStale,
      prMerged,
      slug,
    });

    const row: JobViewRow = {
      jobId: job.jobId,
      slug,
      step: job.step,
      status: job.status,
      stale: isStale,
      prMerged,
      escalationStep,
      nextAction,
      branch: job.branch ?? null,
      createdAt: job.createdAt,
    };

    buckets.get(categoryId)!.push(row);
  }

  // Sort within each category by createdAt descending
  for (const rows of buckets.values()) {
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Build categories in fixed order, skipping empty ones
  const categories: CategoryGroup[] = [];
  for (const meta of CATEGORY_META) {
    const jobs = buckets.get(meta.id)!;
    if (jobs.length === 0) continue;
    categories.push({ category: meta.id, label: meta.label, jobs });
  }

  return { categories };
}

// ---------------------------------------------------------------------------
// formatOperationsViewHuman — T-02
// ---------------------------------------------------------------------------

/** Width of the STATUS column in TTY mode — wide enough for annotations. */
const STATUS_COLUMN_WIDTH = 48;

/**
 * Build the STATUS column string with annotations.
 */
function buildStatusCell(row: JobViewRow): string {
  if (row.status === "running" && row.stale) {
    return "running (stale?)";
  }
  if (row.status === "awaiting-resume" && row.escalationStep !== null) {
    return `awaiting-resume (escalation: ${row.escalationStep})`;
  }
  if (row.status === "awaiting-archive" && row.prMerged === true) {
    return "awaiting-archive (PR merged)";
  }
  return row.status;
}

/**
 * Format a job's age in human-readable form.
 * Re-uses the formatAge logic from ps.ts (copied here to stay import-clean).
 */
function formatAgeInternal(createdAt: string, nowMs: number): string {
  const created = new Date(createdAt).getTime();
  const diffMs = nowMs - created;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMinutes > 0) return `${diffMinutes}m`;
  return `${diffSeconds}s`;
}

function truncateInternal(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Format the operations view for human consumption.
 *
 * Layout: non-empty categories as sections, each with:
 *   [label line]
 *   [header line]
 *   [separator]
 *   [rows]
 *
 * Columns: JOB_ID(8) / SLUG / STEP / STATUS / NEXT / AGE
 * TTY: fixed-width pad
 * non-TTY: TAB-separated
 *
 * Returns empty string when view has no categories (caller outputs "No jobs found.").
 */
export function formatOperationsViewHuman(
  view: OperationsView,
  opts: { isTty: boolean; nowMs?: number },
): string {
  if (view.categories.length === 0) return "";

  const nowMs = opts.nowMs ?? Date.now();
  const { isTty } = opts;
  const lines: string[] = [];

  for (const group of view.categories) {
    // Category label
    lines.push(`[${group.label}]`);

    // Column header
    if (isTty) {
      const header = [
        "JOB_ID".padEnd(8),
        "SLUG".padEnd(30),
        "STEP".padEnd(25),
        "STATUS".padEnd(STATUS_COLUMN_WIDTH),
        "NEXT".padEnd(30),
        "AGE".padEnd(8),
      ].join("  ");
      lines.push(header);
      lines.push("-".repeat(header.length));
    } else {
      lines.push(["JOB_ID", "SLUG", "STEP", "STATUS", "NEXT", "AGE"].join("\t"));
    }

    // Rows
    for (const row of group.jobs) {
      const jobIdShort = row.jobId.slice(0, 8);
      const slug = truncateInternal(row.slug, 30);
      const step = truncateInternal(row.step, 25);
      const statusCell = buildStatusCell(row);
      const nextCell = row.nextAction ?? "-";
      const age = formatAgeInternal(row.createdAt, nowMs);

      if (isTty) {
        lines.push(
          [
            jobIdShort.padEnd(8),
            slug.padEnd(30),
            step.padEnd(25),
            statusCell.padEnd(STATUS_COLUMN_WIDTH),
            nextCell.padEnd(30),
            age.padEnd(8),
          ].join("  "),
        );
      } else {
        lines.push([jobIdShort, slug, step, statusCell, nextCell, age].join("\t"));
      }
    }

    lines.push(""); // blank line between sections
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// formatOperationsViewJson — T-03
// ---------------------------------------------------------------------------

/**
 * Format the operations view as machine-readable JSON.
 *
 * Top-level structure: { categories }
 * Each category: { category, label, jobs }
 * Each job: { jobId, slug, step, status, stale, prMerged, escalationStep, nextAction, branch, createdAt }
 *
 * Trailing newline included (mirrors existing config-effective JSON output).
 */
export function formatOperationsViewJson(view: OperationsView): string {
  return JSON.stringify({ categories: view.categories }, null, 2) + "\n";
}
