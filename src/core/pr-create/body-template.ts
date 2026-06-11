/**
 * PR body template renderer.
 * Generates PR title and body from ParsedRequest + JobState.
 *
 * Design D4: body is generated from request.md sections + pipeline execution summary.
 * commit messages are NOT used (noisy and variable quality).
 */
import type { ParsedRequest } from "../../parser/request-md.js";
import type { JobState, StepRun } from "../../state/schema.js";
import { specReviewResultPath, verificationResultPath, reviewFeedbackPath, changeFolderPath } from "../../util/paths.js";
import { STEP_NAMES } from "../step/step-names.js";
import { getConventionalPrefix } from "../../config/type-config.js";

/** Conventional commits prefix pattern — e.g. "feat:", "fix(scope):" */
const CONVENTIONAL_PREFIX_RE = /^(feat|fix|refactor|chore|docs|style|perf|test|ci|build|revert)(\(.+\))?:/;

/**
 * Render the PR title from the request.md H1 heading.
 * Prepends the conventional commits prefix derived from the request type,
 * unless the title already carries a prefix.
 */
export function renderPrTitle(parsedRequest: ParsedRequest): string {
  const title = parsedRequest.title;
  if (CONVENTIONAL_PREFIX_RE.test(title)) {
    return title;
  }
  const prefix = getConventionalPrefix(parsedRequest.type);
  return `${prefix}: ${title}`;
}

/**
 * Render the PR body from request sections and job state.
 *
 * Structure:
 * ## Summary
 * <背景 and 目的 from request.md>
 *
 * ## Workflow
 * | Phase | Verdict | Iterations | Result Path |
 * ...
 *
 * ## Test plan
 * - [ ] ...
 *
 * 🤖 Generated with SpecRunner
 */
export function renderPrBody(params: {
  parsedRequest: ParsedRequest;
  jobState: JobState;
  slug: string;
}): string {
  const { parsedRequest, jobState, slug } = params;
  const sections: string[] = [];

  // --- Summary section ---
  sections.push("## Summary");
  const background = parsedRequest.sections?.["背景"];
  const purpose = parsedRequest.sections?.["目的"];

  if (background) {
    sections.push("### 背景");
    sections.push(background);
  }
  if (purpose) {
    sections.push("### 目的");
    sections.push(purpose);
  }
  if (!background && !purpose) {
    sections.push("_No 背景/目的 sections found in request.md._");
  }

  // --- Fixes line (auto-close linked issue on PR merge) ---
  // issueNumber (from job state) takes priority; falls back to request.md issue field.
  if (jobState.issueNumber != null) {
    sections.push(`Fixes #${jobState.issueNumber}`);
  } else if (parsedRequest.issue) {
    sections.push(`Fixes ${parsedRequest.issue}`);
  }

  // --- Workflow table ---
  sections.push("## Workflow");

  const workflowPhases: { name: string; stepKey: string; resultPathTemplate: (slug: string, n: number) => string }[] = [
    {
      name: STEP_NAMES.SPEC_REVIEW,
      stepKey: STEP_NAMES.SPEC_REVIEW,
      resultPathTemplate: (slug, n) => specReviewResultPath(slug, n),
    },
    {
      name: STEP_NAMES.VERIFICATION,
      stepKey: STEP_NAMES.VERIFICATION,
      resultPathTemplate: (slug, _n) => verificationResultPath(slug),
    },
    {
      name: STEP_NAMES.CODE_REVIEW,
      stepKey: STEP_NAMES.CODE_REVIEW,
      resultPathTemplate: (slug, n) => reviewFeedbackPath(slug, n),
    },
  ];

  const tableRows: string[] = [];
  tableRows.push("| Phase | Verdict | Iterations | Result Path |");
  tableRows.push("|-------|---------|------------|-------------|");

  for (const phase of workflowPhases) {
    const runs: StepRun[] = jobState.steps?.[phase.stepKey] ?? [];
    if (runs.length === 0) {
      // TC-034: omit phases that did not run
      continue;
    }
    const lastRun = runs[runs.length - 1]!;
    const verdict = lastRun.outcome.verdict ?? "—";
    const iterations = runs.length;
    const resultPath = phase.resultPathTemplate(slug, iterations);
    tableRows.push(`| ${phase.name} | ${verdict} | ${iterations} | ${resultPath} |`);
  }

  sections.push(tableRows.join("\n"));

  // --- Test plan section ---
  sections.push("## Test plan");
  const verificationRuns: StepRun[] = jobState.steps?.[STEP_NAMES.VERIFICATION] ?? [];
  if (verificationRuns.length > 0) {
    const lastVerification = verificationRuns[verificationRuns.length - 1]!;
    const verificationPath = lastVerification.outcome.findingsPath
      ?? verificationResultPath(slug);
    sections.push(`- [ ] Review verification results: \`${verificationPath}\``);
  } else {
    sections.push("- [ ] Run verification and confirm all tests pass.");
  }

  // Add test cases reference if there's a test-cases file
  sections.push(`- [ ] Confirm must test cases in \`${changeFolderPath(slug)}/test-cases.md\` are covered.`);

  // --- Signature ---
  sections.push("🤖 Generated with SpecRunner");

  return sections.join("\n\n");
}
