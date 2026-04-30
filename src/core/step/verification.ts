import type { CliStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import { runVerification } from "../verification/runner.js";

/**
 * VerificationStep: implements the verification pipeline step as a CLI-resident step.
 *
 * kind: "cli" — no agent session is created.
 * Runs verification phases (build / typecheck / test / lint / security) via
 * node:child_process.spawn, writes verification-result.md, then parseResult
 * extracts the verdict via regex.
 *
 * Design D1: explicit kind discriminator (not null-agent inference).
 * Design D2: no Anthropic session — entirely local.
 */
export const VerificationStep: CliStep = {
  kind: "cli",
  name: "verification",

  async run(_state: JobState, deps: StepDeps): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    await runVerification(deps.slug, cwd);
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
