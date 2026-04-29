import type { Step, StepDeps, ParsedStepResult } from "./types.js";
import type { JobState, Verdict } from "../../state/schema.js";
import { buildSpecReviewInitialMessage } from "../../prompts/spec-review-system.js";
import { stderrWrite } from "../../logger/stdout.js";
import { githubTokenExpiredError } from "../../errors.js";
import type { PipelineDeps } from "../types.js";

/**
 * Parse the verdict from a spec-review-result.md file content.
 * Returns the first matched verdict (first-write-wins).
 */
export function parseSpecReviewVerdict(content: string): Verdict | null {
  const regex = /^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m;
  const match = regex.exec(content);
  if (!match || !match[1]) {
    return null;
  }
  return match[1] as Verdict;
}

/**
 * Build the findings file path for a given iteration.
 * Format: openspec/changes/<slug>/spec-review-result-NNN.md (3-digit zero-padded)
 */
export function buildFindingsPath(slug: string, iteration: number): string {
  const nnn = String(iteration).padStart(3, "0");
  return `openspec/changes/${slug}/spec-review-result-${nnn}.md`;
}

/**
 * Compute the iteration number for the next spec-review push.
 */
function computeSpecReviewIteration(state: JobState): number {
  return (state.steps?.["spec-review"]?.length ?? 0) + 1;
}

/**
 * SpecReviewStep: implements the spec-review pipeline step as a plain Step object.
 *
 * No custom tool handlers — spec-review has no Custom Tools.
 * Verdict is parsed from a result file written to the branch by the agent.
 */
export const SpecReviewStep: Step = {
  name: "spec-review",

  agent: {
    // Agent ID resolved at runtime from config via deps
    agentId: "",
  },

  // No custom tool handlers for spec-review
  toolHandlers: undefined,

  buildMessage(state: JobState, deps: StepDeps): string {
    const iteration = computeSpecReviewIteration(state);
    const findingsPath = buildFindingsPath(deps.slug, iteration);
    return buildSpecReviewInitialMessage({
      slug: deps.slug,
      repository: `${deps.repo.owner}/${deps.repo.name}`,
      requestType: state.request.type,
      enabled: deps.request.enabled,
      requestContent: deps.request.content,
      iteration,
      findingsPath,
    });
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    const iteration = computeSpecReviewIteration(state);
    return buildFindingsPath(deps.slug, iteration);
  },

  parseResult(content: string, _deps: StepDeps): ParsedStepResult {
    const verdict = parseSpecReviewVerdict(content);
    return {
      verdict: verdict ?? "escalation",
      findingsPath: null, // filled in by StepExecutor after fetch
      fileContent: content,
    };
  },
};

// ---------------------------------------------------------------------------
// Fetch helper — used by StepExecutor as a legacy fallback when githubClient
// is not provided in PipelineDeps.
// ---------------------------------------------------------------------------

/**
 * Fetch the spec-review-result file from GitHub.
 * Returns file content as string, or null if not found after retries.
 * Throws SpecRunnerError(GITHUB_TOKEN_EXPIRED) on 401.
 *
 * Uses PipelineDeps.githubFetch directly (no getFileContent helper).
 * 404: retries up to 3 times with 1s interval.
 */
export async function fetchSpecReviewResult(
  deps: PipelineDeps,
  slug: string,
  branch: string,
  iteration: number,
): Promise<string | null> {
  const githubFetch = deps.githubFetch ?? fetch;
  const config = deps.config;
  const repo = deps.repo;
  const githubToken = config.github!.accessToken;
  const sleepFn = deps.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const filePath = buildFindingsPath(slug, iteration);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleepFn(1000);
    }

    const resp = await githubFetch(url, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });

    if (resp.status === 200) {
      return resp.text();
    }

    if (resp.status === 401) {
      throw githubTokenExpiredError();
    }

    if (resp.status === 404) {
      if (attempt < MAX_RETRIES) {
        continue;
      }
      return null;
    }

    return null;
  }

  return null;
}

