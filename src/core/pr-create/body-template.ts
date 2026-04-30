/**
 * PR body template renderer.
 * Generates PR title and body from ParsedRequest + JobState.
 *
 * Design D4: body is generated from request.md sections + pipeline execution summary.
 * commit messages are NOT used (noisy and variable quality).
 */
import type { ParsedRequest } from "../../parser/request-md.js";
import type { JobState, StepRun } from "../../state/schema.js";

/**
 * Render the PR title from the request.md H1 heading.
 * Returns the title as-is (truncation is out of scope for initial version).
 */
export function renderPrTitle(parsedRequest: ParsedRequest): string {
  return parsedRequest.title;
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

  // --- Workflow table ---
  sections.push("## Workflow");

  const workflowPhases: { name: string; stepKey: string; resultPathTemplate: (slug: string, n: number) => string }[] = [
    {
      name: "spec-review",
      stepKey: "spec-review",
      resultPathTemplate: (slug, n) => `openspec/changes/${slug}/spec-review-result-${String(n).padStart(3, "0")}.md`,
    },
    {
      name: "verification",
      stepKey: "verification",
      resultPathTemplate: (slug, _n) => `openspec/changes/${slug}/verification-result.md`,
    },
    {
      name: "code-review",
      stepKey: "code-review",
      resultPathTemplate: (slug, n) => `openspec/changes/${slug}/review-feedback-${String(n).padStart(3, "0")}.md`,
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
  const verificationRuns: StepRun[] = jobState.steps?.["verification"] ?? [];
  if (verificationRuns.length > 0) {
    const lastVerification = verificationRuns[verificationRuns.length - 1]!;
    const verificationPath = lastVerification.outcome.findingsPath
      ?? `openspec/changes/${slug}/verification-result.md`;
    sections.push(`- [ ] Review verification results: \`${verificationPath}\``);
  } else {
    sections.push("- [ ] Run verification and confirm all tests pass.");
  }

  // Add test cases reference if there's a test-cases file
  sections.push(`- [ ] Confirm must test cases in \`openspec/changes/${slug}/test-cases.md\` are covered.`);

  // --- Signature ---
  sections.push("🤖 Generated with SpecRunner");

  return sections.join("\n\n");
}
