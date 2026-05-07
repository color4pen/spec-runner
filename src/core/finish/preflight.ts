/**
 * Phase 0 pre-flight checks for finish command.
 *
 * All checks run before any destructive operation.
 * Destructive ops: openspec archive / git commit / git push / gh pr merge
 *
 * Checks:
 *   1. slug resolved (validated by resolveTarget)
 *   2. state.pullRequest.number exists
 *   3. gh pr view success + state
 *   4. mergeStateStatus=UNKNOWN → 3-second × 3-retry
 *   5. openspec/changes/<slug>/ existence (warning, not escalation)
 *   6. openspec validate <slug> dry-run (if change folder exists)
 *   7. gh / git / openspec binaries available
 *   8. feature branch unpushed commits (warning only)
 *
 * TC-104: UNKNOWN → CLEAN after 1 retry → success
 * TC-105: gh pr view auth failure → escalation
 * TC-107: openspec validate fail → escalation
 * TC-108: --dry-run → Phase 0 only, 0 destructive spawns
 * TC-119: UNKNOWN × 3 → escalation
 * TC-120: pullRequest.number absent → escalation
 * TC-121: gh binary missing → escalation
 * TC-129: dry-run + Phase 0 fail → escalation, exit 1
 */
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs, ResolvedTarget } from "./types.js";
import { formatEscalation } from "./escalation.js";

export interface PreflightInput {
  target: ResolvedTarget;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  dryRun: boolean;
  /** Injectable sleep for testing (defaults to real setTimeout-based sleep). */
  sleepFn?: (ms: number) => Promise<void>;
}

export type PreflightResult =
  | { ok: true; prViewData: PrViewData }
  | { ok: false; escalation: string };

export interface PrViewData {
  state: string;
  mergeStateStatus?: string;
  headRefName?: string;
}

const UNKNOWN_RETRY_COUNT = 3;
const UNKNOWN_RETRY_DELAY_MS = 3000;

/**
 * Run all Phase 0 preflight checks.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const { target, cwd, spawn, fs, dryRun } = input;

  // Check 2: pullRequest.number must exist (already validated in resolveTarget,
  // but re-check here for clarity in escalation messaging)
  if (!target.prNumber) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 0 check 2 (pullRequest.number)",
        detectedState: "state.pullRequest is absent",
        recommendedAction: "pr-create が完走していません。propose pipeline を再実行してください。",
        resumeCommand: `specrunner finish ${target.slug}`,
      }),
    };
  }

  // Check 7: binary availability (gh, git, openspec)
  const binaryCheck = await checkBinaries(["gh", "git", "openspec"], spawn, cwd);
  if (!binaryCheck.ok) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 0 check 7 (binary check)",
        detectedState: `Binary not found: ${binaryCheck.missing}`,
        recommendedAction: `Binary not found: ${binaryCheck.missing}. Run 'specrunner doctor'.`,
        resumeCommand: `specrunner finish ${target.slug}`,
      }),
    };
  }

  // Check 3 + 4: gh pr view + UNKNOWN retry
  const prViewResult = await fetchPrViewWithRetry({
    prNumber: target.prNumber,
    cwd,
    spawn,
    slug: target.slug,
    sleepFn: input.sleepFn,
  });

  if (!prViewResult.ok) {
    return { ok: false, escalation: prViewResult.escalation };
  }

  const prViewData = prViewResult.data;

  // T3: Guard against empty target.branch
  if (!target.branch) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 0 (branch checkout for validation)",
        detectedState: "target.branch is empty",
        recommendedAction:
          "state.branch が未設定です。pipeline が正常に完走していない可能性があります。",
        resumeCommand: `specrunner finish ${target.slug}`,
      }),
    };
  }

  // Checkout feature branch for validation (Check 5+6)
  const checkoutResult = await checkoutForValidation({ branch: target.branch, cwd, spawn });
  if (!checkoutResult.ok) {
    return { ok: false, escalation: checkoutResult.escalation };
  }

  let validationError: PreflightResult | null = null;
  try {
    // Check 5: openspec/changes/<slug>/ existence (warning only)
    const changeFolderPath = path.join(cwd, "openspec", "changes", target.slug);
    const changeFolderExists = await fs.exists(changeFolderPath);
    if (!changeFolderExists) {
      process.stderr.write(
        `Warning: openspec/changes/${target.slug}/ not found. Archive steps will be skipped.\n`,
      );
    }

    // Check 6: openspec validate (only if change folder AND specs/ subdirectory exist)
    // Delta-less changes (bug-fix etc.) have no specs/ — validate would fail with "no deltas found".
    const specsFolderPath = path.join(changeFolderPath, "specs");
    const specsFolderExists = changeFolderExists && await fs.exists(specsFolderPath);
    if (specsFolderExists) {
      const validateResult = await spawn(
        "openspec",
        ["validate", target.slug],
        { cwd },
      );
      if (validateResult.exitCode !== 0) {
        validationError = {
          ok: false,
          escalation: formatEscalation({
            failedStep: "Phase 0 check 6 (openspec validate)",
            detectedState: `openspec validate ${target.slug} failed (exit ${validateResult.exitCode})`,
            recommendedAction: `Fix spec validation errors:\n${validateResult.stderr.trim()}\n  Then re-run: specrunner finish ${target.slug}`,
            resumeCommand: `specrunner finish ${target.slug}`,
          }),
        };
      }
    }
  } finally {
    await restoreBranch({ originalBranch: checkoutResult.originalBranch, cwd, spawn });
  }

  if (validationError) {
    return validationError;
  }

  // Check 8: unpushed commits on feature branch (warning only)
  if (!dryRun) {
    const unpushedResult = await spawn(
      "git",
      ["rev-list", `origin/${target.branch}..HEAD`, "--count"],
      { cwd },
    );
    if (unpushedResult.exitCode === 0) {
      const count = parseInt(unpushedResult.stdout.trim(), 10);
      if (!isNaN(count) && count > 0) {
        process.stderr.write(
          `Warning: feature branch has unpushed commits.\n`,
        );
      }
    }
  }

  return { ok: true, prViewData };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BinaryCheckResult = { ok: true } | { ok: false; missing: string };

async function checkBinaries(
  binaries: string[],
  spawn: SpawnFn,
  cwd: string,
): Promise<BinaryCheckResult> {
  for (const binary of binaries) {
    const result = await spawn("which", [binary], { cwd });
    if (result.exitCode !== 0) {
      return { ok: false, missing: binary };
    }
  }
  return { ok: true };
}

type PrViewFetchResult =
  | { ok: true; data: PrViewData }
  | { ok: false; escalation: string };

async function fetchPrViewWithRetry(params: {
  prNumber: number;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<PrViewFetchResult> {
  const { prNumber, cwd, spawn, slug } = params;
  const sleepImpl = params.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= UNKNOWN_RETRY_COUNT; attempt++) {
    // Check 3: gh pr view
    const result = await spawn(
      "gh",
      ["pr", "view", String(prNumber), "--json", "state,mergeStateStatus,headRefName"],
      { cwd },
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
    // Design D4: check state === "MERGED" before entering the UNKNOWN retry loop.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Branch checkout helpers (T1)
// ---------------------------------------------------------------------------

interface CheckoutForValidationInput {
  branch: string;
  cwd: string;
  spawn: SpawnFn;
}

type CheckoutForValidationResult =
  | { ok: true; originalBranch: string }
  | { ok: false; escalation: string };

/**
 * Record the current branch, fetch the feature branch, and check it out.
 * Used before Check 5+6 so that openspec validate runs in the feature branch.
 */
async function checkoutForValidation(
  input: CheckoutForValidationInput,
): Promise<CheckoutForValidationResult> {
  const { branch, cwd, spawn } = input;

  // Get current branch name
  const revParseResult = await spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  if (revParseResult.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 0 (branch checkout for validation)",
        detectedState: `git rev-parse --abbrev-ref HEAD failed: ${revParseResult.stderr.trim()}`,
        recommendedAction: "git コマンドが正常に動作しているか確認してください。",
        resumeCommand: "specrunner finish",
      }),
    };
  }
  const originalBranch = revParseResult.stdout.trim();

  // Fetch the feature branch from remote (best-effort; ignore failures)
  await spawn("git", ["fetch", "origin", branch], { cwd });

  // Try to checkout the feature branch
  const checkoutResult = await spawn("git", ["checkout", branch], { cwd });
  if (checkoutResult.exitCode !== 0) {
    // Attempt to create a local tracking branch (managed mode)
    const checkoutBResult = await spawn(
      "git",
      ["checkout", "-b", branch, `origin/${branch}`],
      { cwd },
    );
    if (checkoutBResult.exitCode !== 0) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 (branch checkout for validation)",
          detectedState: `git checkout ${branch} failed: ${checkoutBResult.stderr.trim()}`,
          recommendedAction: `feature branch への checkout に失敗しました。branch "${branch}" が存在するか確認してください。`,
          resumeCommand: "specrunner finish",
        }),
      };
    }
  }

  return { ok: true, originalBranch };
}

interface RestoreBranchInput {
  originalBranch: string;
  cwd: string;
  spawn: SpawnFn;
}

/**
 * Restore the previously recorded branch.
 * Failures are reported as warnings only (not escalation).
 */
async function restoreBranch(input: RestoreBranchInput): Promise<void> {
  const { originalBranch, cwd, spawn } = input;
  const result = await spawn("git", ["checkout", originalBranch], { cwd });
  if (result.exitCode !== 0) {
    process.stderr.write(
      `Warning: failed to restore branch "${originalBranch}": ${result.stderr.trim()}\n`,
    );
  }
}

/**
 * Exported for unit testing only.
 * Allows tests to exercise the MERGED bypass and UNKNOWN retry logic in isolation.
 */
export { fetchPrViewWithRetry as fetchPrViewWithRetryForTest };
