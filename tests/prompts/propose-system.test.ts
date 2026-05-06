/**
 * Unit tests for src/prompts/propose-system.ts
 *
 * Regression for the dogfooding-001 second-pass bug where the propose agent
 * edited README.md (a file outside `openspec/changes/<slug>/`) because the
 * prompt's negative-only framing did not draw the boundary by path.
 *
 * TC-007: PROPOSE_SYSTEM_PROMPT に openspec new change コマンドの指示が含まれる (must)
 * TC-008: PROPOSE_SYSTEM_PROMPT に openspec status --json の指示が含まれる (must)
 * TC-009: PROPOSE_SYSTEM_PROMPT に openspec instructions の指示が含まれる (must)
 * TC-010: PROPOSE_SYSTEM_PROMPT に path-fence の記述が維持されている (must)
 * TC-011: PROPOSE_SYSTEM_PROMPT に完了条件（commit + push + register_branch）が維持されている (must)
 * TC-012: PROPOSE_INITIAL_MESSAGE_TEMPLATE が slug と branch を注入する構造を維持する (must)
 */
import { describe, it, expect } from "vitest";
import {
  PROPOSE_SYSTEM_PROMPT,
  PROPOSE_INITIAL_MESSAGE_TEMPLATE,
  buildInitialMessage,
} from "../../src/prompts/propose-system.js";

describe("propose system prompt — workflow position (positive framing)", () => {
  it("declares propose as stage 1 of the pipeline", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("stage 1");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("propose");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("spec-review");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("implementer");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("verification");
  });

  it("explains that tasks.md is the hand-off to implementer", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/tasks\.md.*implementer|implementer.*tasks\.md/s);
  });
});

describe("propose system prompt — CRITICAL BOUNDARY (path-fence)", () => {
  it("contains a CRITICAL BOUNDARY section", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("CRITICAL BOUNDARY");
  });

  it("forbids modifying files outside openspec/changes/<slug>/", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/outside.*openspec\/changes/);
  });

  it("explicitly names README.md as forbidden", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("README.md");
  });

  it("draws the boundary by path, not by file type", () => {
    // The agent's prior failure mode was reasoning "README is documentation,
    // therefore not 'implementation work'". The prompt must override that.
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/by.*path/i);
  });

  it("includes an 'even if the user request asks' override clause", () => {
    // Either the system prompt or the message template must contain the override.
    const combined = `${PROPOSE_SYSTEM_PROMPT}\n${PROPOSE_INITIAL_MESSAGE_TEMPLATE}`;
    expect(combined).toMatch(/even if the user request asks/i);
  });
});

describe("propose initial message — user-request override clause", () => {
  it("template warns the agent not to follow user-request edits outside the change folder", () => {
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).toMatch(/IMPORTANT/);
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).toMatch(/README\.md|outside/i);
  });

  it("buildInitialMessage substitutes slug and branch into the override", () => {
    const msg = buildInitialMessage("body", "my-slug", "feat/my-slug");
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("body");
  });
});

// TC-007: PROPOSE_SYSTEM_PROMPT に openspec new change コマンドの指示が含まれる
describe("TC-007: openspec new change command is described in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains 'openspec new change' instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("openspec new change");
  });
});

// TC-008: PROPOSE_SYSTEM_PROMPT に openspec status --json の指示が含まれる
describe("TC-008: openspec status --json is described in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains 'openspec status' with --json flag instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("openspec status");
    expect(PROPOSE_SYSTEM_PROMPT).toContain("--json");
  });
});

// TC-009: PROPOSE_SYSTEM_PROMPT に openspec instructions の指示が含まれる
describe("TC-009: openspec instructions command is described in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains 'openspec instructions' instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("openspec instructions");
  });
});

// TC-010: path-fence maintained
describe("TC-010: path-fence is maintained in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains reference to openspec/changes/<slug>/ boundary", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/openspec\/changes.*slug/);
  });
});

// TC-011: completion conditions maintained
describe("TC-011: commit + push + register_branch completion conditions maintained", () => {
  it("contains commit instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT.toLowerCase()).toContain("commit");
  });

  it("contains push instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT.toLowerCase()).toContain("push");
  });

  it("contains register_branch instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("register_branch");
  });
});

// TC-012: PROPOSE_INITIAL_MESSAGE_TEMPLATE slug/branch injection
describe("TC-012: PROPOSE_INITIAL_MESSAGE_TEMPLATE maintains slug and branch injection", () => {
  it("template contains {{SLUG}} and {{BRANCH}} placeholders", () => {
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).toContain("{{SLUG}}");
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).toContain("{{BRANCH}}");
  });

  it("buildInitialMessage signature accepts requestContent, slug, branch (design D4)", () => {
    const msg = buildInitialMessage("req-content", "test-slug", "change/test-slug");
    expect(msg).toContain("test-slug");
    expect(msg).toContain("change/test-slug");
    expect(msg).toContain("req-content");
  });
});
