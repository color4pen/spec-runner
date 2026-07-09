/**
 * Handler for `specrunner job show <jobId|slug>`.
 *
 * Displays key fields of a job state:
 *   Job ID / Status / Branch / Step / Created / Updated / Log
 *
 * Also displays lineage (artifact provenance) and step-by-step cost sections
 * when the data is available in events.jsonl / usage.json.
 *
 * Input resolution:
 *   - UUID format (/^[a-f0-9-]{36}$/) → load by jobId directly
 *   - Otherwise → resolve by slug (all jobs, latest updatedAt wins)
 */
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { JobStateStore } from "../store/job-state-store.js";
import { loadStateByJobId } from "../core/job-access/load-by-job-id.js";
import { getJobSlug } from "../state/job-slug.js";
import type { JobState } from "../state/schema.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import { logResult, stderrWrite } from "../logger/stdout.js";
import { detectSpecrunnerWorktree } from "../core/worktree/detection.js";
import { worktreeGuardError, SpecRunnerError, ERROR_CODES } from "../errors.js";
import { getVerboseLogPath } from "../util/xdg.js";
import { fold } from "../store/event-journal.js";
import type { LineageRecord } from "../store/event-journal.js";
import { readUsageFile } from "../core/usage/store.js";
import { computeCostUsd, formatUsd } from "../core/usage/pricing.js";
import type { ModelUsage } from "../state/schema.js";
import { resolveChangeDir } from "../core/job-access/resolve-change-dir.js";

const UUID_REGEX = /^[a-f0-9-]{36}$/;

/**
 * Run `job show` — print key fields to stdout.
 * Returns the exit code: 0 = success, 1 = error.
 */
export async function runJobShow(input: string): Promise<number> {
  // Read-only command — fallback to cwd if git unavailable
  const repoRoot = (await resolveRepoRoot()) ?? process.cwd();

  // Worktree guard: reject from inside a specrunner job worktree.
  // Uses resolved repoRoot (which equals the worktree root when running from inside one)
  // so that git-aware resolution captures worktree context correctly.
  const wtResult = await detectSpecrunnerWorktree(repoRoot);
  if (wtResult.isSpecrunnerWorktree) {
    const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
    const guardErr = worktreeGuardError("job show", mainPath);
    stderrWrite(guardErr.message);
    stderrWrite(`Hint: ${guardErr.hint}`);
    return 2;
  }

  let state: JobState;

  if (UUID_REGEX.test(input)) {
    // Load via sidecar → slug dir
    try {
      const loaded = await loadStateByJobId(repoRoot, input);
      state = loaded as JobState;
    } catch (err: unknown) {
      if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FOUND) {
        stderrWrite(`Error: Job not found: ${input}`);
        return 1;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        stderrWrite(`Error: Job not found: ${input}`);
        return 1;
      }
      const msg = err instanceof Error ? err.message : String(err);
      stderrWrite(`Error: ${msg}`);
      return 1;
    }
  } else {
    // Resolve by slug
    const allJobs = await JobStateStore.list(repoRoot, { includeArchived: true });
    const matching = allJobs.filter((j) => getJobSlug(j) === input);
    if (matching.length === 0) {
      stderrWrite(`Error: Job not found for slug: ${input}`);
      return 1;
    }
    // Pick most recently updated
    state = [...matching].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0]!;
  }

  await printJobState(state, repoRoot);
  return 0;
}

export async function printJobState(state: JobState, repoRoot: string = process.cwd()): Promise<void> {
  logResult(`Job ID:  ${state.jobId}`);
  logResult(`Status:  ${state.status}`);
  logResult(`Branch:  ${state.branch ?? "(none)"}`);
  logResult(`Step:    ${state.step ?? "(none)"}`);
  logResult(`Created: ${state.createdAt}`);
  logResult(`Updated: ${state.updatedAt}`);

  // Show pipeline log path (relative to repoRoot for readability)
  const logPath = getVerboseLogPath(repoRoot, state.jobId);
  if (fs.existsSync(logPath)) {
    const relPath = path.relative(repoRoot, logPath);
    logResult(`Log:     ${relPath}`);
  } else {
    logResult(`Log:     (none)`);
  }

  // Resolve the change dir for the slug (active → archive)
  const slug = getJobSlug(state);
  if (!slug) return;

  const changeDir = await resolveChangeDir(slug, repoRoot);

  // ── Lineage section ─────────────────────────────────────────────────────────
  const lineage = changeDir ? await readLineage(changeDir) : [];
  if (lineage.length > 0) {
    logResult(`\n${"─".repeat(40)}`);
    logResult("Lineage:");
    for (const rec of lineage) {
      logResult(`  ${rec.step} (${rec.ts})`);
      if (rec.outputs.length > 0) {
        logResult("    outputs:");
        for (const o of rec.outputs) {
          logResult(`      ${o.path}  ${o.hash ?? "(hash unavailable)"}`);
        }
      }
      if (rec.inputs.length > 0) {
        logResult("    inputs:");
        for (const inp of rec.inputs) {
          logResult(`      ${inp.path}  ${inp.hash ?? "(hash unavailable)"}`);
        }
      }
    }
  }

  // ── Cost section ─────────────────────────────────────────────────────────────
  const usagePath = changeDir ? path.join(changeDir, "usage.json") : null;
  if (usagePath) {
    const stepCosts = await computeStepCosts(usagePath);
    if (stepCosts.size > 0) {
      logResult(`\n${"─".repeat(40)}`);
      logResult("Cost by step:");
      for (const [stepName, cost] of stepCosts.entries()) {
        const totalIn = cost.totalUsage.inputTokens;
        const totalOut = cost.totalUsage.outputTokens;
        const usd = formatUsd(cost.totalUsd);
        logResult(
          `  ${stepName}: in=${totalIn} out=${totalOut} ${usd}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read lineage records from events.jsonl in the given change dir.
 * Returns an empty array if the file doesn't exist or has no lineage records.
 */
async function readLineage(changeDir: string): Promise<LineageRecord[]> {
  const eventsPath = path.join(changeDir, "events.jsonl");
  try {
    const content = await fsPromises.readFile(eventsPath, "utf-8");
    const result = fold(content);
    return result.lineage;
  } catch {
    return [];
  }
}

/** Aggregated cost per step. */
interface StepCostEntry {
  totalUsage: ModelUsage;
  totalUsd: number | null;
}

/**
 * Read usage.json and aggregate token counts and USD cost per step.
 * Returns a Map<stepName, StepCostEntry> (empty if no data).
 */
async function computeStepCosts(usagePath: string): Promise<Map<string, StepCostEntry>> {
  const file = await readUsageFile(usagePath);
  const byStep = new Map<string, { usage: Record<string, ModelUsage> }>();

  for (const inv of file.commandInvocations) {
    if (!inv.stepName || !inv.modelUsage) continue;
    if (!byStep.has(inv.stepName)) {
      byStep.set(inv.stepName, { usage: {} });
    }
    const entry = byStep.get(inv.stepName)!;
    for (const [model, usage] of Object.entries(inv.modelUsage)) {
      if (!entry.usage[model]) {
        entry.usage[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
      }
      const m = entry.usage[model]!;
      m.inputTokens += usage.inputTokens;
      m.outputTokens += usage.outputTokens;
      m.cacheReadInputTokens += usage.cacheReadInputTokens;
      m.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    }
  }

  const result = new Map<string, StepCostEntry>();
  for (const [stepName, { usage }] of byStep.entries()) {
    // Aggregate across all models for this step
    const totalUsage: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
    let totalUsd: number | null = 0;

    for (const [model, mu] of Object.entries(usage)) {
      totalUsage.inputTokens += mu.inputTokens;
      totalUsage.outputTokens += mu.outputTokens;
      totalUsage.cacheReadInputTokens += mu.cacheReadInputTokens;
      totalUsage.cacheCreationInputTokens += mu.cacheCreationInputTokens;
      const usd = computeCostUsd(model, mu);
      if (usd === null) {
        totalUsd = null; // at least one unknown model
      } else if (totalUsd !== null) {
        totalUsd += usd;
      }
    }

    result.set(stepName, { totalUsage, totalUsd });
  }

  return result;
}
