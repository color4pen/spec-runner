/**
 * TC-012 (this file): register_branch input_schema has correct structure.
 * TC-019: register_branch input_schema is unchanged under managed runtime (TC-019)
 *
 * Updated to reflect new slug field in input_schema (finish-redesign F chapter).
 * register_branch is now owned by src/adapter/managed-agent/tools/register-branch.ts
 * per design D3 (design.md): it is managed-agent adapter specific.
 *
 * TC-127: slug explicit input → slug in result
 * TC-128: slug omitted → derived from branch
 * TC-146: definition is deterministic
 */
import { describe, it, expect } from "vitest";
import { registerBranchTool } from "../src/adapter/managed-agent/tools/register-branch.js";
import type { CustomToolContext } from "../src/core/tools/types.js";

/**
 * The canonical input_schema for register_branch (post finish-redesign).
 * branch is required; slug is optional.
 * TC-019: this exact schema must be unchanged.
 */
const CANONICAL_INPUT_SCHEMA = {
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
} as const;

// TC-012 / TC-019: register_branch input_schema structure
describe("TC-012 / TC-019: register_branch input_schema is byte-identical to pre-refactor definition", () => {
  it("registerBranchTool.definition.input_schema matches canonical schema exactly", () => {
    const { input_schema } = registerBranchTool.definition;
    expect(JSON.stringify(input_schema)).toBe(JSON.stringify(CANONICAL_INPUT_SCHEMA));
  });

  it("tool name is still 'register_branch'", () => {
    expect(registerBranchTool.definition.name).toBe("register_branch");
  });

  it("tool type is still 'custom'", () => {
    expect(registerBranchTool.definition.type).toBe("custom");
  });

  it("input_schema.required is ['branch'] (slug is optional)", () => {
    const { input_schema } = registerBranchTool.definition;
    expect(input_schema.required).toEqual(["branch"]);
  });

  it("input_schema.properties.branch.type is 'string'", () => {
    const { input_schema } = registerBranchTool.definition;
    expect((input_schema.properties?.branch as Record<string, unknown>)?.type).toBe("string");
  });

  it("input_schema.properties.slug.type is 'string'", () => {
    const { input_schema } = registerBranchTool.definition;
    expect((input_schema.properties as Record<string, unknown>)?.["slug"] as Record<string, unknown>)
      .toBeDefined();
  });
});

// TC-016: register_branch file lives in managed-agent adapter
describe("TC-016: register_branch file is in managed-agent adapter", () => {
  it("registerBranchTool is importable from adapter/managed-agent/tools/register-branch", () => {
    expect(registerBranchTool).toBeDefined();
    expect(registerBranchTool.definition).toBeDefined();
    expect(registerBranchTool.handler).toBeDefined();
  });
});

// TC-127: slug explicit input → slug in result
type OkResult = { ok: true; [key: string]: unknown };

describe("TC-127: register_branch — slug explicit input sets state.request.slug", () => {
  it("returns ok:true with branch and slug when slug is explicitly provided", async () => {
    const ctx: CustomToolContext = { sessionId: "test-session" };
    const result = await registerBranchTool.handler(
      { branch: "feat/readme-status-section", slug: "readme-status-section" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const ok = result as OkResult;
    expect(ok["branch"]).toBe("feat/readme-status-section");
    expect(ok["slug"]).toBe("readme-status-section");
  });

  it("uses the explicit slug verbatim (no stripping)", async () => {
    const ctx: CustomToolContext = { sessionId: "test-session" };
    const result = await registerBranchTool.handler(
      { branch: "feat/my-feature", slug: "custom-slug-override" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const ok = result as OkResult;
    expect(ok["slug"]).toBe("custom-slug-override");
  });
});

// TC-128: slug omitted → derived from branch
describe("TC-128: register_branch — slug omitted derives from branch prefix strip", () => {
  it("derives slug from feat/ branch when slug is not provided", async () => {
    const ctx: CustomToolContext = { sessionId: "test-session" };
    const result = await registerBranchTool.handler(
      { branch: "feat/readme-status-section" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const ok = result as OkResult;
    expect(ok["branch"]).toBe("feat/readme-status-section");
    expect(ok["slug"]).toBe("readme-status-section");
  });

  it("derives slug from fix/ branch", async () => {
    const ctx: CustomToolContext = { sessionId: "test-session" };
    const result = await registerBranchTool.handler(
      { branch: "fix/some-bug" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const ok = result as OkResult;
    expect(ok["slug"]).toBe("some-bug");
  });

  it("empty string slug is treated as absent — branch-derived", async () => {
    const ctx: CustomToolContext = { sessionId: "test-session" };
    const result = await registerBranchTool.handler(
      { branch: "feat/readme-status-section", slug: "" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const ok = result as OkResult;
    expect(ok["slug"]).toBe("readme-status-section");
  });

  it("returns error for empty branch string", async () => {
    const ctx: CustomToolContext = { sessionId: "test-session" };
    const result = await registerBranchTool.handler({ branch: "" }, ctx);
    expect(result.ok).toBe(false);
  });
});
