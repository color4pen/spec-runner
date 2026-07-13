/**
 * PrCreateStep: implements the pr-create pipeline step as a CLI-resident step.
 *
 * kind: "cli" — no agent session is created.
 * Calls runPrCreate() to call GitHub REST API, writes pr-create-result.md, then
 * parseResult extracts the verdict via regex.
 *
 * Design D1: kind=cli (not kind=agent).
 * Design D5: resultFilePath → specrunner/changes/<slug>/pr-create-result.md
 * Design D6: failure → escalation (no retry loop).
 */
import type { CliStep, IoRef } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runPrCreate } from "../pr-create/runner.js";
import { renderPrTitle, renderPrBody } from "../pr-create/body-template.js";
import { branchNotSetError } from "../../errors.js";
import { prCreateResultPath, slugEventsPath, usageJsonPath } from "../../util/paths.js";
import { readUsageFile } from "../usage/store.js";
import { buildAttestation } from "../attestation/build-attestation.js";
import { renderAttestationComment } from "../attestation/render-comment.js";
import { logWarn } from "../../logger/stdout.js";
import { STEP_NAMES } from "./step-names.js";

export const PrCreateStep: CliStep = {
  kind: "cli",
  name: STEP_NAMES.PR_CREATE,

  async run(state: JobState, deps: StepDeps): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const slug = deps.slug;
    if (!state.branch) throw branchNotSetError(STEP_NAMES.PR_CREATE);
    const branch = state.branch;
    const title = renderPrTitle(deps.request);
    const body = renderPrBody({ parsedRequest: deps.request, jobState: state, slug });

    if (!deps.githubClient) {
      throw new Error("githubClient is required for pr-create step");
    }
    if (!deps.owner) {
      throw new Error("owner is required for pr-create step");
    }
    if (!deps.repo) {
      throw new Error("repo is required for pr-create step");
    }
    const result = await runPrCreate({
      branch,
      baseBranch: deps.request.baseBranch,
      title,
      body,
      cwd,
      githubClient: deps.githubClient,
      owner: deps.owner,
      repo: deps.repo,
    });

    const resultFilePath = PrCreateStep.resultFilePath(state, deps);
    const resultFileDir = path.dirname(path.resolve(cwd, resultFilePath));
    await fs.mkdir(resultFileDir, { recursive: true });

    if (result.status === "created" || result.status === "existing-open") {
      const createdAt = new Date().toISOString();

      const content = [
        `# pr-create Result — ${slug}`,
        "",
        `## Status: success`,
        "",
        `## PR`,
        "",
        `- **URL**: ${result.url}`,
        `- **Number**: ${result.number}`,
        `- **CreatedAt**: ${createdAt}`,
        `- **Action**: ${result.status === "created" ? "created" : "existing-open (idempotent)"}`,
        "",
      ].join("\n");

      await fs.writeFile(path.resolve(cwd, resultFilePath), content, "utf-8");

      // Best-effort: attach attestation as PR comment
      if (typeof result.number === "number") {
        try {
          const journalPath = path.resolve(cwd, slugEventsPath(slug));
          let journalContent: string;
          try {
            journalContent = await fs.readFile(journalPath, "utf-8");
          } catch {
            logWarn(`pr-create: could not read events.jsonl for attestation, skipping comment`);
            journalContent = "";
          }

          if (journalContent) {
            const usagePath = path.resolve(cwd, usageJsonPath(slug));
            const usage = await readUsageFile(usagePath);
            const attestation = buildAttestation({ journalContent, usage });
            const body = renderAttestationComment(attestation);
            await deps.githubClient!.createIssueComment(deps.owner!, deps.repo!, result.number, body);
          }
        } catch (err: unknown) {
          logWarn(`pr-create: attestation comment failed: ${(err as Error).message ?? String(err)}`);
        }
      }
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

  reads(state: JobState, _deps: StepDeps): IoRef[] {
    if (!state.branch) return [];
    return [
      { path: state.branch, artifact: "gitState" },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: prCreateResultPath(deps.slug) },
    ];
  },

  resultFilePath(state: JobState, deps: StepDeps): string {
    void state; // unused — result path is purely slug-based
    return prCreateResultPath(deps.slug);
  },

  parseResult(content: string, deps: StepDeps) {
    void deps; // unused
    const match = /^## Status: (success|failed)$/m.exec(content);
    const status = match?.[1];
    if (status === "success") {
      const urlMatch = /\*\*URL\*\*: (.+)$/m.exec(content);
      const numberMatch = /\*\*Number\*\*: (\d+)$/m.exec(content);
      const createdAtMatch = /\*\*CreatedAt\*\*: (.+)$/m.exec(content);
      const url = urlMatch?.[1]?.trim();
      const number = numberMatch?.[1] ? parseInt(numberMatch[1], 10) : undefined;
      const createdAt = createdAtMatch?.[1]?.trim();
      return {
        verdict: "success" as const,
        findingsPath: null,
        ...(url && number && createdAt
          ? { pullRequest: { url, number, createdAt } }
          : {}),
      };
    }
    if (status === "failed") {
      return { verdict: "error" as const, findingsPath: null };
    }
    return { verdict: null, findingsPath: null };
  },
};
