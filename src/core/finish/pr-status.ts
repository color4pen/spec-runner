/**
 * PR status fetching and polling for the finish command.
 *
 * Responsibilities:
 *   - fetchPrViewWithRetry: Check 3+4 (gh pr view + UNKNOWN retry)
 *   - pollMergeStateAfterPush: Phase 2 post-push mergeStateStatus polling
 */
import type { SpawnFn } from "../../util/spawn.js";
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
 * Fetch PR view from gh CLI with retry on UNKNOWN mergeStateStatus.
 * Implements Check 3 (gh pr view success) and Check 4 (UNKNOWN retry).
 *
 * Bypass: MERGED PRs with UNKNOWN mergeStateStatus return success immediately
 * (GitHub always returns UNKNOWN for MERGED PRs — merge-ability check is moot).
 */
export async function fetchPrViewWithRetry(params: {
  prNumber: number;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
  sleepFn?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
}): Promise<PrViewFetchResult> {
  const { prNumber, cwd, spawn, slug, env } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= UNKNOWN_RETRY_COUNT; attempt++) {
    // Check 3: gh pr view
    const result = await spawn(
      "gh",
      ["pr", "view", String(prNumber), "--json", "state,mergeStateStatus,headRefName"],
      { cwd, env },
    );

    if (result.exitCode !== 0) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 check 3 (gh pr view)",
          detectedState: `gh pr view ${prNumber} failed (exit ${result.exitCode})`,
          recommendedAction: `Check gh authentication: specrunner login. Error: ${result.stderr.trim()}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
      };
    }

    let parsed: PrViewData;
    try {
      parsed = JSON.parse(result.stdout.trim()) as PrViewData;
    } catch {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 check 3 (gh pr view parse)",
          detectedState: `Failed to parse gh pr view output`,
          recommendedAction: `Check gh CLI version. Output was: ${result.stdout.slice(0, 200)}`,
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
  cwd: string;
  spawn: SpawnFn;
  slug: string;
  baseBranch: string;
  sleepFn?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
}): Promise<CheckMergeableResult> {
  const { prNumber, cwd, spawn, slug, baseBranch, env } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= MERGEABLE_RETRY_COUNT; attempt++) {
    const result = await spawn(
      "gh",
      ["pr", "view", String(prNumber), "--json", "mergeable"],
      { cwd, env },
    );

    if (result.exitCode !== 0) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 3 guard (gh pr view --json mergeable)",
          detectedState: `gh pr view ${prNumber} failed (exit ${result.exitCode})`,
          recommendedAction: `Check gh authentication: specrunner login. Error: ${result.stderr.trim()}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
      };
    }

    let parsed: { mergeable?: string };
    try {
      parsed = JSON.parse(result.stdout.trim()) as { mergeable?: string };
    } catch {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 3 guard (gh pr view --json mergeable parse)",
          detectedState: `Failed to parse gh pr view output`,
          recommendedAction: `Check gh CLI version. Output was: ${result.stdout.slice(0, 200)}`,
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
  cwd: string;
  spawn: SpawnFn;
  slug: string;
  sleepFn?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
}): Promise<{ mergeStateStatus: string }> {
  const { prNumber, cwd, spawn, slug: _slug, env } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= POST_PUSH_RETRY_COUNT; attempt++) {
    const result = await spawn(
      "gh",
      ["pr", "view", String(prNumber), "--json", "mergeStateStatus"],
      { cwd, env },
    );

    if (result.exitCode !== 0) {
      // gh pr view failed — return empty string so Phase 3 attempts merge without --admin
      return { mergeStateStatus: "" };
    }

    let parsed: { mergeStateStatus?: string };
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch {
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
