/**
 * BiteEvidenceStep: CLI step that verifies base-red → candidate-green for all
 * materialized test files (bite-evidence-forward R4, T-07).
 *
 * kind: "cli" — no agent session is created.
 *
 * Workflow:
 *   1. Compute tamper status using provenance-based approach (tamper-provenance-baseline):
 *      - authorizedCanonWriters injected via buildPipelineForJob (PipelineDeps)
 *      - listWorktreeChanges → worktreeDirty flag
 *      - lastCommitTouchingPath → commit subject → parseCommitToken → step token
 *   2. Run the gate decision logic (gate.ts).
 *   3. Write bite-evidence-result.md with verdict + JSON records.
 *
 * Verdict mapping:
 *   - "passed"           → bite-evidence / passed → verification
 *   - "strategy-deferred"→ bite-evidence / strategy-deferred → verification
 *   - "failed"           → bite-evidence / failed → escalate (fail-closed)
 *
 * Never throws for expected fail-closed outcomes — they are encoded as the "failed" verdict.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CliStep, CliStepDeps, IoRef, ParsedStepResult } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";
import type { BiteEvidenceRecord } from "../../../state/schema.js";
import { biteEvidenceResultPath, changeFolderPath } from "../../../util/paths.js";
import { STEP_NAMES } from "../../../kernel/step-names.js";
import { runBiteEvidenceGate } from "./gate.js";
import { checkTamperStatus, parseCommitToken } from "./tamper.js";

// ---------------------------------------------------------------------------
// BiteEvidenceStep
// ---------------------------------------------------------------------------

export const BiteEvidenceStep: CliStep = {
  kind: "cli",
  name: STEP_NAMES.BITE_EVIDENCE,

  async run(state: JobState, deps: CliStepDeps): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const slug = deps.slug;

    // Compute tamper status using provenance-based approach (tamper-provenance-baseline).
    let tamperStatus: "match" | "mismatch" | "inconclusive" = "inconclusive";
    try {
      const testCasesMdPath = `${changeFolderPath(slug)}/test-cases.md`;

      // 1. Derive authorized writers from pre-computed injection (buildPipelineForJob).
      //    When absent or empty → evidenceAvailable=false (fail-open for gate).
      const authorizedWriters = (deps as { authorizedCanonWriters?: ReadonlySet<string> }).authorizedCanonWriters;
      let evidenceAvailable = !!(authorizedWriters && authorizedWriters.size > 0);

      // 2. Determine if test-cases.md has uncommitted worktree changes.
      let worktreeDirty = false;
      if (evidenceAvailable && deps.runtimeStrategy?.listWorktreeChanges) {
        const wtResult = await deps.runtimeStrategy.listWorktreeChanges(cwd);
        if (wtResult.kind === "unavailable") {
          evidenceAvailable = false;
        } else {
          // Check if test-cases.md appears in the worktree changes (exact path match).
          // Suffix-match would cause false-positives for other slugs' test-cases.md files.
          worktreeDirty = wtResult.paths.some((p) => p === testCasesMdPath);
        }
      } else if (evidenceAvailable && !deps.runtimeStrategy?.listWorktreeChanges) {
        // listWorktreeChanges not available on this fake/runtime → cannot verify
        evidenceAvailable = false;
      }

      // 3. Find the last commit that touched test-cases.md, and extract the step token.
      let lastCanonCommitToken: string | null = null;
      if (evidenceAvailable && deps.runtimeStrategy && typeof (deps.runtimeStrategy as { lastCommitTouchingPath?: unknown }).lastCommitTouchingPath === "function") {
        const rt = deps.runtimeStrategy as { lastCommitTouchingPath: (p: string, cwd: string) => Promise<{ kind: "found"; oid: string; subject: string } | { kind: "none" } | { kind: "unavailable"; reason: string }> };
        const commitResult = await rt.lastCommitTouchingPath(testCasesMdPath, cwd);
        if (commitResult.kind === "unavailable") {
          evidenceAvailable = false;
        } else if (commitResult.kind === "none") {
          lastCanonCommitToken = null; // no history → inconclusive
        } else {
          // Parse token from commit subject: "<token>: <slug>"
          const token = parseCommitToken(commitResult.subject, slug);
          // null means non-conforming subject or cross-slug → unauthorized write.
          // Use a sentinel (not null) so checkTamperStatus routes to branch 5 (mismatch),
          // not branch 3 (inconclusive). Branch 3 (null) is reserved for "no git history"
          // (commitResult.kind === "none"), which is a distinct case where the file has
          // never been committed at all. Non-conforming subject on a real commit must fail-closed.
          lastCanonCommitToken = token ?? "__non-conforming-subject__";
        }
      } else if (evidenceAvailable) {
        // lastCommitTouchingPath not available on runtime → cannot determine provenance
        evidenceAvailable = false;
      }

      const tamperResult = checkTamperStatus({
        authorizedWriters: authorizedWriters ?? new Set<string>(),
        lastCanonCommitToken,
        worktreeDirty,
        evidenceAvailable,
      });
      tamperStatus = tamperResult.status;
    } catch {
      // Best-effort — inconclusive on error
      tamperStatus = "inconclusive";
    }

    // Run the gate logic.
    const gateResult = await runBiteEvidenceGate({
      state,
      cwd,
      slug,
      config: deps.config,
      runtimeStrategy: deps.runtimeStrategy ?? null,
      tamperStatus,
    });

    // Write bite-evidence-result.md.
    const resultPath = path.join(cwd, biteEvidenceResultPath(slug));
    await fs.mkdir(path.dirname(resultPath), { recursive: true });

    const recordsJson = JSON.stringify(gateResult.records, null, 2);
    const reasonLine = gateResult.reason ? `\n\n**Reason**: ${gateResult.reason}` : "";
    const content = [
      `## Verdict: ${gateResult.verdict}`,
      reasonLine,
      "",
      "```json",
      recordsJson,
      "```",
      "",
    ].join("\n");

    await fs.writeFile(resultPath, content, "utf-8");
  },

  reads(state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: `${changeFolderPath(deps.slug)}/test-cases.md`, required: false },
      { path: ".", artifact: "gitState" },
    ];
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: biteEvidenceResultPath(deps.slug) },
    ];
  },

  resultFilePath(_state: JobState, deps: StepDeps): string {
    return biteEvidenceResultPath(deps.slug);
  },

  parseResult(content: string, deps: StepDeps): ParsedStepResult {
    // Parse verdict from "## Verdict: <verdict>" line.
    const verdictMatch = /^## Verdict:\s+(passed|failed|strategy-deferred)$/m.exec(content);
    const verdictStr = verdictMatch?.[1];

    let verdict: "passed" | "failed" | "strategy-deferred" | null = null;
    if (verdictStr === "passed" || verdictStr === "failed" || verdictStr === "strategy-deferred") {
      verdict = verdictStr;
    }

    // Parse BiteEvidence records from the JSON block.
    let biteEvidence: BiteEvidenceRecord[] | undefined;
    const jsonMatch = /```json\n([\s\S]*?)\n```/m.exec(content);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          biteEvidence = parsed as BiteEvidenceRecord[];
        }
      } catch {
        // Ignore parse errors
      }
    }

    const findingsPath = biteEvidenceResultPath(deps.slug);
    return {
      verdict,
      findingsPath,
      ...(biteEvidence !== undefined ? { biteEvidence } : {}),
    };
  },
};
