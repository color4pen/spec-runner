/**
 * PrCreateStep: implements the pr-create pipeline step as a CLI-resident step.
 *
 * kind: "cli" — no agent session is created.
 * Calls runPrCreate() to spawn gh CLI, writes pr-create-result.md, then
 * parseResult extracts the verdict via regex.
 *
 * Design D1: kind=cli (not kind=agent).
 * Design D5: resultFilePath → openspec/changes/<slug>/pr-create-result.md
 * Design D6: failure → escalation (no retry loop).
 */
import type { CliStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runPrCreate } from "../pr-create/runner.js";
import { renderPrTitle, renderPrBody } from "../pr-create/body-template.js";
import { branchNotSetError } from "../../errors.js";

export const PrCreateStep: CliStep = {
  kind: "cli",
  name: "pr-create",

  async run(state: JobState, deps: StepDeps): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const slug = deps.slug;
    if (!state.branch) throw branchNotSetError("pr-create");
    const branch = state.branch;
    const title = renderPrTitle(deps.request);
    const body = renderPrBody({ parsedRequest: deps.request, jobState: state, slug });

    const result = await runPrCreate({
      branch,
      baseBranch: "main",
      title,
      body,
      cwd,
    });

    const resultFilePath = PrCreateStep.resultFilePath(state, deps);
    const resultFileDir = path.dirname(path.resolve(cwd, resultFilePath));
    await fs.mkdir(resultFileDir, { recursive: true });

    if (result.status === "created" || result.status === "existing-open") {
      // Record PR info in state (mutation — StepExecutor will persist this)
      state.pullRequest = {
        url: result.url,
        number: result.number,
        createdAt: new Date().toISOString(),
      };

      const content = [
        `# pr-create Result — ${slug}`,
        "",
        `## Status: success`,
        "",
        `## PR`,
        "",
        `- **URL**: ${result.url}`,
        `- **Number**: ${result.number}`,
        `- **Action**: ${result.status === "created" ? "created" : "existing-open (idempotent)"}`,
        "",
      ].join("\n");

      await fs.writeFile(path.resolve(cwd, resultFilePath), content, "utf-8");
    } else {
      // Error — do NOT modify state.pullRequest
      const content = [
        `# pr-create Result — ${slug}`,
        "",
        `## Status: failed`,
        "",
        `## Detail`,
        "",
        `- **Reason**: ${result.reason}`,
        `- **Message**: ${result.message}`,
        "",
      ].join("\n");

      await fs.writeFile(path.resolve(cwd, resultFilePath), content, "utf-8");
    }
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    void state; // unused — result path is purely slug-based
    return `openspec/changes/${deps.slug}/pr-create-result.md`;
  },

  parseResult(content: string, deps: StepDeps) {
    void deps; // unused
    const match = /^## Status: (success|failed)$/m.exec(content);
    const status = match?.[1];
    if (status === "success") {
      return { verdict: "success" as const, findingsPath: null };
    }
    if (status === "failed") {
      return { verdict: "error" as const, findingsPath: null };
    }
    return { verdict: null, findingsPath: null };
  },
};
