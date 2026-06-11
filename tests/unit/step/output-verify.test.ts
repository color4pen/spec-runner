/**
 * Unit tests for output-verify.ts pure functions.
 *
 * TC-OV-001: parseIncompleteTaskLabels — extracts [ ] lines, skips [x]/[X]
 * TC-OV-002: buildOutputFollowUpPrompt — lists task labels and paths
 * TC-OV-003: producedContractsFromWrites — filters gitState and verify:false
 * TC-OV-004: partitionByPolicy — separates halt and follow-up violations
 */
import { describe, it, expect } from "vitest";
import {
  parseIncompleteTaskLabels,
  buildOutputFollowUpPrompt,
  producedContractsFromWrites,
  partitionByPolicy,
  OUTPUT_FOLLOWUP_MAX_ATTEMPTS,
} from "../../../src/core/step/output-verify.js";
import type { OutputViolation, OutputCheckResult } from "../../../src/core/port/output-contract.js";
import type { IoRef } from "../../../src/core/port/step-types.js";

// ---------------------------------------------------------------------------
// TC-OV-001: parseIncompleteTaskLabels
// ---------------------------------------------------------------------------

describe("parseIncompleteTaskLabels", () => {
  it("returns empty array for empty string", () => {
    expect(parseIncompleteTaskLabels("")).toEqual([]);
  });

  it("extracts unchecked items", () => {
    const md = `# Tasks\n\n- [ ] Write tests\n- [ ] Implement feature\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual(["Write tests", "Implement feature"]);
  });

  it("ignores checked [x] items", () => {
    const md = `- [x] Done task\n- [ ] Incomplete task\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual(["Incomplete task"]);
  });

  it("ignores checked [X] items", () => {
    const md = `- [X] Done with upper case\n- [ ] Still to do\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual(["Still to do"]);
  });

  it("handles all tasks complete", () => {
    const md = `- [x] Task 1\n- [X] Task 2\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual([]);
  });

  it("handles indented checkboxes", () => {
    const md = `  - [ ] Indented task\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual(["Indented task"]);
  });

  it("ignores lines that are not checkboxes", () => {
    const md = `# T-01: My Task\n\n- [ ] Sub-task 1\n\n**Acceptance Criteria**:\n- some criteria\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual(["Sub-task 1"]);
  });

  it("handles mixed complete and incomplete tasks", () => {
    const md = `- [x] First task\n- [ ] Second task\n- [X] Third task\n- [ ] Fourth task\n`;
    expect(parseIncompleteTaskLabels(md)).toEqual(["Second task", "Fourth task"]);
  });
});

// ---------------------------------------------------------------------------
// TC-OV-002: buildOutputFollowUpPrompt
// ---------------------------------------------------------------------------

describe("buildOutputFollowUpPrompt", () => {
  it("includes incomplete task labels in tasks-complete violation", () => {
    const violations: OutputViolation[] = [
      {
        kind: "tasks-complete",
        path: "specrunner/changes/test-slug/tasks.md",
        policy: "follow-up",
        detail: ["Write unit tests", "Update documentation"],
      },
    ];
    const prompt = buildOutputFollowUpPrompt(violations);
    expect(prompt).toContain("Write unit tests");
    expect(prompt).toContain("Update documentation");
    expect(prompt).toContain("tasks.md");
  });

  it("includes missing path in produced violation", () => {
    const violations: OutputViolation[] = [
      {
        kind: "produced",
        path: "specrunner/changes/test-slug/design.md",
        policy: "halt",
        detail: [],
      },
    ];
    const prompt = buildOutputFollowUpPrompt(violations);
    expect(prompt).toContain("specrunner/changes/test-slug/design.md");
  });

  it("handles both violation types", () => {
    const violations: OutputViolation[] = [
      {
        kind: "tasks-complete",
        path: "specrunner/changes/test-slug/tasks.md",
        policy: "follow-up",
        detail: ["Task A"],
      },
      {
        kind: "produced",
        path: "specrunner/changes/test-slug/spec.md",
        policy: "halt",
        detail: [],
      },
    ];
    const prompt = buildOutputFollowUpPrompt(violations);
    expect(prompt).toContain("Task A");
    expect(prompt).toContain("spec.md");
  });

  it("handles tasks-complete with no detail (fallback text)", () => {
    const violations: OutputViolation[] = [
      {
        kind: "tasks-complete",
        path: "specrunner/changes/test-slug/tasks.md",
        policy: "follow-up",
        detail: [],
      },
    ];
    const prompt = buildOutputFollowUpPrompt(violations);
    expect(prompt).toContain("tasks.md");
  });
});

// ---------------------------------------------------------------------------
// TC-OV-003: producedContractsFromWrites
// ---------------------------------------------------------------------------

describe("producedContractsFromWrites", () => {
  it("returns empty array for undefined writes", () => {
    expect(producedContractsFromWrites(undefined, {})).toEqual([]);
  });

  it("returns empty array for empty writes", () => {
    expect(producedContractsFromWrites([], {})).toEqual([]);
  });

  it("excludes gitState artifact", () => {
    const writes: IoRef[] = [
      { path: "specrunner/changes/test-slug", artifact: "gitState" },
      { path: "specrunner/changes/test-slug/spec.md" },
    ];
    const result = producedContractsFromWrites(writes, {});
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("specrunner/changes/test-slug/spec.md");
    expect(result[0]?.kind).toBe("produced");
    expect(result[0]?.policy).toBe("halt");
  });

  it("excludes writes with verify: false", () => {
    const writes: IoRef[] = [
      { path: "specrunner/changes/test-slug/tasks.md", verify: false },
      { path: "specrunner/changes/test-slug/spec.md" },
    ];
    const result = producedContractsFromWrites(writes, {});
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("specrunner/changes/test-slug/spec.md");
  });

  it("includes scaffold content when path is in scaffolds map", () => {
    const writes: IoRef[] = [
      { path: "specrunner/changes/test-slug/spec.md" },
    ];
    const scaffolds = { "specrunner/changes/test-slug/spec.md": "# Spec:\n\n" };
    const result = producedContractsFromWrites(writes, scaffolds);
    expect(result).toHaveLength(1);
    expect(result[0]?.scaffold).toBe("# Spec:\n\n");
  });

  it("leaves scaffold undefined when path not in scaffolds", () => {
    const writes: IoRef[] = [
      { path: "specrunner/changes/test-slug/design.md" },
    ];
    const result = producedContractsFromWrites(writes, {});
    expect(result[0]?.scaffold).toBeUndefined();
  });

  it("handles multiple writes with mixed exclusions", () => {
    const writes: IoRef[] = [
      { path: "specrunner/changes/test-slug", artifact: "gitState" },
      { path: "specrunner/changes/test-slug/tasks.md", verify: false },
      { path: "specrunner/changes/test-slug/spec.md" },
      { path: "specrunner/changes/test-slug/design.md" },
    ];
    const result = producedContractsFromWrites(writes, {});
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.path)).toEqual([
      "specrunner/changes/test-slug/spec.md",
      "specrunner/changes/test-slug/design.md",
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC-OV-004: partitionByPolicy
// ---------------------------------------------------------------------------

describe("partitionByPolicy", () => {
  it("returns empty arrays for empty violations", () => {
    const result: OutputCheckResult = { violations: [] };
    const { followUp, halt } = partitionByPolicy(result);
    expect(followUp).toEqual([]);
    expect(halt).toEqual([]);
  });

  it("separates follow-up and halt violations", () => {
    const violations: OutputViolation[] = [
      { kind: "tasks-complete", path: "tasks.md", policy: "follow-up", detail: ["Task A"] },
      { kind: "produced", path: "spec.md", policy: "halt", detail: [] },
      { kind: "produced", path: "design.md", policy: "halt", detail: [] },
    ];
    const { followUp, halt } = partitionByPolicy({ violations });
    expect(followUp).toHaveLength(1);
    expect(followUp[0]?.kind).toBe("tasks-complete");
    expect(halt).toHaveLength(2);
    expect(halt.map((v) => v.path)).toEqual(["spec.md", "design.md"]);
  });

  it("all follow-up violations go to followUp", () => {
    const violations: OutputViolation[] = [
      { kind: "tasks-complete", path: "tasks.md", policy: "follow-up", detail: [] },
    ];
    const { followUp, halt } = partitionByPolicy({ violations });
    expect(followUp).toHaveLength(1);
    expect(halt).toHaveLength(0);
  });

  it("all halt violations go to halt", () => {
    const violations: OutputViolation[] = [
      { kind: "produced", path: "spec.md", policy: "halt", detail: [] },
    ];
    const { followUp, halt } = partitionByPolicy({ violations });
    expect(followUp).toHaveLength(0);
    expect(halt).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Constant
// ---------------------------------------------------------------------------

describe("OUTPUT_FOLLOWUP_MAX_ATTEMPTS", () => {
  it("is a positive integer", () => {
    expect(OUTPUT_FOLLOWUP_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(Number.isInteger(OUTPUT_FOLLOWUP_MAX_ATTEMPTS)).toBe(true);
  });
});
