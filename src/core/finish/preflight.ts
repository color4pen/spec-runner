/**
 * Phase 0 pre-flight checks for finish command.
 *
 * All checks run before any destructive operation.
 * Destructive ops: openspec archive / git commit / git push / gh pr merge
 *
 * Checks:
 *   1. slug resolved (validated by resolveTarget)
 *   2. state.pullRequest.number exists
 *   3. gh pr view success + state           → pr-status.ts
 *   4. mergeStateStatus=UNKNOWN → 3-second × 3-retry → pr-status.ts
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
import type { FinishFs, ResolvedTarget, PrViewData } from "./types.js";
import { formatEscalation } from "./escalation.js";
import { fetchPrViewWithRetry } from "./pr-status.js";
import { checkoutForValidation, restoreBranch } from "./branch-checkout.js";
import { changeFolderPath } from "../../util/paths.js";

export type { PrViewData };

export interface PreflightInput {
  target: ResolvedTarget;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  dryRun: boolean;
  /** Injectable sleep for testing (defaults to real setTimeout-based sleep). */
  sleepFn?: (ms: number) => Promise<void>;
  /** Warning output function (defaults to process.stderr.write). */
  warnFn?: (msg: string) => void;
}

export type PreflightResult =
  | { ok: true; prViewData: PrViewData }
  | { ok: false; escalation: string };

/**
 * Run all Phase 0 preflight checks.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const { target, cwd, spawn, fs, dryRun } = input;
  const warn = input.warnFn ?? ((m: string) => process.stderr.write(m));

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

  // Design D6: Check 5+6 branch on worktreePath.
  // If worktreePath is set, the worktree IS already on the feature branch — no checkout needed.
  // If worktreePath is null (managed mode / crash recovery), use existing checkout flow.

  if (target.worktreePath) {
    // Local runtime with worktree: run checks directly in the worktree
    const validationResult = await runChecks5and6({
      slug: target.slug,
      checkCwd: target.worktreePath,
      spawn,
      fs,
      warnFn: warn,
    });
    if (!validationResult.ok) {
      return { ok: false, escalation: validationResult.escalation };
    }
  } else {
    // Managed mode / crash recovery: existing checkout flow

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

    const checkoutResult = await checkoutForValidation({ branch: target.branch, cwd, spawn });
    if (!checkoutResult.ok) {
      return { ok: false, escalation: checkoutResult.escalation };
    }

    let validationError: PreflightResult | null = null;
    try {
      const innerResult = await runChecks5and6({
        slug: target.slug,
        checkCwd: cwd,
        spawn,
        fs,
        warnFn: warn,
      });
      if (!innerResult.ok) {
        validationError = { ok: false, escalation: innerResult.escalation };
      }
    } finally {
      await restoreBranch({
        originalBranch: checkoutResult.originalBranch,
        cwd,
        spawn,
        warnFn: warn,
      });
    }

    if (validationError) {
      return validationError;
    }
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
        warn(`Warning: feature branch has unpushed commits.\n`);
      }
    }
  }

  return { ok: true, prViewData };
}

// ---------------------------------------------------------------------------
// Check 5+6 helper (shared by worktree and checkout paths)
// ---------------------------------------------------------------------------

type Checks5and6Result = { ok: true } | { ok: false; escalation: string };

/**
 * Run Check 5 (openspec/changes existence) and Check 6 (openspec validate).
 * checkCwd is either the job worktree path or the main cwd (after checkout).
 */
async function runChecks5and6(params: {
  slug: string;
  checkCwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  warnFn: (msg: string) => void;
}): Promise<Checks5and6Result> {
  const { slug, checkCwd, spawn, fs, warnFn } = params;

  // Check 5: openspec/changes/<slug>/ existence (warning only)
  const changeFolderAbsPath = path.join(checkCwd, changeFolderPath(slug));
  const changeFolderExists = await fs.exists(changeFolderAbsPath);
  if (!changeFolderExists) {
    warnFn(
      `Warning: ${changeFolderPath(slug)}/ not found. Archive steps will be skipped.\n`,
    );
  }

  // Check 6: openspec validate (only if change folder AND specs/ subdirectory exist)
  // Delta-less changes (bug-fix etc.) have no specs/ — validate would fail with "no deltas found".
  const specsFolderPath = path.join(changeFolderAbsPath, "specs");
  const specsFolderExists = changeFolderExists && (await fs.exists(specsFolderPath));
  if (specsFolderExists) {
    // Run openspec validate; on failure build a custom escalation that includes stderr output.
    const validateSpawnResult = await spawn("openspec", ["validate", slug], { cwd: checkCwd });
    if (validateSpawnResult.exitCode !== 0) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 check 6 (openspec validate)",
          detectedState: `openspec validate ${slug} failed (exit ${validateSpawnResult.exitCode})`,
          recommendedAction: `Fix spec validation errors:\n${validateSpawnResult.stderr.trim()}\n  Then re-run: specrunner finish ${slug}`,
          resumeCommand: `specrunner finish ${slug}`,
        }),
      };
    }
  }

  return { ok: true };
}

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
