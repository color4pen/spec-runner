/**
 * PR status fetching and polling for the finish command.
 * Uses GitHubClient REST API instead of gh CLI subprocess.
 *
 * Responsibilities:
 *   - fetchPrViewWithRetry: Check 3+4 (getPullRequest + UNKNOWN retry)
 */
import type { GitHubClient } from "../../core/port/github-client.js";
import type { PrViewData } from "./types.js";
import { formatEscalation } from "./escalation.js";
import { stderrWrite } from "../../logger/stdout.js";

export type { PrViewData };

export type PrViewFetchResult =
  | { ok: true; data: PrViewData }
  | { ok: false; escalation: string };

const UNKNOWN_RETRY_COUNT = 3;
const UNKNOWN_RETRY_DELAY_MS = 3000;


/**
 * Fetch PR view from GitHub REST API with retry on UNKNOWN mergeStateStatus.
 * Implements Check 3 (getPullRequest success) and Check 4 (UNKNOWN retry).
 *
 * Bypass: MERGED PRs with UNKNOWN mergeStateStatus return success immediately
 * (GitHub always returns UNKNOWN for MERGED PRs — merge-ability check is moot).
 */
export async function fetchPrViewWithRetry(params: {
  prNumber: number;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  slug: string;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<PrViewFetchResult> {
  const { prNumber, githubClient, owner, repo, slug } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= UNKNOWN_RETRY_COUNT; attempt++) {
    // Check 3: getPullRequest
    let parsed: PrViewData;
    try {
      parsed = await githubClient.getPullRequest(owner, repo, prNumber);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 check 3 (getPullRequest)",
          detectedState: `getPullRequest #${prNumber} failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Error: ${detail}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // Check 4: UNKNOWN retry — but bypass for MERGED PRs.
    // GitHub API returns mergeStateStatus=UNKNOWN for PRs in MERGED state.
    // MERGED is an irreversible terminal state; merge-ability check is unnecessary.
    if ((parsed.mergeStateStatus ?? "").toUpperCase() === "UNKNOWN") {
      if (parsed.state === "MERGED") {
        // MERGED PR with UNKNOWN mergeStateStatus — bypass retry, return success immediately.
        return { ok: true, data: parsed };
      }
      if (attempt < UNKNOWN_RETRY_COUNT) {
        stderrWrite(
          `Retrying check 4: mergeStateStatus was UNKNOWN (attempt ${attempt}/${UNKNOWN_RETRY_COUNT})...`,
        );
        await sleepImpl(UNKNOWN_RETRY_DELAY_MS);
        continue;
      }
      // All retries exhausted
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 check 4 (mergeStateStatus UNKNOWN)",
          detectedState: `mergeStateStatus is UNKNOWN after ${UNKNOWN_RETRY_COUNT} retries`,
          recommendedAction:
            `GitHub's merge state is still computing. Wait a moment and re-run:\n  specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    return { ok: true, data: parsed };
  }

  // Unreachable, but TypeScript needs this
  return {
    ok: false,
    escalation: formatEscalation({
      failedStep: "Phase 0 check 4 (mergeStateStatus UNKNOWN)",
      detectedState: `mergeStateStatus is UNKNOWN after ${UNKNOWN_RETRY_COUNT} retries`,
      recommendedAction: `Wait a moment and re-run: specrunner job archive --with-merge ${slug}`,
      resumeCommand: `specrunner job archive --with-merge ${slug}`,
    }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
