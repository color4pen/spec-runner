/**
 * Structural regression tests for the `request generate` removal and
 * `request prompt` introduction (deterministic-request-entrance).
 *
 * TC-005: 廃止シンボルへの参照が src / docs に残らない
 *   Source: spec.md > Requirement: `request generate` とその一本鎖は廃止される
 *           > Scenario: 廃止シンボルへの参照が src / docs に残らない
 *
 * TC-007: usage と docs に generate 案内が残らず prompt が案内される
 *   Source: spec.md > Requirement: docs と CLI usage が新しい入口を案内する
 *           > Scenario: usage と docs に generate 案内が残らず prompt が案内される
 *
 * TC-008: 生成一本鎖 5 ファイルが削除されている
 *   Source: tasks.md > T-03
 *
 * TC-009: manager.ts に create / generator / OneShotQueryClient が現れない
 *   Source: tasks.md > T-03
 *
 * TC-010: port/index.ts から OneShotQueryClient 系 re-export が除去されている
 *   Source: tasks.md > T-03
 *
 * TC-011: CommandInvocation.command union に "request-generate" リテラルが残置されている
 *   Source: design.md > D4
 *
 * TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する
 *   Source: design.md > D5
 *
 * TC-014: 生成専用テストファイル 3 件が存在しない
 *   Source: tasks.md > T-07
 *
 * All "RED before implementation, GREEN after" tests verify the deletion of the
 * generate chain. TC-011 and TC-012 are GREEN throughout (positive invariants).
 *
 * NOTE: This test file lives under tests/ (not src/ or docs/) so that
 * TC-005's grep checks do not self-match.
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ─── grep helper ──────────────────────────────────────────────────────────────

/**
 * Run `grep -rn PATTERN DIR` from the project root.
 * Returns matched lines (non-empty string) or "" on no matches.
 * Throws if grep exits with code > 1 (real error).
 */
function grepIn(pattern: string, dir: string): string {
  try {
    return execSync(`grep -rn "${pattern}" ${dir}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return ""; // no matches — success
    throw err;
  }
}

// ─── TC-005: 廃止シンボルへの参照が src / docs に残らない ────────────────────

describe("TC-005: 廃止シンボルへの参照が src / docs に残らない", () => {
  // The three banned patterns — none of these match "request-generate" (the
  // retained literal in src/core/usage/types.ts) so no exclusion is needed.

  it("TC-005: src/ に OneShotQueryClient の参照が 0 件である", () => {
    const result = grepIn("OneShotQueryClient", "src");
    expect(
      result,
      `OneShotQueryClient が src/ に残っています:\n${result}`,
    ).toBe("");
  });

  it("TC-005: docs/ に OneShotQueryClient の参照が 0 件である", () => {
    const result = grepIn("OneShotQueryClient", "docs");
    expect(
      result,
      `OneShotQueryClient が docs/ に残っています:\n${result}`,
    ).toBe("");
  });

  it("TC-005: src/ に request-generate-system の参照が 0 件である", () => {
    const result = grepIn("request-generate-system", "src");
    expect(
      result,
      `request-generate-system が src/ に残っています:\n${result}`,
    ).toBe("");
  });

  it("TC-005: docs/ に request-generate-system の参照が 0 件である", () => {
    const result = grepIn("request-generate-system", "docs");
    expect(
      result,
      `request-generate-system が docs/ に残っています:\n${result}`,
    ).toBe("");
  });

  it("TC-005: src/ に 'request generate'（スペース区切り）の参照が 0 件である", () => {
    // "request generate" with a space — distinct from "request-generate" (hyphen)
    // The retained literal "request-generate" in types.ts will NOT match this pattern.
    const result = grepIn("request generate", "src");
    expect(
      result,
      `'request generate' が src/ に残っています:\n${result}`,
    ).toBe("");
  });

  it("TC-005: docs/ に 'request generate'（スペース区切り）の参照が 0 件である", () => {
    const result = grepIn("request generate", "docs");
    expect(
      result,
      `'request generate' が docs/ に残っています:\n${result}`,
    ).toBe("");
  });
});

// ─── TC-007: usage と docs に generate 案内が残らず prompt が案内される ─────

describe("TC-007: usage と docs に generate 案内が残らず prompt が案内される", () => {
  // Read command-registry.ts as raw source to check USAGE content without
  // triggering module-load failures (generate chain imports will be deleted).

  it("TC-007: CLI USAGE 文字列に 'request generate' が含まれない", () => {
    const registrySource = readFileSync(
      path.join(ROOT, "src/cli/command-registry.ts"),
      "utf-8",
    );
    // Extract USAGE section: starts with `export const USAGE = \`` and ends with the closing backtick line
    const usageMatch = registrySource.match(/export const USAGE = `([\s\S]*?)`\s*;/);
    const usageContent = usageMatch ? usageMatch[1] : registrySource;
    expect(
      usageContent,
      "CLI USAGE に 'request generate' が残っています（T-02 で除去が必要）",
    ).not.toContain("request generate");
  });

  it("TC-007: CLI USAGE 文字列に 'request prompt' が含まれる", () => {
    const registrySource = readFileSync(
      path.join(ROOT, "src/cli/command-registry.ts"),
      "utf-8",
    );
    const usageMatch = registrySource.match(/export const USAGE = `([\s\S]*?)`\s*;/);
    const usageContent = usageMatch ? usageMatch[1] : registrySource;
    expect(
      usageContent,
      "CLI USAGE に 'request prompt' がありません（T-02 で追加が必要）",
    ).toContain("request prompt");
  });

  it("TC-007: docs/request-authoring.md に 'request prompt' の案内が含まれる", () => {
    const docsPath = path.join(ROOT, "docs/request-authoring.md");
    const content = readFileSync(docsPath, "utf-8");
    expect(
      content,
      "docs/request-authoring.md に 'request prompt' の案内がありません（T-08 で追加が必要）",
    ).toContain("request prompt");
  });

  it("TC-007: docs/request-authoring.md に 'request generate' の案内が含まれない", () => {
    const docsPath = path.join(ROOT, "docs/request-authoring.md");
    const content = readFileSync(docsPath, "utf-8");
    expect(content).not.toContain("request generate");
  });
});

// ─── TC-008: 生成一本鎖 5 ファイルが削除されている ──────────────────────────

describe("TC-008: 生成一本鎖 5 ファイルが削除されている", () => {
  const DELETED_FILES = [
    "src/core/command/request-create.ts",
    "src/core/request/generator.ts",
    "src/prompts/request-generate-system.ts",
    "src/core/port/one-shot-query-client.ts",
    "src/adapter/claude-code/one-shot-query-client.ts",
  ];

  for (const file of DELETED_FILES) {
    it(`TC-008: ${file} が存在しない`, () => {
      const fullPath = path.join(ROOT, file);
      expect(
        existsSync(fullPath),
        `${file} がまだ存在しています（削除されていません）`,
      ).toBe(false);
    });
  }
});

// ─── TC-009: manager.ts に create / generator / OneShotQueryClient が現れない ─

describe("TC-009: manager.ts に create / generator / OneShotQueryClient が現れない", () => {
  const MANAGER_PATH = path.join(ROOT, "src/core/request/manager.ts");

  it("TC-009: manager.ts に 'create' が現れない（list / resolve は残存）", () => {
    const source = readFileSync(MANAGER_PATH, "utf-8");
    // Remove comment lines to avoid false positives from JSDoc
    const nonCommentLines = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    // Check function declaration and usage but not as part of 'executeCreate' etc.
    // We specifically check that 'export.*function create' or 'manager.create' don't appear.
    expect(nonCommentLines).not.toMatch(/\bexport\s+(async\s+)?function\s+create\b/);
    expect(nonCommentLines).not.toContain("generator.generate");
  });

  it("TC-009: manager.ts に 'generator' の import が現れない", () => {
    const source = readFileSync(MANAGER_PATH, "utf-8");
    expect(source).not.toContain("generator");
  });

  it("TC-009: manager.ts に 'OneShotQueryClient' が現れない", () => {
    const source = readFileSync(MANAGER_PATH, "utf-8");
    expect(source).not.toContain("OneShotQueryClient");
  });
});

// ─── TC-010: port/index.ts から OneShotQueryClient 系 re-export が除去されている

describe("TC-010: port/index.ts から OneShotQueryClient 系 re-export が除去されている", () => {
  const PORT_INDEX_PATH = path.join(ROOT, "src/core/port/index.ts");

  it("TC-010: port/index.ts に 'OneShotQueryClient' が現れない", () => {
    const source = readFileSync(PORT_INDEX_PATH, "utf-8");
    expect(source).not.toContain("OneShotQueryClient");
  });

  it("TC-010: port/index.ts に 'OneShotQueryOptions' が現れない", () => {
    const source = readFileSync(PORT_INDEX_PATH, "utf-8");
    expect(source).not.toContain("OneShotQueryOptions");
  });

  it("TC-010: port/index.ts に 'OneShotQueryResult' が現れない", () => {
    const source = readFileSync(PORT_INDEX_PATH, "utf-8");
    expect(source).not.toContain("OneShotQueryResult");
  });
});

// ─── TC-011: CommandInvocation.command union に "request-generate" リテラルが残置 ─

describe("TC-011: CommandInvocation.command union に \"request-generate\" リテラルが残置されている（D4 互換）", () => {
  it("TC-011: src/core/usage/types.ts に '\"request-generate\"' リテラルが含まれる（過去 usage 読み取り互換）", () => {
    const typesPath = path.join(ROOT, "src/core/usage/types.ts");
    const source = readFileSync(typesPath, "utf-8");
    expect(
      source,
      "\"request-generate\" リテラルが types.ts の CommandInvocation.command union から削除されています。" +
      "このリテラルは過去 usage データ読み取り互換のため残置が必要です（design.md D4）。",
    ).toContain('"request-generate"');
  });
});

// ─── TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する ──

describe("TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する（D5 スコープ外）", () => {
  it("TC-012: src/adapter/claude-code/query-one-shot.ts が存在する（本 change のスコープ外として意図的に残置）", () => {
    const filePath = path.join(ROOT, "src/adapter/claude-code/query-one-shot.ts");
    expect(
      existsSync(filePath),
      "src/adapter/claude-code/query-one-shot.ts が削除されています。" +
      "このファイルは design.md D5 によりスコープ外で意図的に残置されます。",
    ).toBe(true);
  });
});

// ─── TC-014: 生成専用テストファイル 3 件が存在しない ─────────────────────────

describe("TC-014: 生成専用テストファイル 3 件が存在しない", () => {
  const DELETED_TEST_FILES = [
    "tests/unit/command/request-create.test.ts",
    "tests/unit/core/request/generator.test.ts",
    "tests/prompts/request-generate-system.test.ts",
  ];

  for (const file of DELETED_TEST_FILES) {
    it(`TC-014: ${file} が存在しない（生成系テストの削除）`, () => {
      const fullPath = path.join(ROOT, file);
      expect(
        existsSync(fullPath),
        `${file} がまだ存在しています（削除されていません）`,
      ).toBe(false);
    });
  }
});
