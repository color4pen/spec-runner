/**
 * Pure functions for step output contract verification.
 *
 * All functions in this module are pure (no I/O, no state mutation).
 * Runtime I/O (filesystem / GitHub API) lives in RuntimeStrategy implementations.
 *
 * Design: symmetric to validateStepInputs — detect is CLI-deterministic (zero tokens),
 * repair is agent follow-up (same-session), last resort is halt → escalation.
 */

import type { IoRef, AgentStep, StepDeps } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type {
  OutputContract,
  OutputViolation,
  OutputCheckResult,
  ContentFormatCheck,
} from "../port/output-contract.js";
import { getOutputTemplates } from "../../templates/step-output-templates.js";

/**
 * Maximum number of follow-up attempts for output verification repair.
 * Matches DEFAULT_TOOL_RETRY.maxAttempts for budget parity.
 */
export const OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2;

/**
 * Extract the labels of unchecked task items from a tasks.md string.
 *
 * Matches lines of the form `- [ ] <label>` (unchecked).
 * Excludes `- [x]` and `- [X]` (checked).
 * Returns an array of label strings (trimmed), empty when all tasks are complete.
 *
 * Pure function — no I/O.
 */
export function parseIncompleteTaskLabels(tasksMd: string): string[] {
  const lines = tasksMd.split("\n");
  const labels: string[] = [];
  for (const line of lines) {
    // Match "- [ ] label" — unchecked checkbox
    const match = /^(\s*)-\s+\[\s\]\s+(.+)$/.exec(line);
    if (match) {
      const label = match[2]?.trim();
      if (label) labels.push(label);
    }
  }
  return labels;
}

/**
 * Remove HTML comments (`<!-- ... -->`) from a Markdown string.
 *
 * Handles single-line and multi-line comments (non-greedy).
 * Returns the comment-stripped text with comment positions collapsed to empty string.
 *
 * Pure function — no I/O.
 */
export function stripHtmlComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Evaluate a set of ContentFormatChecks against the given file content.
 *
 * - `content === null` (file missing): all checks fail — returns all labels.
 * - Otherwise: strips HTML comments, then tests each check's pattern.
 *   Returns an array of labels whose patterns did NOT match.
 *
 * Pure function — no I/O.
 */
export function evaluateContentFormatChecks(
  content: string | null,
  checks: ContentFormatCheck[],
): string[] {
  if (checks.length === 0) return [];
  if (content === null) {
    // File missing — all checks fail
    return checks.map((c) => c.label);
  }
  const stripped = stripHtmlComments(content);
  const failed: string[] = [];
  for (const check of checks) {
    const re = new RegExp(check.pattern, check.flags ?? "");
    if (!re.test(stripped)) {
      failed.push(check.label);
    }
  }
  return failed;
}

/**
 * Derive produced OutputContracts from a step's writes() declaration.
 *
 * Filters to entries where:
 *   - artifact !== "gitState"  (git state writes are not file artifacts)
 *   - verify !== false         (explicitly excluded writes are skipped)
 *
 * All produced contracts use policy "halt" — an empty scaffold committed to the
 * branch is the failure mode we prevent here.
 *
 * @param writes   - IoRef[] from step.writes(state, deps). May be undefined (steps without writes).
 * @param scaffolds - Map of worktree-relative path → scaffold content placed before the step ran.
 *                    When a path appears here, the gate checks that the agent overwrote it.
 *
 * Pure function — no I/O.
 */
export function producedContractsFromWrites(
  writes: IoRef[] | undefined,
  scaffolds: Record<string, string>,
): OutputContract[] {
  if (!writes || writes.length === 0) return [];
  const contracts: OutputContract[] = [];
  for (const w of writes) {
    if (w.artifact === "gitState") continue;
    if (w.verify === false) continue;
    contracts.push({
      kind: "produced",
      path: w.path,
      policy: "halt",
      scaffold: scaffolds[w.path],
    });
  }
  return contracts;
}

/**
 * Build a repair follow-up prompt from the current set of output violations.
 *
 * The prompt is conditional — it lists the specific incomplete tasks / missing
 * paths so the agent has actionable detail rather than a generic nudge.
 *
 * Pure function — no I/O. Callers must not call this when violations is empty.
 */
export function buildOutputFollowUpPrompt(violations: OutputViolation[]): string {
  const lines: string[] = [
    "Output verification detected incomplete work. Please address the following:",
    "",
  ];

  const tasksViolations = violations.filter((v) => v.kind === "tasks-complete");
  const producedViolations = violations.filter((v) => v.kind === "produced");
  const contentFormatViolations = violations.filter((v) => v.kind === "content-format");

  if (tasksViolations.length > 0) {
    lines.push("## Incomplete tasks (tasks.md)");
    lines.push("");
    lines.push("The following tasks are still marked `- [ ]` (unchecked). Complete them and update the checkboxes to `- [x]`:");
    lines.push("");
    for (const v of tasksViolations) {
      if (v.detail.length > 0) {
        for (const label of v.detail) {
          lines.push(`- ${label}`);
        }
      } else {
        lines.push(`- (see ${v.path} for remaining unchecked items)`);
      }
    }
    lines.push("");
  }

  if (producedViolations.length > 0) {
    lines.push("## Missing or empty output files");
    lines.push("");
    lines.push("The following files are missing, empty, or still contain the unmodified template. Write the required content:");
    lines.push("");
    for (const v of producedViolations) {
      lines.push(`- ${v.path}`);
    }
    lines.push("");
  }

  if (contentFormatViolations.length > 0) {
    lines.push("## Format violations in output files");
    lines.push("");
    lines.push("The following files have format violations. Use the Read tool to read each file and fix the listed issues:");
    lines.push("");
    for (const v of contentFormatViolations) {
      const labelList = v.detail.length > 0 ? v.detail.join(", ") : "see file";
      lines.push(`- ${v.path} (failed checks: ${labelList})`);
    }
    lines.push("");
    lines.push("Fix the format issues in the file(s) listed above. Do not use tool calls to submit results.");
    lines.push("");
  }

  lines.push("After completing the work, commit and push your changes.");

  return lines.join("\n");
}

/**
 * Partition violations by their response policy.
 *
 * Returns:
 *   followUp — violations with policy "follow-up" (repair via same-session prompt)
 *   halt     — violations with policy "halt" (immediate pipeline stop)
 *
 * Pure function — no I/O.
 */
export function partitionByPolicy(result: OutputCheckResult): {
  followUp: OutputViolation[];
  halt: OutputViolation[];
} {
  const followUp: OutputViolation[] = [];
  const halt: OutputViolation[] = [];
  for (const v of result.violations) {
    if (v.policy === "follow-up") {
      followUp.push(v);
    } else {
      halt.push(v);
    }
  }
  return { followUp, halt };
}

/**
 * Build the full set of output contracts for an agent step.
 *
 * Combines:
 *   1. Produced contracts auto-derived from step.writes() — each write entry
 *      that is not gitState and not verify:false becomes a "produced" contract,
 *      with the scaffold content (if a template was written before the step ran)
 *      so the gate can detect uncommitted scaffold files.
 *   2. Step-declared contracts from step.outputContracts() — additional kinds
 *      such as "tasks-complete".
 *
 * Pure function — no I/O. getOutputTemplates reads from the in-memory template
 * registry (no filesystem access).
 */
export function buildAllOutputContracts(
  step: AgentStep,
  state: JobState,
  deps: StepDeps,
): OutputContract[] {
  const templates = getOutputTemplates(step.name, deps.slug, state);
  const scaffolds: Record<string, string> = {};
  for (const tpl of templates) {
    scaffolds[tpl.path] = tpl.content;
  }
  const producedContracts = producedContractsFromWrites(step.writes?.(state, deps), scaffolds);
  const stepContracts: OutputContract[] = step.outputContracts?.(state, deps) ?? [];
  return [...producedContracts, ...stepContracts];
}
