import type { CliStep, CliStepDeps, IoRef } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { runVerification } from "../verification/runner.js";
import { propagateVerificationResult } from "../verification/propagate.js";
import { reloadCoverageConfig } from "../verification/reload-coverage-config.js";
import { verificationResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { stderrWrite } from "../../logger/stdout.js";

/**
 * VerificationStep: implements the verification pipeline step as a CLI-resident step.
 *
 * kind: "cli" — no agent session is created.
 * Runs verification phases (build / typecheck / test / lint / security) via
 * node:child_process.spawn, writes verification-result.md, then parseResult
 * extracts the verdict via regex.
 *
 * Design D4: With the job worktree design (Phase 2), the pipeline's deps.cwd IS
 * the feature branch worktree. No per-step temp worktree is needed.
 * verificationCwd = deps.cwd ?? process.cwd().
 *
 * After execution, verification-result.md is already in the worktree — no copy needed.
 * It is propagated to the feature branch on origin via propagateVerificationResult so
 * build-fixer's managed agent workspace can read it on the next clone.
 *
 * Design D1: explicit kind discriminator (not null-agent inference).
 * Design D2: no Anthropic session — entirely local.
 */
export const VerificationStep: CliStep = {
  kind: "cli",
  name: STEP_NAMES.VERIFICATION,

  async run(state: JobState, deps: CliStepDeps): Promise<void> {
    const verificationCwd = deps.cwd ?? process.cwd();

    // Re-resolve coverage config from disk immediately before running verification.
    // This ensures that edits made by build-fixer (e.g. adding exclude entries) during
    // the same job are reflected in subsequent verification attempts.
    // Only verification.coverage is re-read; all other config fields (including
    // verification.commands) retain their job-start values from deps.config.
    // When applied === false (no project-local config or any error), falls back to
    // the job-start value — no pipeline disruption.
    const reload = await reloadCoverageConfig(verificationCwd);
    const effectiveVerification = reload.applied
      ? { ...deps.config.verification, coverage: reload.coverage }
      : deps.config.verification;

    await runVerification(deps.slug, verificationCwd, effectiveVerification, deps.request.baseBranch);

    // Propagate verification-result.md to branch so build-fixer can read it
    if (state.branch) {
      const iteration = (state.steps?.[STEP_NAMES.VERIFICATION]?.length ?? 0) + 1;
      const result = await propagateVerificationResult({
        slug: deps.slug,
        branch: state.branch,
        iteration,
        cwd: verificationCwd,
        spawn: deps.spawn,
        // D4 egress backstop: pass ledger so propagate can verify publish range before push.
        synthesizedCommits: state.synthesizedCommits ?? [],
      });
      if (!result.ok) {
        stderrWrite(
          `Warning: failed to propagate verification-result.md to branch ${state.branch}: ${result.error}\n`,
        );
        stderrWrite(
          `build-fixer (if invoked next) may not see the verification result and fall back to running tests itself.\n`,
        );
      }
    }
  },

  reads(_state: JobState, _deps: StepDeps): IoRef[] {
    return [
      { path: ".", artifact: "gitState" },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: verificationResultPath(deps.slug) },
    ];
  },

  resultFilePath(_state: JobState, deps): string {
    return verificationResultPath(deps.slug);
  },

  parseResult(content: string, deps) {
    const match = /^## Verdict: (passed|failed)$/m.exec(content);
    const verdict = match?.[1] as "passed" | "failed" | undefined;
    const findingsPath = verificationResultPath(deps.slug);
    return {
      verdict: verdict ?? null,
      findingsPath,
    };
  },
};
