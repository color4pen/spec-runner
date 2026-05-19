/**
 * PR status fetching and polling for the finish command.
 * Uses GitHubClient REST API instead of gh CLI subprocess.
 *
 * Responsibilities:
 *   - fetchPrViewWithRetry: Check 3+4 (getPullRequest + UNKNOWN retry)
 *   - pollMergeStateAfterPush: Phase 2 post-push mergeStateStatus polling
 *   - checkMergeableForMerge: Phase 3 guard (MERGEABLE check)
 */
import type { GitHubClient } from "../../core/port/github-client.js";
import type { PrViewData } from "./types.js";
import { formatEscalation } from "./escalation.js";

export type { PrViewData };

export type PrViewFetchResult =
  | { ok: true; data: PrViewData }
  | { ok: false; escalation: string };

export type CheckMergeableResult =
  | { ok: true }
  | { ok: false; escalation: string };

const UNKNOWN_RETRY_COUNT = 3;
const UNKNOWN_RETRY_DELAY_MS = 3000;

export const MERGEABLE_RETRY_COUNT = 3;
export const MERGEABLE_RETRY_DELAY_MS = 5000;

const POST_PUSH_RETRY_COUNT = 5;
const POST_PUSH_RETRY_DELAY_MS = 3000;

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
          resumeCommand: `specrunner finish ${slug}`,
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
        process.stdout.write(
          `Retrying check 4: mergeStateStatus was UNKNOWN (attempt ${attempt}/${UNKNOWN_RETRY_COUNT})...\n`,
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
            `GitHub's merge state is still computing. Wait a moment and re-run:\n  specrunner finish ${slug}`,
          resumeCommand: `specrunner finish ${slug}`,
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
      recommendedAction: `Wait a moment and re-run: specrunner finish ${slug}`,
      resumeCommand: `specrunner finish ${slug}`,
    }),
  };
}

/**
 * Check PR mergeable status before Phase 3 merge.
 * Implements the Phase 3 guard: MERGEABLE → ok, CONFLICTING → escalation, UNKNOWN → retry.
 */
export async function checkMergeableForMerge(params: {
  prNumber: number;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  slug: string;
  baseBranch: string;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<CheckMergeableResult> {
  const { prNumber, githubClient, owner, repo, slug, baseBranch } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= MERGEABLE_RETRY_COUNT; attempt++) {
    let parsed: { mergeable?: string };
    try {
      parsed = await githubClient.getPullRequest(owner, repo, prNumber);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 3 guard (getPullRequest for mergeable)",
          detectedState: `getPullRequest #${prNumber} failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Error: ${detail}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
      };
    }

    const mergeable = (parsed.mergeable ?? "").toUpperCase();

    if (mergeable === "MERGEABLE") {
      return { ok: true };
    }

    if (mergeable === "CONFLICTING") {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 3 guard (mergeable CONFLICTING)",
          detectedState: `mergeable is CONFLICTING (PR has merge conflicts)`,
          recommendedAction: `Rebase the feature branch onto ${baseBranch} and re-run:\n  git rebase ${baseBranch}\n  git push --force-with-lease\n  specrunner finish ${slug}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
      };
    }

    // UNKNOWN: retry with delay
    if (attempt < MERGEABLE_RETRY_COUNT) {
      process.stdout.write(
        `Retrying Phase 3 mergeable check: UNKNOWN (attempt ${attempt}/${MERGEABLE_RETRY_COUNT})...\n`,
      );
      await sleepImpl(MERGEABLE_RETRY_DELAY_MS);
      continue;
    }

    // All retries exhausted
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 3 guard (mergeable UNKNOWN)",
        detectedState: `mergeable is UNKNOWN after ${MERGEABLE_RETRY_COUNT} retries`,
        recommendedAction: `GitHub's merge state is still computing. Wait a moment and re-run:\n  specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
    };
  }

  // Unreachable — TypeScript needs a return here
  return {
    ok: false,
    escalation: formatEscalation({
      failedStep: "Phase 3 guard (mergeable UNKNOWN)",
      detectedState: `mergeable is UNKNOWN after ${MERGEABLE_RETRY_COUNT} retries`,
      recommendedAction: `Wait a moment and re-run: specrunner finish ${slug}`,
      resumeCommand: `specrunner finish ${slug}`,
    }),
  };
}

/**
 * Poll mergeStateStatus after Phase 2 push until CLEAN or retries exhausted.
 *
 * Unlike fetchPrViewWithRetry (Phase 0), this function:
 * - Retries on ANY non-CLEAN status (not just UNKNOWN)
 * - Does NOT escalate on exhaustion — returns current state for Phase 3 to attempt merge
 */
export async function pollMergeStateAfterPush(params: {
  prNumber: number;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  slug: string;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ mergeStateStatus: string }> {
  const { prNumber, githubClient, owner, repo, slug: _slug } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= POST_PUSH_RETRY_COUNT; attempt++) {
    let parsed: { mergeStateStatus?: string };
    try {
      parsed = await githubClient.getPullRequest(owner, repo, prNumber);
    } catch {
      // getPullRequest failed — return empty string so Phase 3 attempts merge without --admin
      return { mergeStateStatus: "" };
    }

    const status = (parsed.mergeStateStatus ?? "").toUpperCase();
    if (status === "CLEAN") {
      return { mergeStateStatus: status };
    }

    // DIRTY means merge conflicts exist — this is a confirmed state that won't resolve itself.
    // Return immediately so the orchestrator can escalate without retrying.
    if (status === "DIRTY") {
      return { mergeStateStatus: status };
    }

    if (attempt < POST_PUSH_RETRY_COUNT) {
      process.stdout.write(
        `Post-push polling: mergeStateStatus=${status}, retrying (${attempt}/${POST_PUSH_RETRY_COUNT})...\n`,
      );
      await sleepImpl(POST_PUSH_RETRY_DELAY_MS);
    }
  }

  // Exhausted — return empty string so Phase 3 attempts merge anyway (no escalation)
  return { mergeStateStatus: "" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
