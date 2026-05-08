/**
 * Unit tests for src/prompts/create-dialog.ts
 *
 * TC-PR-001: buildDialogSystemPrompt — contains <!-- FINAL_DRAFT --> marker instruction
 * TC-PR-002: buildDialogSystemPrompt — contains request.md structure rules
 * TC-PR-003: buildDialogInitialMessage — contains description, type, slug
 * TC-PR-004: buildDialogInitialMessage — contains DynamicContext sections
 * TC-PR-005: buildDialogInitialMessage — contains patterns as examples
 * TC-PR-006: buildDialogInitialMessage — works with empty context/patterns
 */
import { describe, it, expect } from "vitest";
import {
  buildDialogSystemPrompt,
  buildDialogInitialMessage,
} from "../../../src/prompts/create-dialog.js";
import type { DynamicContext } from "../../../src/git/dynamic-context.js";
import type { RequestPattern } from "../../../src/context/request-patterns.js";

function buildEmptyContext(): DynamicContext {
  return {
    gitLog: "",
    diffStat: "",
    specsList: [],
    changesList: [],
  };
}

function buildContextWithData(): DynamicContext {
  return {
    gitLog: "abc123 some commit",
    diffStat: "1 file changed",
    specsList: ["cli-commands", "request-management"],
    changesList: ["interactive-create-dialog", "another-change"],
  };
}

function buildPattern(slug: string, type: string): RequestPattern {
  return {
    type,
    title: `Pattern for ${slug}`,
    slug,
    content: `# Pattern ${slug}\n\n## Meta\n\n- **type**: ${type}\n- **slug**: ${slug}\n`,
  };
}

// ---------------------------------------------------------------------------
// TC-PR-001 – TC-PR-002: buildDialogSystemPrompt
// ---------------------------------------------------------------------------

describe("TC-PR-001: buildDialogSystemPrompt — FINAL_DRAFT marker instruction", () => {
  it("includes the <!-- FINAL_DRAFT --> marker protocol", () => {
    const prompt = buildDialogSystemPrompt();
    expect(prompt).toContain("<!-- FINAL_DRAFT -->");
  });

  it("instructs LLM to present final draft with the marker", () => {
    const prompt = buildDialogSystemPrompt();
    // Should contain instructions about when to present the marker
    expect(prompt.toLowerCase()).toContain("final");
    expect(prompt).toContain("<!-- FINAL_DRAFT -->");
  });
});

describe("TC-PR-002: buildDialogSystemPrompt — request.md structure rules", () => {
  it("contains all required section headers", () => {
    const prompt = buildDialogSystemPrompt();
    expect(prompt).toContain("## Meta");
    expect(prompt).toContain("## 背景");
    expect(prompt).toContain("## 要件");
    expect(prompt).toContain("## スコープ外");
    expect(prompt).toContain("## 受け入れ基準");
    expect(prompt).toContain("## Workflow Options");
  });

  it("instructs LLM to actively investigate codebase", () => {
    const prompt = buildDialogSystemPrompt();
    expect(prompt).toContain("Read");
    expect(prompt).toContain("Grep");
    expect(prompt).toContain("Glob");
  });

  it("includes the bun run typecheck requirement", () => {
    const prompt = buildDialogSystemPrompt();
    expect(prompt).toContain("bun run typecheck");
  });

  it("returns a non-empty string", () => {
    const prompt = buildDialogSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// TC-PR-003 – TC-PR-006: buildDialogInitialMessage
// ---------------------------------------------------------------------------

describe("TC-PR-003: buildDialogInitialMessage — description, type, slug", () => {
  it("includes the description", () => {
    const msg = buildDialogInitialMessage({
      description: "Add authentication to the API",
      type: "new-feature",
      slug: "api-auth",
      dynamicContext: buildEmptyContext(),
      patterns: [],
    });
    expect(msg).toContain("Add authentication to the API");
  });

  it("includes the type", () => {
    const msg = buildDialogInitialMessage({
      description: "fix something",
      type: "bug-fix",
      slug: "fix-thing",
      dynamicContext: buildEmptyContext(),
      patterns: [],
    });
    expect(msg).toContain("bug-fix");
  });

  it("includes the slug", () => {
    const msg = buildDialogInitialMessage({
      description: "fix something",
      type: "bug-fix",
      slug: "fix-thing",
      dynamicContext: buildEmptyContext(),
      patterns: [],
    });
    expect(msg).toContain("fix-thing");
  });
});

describe("TC-PR-004: buildDialogInitialMessage — DynamicContext sections", () => {
  it("includes specsList items", () => {
    const msg = buildDialogInitialMessage({
      description: "test",
      type: "new-feature",
      slug: "test",
      dynamicContext: buildContextWithData(),
      patterns: [],
    });
    expect(msg).toContain("cli-commands");
    expect(msg).toContain("request-management");
  });

  it("includes changesList items", () => {
    const msg = buildDialogInitialMessage({
      description: "test",
      type: "new-feature",
      slug: "test",
      dynamicContext: buildContextWithData(),
      patterns: [],
    });
    expect(msg).toContain("interactive-create-dialog");
    expect(msg).toContain("another-change");
  });

  it("omits context sections when lists are empty", () => {
    const msg = buildDialogInitialMessage({
      description: "test",
      type: "new-feature",
      slug: "test",
      dynamicContext: buildEmptyContext(),
      patterns: [],
    });
    expect(msg).not.toContain("既存 Specs");
    expect(msg).not.toContain("進行中の Changes");
  });
});

describe("TC-PR-005: buildDialogInitialMessage — patterns as examples", () => {
  it("includes example patterns", () => {
    const patterns = [buildPattern("auth-flow", "new-feature")];
    const msg = buildDialogInitialMessage({
      description: "test",
      type: "new-feature",
      slug: "test",
      dynamicContext: buildEmptyContext(),
      patterns,
    });
    expect(msg).toContain("<example-1>");
    expect(msg).toContain("Pattern auth-flow");
  });

  it("includes multiple patterns numbered sequentially", () => {
    const patterns = [
      buildPattern("pattern-a", "new-feature"),
      buildPattern("pattern-b", "bug-fix"),
    ];
    const msg = buildDialogInitialMessage({
      description: "test",
      type: "new-feature",
      slug: "test",
      dynamicContext: buildEmptyContext(),
      patterns,
    });
    expect(msg).toContain("<example-1>");
    expect(msg).toContain("<example-2>");
    expect(msg).toContain("</example-1>");
    expect(msg).toContain("</example-2>");
  });
});

describe("TC-PR-006: buildDialogInitialMessage — empty context and patterns", () => {
  it("returns a valid string with empty context", () => {
    const msg = buildDialogInitialMessage({
      description: "minimal description",
      type: "new-feature",
      slug: "minimal",
      dynamicContext: buildEmptyContext(),
      patterns: [],
    });
    expect(typeof msg).toBe("string");
    expect(msg).toContain("minimal description");
    expect(msg).toContain("minimal");
  });
});
