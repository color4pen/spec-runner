import type { Step, StepDeps, ParsedStepResult } from "./types.js";
import type { JobState } from "../../state/schema.js";
import { registerBranchTool } from "../tools/register-branch.js";
import { buildInitialMessage } from "../../prompts/propose-system.js";

/**
 * ProposeStep: implements the propose pipeline step as a plain Step object.
 *
 * Owns the register_branch Custom Tool handler (co-located per D4).
 * No execution lifecycle here — StepExecutor owns that.
 */
export const ProposeStep: Step = {
  name: "propose",

  agent: {
    // Agent ID is resolved at runtime from config via deps
    agentId: "",
  },

  /**
   * register_branch handler is exclusively owned by ProposeStep.
   * spec-review and spec-fixer do NOT have this handler.
   */
  toolHandlers: new Map([["register_branch", registerBranchTool.handler]]),

  buildMessage(_state: JobState, deps: StepDeps): string {
    return buildInitialMessage(deps.request.content);
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // Propose step does not produce a result file for verdict parsing
    // (branch is registered via SSE tool call, not a file)
    return null;
  },

  parseResult(_content: string, _deps: StepDeps): ParsedStepResult {
    // Propose has no file-based verdict — always returns null
    return {
      verdict: null,
      findingsPath: null,
      fileContent: null,
    };
  },
};
