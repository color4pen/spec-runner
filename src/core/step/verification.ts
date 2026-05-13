import type { CliStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { runVerification } from "../verification/runner.js";
import { propagateVerificationResult } from "../verification/propagate.js";
import { verificationResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";

const stderrWrite = (msg: string): void => {
  process.stderr.write(msg);
};

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

  async run(state: JobState, deps: StepDeps): Promise<void> {
    const verificationCwd = deps.cwd ?? process.cwd();

    await runVerification(deps.slug, verificationCwd);

    // Propagate verification-result.md to branch so build-fixer can read it
    if (state.branch) {
      const iteration = (state.steps?.[STEP_NAMES.VERIFICATION]?.length ?? 0) + 1;
      const result = await propagateVerificationResult({
        slug: deps.slug,
        branch: state.branch,
        iteration,
        cwd: verificationCwd,
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

  resultFilePath(_state: JobState, deps: StepDeps): string {
    return verificationResultPath(deps.slug);
  },

  parseResult(content: string, deps: StepDeps) {
    const match = /^## Verdict: (passed|failed)$/m.exec(content);
    const verdict = match?.[1] as "passed" | "failed" | undefined;
    const findingsPath = verificationResultPath(deps.slug);
    return {
      verdict: verdict ?? null,
      findingsPath,
    };
  },
};
