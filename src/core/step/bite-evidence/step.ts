/**
 * BiteEvidenceStep: CLI step that verifies base-red → candidate-green for all
 * materialized test files (bite-evidence-forward R4, T-07).
 *
 * kind: "cli" — no agent session is created.
 *
 * Workflow:
 *   1. Resolve base/candidate OIDs from state.
 *   2. Compute tamper status from events.jsonl lineage.
 *   3. Run the gate decision logic (gate.ts).
 *   4. Write bite-evidence-result.md with verdict + JSON records.
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
import { biteEvidenceResultPath, changeFolderPath, slugEventsPath } from "../../../util/paths.js";
import { STEP_NAMES } from "../../../kernel/step-names.js";
import { runBiteEvidenceGate } from "./gate.js";
import { checkTamperStatus } from "./tamper.js";
import { fold } from "../../../store/event-journal.js";

// ---------------------------------------------------------------------------
// BiteEvidenceStep
// ---------------------------------------------------------------------------

export const BiteEvidenceStep: CliStep = {
  kind: "cli",
  name: STEP_NAMES.BITE_EVIDENCE,

  async run(state: JobState, deps: CliStepDeps): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const slug = deps.slug;

    // Compute tamper status from events.jsonl.
    let tamperStatus: "match" | "mismatch" | "inconclusive" = "inconclusive";
    try {
      const eventsPath = path.join(cwd, slugEventsPath(slug));
      let eventsContent: string;
      try {
        eventsContent = await fs.readFile(eventsPath, "utf-8");
      } catch {
        // events.jsonl not found → inconclusive
        eventsContent = "";
      }

      const foldResult = fold(eventsContent);
      const lineage = foldResult.lineage;

      // Compute current hash of test-cases.md if runtimeStrategy is available.
      let currentHash: string | null = null;
      if (deps.runtimeStrategy) {
        const testCasesMdPath = `${changeFolderPath(slug)}/test-cases.md`;
        const refs = await deps.runtimeStrategy.digestArtifacts(
          [{ path: testCasesMdPath }],
          cwd,
          state.branch ?? null,
        );
        currentHash = refs[0]?.hash ?? null;
      }

      const tamperResult = checkTamperStatus(lineage, currentHash);
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
