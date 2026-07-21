/**
 * Unit tests verifying write-scope single-source is consistent with rules.md
 * responsibility table for guarded write steps.
 *
 * TC-001: 単一ソースが責任範囲表の禁止項目を下回らない
 * TC-002: 単一ソースが Touch 可能 path を禁止しない
 *
 * NOTE: These tests are intentionally RED until src/core/step/write-scope.ts is created.
 * The import below will fail with "Cannot find module" until the implementation exists.
 */
import { describe, it, expect } from "vitest";
import { forbiddenWritePaths } from "../../../src/core/step/write-scope.js";

const slug = "test-slug";
const requestMd = `specrunner/changes/${slug}/request.md`;
const specMd = `specrunner/changes/${slug}/spec.md`;
const designMd = `specrunner/changes/${slug}/design.md`;
const tasksMd = `specrunner/changes/${slug}/tasks.md`;
const testCasesMd = `specrunner/changes/${slug}/test-cases.md`;

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: 単一ソースが責任範囲表の禁止項目を下回らない
//
// rules.md 責任範囲表の 禁止 セル（path 表現可能なもの）が forbiddenWritePaths
// の返す集合に全て含まれることを各 guarded step ごとに検証する。
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-001: 単一ソースが責任範囲表の禁止項目を下回らない", () => {
  // rules.md: implementer — 禁止 = specs (read-only), design.md
  describe("implementer (declaredWritePaths = [])", () => {
    it("request.md is forbidden for implementer", () => {
      const forbidden = forbiddenWritePaths("implementer", slug, []);
      expect(forbidden).toContain(requestMd);
    });

    it("spec.md is forbidden for implementer (rules.md: specs は禁止)", () => {
      const forbidden = forbiddenWritePaths("implementer", slug, []);
      expect(forbidden).toContain(specMd);
    });

    it("design.md is forbidden for implementer (rules.md: design.md は禁止)", () => {
      const forbidden = forbiddenWritePaths("implementer", slug, []);
      expect(forbidden).toContain(designMd);
    });
  });

  // rules.md: build-fixer — 禁止 = specs, design, tasks
  describe("build-fixer (declaredWritePaths = [])", () => {
    it("spec.md is forbidden for build-fixer (rules.md: specs は禁止)", () => {
      const forbidden = forbiddenWritePaths("build-fixer", slug, []);
      expect(forbidden).toContain(specMd);
    });

    it("design.md is forbidden for build-fixer (rules.md: design は禁止)", () => {
      const forbidden = forbiddenWritePaths("build-fixer", slug, []);
      expect(forbidden).toContain(designMd);
    });

    it("tasks.md is forbidden for build-fixer (rules.md: tasks は禁止)", () => {
      const forbidden = forbiddenWritePaths("build-fixer", slug, []);
      expect(forbidden).toContain(tasksMd);
    });
  });

  // rules.md: code-fixer — 禁止 = specs, design, tasks
  describe("code-fixer (declaredWritePaths = [])", () => {
    it("spec.md is forbidden for code-fixer (rules.md: specs は禁止)", () => {
      const forbidden = forbiddenWritePaths("code-fixer", slug, []);
      expect(forbidden).toContain(specMd);
    });

    it("design.md is forbidden for code-fixer (rules.md: design は禁止)", () => {
      const forbidden = forbiddenWritePaths("code-fixer", slug, []);
      expect(forbidden).toContain(designMd);
    });

    it("tasks.md is forbidden for code-fixer (rules.md: tasks は禁止)", () => {
      const forbidden = forbiddenWritePaths("code-fixer", slug, []);
      expect(forbidden).toContain(tasksMd);
    });
  });

  // rules.md: test-materialize — 禁止 = production code, test-cases.md, tasks.md
  describe("test-materialize (declaredWritePaths = [])", () => {
    it("test-cases.md is forbidden for test-materialize (rules.md: test-cases.md は禁止)", () => {
      const forbidden = forbiddenWritePaths("test-materialize", slug, []);
      expect(forbidden).toContain(testCasesMd);
    });

    it("tasks.md is forbidden for test-materialize (rules.md: tasks.md は禁止)", () => {
      const forbidden = forbiddenWritePaths("test-materialize", slug, []);
      expect(forbidden).toContain(tasksMd);
    });
  });

  // rules.md: adr-gen — 禁止 = source code, specs, design, tasks
  describe("adr-gen (declaredWritePaths = [])", () => {
    it("spec.md is forbidden for adr-gen (rules.md: specs は禁止)", () => {
      const forbidden = forbiddenWritePaths("adr-gen", slug, []);
      expect(forbidden).toContain(specMd);
    });

    it("design.md is forbidden for adr-gen (rules.md: design は禁止)", () => {
      const forbidden = forbiddenWritePaths("adr-gen", slug, []);
      expect(forbidden).toContain(designMd);
    });

    it("tasks.md is forbidden for adr-gen (rules.md: tasks は禁止)", () => {
      const forbidden = forbiddenWritePaths("adr-gen", slug, []);
      expect(forbidden).toContain(tasksMd);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: 単一ソースが Touch 可能 path を禁止しない
//
// implementer は rules.md で tasks.md を Touch 可能とされている。
// implementer の writes() が tasks.md を宣言している場合、禁止領域に含まれない。
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-002: 単一ソースが Touch 可能 path を禁止しない", () => {
  it("implementer が tasks.md を宣言 write している場合、禁止領域に tasks.md が含まれない", () => {
    // implementer's writes() declares tasks.md (verify: false checkbox update)
    // → tasks.md is "Touch 可能" per rules.md → must NOT be in forbidden set
    const declaredWritePaths = [tasksMd];
    const forbidden = forbiddenWritePaths("implementer", slug, declaredWritePaths);
    expect(forbidden).not.toContain(tasksMd);
  });

  it("implementer が tasks.md を宣言していない場合、tasks.md はデフォルトで forbidden に含まれる", () => {
    // Without declaration, tasks.md remains in protectedCanonPaths
    const forbidden = forbiddenWritePaths("implementer", slug, []);
    expect(forbidden).toContain(tasksMd);
  });

  it("tasks.md 宣言時も spec.md は依然として forbidden に含まれる", () => {
    // Declaring tasks.md does not remove spec.md from the forbidden set
    const declaredWritePaths = [tasksMd];
    const forbidden = forbiddenWritePaths("implementer", slug, declaredWritePaths);
    expect(forbidden).toContain(specMd);
  });

  it("tasks.md 宣言時も design.md は依然として forbidden に含まれる", () => {
    const declaredWritePaths = [tasksMd];
    const forbidden = forbiddenWritePaths("implementer", slug, declaredWritePaths);
    expect(forbidden).toContain(designMd);
  });
});
