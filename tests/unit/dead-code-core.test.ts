/**
 * Structural tests for the dead-code-core refactoring.
 * All "must" TCs are covered here; tests are intentionally RED before implementation.
 *
 * TC-001: finish の死コードが削除されている
 * TC-002: errors.ts の factory 7 個が削除されている
 * TC-003: ERROR_CODES の 7 エントリが削除されている
 * TC-004: 残存 symbol が存在する
 * TC-005: error-codes.test.ts が green のまま
 * TC-006: generate-chain-removed.test.ts が green のまま
 * TC-007: 全テストが green (gate — file-existence invariants)
 * TC-008: FinishFs が types.ts 部分削除後も archive モジュールで使用可能
 * TC-009: slugify が src/ bin/ tests/ で grep 0 件
 * TC-011: state/reconcile が完全削除される
 * TC-012: 保護対象 ERROR_CODES が残存する
 * TC-015: request/manager.ts に resolve なし・list あり・ファイル存在
 * TC-016: src/core/tools/ ディレクトリが存在しない
 * TC-018: core/validation/ 削除後テストが src/parser/validation/ を直接 import して green
 * TC-019: core/doctor/index.ts 削除後 next-steps.test.ts が fallback 経路で green
 * TC-020: allChecks が src/ tests/ で grep 0 件
 * TC-022: core/port/index.ts が削除され TC-010 ブロックが存在しない
 * TC-023: prompts の不使用 wrapper が src/ tests/ で grep 0 件
 * TC-025: kernel/tool-types.ts の 3 symbol が削除され CustomToolContext 等が残存する
 * TC-026: derive-usage.ts・orchestrator 呼び出し block・vi.mock が src/ tests/ で grep 0 件
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// This file's basename — excluded when grepping tests/ to avoid self-match.
const SELF = "dead-code-core.test.ts";

// ─── grep helpers ──────────────────────────────────────────────────────────────

/** grep -rn PATTERN DIR (literal, exits 1 on no matches → returns ""). */
function grepIn(pattern: string, dir: string): string {
  try {
    return execSync(`grep -rn "${pattern}" ${dir}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return "";
    throw err;
  }
}

/** Same, but excludes this test file itself (prevents self-match in tests/). */
function grepInTests(pattern: string): string {
  try {
    return execSync(`grep -rn --exclude="${SELF}" "${pattern}" tests`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return "";
    throw err;
  }
}

// ─── TC-001: finish の死コードが削除されている ─────────────────────────────────

describe("TC-001: finish の死コードが削除されている", () => {
  const deadSymbols = [
    "resolveTarget",
    "fetchPrViewWithRetry",
    "PrViewData",
    "ResolvedTarget",
    "FinishContext",
    "FinishFlags",
  ];

  for (const sym of deadSymbols) {
    it(`TC-001: "${sym}" が src/ に存在しない`, () => {
      const result = grepIn(sym, "src");
      expect(result, `"${sym}" が src/ に残存:\n${result}`).toBe("");
    });

    it(`TC-001: "${sym}" が tests/ に存在しない`, () => {
      const result = grepInTests(sym);
      expect(result, `"${sym}" が tests/ に残存:\n${result}`).toBe("");
    });
  }

  it("TC-001: src/core/finish/resolve-target.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/finish/resolve-target.ts"))).toBe(false);
  });

  it("TC-001: src/core/finish/pr-status.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/finish/pr-status.ts"))).toBe(false);
  });

  it("TC-001: tests/finish-resolve-target.test.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "tests/finish-resolve-target.test.ts"))).toBe(false);
  });

  it("TC-001: tests/unit/core/finish/pr-status.test.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "tests/unit/core/finish/pr-status.test.ts"))).toBe(false);
  });
});

// ─── TC-002: errors.ts の factory 7 個が削除されている ─────────────────────────

describe("TC-002: errors.ts の factory 7 個が削除されている", () => {
  const deadFactories = [
    "branchNotRegisteredError",
    "stateFileInvalidError",
    "sessionCreateFailedError",
    "noCommitDetectedError",
    "stepHaltedNoToolCallError",
    "stepInputMissingError",
    "authoritySpecEditViolationError",
  ];

  for (const fn of deadFactories) {
    it(`TC-002: "${fn}" が src/ に存在しない`, () => {
      const result = grepIn(fn, "src");
      expect(result, `"${fn}" が src/ に残存:\n${result}`).toBe("");
    });

    it(`TC-002: "${fn}" が tests/ に存在しない`, () => {
      const result = grepInTests(fn);
      expect(result, `"${fn}" が tests/ に残存:\n${result}`).toBe("");
    });
  }
});

// ─── TC-003: ERROR_CODES の 7 エントリが削除されている ─────────────────────────

describe("TC-003: ERROR_CODES の 7 エントリが削除されている", () => {
  const deadCodes = [
    "AUTO_MERGE_UNAVAILABLE",
    "GH_SUBPROCESS_FAILED",
    "OPENSPEC_ARCHIVE_FAILED",
    "SPEC_FIXER_NO_FINDINGS",
    "AUTHORITY_SPEC_EDIT_VIOLATION",
    "STEP_HALTED_NO_TOOL_CALL",
    "NO_COMMIT_DETECTED",
  ];

  for (const code of deadCodes) {
    it(`TC-003: "${code}" が src/ に存在しない`, () => {
      const result = grepIn(code, "src");
      expect(result, `"${code}" が src/ に残存:\n${result}`).toBe("");
    });

    it(`TC-003: "${code}" が tests/ に存在しない`, () => {
      const result = grepInTests(code);
      expect(result, `"${code}" が tests/ に残存:\n${result}`).toBe("");
    });
  }
});

// ─── TC-004: 残存 symbol が存在する ───────────────────────────────────────────

describe("TC-004: 残存 symbol が存在する", () => {
  it("TC-004: FinishFs が src/ に 1 件以上マッチする", () => {
    const result = grepIn("FinishFs", "src");
    expect(result, "FinishFs が src/ に存在しない").not.toBe("");
  });

  it("TC-004: STEP_INPUT_MISSING が src/ に 1 件以上マッチする", () => {
    const result = grepIn("STEP_INPUT_MISSING", "src");
    expect(result, "STEP_INPUT_MISSING が src/ に存在しない").not.toBe("");
  });

  it("TC-004: CustomToolContext が src/ に 1 件以上マッチする", () => {
    const result = grepIn("CustomToolContext", "src");
    expect(result, "CustomToolContext が src/ に存在しない").not.toBe("");
  });

  it("TC-004: list 関数が src/core/request/manager.ts に残存している", () => {
    const content = readFileSync(path.join(ROOT, "src/core/request/manager.ts"), "utf-8");
    expect(content).toContain("export async function list(");
  });
});

// ─── TC-005: error-codes.test.ts が green のまま ─────────────────────────────

describe("TC-005: error-codes.test.ts が green のまま (structural check)", () => {
  const ERROR_CODES_TEST = path.join(ROOT, "tests/error-codes.test.ts");

  it("TC-005: error-codes.test.ts が branchNotRegisteredError を import していない", () => {
    const content = readFileSync(ERROR_CODES_TEST, "utf-8");
    expect(content).not.toContain("branchNotRegisteredError");
  });

  it("TC-005: error-codes.test.ts が stateFileInvalidError を import していない", () => {
    const content = readFileSync(ERROR_CODES_TEST, "utf-8");
    expect(content).not.toContain("stateFileInvalidError");
  });

  it("TC-005: error-codes.test.ts が BRANCH_NOT_REGISTERED の確認 assertion を含む", () => {
    const content = readFileSync(ERROR_CODES_TEST, "utf-8");
    expect(content).toContain("BRANCH_NOT_REGISTERED");
  });

  it("TC-005: error-codes.test.ts が STATE_FILE_INVALID の確認 assertion を含む", () => {
    const content = readFileSync(ERROR_CODES_TEST, "utf-8");
    expect(content).toContain("STATE_FILE_INVALID");
  });
});

// ─── TC-006: generate-chain-removed.test.ts が green のまま ──────────────────

describe("TC-006: generate-chain-removed.test.ts が green のまま", () => {
  const GCR_TEST = path.join(ROOT, "tests/unit/generate-chain-removed.test.ts");

  it("TC-006: generate-chain-removed.test.ts に PORT_INDEX_PATH が存在しない", () => {
    const content = readFileSync(GCR_TEST, "utf-8");
    expect(content).not.toContain("PORT_INDEX_PATH");
  });

  it("TC-006: generate-chain-removed.test.ts の TC-010 describe ブロックが存在しない", () => {
    const content = readFileSync(GCR_TEST, "utf-8");
    // The old TC-010 block title must be removed
    expect(content).not.toContain("TC-010: port/index.ts から OneShotQueryClient 系 re-export が除去されている");
  });
});

// ─── TC-007: 全テストが green (gate — file-existence invariants) ──────────────

describe("TC-007: 全テストが green (gate — file-existence invariants)", () => {
  const deletedFiles = [
    "src/core/finish/resolve-target.ts",
    "src/core/finish/pr-status.ts",
    "src/core/finish/derive-usage.ts",
    "src/util/slugify.ts",
    "src/state/reconcile.ts",
    "src/core/doctor/index.ts",
    "src/core/port/index.ts",
    "src/core/event/index.ts",
    "src/core/step/index.ts",
    "src/store/index.ts",
    "src/state/store.ts",
  ];

  for (const file of deletedFiles) {
    it(`TC-007: ${file} が存在しない`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(false);
    });
  }

  it("TC-007: src/core/tools/ ディレクトリが存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/tools"))).toBe(false);
  });

  it("TC-007: src/core/validation/ ディレクトリが存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/validation"))).toBe(false);
  });
});

// ─── TC-008: FinishFs が types.ts 部分削除後も残存している ───────────────────

describe("TC-008: FinishFs が types.ts 部分削除後も残存している", () => {
  const TYPES_PATH = path.join(ROOT, "src/core/finish/types.ts");

  it("TC-008: src/core/finish/types.ts に FinishFs が定義されている", () => {
    const content = readFileSync(TYPES_PATH, "utf-8");
    expect(content).toContain("FinishFs");
  });

  it("TC-008: src/core/finish/types.ts に PrViewData が存在しない", () => {
    const content = readFileSync(TYPES_PATH, "utf-8");
    expect(content).not.toContain("PrViewData");
  });

  it("TC-008: src/core/finish/types.ts に ResolvedTarget が存在しない", () => {
    const content = readFileSync(TYPES_PATH, "utf-8");
    expect(content).not.toContain("ResolvedTarget");
  });

  it("TC-008: src/core/finish/types.ts に FinishContext が存在しない", () => {
    const content = readFileSync(TYPES_PATH, "utf-8");
    expect(content).not.toContain("FinishContext");
  });

  it("TC-008: src/core/finish/types.ts に FinishFlags が存在しない", () => {
    const content = readFileSync(TYPES_PATH, "utf-8");
    expect(content).not.toContain("FinishFlags");
  });
});

// ─── TC-009: slugify が src/ bin/ tests/ で grep 0 件 ─────────────────────────

describe("TC-009: slugify が src/ bin/ tests/ で grep 0 件", () => {
  it("TC-009: src/ に slugify の参照が存在しない", () => {
    const result = grepIn("slugify", "src");
    expect(result, `slugify が src/ に残存:\n${result}`).toBe("");
  });

  it("TC-009: tests/ に slugify の参照が存在しない", () => {
    const result = grepInTests("slugify");
    expect(result, `slugify が tests/ に残存:\n${result}`).toBe("");
  });

  it("TC-009: src/util/slugify.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/util/slugify.ts"))).toBe(false);
  });

  it("TC-009: tests/unit/util/slugify.test.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "tests/unit/util/slugify.test.ts"))).toBe(false);
  });
});

// ─── TC-011: state/reconcile が完全削除される ─────────────────────────────────

describe("TC-011: state/reconcile が完全削除される", () => {
  it("TC-011: src/state/reconcile.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/state/reconcile.ts"))).toBe(false);
  });

  it("TC-011: tests/unit/state/reconcile.test.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "tests/unit/state/reconcile.test.ts"))).toBe(false);
  });

  it("TC-011: src/ に state/reconcile の参照が存在しない", () => {
    const result = grepIn("state/reconcile", "src");
    expect(result, `state/reconcile が src/ に残存:\n${result}`).toBe("");
  });

  it("TC-011: tests/ に state/reconcile の参照が存在しない", () => {
    const result = grepInTests("state/reconcile");
    expect(result, `state/reconcile が tests/ に残存:\n${result}`).toBe("");
  });
});

// ─── TC-012: 保護対象 ERROR_CODES が残存する ───────────────────────────────────

describe("TC-012: 保護対象 ERROR_CODES（BRANCH_NOT_REGISTERED・STATE_FILE_INVALID・STEP_INPUT_MISSING）が残存する", () => {
  it("TC-012: BRANCH_NOT_REGISTERED が src/ に 1 件以上マッチする", () => {
    const result = grepIn("BRANCH_NOT_REGISTERED", "src");
    expect(result, "BRANCH_NOT_REGISTERED が src/ に存在しない").not.toBe("");
  });

  it("TC-012: STATE_FILE_INVALID が src/ に 1 件以上マッチする", () => {
    const result = grepIn("STATE_FILE_INVALID", "src");
    expect(result, "STATE_FILE_INVALID が src/ に存在しない").not.toBe("");
  });

  it("TC-012: STEP_INPUT_MISSING が src/ に 1 件以上マッチする", () => {
    const result = grepIn("STEP_INPUT_MISSING", "src");
    expect(result, "STEP_INPUT_MISSING が src/ に存在しない").not.toBe("");
  });
});

// ─── TC-015: request/manager.ts に resolve なし・list あり・ファイル存在 ──────

describe("TC-015: request/manager.ts に resolve なし・list あり・ファイル存在", () => {
  const MANAGER = path.join(ROOT, "src/core/request/manager.ts");

  it("TC-015: src/core/request/manager.ts が存在する", () => {
    expect(existsSync(MANAGER)).toBe(true);
  });

  it("TC-015: src/core/request/manager.ts に resolve 関数が存在しない", () => {
    const content = readFileSync(MANAGER, "utf-8");
    expect(content).not.toContain("export function resolve(");
  });

  it("TC-015: src/core/request/manager.ts に list 関数が存在する", () => {
    const content = readFileSync(MANAGER, "utf-8");
    expect(content).toContain("export async function list(");
  });
});

// ─── TC-016: src/core/tools/ ディレクトリが存在しない ─────────────────────────

describe("TC-016: src/core/tools/ ディレクトリが存在しない", () => {
  it("TC-016: src/core/tools/ ディレクトリが存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/tools"))).toBe(false);
  });

  it("TC-016: src/core/tools/types.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/tools/types.ts"))).toBe(false);
  });
});

// ─── TC-018: core/validation/ 削除後テストが src/parser/validation/ を直接 import ─

describe("TC-018: core/validation/ 削除後テストが src/parser/validation/ を直接 import して green", () => {
  it("TC-018: src/core/validation/ ディレクトリが存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/validation"))).toBe(false);
  });

  it("TC-018: registry.test.ts が src/parser/validation/registry を import している", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/core/validation/registry.test.ts"),
      "utf-8",
    );
    expect(content).toContain("parser/validation/registry");
  });

  it("TC-018: registry.test.ts が src/core/validation/registry を import していない", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/core/validation/registry.test.ts"),
      "utf-8",
    );
    expect(content).not.toContain("core/validation/registry");
  });

  it("TC-018: rule-name-typesafe.test.ts が src/parser/validation を import している", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/parser/rules/rule-name-typesafe.test.ts"),
      "utf-8",
    );
    expect(content).toContain("parser/validation");
  });

  it("TC-018: rule-name-typesafe.test.ts が src/core/validation を import していない", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/parser/rules/rule-name-typesafe.test.ts"),
      "utf-8",
    );
    expect(content).not.toContain("core/validation");
  });
});

// ─── TC-019: core/doctor/index.ts 削除後 next-steps.test.ts が fallback 経路 ──

describe("TC-019: core/doctor/index.ts 削除後 next-steps.test.ts が fallback 経路で green", () => {
  it("TC-019: src/core/doctor/index.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/doctor/index.ts"))).toBe(false);
  });

  it("TC-019: next-steps.test.ts のコメントが fallback 経路（next-steps.ts への直接 import）を説明している", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/doctor/next-steps.test.ts"),
      "utf-8",
    );
    // After T-09, this comment must be updated to explain the fallback path
    expect(content).toContain("falls back to next-steps");
  });

  it("TC-019: next-steps.test.ts に古い 'RED until implementation' コメントが存在しない", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/doctor/next-steps.test.ts"),
      "utf-8",
    );
    expect(content).not.toContain("RED until implementation");
  });
});

// ─── TC-020: allChecks が src/ tests/ で grep 0 件 ────────────────────────────

describe("TC-020: allChecks が src/ tests/ で grep 0 件", () => {
  it("TC-020: src/ に allChecks の参照が存在しない", () => {
    const result = grepIn("allChecks", "src");
    expect(result, `allChecks が src/ に残存:\n${result}`).toBe("");
  });

  it("TC-020: tests/ に allChecks の参照が存在しない", () => {
    const result = grepInTests("allChecks");
    expect(result, `allChecks が tests/ に残存:\n${result}`).toBe("");
  });

  it("TC-020: tests/core/doctor/checks/all-checks.test.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "tests/core/doctor/checks/all-checks.test.ts"))).toBe(false);
  });
});

// ─── TC-022: core/port/index.ts が削除され TC-010 ブロックが存在しない ──────────

describe("TC-022: core/port/index.ts が削除され TC-010 ブロックが存在しない", () => {
  it("TC-022: src/core/port/index.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/port/index.ts"))).toBe(false);
  });

  it("TC-022: generate-chain-removed.test.ts に PORT_INDEX_PATH が存在しない", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/generate-chain-removed.test.ts"),
      "utf-8",
    );
    expect(content).not.toContain("PORT_INDEX_PATH");
  });

  it("TC-022: generate-chain-removed.test.ts に TC-010 describe ブロックが存在しない", () => {
    const content = readFileSync(
      path.join(ROOT, "tests/unit/generate-chain-removed.test.ts"),
      "utf-8",
    );
    // TC-010 block reads port/index.ts — once deleted it must be removed
    expect(content).not.toContain("TC-010: port/index.ts から OneShotQueryClient 系 re-export が除去されている");
  });
});

// ─── TC-023: prompts の不使用 wrapper が src/ tests/ で grep 0 件 ─────────────

describe("TC-023: prompts の不使用 wrapper が src/ tests/ で grep 0 件", () => {
  const deadPromptSymbols = [
    "buildSpecFixerSystemPrompt",
    "SpecFixerPromptInput",
    "buildSpecReviewSystemPrompt",
  ];

  for (const sym of deadPromptSymbols) {
    it(`TC-023: "${sym}" が src/ に存在しない`, () => {
      const result = grepIn(sym, "src");
      expect(result, `"${sym}" が src/ に残存:\n${result}`).toBe("");
    });

    it(`TC-023: "${sym}" が tests/ に存在しない`, () => {
      const result = grepInTests(sym);
      expect(result, `"${sym}" が tests/ に残存:\n${result}`).toBe("");
    });
  }

  it("TC-023: tests/prompts/spec-fixer-system.test.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "tests/prompts/spec-fixer-system.test.ts"))).toBe(false);
  });
});

// ─── TC-025: kernel/tool-types.ts の 3 symbol が削除され CustomToolContext 等が残存 ─

describe("TC-025: kernel/tool-types.ts の 3 symbol が削除され CustomToolContext 等が残存する", () => {
  // defineCustomTool と CustomToolDefinition は grep で安全にチェックできる（他にマッチしない）
  const unambiguousDeadSymbols = ["defineCustomTool", "CustomToolDefinition"];

  for (const sym of unambiguousDeadSymbols) {
    it(`TC-025: "${sym}" が src/ に存在しない`, () => {
      const result = grepIn(sym, "src");
      expect(result, `"${sym}" が src/ に残存:\n${result}`).toBe("");
    });

    it(`TC-025: "${sym}" が tests/ に存在しない`, () => {
      const result = grepInTests(sym);
      expect(result, `"${sym}" が tests/ に残存:\n${result}`).toBe("");
    });
  }

  // CustomTool interface は tool-types.ts のソース内容で確認（"CustomToolContext" 等と区別するため）
  it("TC-025: tool-types.ts に CustomTool interface が存在しない", () => {
    const content = readFileSync(path.join(ROOT, "src/kernel/tool-types.ts"), "utf-8");
    // interface 宣言行がないことを確認（"CustomToolContext" 等にはマッチしない）
    expect(content).not.toMatch(/export interface CustomTool\b[^C]/);
    expect(content).not.toContain("interface CustomTool {");
  });

  const preservedToolSymbols = ["CustomToolContext", "CustomToolResult", "CustomToolHandler"];

  for (const sym of preservedToolSymbols) {
    it(`TC-025: "${sym}" が src/ に残存している`, () => {
      const result = grepIn(sym, "src");
      expect(result, `"${sym}" が src/ に存在しない`).not.toBe("");
    });
  }
});

// ─── TC-026: derive-usage.ts・orchestrator 呼び出し block・vi.mock が grep 0 件 ─

describe("TC-026: derive-usage.ts・orchestrator 呼び出し block・vi.mock が src/ tests/ で grep 0 件", () => {
  const deadDeriveSymbols = [
    "deriveAndWriteUsage",
    "DeriveUsageResult",
    "derive-usage",
  ];

  for (const sym of deadDeriveSymbols) {
    it(`TC-026: "${sym}" が src/ に存在しない`, () => {
      const result = grepIn(sym, "src");
      expect(result, `"${sym}" が src/ に残存:\n${result}`).toBe("");
    });

    it(`TC-026: "${sym}" が tests/ に存在しない`, () => {
      const result = grepInTests(sym);
      expect(result, `"${sym}" が tests/ に残存:\n${result}`).toBe("");
    });
  }

  it("TC-026: src/core/finish/derive-usage.ts が存在しない", () => {
    expect(existsSync(path.join(ROOT, "src/core/finish/derive-usage.ts"))).toBe(false);
  });
});
