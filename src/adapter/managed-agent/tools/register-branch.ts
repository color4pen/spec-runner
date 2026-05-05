import { defineCustomTool } from "../../../core/tools/types.js";
import { stripBranchPrefix } from "../../../state/job-slug.js";
import type { CustomToolContext, CustomToolResult } from "../../../core/tools/types.js";

/**
 * The register_branch custom tool.
 * Definition and handler are colocated in this single file.
 * This is the canonical Tool definition; the toolHandlers map key in propose.ts
 * and the SSE matcher in sse-stream.ts intentionally reference this name.
 *
 * The handler validates input, sets branch and slug, then returns them via return value.
 * The caller (SSE dispatcher in session.ts) receives the branch via the
 * onBranchRegistered callback — no module-level state is needed.
 *
 * slug input: optional. If absent or empty, derived from branch via stripBranchPrefix.
 * This is idempotent — multiple calls are allowed and the last call wins (last-write-wins).
 *
 * TC-127: slug explicit input → state.request.slug set to that value
 * TC-128: slug omitted → derived from branch via stripBranchPrefix (backward compat)
 * TC-146: definition is deterministic
 */
export const registerBranchTool = defineCustomTool({
  definition: {
    type: "custom",
    name: "register_branch",
    description:
      "Registers the proposed branch name and slug with the specrunner CLI at the end of the propose step. " +
      "Call this tool exactly once when you have finalized the branch name for the proposed change, " +
      "immediately before completing your work. The branch name must follow the openspec slug naming " +
      "convention (e.g., feat/YYYY-MM-DD-short-description). " +
      "The slug field is optional — when omitted the CLI derives it by stripping the branch prefix " +
      "(feat/, fix/, change/, refactor/, chore/). Calling this tool multiple times is allowed and " +
      "the last call wins (last-write-wins semantics).",
    input_schema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description:
            "The proposed branch name, e.g. feat/2026-04-27-my-feature. Must be non-empty.",
        },
        slug: {
          type: "string",
          description:
            "Optional canonical slug for this request (e.g. my-feature). " +
            "If omitted, derived from branch by stripping the prefix (feat/, fix/, etc.).",
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

    const trimmedBranch = branch.trim();

    // Resolve slug: explicit input > branch-derived
    let resolvedSlug: string;
    const inputSlug = input["slug"];
    if (typeof inputSlug === "string" && inputSlug.trim().length > 0) {
      resolvedSlug = inputSlug.trim();
    } else {
      // TC-128: derive from branch via stripBranchPrefix
      resolvedSlug = stripBranchPrefix(trimmedBranch);
    }

    // Return the validated branch and slug via return value.
    // The SSE dispatcher in session.ts passes this to onBranchRegistered callback.
    // No module-level state is used — last-write-wins is handled by the caller.
    return { ok: true, branch: trimmedBranch, slug: resolvedSlug };
  },
});
