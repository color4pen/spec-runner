import { defineCustomTool } from "./types.js";
import type { CustomToolContext, CustomToolResult } from "./types.js";

/**
 * The register_branch custom tool.
 * Definition and handler are colocated in this single file.
 * This is the ONLY place in the codebase where "register_branch" appears.
 *
 * The handler validates input and returns the branch via return value.
 * The caller (SSE dispatcher in session.ts) receives the branch via the
 * onBranchRegistered callback — no module-level state is needed.
 */
export const registerBranchTool = defineCustomTool({
  definition: {
    type: "custom",
    name: "register_branch",
    description:
      "Registers the proposed branch name with the specrunner CLI at the end of the propose step. " +
      "Call this tool exactly once when you have finalized the branch name for the proposed change, " +
      "immediately before completing your work. The branch name must follow the openspec slug naming " +
      "convention (e.g., feat/YYYY-MM-DD-short-description). This tool is idempotent — calling it " +
      "multiple times is allowed and the last call wins (last-write-wins semantics).",
    input_schema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description:
            "The proposed branch name, e.g. feat/2026-04-27-my-feature. Must be non-empty.",
        },
      },
      required: ["branch"],
    },
  },
  handler: async (
    input: Record<string, unknown>,
    _ctx: CustomToolContext,
  ): Promise<CustomToolResult> => {
    const branch = input["branch"];

    if (typeof branch !== "string" || branch.trim().length === 0) {
      return { ok: false, error: "branch must be a non-empty string" };
    }

    // Return the validated branch via return value.
    // The SSE dispatcher in session.ts passes this to onBranchRegistered callback.
    // No module-level state is used — last-write-wins is handled by the caller.
    return { ok: true, branch: branch.trim() };
  },
});
