/**
 * Unit tests for src/prompts/design-system.ts
 *
 * Regression for the dogfooding-001 second-pass bug where the design agent
 * edited README.md (a file outside `specrunner/changes/<slug>/`) because the
 * prompt's negative-only framing did not draw the boundary by path.
 *
 * TC-007: DESIGN_SYSTEM_PROMPT に openspec CLI の指示が含まれない (must)
 * TC-008: DESIGN_SYSTEM_PROMPT に design.md の artifact 指示が含まれる (must)
 * TC-009: DESIGN_SYSTEM_PROMPT に tasks.md の artifact 指示が含まれる (must)
 * TC-010: DESIGN_SYSTEM_PROMPT に path-fence の記述が維持されている (must)
 * TC-011: DESIGN_SYSTEM_PROMPT に完了条件（commit + push）が維持されている (must)
 * TC-012: DESIGN_INITIAL_MESSAGE_TEMPLATE が slug と branch を注入する構造を維持する (must)
 */
import { describe, it, expect } from "vitest";
import {
  DESIGN_SYSTEM_PROMPT,
  DESIGN_INITIAL_MESSAGE_TEMPLATE,
  buildInitialMessage,
} from "../../src/prompts/design-system.js";

describe("design system prompt — workflow position (positive framing)", () => {
  it("declares design as stage 1 of the pipeline", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("stage 1");
    expect(DESIGN_SYSTEM_PROMPT).toContain("design");
    expect(DESIGN_SYSTEM_PROMPT).toContain("spec-review");
    expect(DESIGN_SYSTEM_PROMPT).toContain("implementer");
    expect(DESIGN_SYSTEM_PROMPT).toContain("verification");
  });

  it("explains that tasks.md is the hand-off to implementer", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/tasks\.md.*implementer|implementer.*tasks\.md/s);
  });
});

describe("design system prompt — CRITICAL BOUNDARY (path-fence)", () => {
  it("contains a CRITICAL BOUNDARY section", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("CRITICAL BOUNDARY");
  });

  it("forbids modifying files outside specrunner/changes/<slug>/", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/outside.*specrunner\/changes/);
  });

  it("explicitly names README.md as forbidden", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("README.md");
  });

  it("draws the boundary by path, not by file type", () => {
    // The agent's prior failure mode was reasoning "README is documentation,
    // therefore not 'implementation work'". The prompt must override that.
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/by.*path/i);
  });

  it("includes an 'even if the user request asks' override clause", () => {
    // Either the system prompt or the message template must contain the override.
    const combined = `${DESIGN_SYSTEM_PROMPT}\n${DESIGN_INITIAL_MESSAGE_TEMPLATE}`;
    expect(combined).toMatch(/even if the user request asks/i);
  });
});

describe("design initial message — user-request override clause", () => {
  it("template warns the agent not to follow user-request edits outside the change folder", () => {
    expect(DESIGN_INITIAL_MESSAGE_TEMPLATE).toMatch(/IMPORTANT/);
    expect(DESIGN_INITIAL_MESSAGE_TEMPLATE).toMatch(/README\.md|outside/i);
  });

  it("buildInitialMessage substitutes slug and branch into the override", () => {
    const msg = buildInitialMessage("body", "my-slug", "feat/my-slug");
    expect(msg).toContain("my-slug");
    expect(msg).toContain("feat/my-slug");
    expect(msg).toContain("body");
  });
});

// TC-007: DESIGN_SYSTEM_PROMPT に openspec CLI の指示が含まれない
describe("TC-007: openspec CLI commands are NOT in DESIGN_SYSTEM_PROMPT", () => {
  it("does not contain 'npx openspec' instruction", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("npx openspec");
  });

  it("does not contain 'openspec new change' instruction", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("openspec new change");
  });

  it("does not contain 'openspec status' instruction", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("openspec status");
  });
});

// TC-008: DESIGN_SYSTEM_PROMPT に design.md の artifact 指示が含まれる
describe("TC-008: design.md artifact is specified in DESIGN_SYSTEM_PROMPT", () => {
  it("contains 'design.md' artifact reference", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("design.md");
  });
});

// TC-009: DESIGN_SYSTEM_PROMPT に tasks.md の artifact 指示が含まれる
describe("TC-009: tasks.md artifact is specified in DESIGN_SYSTEM_PROMPT", () => {
  it("contains 'tasks.md' artifact reference", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("tasks.md");
  });
});

// TC-010: path-fence maintained
describe("TC-010: path-fence is maintained in DESIGN_SYSTEM_PROMPT", () => {
  it("contains reference to specrunner/changes/<slug>/ boundary", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/specrunner\/changes.*slug/);
  });
});

// TC-011: completion conditions maintained (commit + push; register_branch removed in D4)
describe("TC-011: commit + push completion conditions maintained", () => {
  it("contains commit instruction", () => {
    expect(DESIGN_SYSTEM_PROMPT.toLowerCase()).toContain("commit");
  });

  it("contains push instruction", () => {
    expect(DESIGN_SYSTEM_PROMPT.toLowerCase()).toContain("push");
  });

  it("does NOT contain register_branch instruction (removed in D4)", () => {
    // Branch is created by CLI before agent runs — agent does not call register_branch
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("register_branch");
  });

  it("does NOT contain proposal.md reference", () => {
    expect(DESIGN_SYSTEM_PROMPT).not.toContain("proposal.md");
  });
});

// TC-012: DESIGN_INITIAL_MESSAGE_TEMPLATE slug/branch injection
describe("TC-012: DESIGN_INITIAL_MESSAGE_TEMPLATE maintains slug and branch injection", () => {
  it("template contains {{SLUG}} and {{BRANCH}} placeholders", () => {
    expect(DESIGN_INITIAL_MESSAGE_TEMPLATE).toContain("{{SLUG}}");
    expect(DESIGN_INITIAL_MESSAGE_TEMPLATE).toContain("{{BRANCH}}");
  });

  it("buildInitialMessage signature accepts requestContent, slug, branch (design D4)", () => {
    const msg = buildInitialMessage("req-content", "test-slug", "change/test-slug");
    expect(msg).toContain("test-slug");
    expect(msg).toContain("change/test-slug");
    expect(msg).toContain("req-content");
  });

  it("DESIGN_INITIAL_MESSAGE_TEMPLATE does not mention proposal.md", () => {
    expect(DESIGN_INITIAL_MESSAGE_TEMPLATE).not.toContain("proposal.md");
  });
});


// TC-CL-001: DESIGN_SYSTEM_PROMPT に Completion Checklist セクションが含まれる
describe("TC-CL-001: DESIGN_SYSTEM_PROMPT contains Completion Checklist section", () => {
  it("contains 'Completion Checklist' section header", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("Completion Checklist");
  });

  it("contains 'spec.md' and 'REQUIRED' in the same section", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("spec.md");
    expect(DESIGN_SYSTEM_PROMPT).toContain("REQUIRED");
    // Both must appear within the Completion Checklist section
    const checklistIdx = DESIGN_SYSTEM_PROMPT.indexOf("Completion Checklist");
    const requiredIdx = DESIGN_SYSTEM_PROMPT.indexOf("REQUIRED");
    expect(checklistIdx).toBeGreaterThan(-1);
    expect(requiredIdx).toBeGreaterThan(checklistIdx);
  });

  it("mentions spec-change and new-feature as requiring delta spec", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("spec-change");
    expect(DESIGN_SYSTEM_PROMPT).toContain("new-feature");
  });

  it("contains bug-fix and refactoring checklist (delta spec not required)", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("bug-fix");
    expect(DESIGN_SYSTEM_PROMPT).toContain("refactoring");
  });

  it("instructs agent not to finish if any checklist item is ✗", () => {
    // Neutral language: "✗ が 1 つでもあれば作業を終えず修正を継続する" or equivalent
    const hasNeutralInstruction =
      DESIGN_SYSTEM_PROMPT.includes("作業を終えず修正を継続する") ||
      DESIGN_SYSTEM_PROMPT.includes("do NOT finish") ||
      (DESIGN_SYSTEM_PROMPT.includes("✗") && DESIGN_SYSTEM_PROMPT.includes("修正"));
    expect(hasNeutralInstruction).toBe(true);
  });
});

// TC-CL-002: DESIGN_INITIAL_MESSAGE_TEMPLATE に {{REQUEST_TYPE}} が含まれる
describe("TC-CL-002: DESIGN_INITIAL_MESSAGE_TEMPLATE contains {{REQUEST_TYPE}} placeholder", () => {
  it("template contains {{REQUEST_TYPE}} placeholder", () => {
    expect(DESIGN_INITIAL_MESSAGE_TEMPLATE).toContain("{{REQUEST_TYPE}}");
  });

  it("{{REQUEST_TYPE}} appears after {{BRANCH}} in the template", () => {
    const branchIdx = DESIGN_INITIAL_MESSAGE_TEMPLATE.indexOf("{{BRANCH}}");
    const typeIdx = DESIGN_INITIAL_MESSAGE_TEMPLATE.indexOf("{{REQUEST_TYPE}}");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(typeIdx).toBeGreaterThan(branchIdx);
  });
});

// TC-CL-003: buildInitialMessage にリクエストタイプを渡すと出力に反映される
describe("TC-CL-003: buildInitialMessage injects requestType into output", () => {
  it("reflects requestType=spec-change in the built message", () => {
    const msg = buildInitialMessage("body", "test-slug", "change/test-slug", undefined, "spec-change");
    expect(msg).toContain("spec-change");
  });

  it("reflects requestType=bug-fix in the built message", () => {
    const msg = buildInitialMessage("body", "test-slug", "change/test-slug", undefined, "bug-fix");
    expect(msg).toContain("bug-fix");
  });

  it("works without requestType (backward compatibility)", () => {
    const msg = buildInitialMessage("body", "test-slug", "change/test-slug");
    expect(msg).toContain("test-slug");
    expect(msg).toContain("change/test-slug");
    expect(msg).toContain("body");
    // No crash; {{REQUEST_TYPE}} replaced with empty string
    expect(msg).not.toContain("{{REQUEST_TYPE}}");
  });

  it("does not leave {{REQUEST_TYPE}} placeholder in output when requestType omitted", () => {
    const msg = buildInitialMessage("body", "my-slug");
    expect(msg).not.toContain("{{REQUEST_TYPE}}");
  });
});

// TC-FC-001: DESIGN_SYSTEM_PROMPT に現状コード断定の検証工程が含まれる
describe("TC-FC-001: code assertion verification step is present in DESIGN_SYSTEM_PROMPT", () => {
  it("contains the fact-check section header", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("現状コード断定の検証");
  });

  it("instructs to check the entire request, not only the dedicated section", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/request 全体が対象|全体.*対象/);
  });

  it("defines file:line as a verification target", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/file:line/);
  });

  it("defines specific symbol names as a verification target", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/シンボル名|symbol/i);
  });

  it("excludes intentions and future plans from verification", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/対象外/);
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/意図|将来/);
  });
});

// TC-FC-002: 不一致時は ok=false + reason で報告する経路が含まれる
describe("TC-FC-002: ok=false + reason reporting path for mismatch is in DESIGN_SYSTEM_PROMPT", () => {
  it("mentions ok: false on mismatch", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/ok.*false|ok: false/i);
  });

  it("mentions reason in the completion call", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/reason/i);
  });

  it("instructs not to proceed with wrong premise", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/誤った前提.*設計|設計.*誤った前提/);
  });
});

// TC-001: DESIGN_SYSTEM_PROMPT に "Layer-1 litmus" セクションが含まれる
describe("TC-001: Layer-1 litmus section is present in DESIGN_SYSTEM_PROMPT", () => {
  it("contains 'Layer-1 litmus' string", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("Layer-1 litmus");
  });
});

// TC-002: DESIGN_SYSTEM_PROMPT に Layer-0 禁止指示が含まれる
describe("TC-002: Layer-0 prohibition is present in DESIGN_SYSTEM_PROMPT", () => {
  it("contains Layer-0 spec 禁止指示", () => {
    expect(DESIGN_SYSTEM_PROMPT).toMatch(/Layer-0.*spec に書かない|SHALL NOT.*Requirement/s);
  });
});

// TC-003: DESIGN_SYSTEM_PROMPT に architecture/ 参照 guidance が含まれる
describe("TC-003: architecture/ reference guidance is present in DESIGN_SYSTEM_PROMPT", () => {
  it("contains 'architecture/' reference", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("architecture/");
  });
});

