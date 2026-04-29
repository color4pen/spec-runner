import type { Step, StepDeps, ParsedStepResult } from "./types.js";
import type { JobState } from "../../state/schema.js";
import { getLatestStepResult } from "../../state/helpers.js";

/**
 * Build the initial user message for the spec-fixer session.
 * Wraps user-controlled content in XML delimiters for prompt injection protection.
 */
function buildSpecFixerInitialMessage(opts: {
  slug: string;
  branch: string;
  findingsPath: string;
}): string {
  const { slug, branch, findingsPath } = opts;
  return `<user-request>
You are the spec-fixer for the following change:

Change folder: openspec/changes/${slug}
Branch: ${branch}
Findings file: ${findingsPath}

Please:
1. Read the findings file at ${findingsPath}
2. For each finding, implement the fix described in the "How to Fix" column
3. After fixing all findings you can address, commit your changes to branch '${branch}'
4. Push the branch to the remote repository
5. Do NOT modify the spec-review-result.md file itself

If any finding cannot be fixed, add a comment at the end of proposal.md or design.md:
<!-- spec-fixer-deferred: [finding number] [reason] -->
</user-request>`;
}

/**
 * SpecFixerStep: implements the spec-fixer pipeline step as a plain Step object.
 *
 * No custom tool handlers — spec-fixer has no Custom Tools.
 * No result file — spec-fixer completion is determined by polling.
 */
export const SpecFixerStep: Step = {
  name: "spec-fixer",

  agent: {
    // Agent ID resolved at runtime from config via deps
    agentId: "",
  },

  // No custom tool handlers for spec-fixer
  toolHandlers: undefined,

  buildMessage(state: JobState, deps: StepDeps): string {
    const branch = state.branch ?? "main";
    const specReviewResult = getLatestStepResult(state, "spec-review");
    const findingsPath = specReviewResult?.findingsPath ?? `openspec/changes/${deps.slug}/spec-review-result-001.md`;
    return buildSpecFixerInitialMessage({
      slug: deps.slug,
      branch,
      findingsPath,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // spec-fixer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
    // spec-fixer has no file-based verdict
    return {
      verdict: null,
      findingsPath: null,
      fileContent: null,
    };
  },
};
