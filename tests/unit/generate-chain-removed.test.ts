/**
 * Tests verifying the removal of the `request generate` chain and related invariants.
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
 * TC-011: CommandInvocation.command union に "request-generate" リテラルが残置されている
 *   Source: design.md > D4
 *
 * TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する
 *   Source: design.md > D5
 *
 * TC-013: drift-guard が request-generate エントリ除去後に count = 14 で green
 *   Source: tasks.md > T-07
 *
 * TC-014: 生成専用テストファイル 3 件が存在しない
 *   Source: tasks.md > T-07
 *
 * TC-016 (should): removed-commands.test.ts から request-create.js の vi.mock が除去されている
 *   Source: tasks.md > T-07
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function src(p: string): string {
  return path.join(ROOT, "src", p);
}

function tests(p: string): string {
  return path.join(ROOT, "tests", p);
}

// ─── grep helpers ─────────────────────────────────────────────────────────────

/**
 * grep -rn PATTERN DIR (literal string pattern, escaped).
 * Returns matched lines or "" on no matches.
 */
function grepLiteral(pattern: string, dir: string): string {
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

// ─── TC-005: 廃止シンボルへの参照が src / docs に残らない ─────────────────────

describe("TC-005: 廃止シンボルへの参照が src / docs に残らない", () => {
  /**
   * 検索パターン: OneShotQueryClient / request-generate-system / request generate (スペース区切り)
   * 対象: src/ および docs/
   * 例外: src/core/usage/types.ts の "request-generate" リテラル（ハイフン区切り）はこれらのパターンにマッチしない
   *
   * NOTE: このテスト自体は tests/ 配下にあるため src/ / docs/ の検索に自己マッチしない。
   */

  it('TC-005: src/ に "OneShotQueryClient" の参照が存在しない', () => {
    const result = grepLiteral("OneShotQueryClient", "src");
    expect(result, `"OneShotQueryClient" が src/ に残存しています:\n${result}`).toBe("");
  });

  it('TC-005: docs/ に "OneShotQueryClient" の参照が存在しない', () => {
    const result = grepLiteral("OneShotQueryClient", "docs");
    expect(result, `"OneShotQueryClient" が docs/ に残存しています:\n${result}`).toBe("");
  });

  it('TC-005: src/ に "request-generate-system" の参照が存在しない', () => {
    const result = grepLiteral("request-generate-system", "src");
    expect(result, `"request-generate-system" が src/ に残存しています:\n${result}`).toBe("");
  });

  it('TC-005: docs/ に "request-generate-system" の参照が存在しない', () => {
    const result = grepLiteral("request-generate-system", "docs");
    expect(result, `"request-generate-system" が docs/ に残存しています:\n${result}`).toBe("");
  });

  it('TC-005: src/ に "request generate"（スペース区切り）の参照が存在しない', () => {
    const result = grepLiteral("request generate", "src");
    expect(result, `"request generate" が src/ に残存しています:\n${result}`).toBe("");
  });

  it('TC-005: docs/ に "request generate"（スペース区切り）の参照が存在しない', () => {
    const result = grepLiteral("request generate", "docs");
    expect(result, `"request generate" が docs/ に残存しています:\n${result}`).toBe("");
  });
});

// ─── TC-007: usage と docs に generate 案内が残らず prompt が案内される ─────────

describe("TC-007: usage と docs に generate 案内が残らず prompt が案内される", () => {
  it('TC-007: command-registry.ts の USAGE 文字列に "request generate" が含まれない', () => {
    const source = readFileSync(src("cli/command-registry.ts"), "utf-8");
    // The generate subcommand should not appear in the USAGE help text
    expect(source).not.toContain("request generate");
  });

  it('TC-007: command-registry.ts の USAGE 文字列に "request prompt" が含まれる', () => {
    const source = readFileSync(src("cli/command-registry.ts"), "utf-8");
    // The new prompt subcommand should appear in the USAGE help text
    expect(source).toContain("request prompt");
  });

  it('TC-007: docs/request-authoring.md に "request generate" の案内が含まれない', () => {
    const docSource = readFileSync(path.join(ROOT, "docs/request-authoring.md"), "utf-8");
    expect(docSource).not.toContain("request generate");
  });

  it('TC-007: docs/request-authoring.md に "request prompt" の案内が含まれる', () => {
    const docSource = readFileSync(path.join(ROOT, "docs/request-authoring.md"), "utf-8");
    expect(docSource).toContain("request prompt");
  });
});

// ─── TC-008: 生成一本鎖 5 ファイルが削除されている ────────────────────────────

describe("TC-008: 生成一本鎖 5 ファイルが削除されている", () => {
  const DELETED_FILES = [
    "src/core/command/request-create.ts",
    "src/core/request/generator.ts",
    "src/prompts/request-generate-system.ts",
    "src/core/port/one-shot-query-client.ts",
    "src/adapter/claude-code/one-shot-query-client.ts",
  ];

  for (const file of DELETED_FILES) {
    it(`TC-008: ${file} が存在しない（削除済み）`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(false);
    });
  }
});

// ─── TC-009: manager.ts に create / generator / OneShotQueryClient が現れない ──

describe("TC-009: manager.ts に create / generator / OneShotQueryClient が現れない", () => {
  const MANAGER_PATH = src("core/request/manager.ts");

  it("TC-009: src/core/request/manager.ts に 'create' が現れない", () => {
    const source = readFileSync(MANAGER_PATH, "utf-8");
    // "create" function should be removed; "list" remains
    // We check the function definition, not the general word "create"
    expect(source).not.toContain("export async function create(");
    expect(source).not.toContain("export function create(");
  });

  it("TC-009: src/core/request/manager.ts に 'generator' が現れない", () => {
    const source = readFileSync(MANAGER_PATH, "utf-8");
    expect(source).not.toContain("generator");
  });

  it("TC-009: src/core/request/manager.ts に 'OneShotQueryClient' が現れない", () => {
    const source = readFileSync(MANAGER_PATH, "utf-8");
    expect(source).not.toContain("OneShotQueryClient");
  });
});

// ─── TC-011: CommandInvocation.command union に "request-generate" リテラル残置 ─

describe('TC-011: CommandInvocation.command union に "request-generate" リテラルが残置されている', () => {
  it('TC-011: src/core/usage/types.ts の CommandInvocation.command に "request-generate" が含まれる', () => {
    const source = readFileSync(src("core/usage/types.ts"), "utf-8");
    // "request-generate" literal must remain for past usage data read compatibility
    // (same precedent as "request-review" which was also removed but kept as a literal)
    expect(source).toContain('"request-generate"');
  });
});

// ─── TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する ─────

describe("TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する", () => {
  it("TC-012: src/adapter/claude-code/query-one-shot.ts が存在する（本 change のスコープ外）", () => {
    expect(existsSync(src("adapter/claude-code/query-one-shot.ts"))).toBe(true);
  });
});

// ─── TC-013: drift-guard が request-generate エントリ除去後に count = 14 で green ─

describe("TC-013: drift-guard が request-generate エントリ除去後に count = 14 で green", () => {
  const DRIFT_GUARD_PATH = path.join(
    ROOT,
    "src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts",
  );

  it(
    "TC-013: drift-guard test file does not import REQUEST_GENERATE_SYSTEM_PROMPT（除去済み）",
    () => {
      const source = readFileSync(DRIFT_GUARD_PATH, "utf-8");
      // After T-07, the import must be removed
      expect(source).not.toContain('from "../request-generate-system.js"');
      expect(source).not.toContain("REQUEST_GENERATE_SYSTEM_PROMPT");
    },
  );

  it("TC-013: drift-guard TC-028 の count assertion が 12（request-generate + build-fixer + test-materialize 廃止後）", () => {
    const source = readFileSync(DRIFT_GUARD_PATH, "utf-8");
    // After request-generate, build-fixer AND test-materialize removal, count is 12
    expect(source).toContain("toBe(12)");
  });

  it("TC-013: drift-guard の ALL_AGENT_PROMPTS count assertion が旧値 (14 or 15) を使用していない", () => {
    const source = readFileSync(DRIFT_GUARD_PATH, "utf-8");
    // The ALL_14_AGENT_PROMPTS array length must be 13, not 14 or 15
    // Note: toBe(15) may appear in PIPELINE_MAP rows assertion (separate concern)
    expect(source).not.toContain("ALL_14_AGENT_PROMPTS.length).toBe(14)");
    expect(source).not.toContain("ALL_14_AGENT_PROMPTS.length).toBe(15)");
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
    it(`TC-014: ${file} が存在しない（削除済み）`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(false);
    });
  }
});

// ─── TC-016 (should): removed-commands.test.ts から request-create.js vi.mock が除去 ─

describe(
  "TC-016 (should): removed-commands.test.ts から request-create.js の vi.mock が除去されている",
  () => {
    it(
      "TC-016: tests/unit/cli/removed-commands.test.ts に request-create.js の vi.mock が存在しない",
      () => {
        const source = readFileSync(
          tests("unit/cli/removed-commands.test.ts"),
          "utf-8",
        );
        // After T-07, the vi.mock for the deleted request-create.js must be removed
        expect(source).not.toContain(
          'vi.mock("../../../src/core/command/request-create.js"',
        );
      },
    );
  },
);
