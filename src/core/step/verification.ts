import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import type { CliStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { runVerification } from "../verification/runner.js";
import { propagateVerificationResult } from "../verification/propagate.js";
import { spawnCommand } from "../../util/spawn.js";

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
 * The phases execute inside a temporary git worktree of the feature branch
 * (state.branch) so they verify the implementer's actual code, not the
 * orchestrator's main checkout. Without this, verification produces false-
 * positive "passed" verdicts because main's tests pass by definition.
 *
 * After execution, the result file is copied back to the orchestrator's cwd
 * (where resultFilePath expects it) and then propagated to the feature branch
 * on origin via a second temp worktree (PR #68 flow) so build-fixer's managed
 * agent workspace can read it on the next clone.
 *
 * Design D1: explicit kind discriminator (not null-agent inference).
 * Design D2: no Anthropic session — entirely local.
 */
export const VerificationStep: CliStep = {
  kind: "cli",
  name: "verification",

  async run(state: JobState, deps: StepDeps): Promise<void> {
    const orchestratorCwd = deps.cwd ?? process.cwd();

    let verificationCwd = orchestratorCwd;
    let worktreeTmpBase: string | null = null;
    let worktreeAdded = false;

    if (state.branch) {
      try {
        worktreeTmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-verify-exec-"));
        const worktreePath = path.join(worktreeTmpBase, "wt");

        const fetchResult = await spawnCommand(
          "git", ["fetch", "origin", state.branch], { cwd: orchestratorCwd },
        );
        if (fetchResult.exitCode !== 0) {
          stderrWrite(`Warning: git fetch origin ${state.branch} failed (exit ${fetchResult.exitCode}). Running verification against local cwd.\n`);
        } else {
          const wtResult = await spawnCommand(
            "git", ["worktree", "add", "--detach", worktreePath, `origin/${state.branch}`],
            { cwd: orchestratorCwd },
          );
          if (wtResult.exitCode !== 0) {
            stderrWrite(`Warning: git worktree add failed (exit ${wtResult.exitCode}). Running verification against local cwd.\n`);
          } else {
            worktreeAdded = true;
            const installResult = await spawnCommand("bun", ["install", "--frozen-lockfile"], { cwd: worktreePath });
            if (installResult.exitCode !== 0) {
              stderrWrite(`Warning: bun install failed (exit ${installResult.exitCode}). Running verification against local cwd.\n`);
            } else {
              verificationCwd = worktreePath;
            }
          }
        }
      } catch (err) {
        stderrWrite(`Warning: worktree setup failed: ${(err as Error).message}. Running verification against local cwd.\n`);
      }
    }

    try {
      await runVerification(deps.slug, verificationCwd);

      if (verificationCwd !== orchestratorCwd) {
        const srcPath = path.join(verificationCwd, "openspec", "changes", deps.slug, "verification-result.md");
        const dstPath = path.join(orchestratorCwd, "openspec", "changes", deps.slug, "verification-result.md");
        await fs.mkdir(path.dirname(dstPath), { recursive: true });
        await fs.copyFile(srcPath, dstPath);
      }
    } finally {
      if (worktreeAdded) {
        const worktreePath = path.join(worktreeTmpBase!, "wt");
        await spawnCommand("git", ["worktree", "remove", "--force", worktreePath], { cwd: orchestratorCwd });
      }
      if (worktreeTmpBase) {
        await fs.rm(worktreeTmpBase, { recursive: true, force: true });
      }
    }

    // Propagate verification-result.md to branch (PR #68 flow)
    if (state.branch) {
      const iteration = (state.steps?.["verification"]?.length ?? 0) + 1;
      const result = await propagateVerificationResult({
        slug: deps.slug,
        branch: state.branch,
        iteration,
        cwd: orchestratorCwd,
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
    return `openspec/changes/${deps.slug}/verification-result.md`;
  },

  parseResult(content: string, deps: StepDeps) {
    const match = /^## Verdict: (passed|failed)$/m.exec(content);
    const verdict = match?.[1] as "passed" | "failed" | undefined;
    const findingsPath = `openspec/changes/${deps.slug}/verification-result.md`;
    return {
      verdict: verdict ?? null,
      findingsPath,
    };
  },
};
