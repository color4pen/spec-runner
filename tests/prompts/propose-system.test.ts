/**
 * Unit tests for src/prompts/propose-system.ts
 *
 * Regression for the dogfooding-001 second-pass bug where the propose agent
 * edited README.md (a file outside `specrunner/changes/<slug>/`) because the
 * prompt's negative-only framing did not draw the boundary by path.
 *
 * TC-007: PROPOSE_SYSTEM_PROMPT に openspec CLI の指示が含まれない (must)
 * TC-008: PROPOSE_SYSTEM_PROMPT に design.md の artifact 指示が含まれる (must)
 * TC-009: PROPOSE_SYSTEM_PROMPT に tasks.md の artifact 指示が含まれる (must)
 * TC-010: PROPOSE_SYSTEM_PROMPT に path-fence の記述が維持されている (must)
 * TC-011: PROPOSE_SYSTEM_PROMPT に完了条件（commit + push）が維持されている (must)
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

  it("forbids modifying files outside specrunner/changes/<slug>/", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/outside.*specrunner\/changes/);
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

// TC-007: PROPOSE_SYSTEM_PROMPT に openspec CLI の指示が含まれない
describe("TC-007: openspec CLI commands are NOT in PROPOSE_SYSTEM_PROMPT", () => {
  it("does not contain 'npx openspec' instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain("npx openspec");
  });

  it("does not contain 'openspec new change' instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain("openspec new change");
  });

  it("does not contain 'openspec status' instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain("openspec status");
  });
});

// TC-008: PROPOSE_SYSTEM_PROMPT に design.md の artifact 指示が含まれる
describe("TC-008: design.md artifact is specified in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains 'design.md' artifact reference", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("design.md");
  });
});

// TC-009: PROPOSE_SYSTEM_PROMPT に tasks.md の artifact 指示が含まれる
describe("TC-009: tasks.md artifact is specified in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains 'tasks.md' artifact reference", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("tasks.md");
  });
});

// TC-010: path-fence maintained
describe("TC-010: path-fence is maintained in PROPOSE_SYSTEM_PROMPT", () => {
  it("contains reference to specrunner/changes/<slug>/ boundary", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/specrunner\/changes.*slug/);
  });
});

// TC-011: completion conditions maintained (commit + push; register_branch removed in D4)
describe("TC-011: commit + push completion conditions maintained", () => {
  it("contains commit instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT.toLowerCase()).toContain("commit");
  });

  it("contains push instruction", () => {
    expect(PROPOSE_SYSTEM_PROMPT.toLowerCase()).toContain("push");
  });

  it("does NOT contain register_branch instruction (removed in D4)", () => {
    // Branch is created by CLI before agent runs — agent does not call register_branch
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain("register_branch");
  });

  it("does NOT contain proposal.md reference", () => {
    expect(PROPOSE_SYSTEM_PROMPT).not.toContain("proposal.md");
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

  it("PROPOSE_INITIAL_MESSAGE_TEMPLATE does not mention proposal.md", () => {
    expect(PROPOSE_INITIAL_MESSAGE_TEMPLATE).not.toContain("proposal.md");
  });
});

// TC-SP-001: PROPOSE_SYSTEM_PROMPT に "Baseline Spec 参照" セクションが含まれる
describe("TC-SP-001: PROPOSE_SYSTEM_PROMPT contains Baseline Spec 参照 section", () => {
  it("contains 'Baseline Spec 参照' section header", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("Baseline Spec 参照");
  });

  it("contains 'specrunner/specs/' reference", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("specrunner/specs/");
  });

  it("contains Read 許可 statement", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("Read は許可");
  });

  it("instructs to read baseline spec before writing delta spec", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("delta spec");
    expect(PROPOSE_SYSTEM_PROMPT).toMatch(/baseline spec.*Read|Read.*baseline spec/);
  });
});

// TC-SP-002: "Baseline Spec 参照" is placed after path-fence and before 禁止事項
describe("TC-SP-002: Baseline Spec 参照 is placed between CRITICAL BOUNDARY and 禁止事項", () => {
  it("Baseline Spec 参照 appears after CRITICAL BOUNDARY and before 禁止事項", () => {
    const pathFenceIdx = PROPOSE_SYSTEM_PROMPT.indexOf("CRITICAL BOUNDARY (path-fence)");
    const baselineIdx = PROPOSE_SYSTEM_PROMPT.indexOf("Baseline Spec 参照");
    const forbiddenIdx = PROPOSE_SYSTEM_PROMPT.indexOf("## 禁止事項");

    expect(pathFenceIdx).toBeGreaterThan(-1);
    expect(baselineIdx).toBeGreaterThan(-1);
    expect(forbiddenIdx).toBeGreaterThan(-1);

    expect(baselineIdx).toBeGreaterThan(pathFenceIdx);
    expect(baselineIdx).toBeLessThan(forbiddenIdx);
  });
});
