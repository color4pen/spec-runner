/**
 * Unit tests for findScopedCommitViolations (T-01).
 *
 * TC-014: findScopedCommitViolations — 宣言 path が除外される
 * TC-015: findScopedCommitViolations — 管理 path が除外される
 * TC-016: findScopedCommitViolations — 宣言外 path のみを返す
 * TC-017: (should) findScopedCommitViolations — 空入力で空配列を返す
 *
 * NOTE: These tests are intentionally RED until T-01 adds findScopedCommitViolations
 * to src/core/step/write-scope.ts. The named import below fails until the export exists.
 */
import { describe, it, expect } from "vitest";
import {
  findScopedCommitViolations,
} from "../../../src/core/step/write-scope.js";

// ─────────────────────────────────────────────────────────────────────────────
// TC-014: findScopedCommitViolations — 宣言 path が除外される
// Source: tasks.md > T-01
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-014: findScopedCommitViolations — 宣言 path が除外される", () => {
  it("declared write path is NOT included in violations", () => {
    // GIVEN
    const changedPaths = ["result.md", "src/secret.ts"];
    const declaredWritePaths = ["result.md"];
    const managedPaths: string[] = [];

    // WHEN
    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    // THEN: "result.md" is excluded because it is declared
    expect(violations).not.toContain("result.md");
  });

  it("non-declared path IS returned as violation", () => {
    const changedPaths = ["result.md", "src/secret.ts"];
    const declaredWritePaths = ["result.md"];
    const managedPaths: string[] = [];

    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    expect(violations).toContain("src/secret.ts");
  });

  it("returns only the non-declared paths when declared path is present", () => {
    const changedPaths = ["result.md", "src/secret.ts"];
    const declaredWritePaths = ["result.md"];
    const managedPaths: string[] = [];

    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    expect(violations).toEqual(["src/secret.ts"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: findScopedCommitViolations — 管理 path が除外される
// Source: tasks.md > T-01
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-015: findScopedCommitViolations — 管理 path が除外される", () => {
  it("managed path is NOT included in violations", () => {
    // GIVEN
    const managedPath = ".specrunner/local/slug/state.json";
    const changedPaths = ["result.md", managedPath];
    const declaredWritePaths: string[] = [];
    const managedPaths = [managedPath];

    // WHEN
    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    // THEN: managed path is excluded
    expect(violations).not.toContain(managedPath);
  });

  it("non-managed path IS returned when not declared", () => {
    const managedPath = ".specrunner/local/slug/state.json";
    const changedPaths = ["result.md", managedPath];
    const declaredWritePaths: string[] = [];
    const managedPaths = [managedPath];

    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    expect(violations).toContain("result.md");
  });

  it("returns only non-managed paths when managed path is present", () => {
    const managedPath = ".specrunner/local/slug/state.json";
    const changedPaths = ["result.md", managedPath];
    const declaredWritePaths: string[] = [];
    const managedPaths = [managedPath];

    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    expect(violations).toEqual(["result.md"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: findScopedCommitViolations — 宣言外 path のみを返す
// Source: tasks.md > T-01
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-016: findScopedCommitViolations — 宣言外 path のみを返す", () => {
  it("returns only paths not in declaredWritePaths and not in managedPaths", () => {
    // GIVEN
    const changedPaths = ["result.md", "request.md", "src/code.ts"];
    const declaredWritePaths = ["result.md"];
    const managedPaths = [".specrunner/local/slug/state.json"];

    // WHEN
    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    // THEN: only "request.md" and "src/code.ts" are violations
    expect(violations).toContain("request.md");
    expect(violations).toContain("src/code.ts");
    expect(violations).not.toContain("result.md");
    expect(violations).not.toContain(".specrunner/local/slug/state.json");
  });

  it("returns all changed paths when no paths are declared or managed", () => {
    const changedPaths = ["request.md", "src/code.ts"];
    const declaredWritePaths: string[] = [];
    const managedPaths: string[] = [];

    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    expect(violations).toHaveLength(2);
    expect(violations).toContain("request.md");
    expect(violations).toContain("src/code.ts");
  });

  it("returns empty array when all changed paths are declared or managed", () => {
    const declaredPath = "result.md";
    const managedPath = ".specrunner/local/slug/state.json";
    const changedPaths = [declaredPath, managedPath];
    const declaredWritePaths = [declaredPath];
    const managedPaths = [managedPath];

    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    expect(violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: (should) findScopedCommitViolations — 空入力で空配列を返す
// Source: tasks.md > T-01
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-017: findScopedCommitViolations — 空入力で空配列を返す", () => {
  it("returns empty array for all empty inputs", () => {
    // GIVEN
    const changedPaths: string[] = [];
    const declaredWritePaths: string[] = [];
    const managedPaths: string[] = [];

    // WHEN
    const violations = findScopedCommitViolations("test-slug", changedPaths, declaredWritePaths, managedPaths);

    // THEN
    expect(violations).toEqual([]);
  });

  it("does not throw on empty inputs", () => {
    expect(() => {
      findScopedCommitViolations("", [], [], []);
    }).not.toThrow();
  });
});
