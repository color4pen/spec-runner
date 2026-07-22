/**
 * Unit and integration tests for type-only skip behavior in changed-line-coverage.
 *
 * New behavior added by coverage-type-only-not-loaded request:
 * - Files absent from lcov AND determined to be type-only are skipped (not failed).
 * - Files absent from lcov AND runtime-code-containing are failed as before (TC-CLG-04).
 * - Files absent from lcov AND source-unreadable are failed as before (fail-closed).
 *
 * TC-004: lcov に無い type-only ファイルの変更は gate を fail させない (evaluator)
 * TC-005: lcov に無い runtime ファイルの変更は fail する (evaluator)
 * TC-006: ソースが読めないと fail する（fail-closed）(integration)
 * TC-007: DA レコードが無い変更行は従来どおり pass（判定 3 不変）(evaluator)
 * TC-008: exclude 宣言ファイルは type-only 判定に関わらず対象外 (evaluator)
 * TC-010: typeOnlyFiles 省略時は not-loaded fail-closed が完全に不変 (evaluator)
 * TC-011: typeOnlySkipped フィールドが全結果経路で含まれる（undefined でない）(evaluator)
 * TC-012: typeOnlySkipped が非空のとき stdout に専用行が追記される (evaluator)
 * TC-013: lcov 不在 + type-only ソース → gate passed・stdout に skip 可視化 (integration)
 * TC-014: lcov 不在 + runtime ソース → gate failed（TC-CLG-04 相当不変）(integration)
 * TC-015: lcov 不在 + ソースファイル不在 → gate failed（fail-closed）(integration)
 * TC-017: 既存 changed-line-coverage テストが無改変で green（後方互換確認）(unit)
 *
 * MUTATION CHECK (TC-016 — manual):
 *   Recorded per tasks.md T-04 破壊確認要件:
 *   If the type-only skip branch in evaluateChangedLineCoverage is removed
 *   (reverting to the original behavior where all not-loaded files fail regardless
 *   of their content), TC-004 and TC-013 will fail. These tests are true teeth for
 *   the type-only skip branch and cannot pass without it.
 *
 * EXISTING TESTS (TC-017):
 *   tests/unit/core/verification/changed-line-coverage.test.ts must remain unmodified.
 *   The backward-compat assertion in TC-017 below verifies the same API contract
 *   as TC-CLG-04 in the original file.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import {
  evaluateChangedLineCoverage,
  runChangedLineCoverageGate,
  CHANGED_LINE_COVERAGE_PHASE,
} from "../../../../src/core/verification/changed-line-coverage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLcov(
  entries: Array<{ file: string; lines: Record<number, number> }>,
): Map<string, Map<number, number>> {
  const m = new Map<string, Map<number, number>>();
  for (const { file, lines } of entries) {
    const lm = new Map<number, number>();
    for (const [ln, count] of Object.entries(lines)) {
      lm.set(Number(ln), count);
    }
    m.set(file, lm);
  }
  return m;
}

function makeChanged(
  entries: Array<{ file: string; lines: number[] }>,
): Map<string, Set<number>> {
  const m = new Map<string, Set<number>>();
  for (const { file, lines } of entries) {
    m.set(file, new Set(lines));
  }
  return m;
}

/**
 * Typed wrapper for evaluateChangedLineCoverage that includes the extended API
 * (typeOnlyFiles on input, typeOnlySkipped on result) added by T-02.
 *
 * Uses `as any` casts to bridge the gap before EvaluateInput / EvaluateResult
 * are officially extended by the implementer. Once T-02 is done, these casts
 * can be removed and the direct import used instead.
 */
function callEvaluate(input: {
  lcov: Map<string, Map<number, number>>;
  changedLinesByFile: Map<string, Set<number>>;
  include: string[];
  exclude?: string[];
  minChangedLineCoverage?: number;
  typeOnlyFiles?: Set<string>;
}): {
  status: "passed" | "failed";
  failedFiles: Array<{ file: string; reason: string; ratio?: number }>;
  skippedFiles: string[];
  stdout: string;
  /** Added by T-02 implementation. undefined before T-02 is implemented. */
  typeOnlySkipped: Array<{ file: string; reason: string }> | undefined;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return evaluateChangedLineCoverage(input as any) as any;
}

/**
 * Fake spawn for integration tests.
 * Mirrors the helper in changed-line-coverage.test.ts.
 */
function makeFakeSpawn(options: {
  gitNameOnlyFiles?: string[];
  gitDiffOutput?: Record<string, string>;
  exitCode?: number;
  gitNameOnlyExitCode?: number;
  gitUnifiedExitCode?: number;
}) {
  return function fakeSpawn(
    cmd: string,
    args: string[],
    _opts?: object,
  ) {
    const emitter = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();

    setImmediate(() => {
      if (cmd === "git") {
        const subCommand = args[0];
        if (subCommand === "diff" && args.includes("--name-only")) {
          if (options.gitNameOnlyExitCode !== undefined) {
            emitter.stderr.emit("data", Buffer.from("fatal: bad revision"));
            emitter.emit("close", options.gitNameOnlyExitCode);
            return;
          }
          const output = (options.gitNameOnlyFiles ?? []).join("\n") + "\n";
          emitter.stdout.emit("data", Buffer.from(output));
          emitter.emit("close", 0);
        } else if (subCommand === "diff" && args.includes("--unified=0")) {
          if (options.gitUnifiedExitCode !== undefined) {
            emitter.stderr.emit("data", Buffer.from("fatal: ambiguous argument"));
            emitter.emit("close", options.gitUnifiedExitCode);
            return;
          }
          const fileArg = args[args.length - 1] as string;
          const output = options.gitDiffOutput?.[fileArg] ?? "";
          emitter.stdout.emit("data", Buffer.from(output));
          emitter.emit("close", 0);
        } else {
          emitter.emit("close", options.exitCode ?? 0);
        }
      } else {
        emitter.emit("close", options.exitCode ?? 0);
      }
    });

    return emitter;
  } as unknown as typeof import("node:child_process").spawn;
}

// ---------------------------------------------------------------------------
// T-02: evaluateChangedLineCoverage unit tests
// ---------------------------------------------------------------------------

// TC-004: lcov に無い type-only ファイルの変更は gate を fail させない
// Source: spec.md > Requirement: lcov に SF が無い type-only ファイルは fail させず理由付きで skip する
//         > Scenario: lcov に無い type-only ファイルの変更は gate を fail させない
//
// MUTATION CHECK (TC-016):
//   If the type-only skip branch (typeOnlyFiles?.has(file) → typeOnlySkipped) were
//   removed, this test would fail because evaluateChangedLineCoverage would add
//   src/types.ts to failedFiles with reason "not-loaded" and status would be "failed".
describe("TC-004: lcov に無い type-only ファイルの変更は gate を fail させない", () => {
  it("typeOnlyFiles に含まれる lcov 不在ファイルは status passed・typeOnlySkipped に記録される", () => {
    const lcov = makeLcov([]); // src/types.ts not in lcov
    const changed = makeChanged([{ file: "src/types.ts", lines: [5, 10] }]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      typeOnlyFiles: new Set(["src/types.ts"]),
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
    expect(result.typeOnlySkipped).toHaveLength(1);
    expect(result.typeOnlySkipped![0]?.file).toBe("src/types.ts");
    expect(result.typeOnlySkipped![0]?.reason).toBe("type-only");
  });

  it("複数ファイル: type-only は skip・runtime は fail (混在ケース)", () => {
    const lcov = makeLcov([]); // neither file in lcov
    const changed = makeChanged([
      { file: "src/types.ts", lines: [5] },
      { file: "src/service.ts", lines: [10] }, // NOT type-only
    ]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      typeOnlyFiles: new Set(["src/types.ts"]), // only types.ts is type-only
    });

    // service.ts is not in typeOnlyFiles → fails as not-loaded
    expect(result.status).toBe("failed");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.file).toBe("src/service.ts");
    expect(result.failedFiles[0]?.reason).toBe("not-loaded");
    // types.ts is in typeOnlyFiles → skipped
    expect(result.typeOnlySkipped).toHaveLength(1);
    expect(result.typeOnlySkipped![0]?.file).toBe("src/types.ts");
  });
});

// TC-005: lcov に無い runtime ファイルの変更は fail する
// Source: spec.md > Requirement: lcov に SF が無い runtime ファイルは従来どおり fail する
//         > Scenario: lcov に無い runtime ファイルの変更は fail する
describe("TC-005: lcov に無い runtime ファイルの変更は fail する", () => {
  it("typeOnlyFiles に含まれない lcov 不在ファイルは failedFiles に reason not-loaded で記録される", () => {
    const lcov = makeLcov([]);
    const changed = makeChanged([{ file: "src/bar.ts", lines: [1, 2, 3] }]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      typeOnlyFiles: new Set(), // src/bar.ts is NOT in typeOnlyFiles
    });

    expect(result.status).toBe("failed");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.file).toBe("src/bar.ts");
    expect(result.failedFiles[0]?.reason).toBe("not-loaded");
    expect(result.typeOnlySkipped ?? []).toHaveLength(0);
  });
});

// TC-007: DA レコードが無い変更行は従来どおり pass（判定 3 不変）
// Source: spec.md > Requirement: 既存の changed-line-coverage 挙動は不変
//         > Scenario: DA レコードが無い変更行は従来どおり pass（判定 3 不変）
//
// Decision table rule 3: file present in lcov, changed lines have no DA records → pass.
// Type-only judgment is NOT involved when the file is present in lcov.
describe("TC-007: DA レコードが無い変更行は従来どおり pass（判定 3 不変）", () => {
  it("src/x.ts が lcov に存在し変更行に DA レコードが無い → passed（type-only 判定は介入しない）", () => {
    // File IS in lcov (has lines 1,2), but changed lines (10,11) have no DA records
    const lcov = makeLcov([{ file: "src/x.ts", lines: { 1: 1, 2: 3 } }]);
    const changed = makeChanged([{ file: "src/x.ts", lines: [10, 11] }]);

    // Use direct call — this is an existing-behavior invariant test
    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
  });
});

// TC-008: exclude 宣言ファイルは type-only 判定に関わらず対象外
// Source: spec.md > Requirement: 既存の changed-line-coverage 挙動は不変
//         > Scenario: exclude 宣言ファイルは type-only 判定に関わらず対象外
describe("TC-008: exclude 宣言ファイルは type-only 判定に関わらず対象外", () => {
  it("exclude に一致するファイルは skippedFiles に入り fail の原因にならない", () => {
    const lcov = makeLcov([]); // excluded file also absent from lcov
    const changed = makeChanged([{ file: "src/generated/api.ts", lines: [1, 2] }]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      exclude: ["src/generated/**"],
      // Even when the file is also in typeOnlyFiles, exclude takes precedence
      typeOnlyFiles: new Set(["src/generated/api.ts"]),
    });

    expect(result.status).toBe("passed");
    expect(result.failedFiles).toHaveLength(0);
    expect(result.skippedFiles).toContain("src/generated/api.ts");
    // Excluded files must NOT appear in typeOnlySkipped
    expect(result.typeOnlySkipped ?? []).toHaveLength(0);
  });
});

// TC-010: typeOnlyFiles 省略時は not-loaded fail-closed が完全に不変
// Source: design.md > D3 / tasks.md > T-02 Acceptance Criteria
describe("TC-010: typeOnlyFiles 省略時は not-loaded fail-closed が完全に不変", () => {
  it("typeOnlyFiles を省略した呼び出しは従来どおり lcov 不在ファイルを not-loaded で fail させる", () => {
    const lcov = makeLcov([]);
    const changed = makeChanged([{ file: "src/bar.ts", lines: [1, 2, 3] }]);

    // Call without typeOnlyFiles — must behave exactly as before this change
    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      // typeOnlyFiles is intentionally omitted
    });

    expect(result.status).toBe("failed");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.file).toBe("src/bar.ts");
    expect(result.failedFiles[0]?.reason).toBe("not-loaded");
  });
});

// TC-011: typeOnlySkipped フィールドが全結果経路で含まれる（undefined でない）
// Source: design.md > D3 / tasks.md > T-02
//
// EvaluateResult must always include typeOnlySkipped (as empty [] or with entries),
// regardless of whether typeOnlyFiles was provided or whether status is passed/failed.
describe("TC-011: typeOnlySkipped フィールドが全結果経路で含まれる（undefined でない）", () => {
  it("passed の結果に typeOnlySkipped が空配列として存在する", () => {
    const lcov = makeLcov([{ file: "src/foo.ts", lines: { 1: 1 } }]);
    const changed = makeChanged([{ file: "src/foo.ts", lines: [1] }]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("passed");
    expect(result.typeOnlySkipped).toBeDefined();
    expect(Array.isArray(result.typeOnlySkipped)).toBe(true);
    expect(result.typeOnlySkipped).toHaveLength(0);
  });

  it("failed の結果に typeOnlySkipped が空配列として存在する", () => {
    const lcov = makeLcov([]);
    const changed = makeChanged([{ file: "src/bar.ts", lines: [1] }]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("failed");
    expect(result.typeOnlySkipped).toBeDefined();
    expect(Array.isArray(result.typeOnlySkipped)).toBe(true);
    expect(result.typeOnlySkipped).toHaveLength(0);
  });

  it("typeOnlyFiles を省略した passed の結果にも typeOnlySkipped が含まれる", () => {
    const lcov = makeLcov([{ file: "src/foo.ts", lines: { 1: 1 } }]);
    const changed = makeChanged([{ file: "src/foo.ts", lines: [1] }]);

    // typeOnlyFiles omitted → typeOnlySkipped must still be [] (not undefined)
    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.typeOnlySkipped).toBeDefined();
    expect(result.typeOnlySkipped).toHaveLength(0);
  });
});

// TC-012: typeOnlySkipped が非空のとき stdout に専用行が追記される
// Source: design.md > D3 / tasks.md > T-02
describe("TC-012: typeOnlySkipped が非空のとき stdout に専用行が追記される", () => {
  it("typeOnlyFiles に lcov 不在ファイルがあると stdout に Type-only の専用行が追記される", () => {
    const lcov = makeLcov([
      { file: "src/real.ts", lines: { 1: 1 } }, // in lcov, passes via DA execution
    ]);
    const changed = makeChanged([
      { file: "src/types.ts", lines: [5] },           // type-only, not in lcov
      { file: "src/generated/api.ts", lines: [1] },   // excluded
      { file: "src/real.ts", lines: [1] },             // in lcov, passes
    ]);

    const result = callEvaluate({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
      exclude: ["src/generated/**"],
      typeOnlyFiles: new Set(["src/types.ts"]),
    });

    // After T-02: types.ts is type-only skipped, real.ts passes, generated is excluded
    expect(result.status).toBe("passed");
    // stdout must include a Type-only dedicated line
    expect(result.stdout).toContain("Type-only");
    expect(result.stdout).toContain("src/types.ts");
    // Existing "Skipped (not in coverage surface)" line must be unchanged
    expect(result.stdout).toContain("Skipped (not in coverage surface)");
    // Passed summary line must be present
    expect(result.stdout).toContain("changed-line-coverage: passed");
  });
});

// ---------------------------------------------------------------------------
// TC-017: 既存 changed-line-coverage テストが無改変で green（後方互換確認）
// Source: tasks.md > T-04 Acceptance Criteria / request.md > R3
//
// The original changed-line-coverage.test.ts must remain unmodified.
// This test verifies the same API contract as TC-CLG-04 in that file,
// confirming backward compatibility with the original evaluateChangedLineCoverage
// call signature (no typeOnlyFiles argument).
// ---------------------------------------------------------------------------
describe("TC-017: 既存 API の後方互換性（既存テストが無改変で green であることを補強）", () => {
  it("typeOnlyFiles を省略した旧スタイル呼び出しは従来どおり動作する（TC-CLG-04 相当）", () => {
    const lcov = makeLcov([]);
    const changed = makeChanged([{ file: "src/bar.ts", lines: [1, 2, 3] }]);

    // Old-style call (no typeOnlyFiles) — uses evaluateChangedLineCoverage directly
    const result = evaluateChangedLineCoverage({
      lcov,
      changedLinesByFile: changed,
      include: ["src/**"],
    });

    expect(result.status).toBe("failed");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]?.file).toBe("src/bar.ts");
    expect(result.failedFiles[0]?.reason).toBe("not-loaded");
    expect(result.skippedFiles).toBeDefined();
    expect(result.stdout).toBeDefined();
    expect(result.stdout).toContain("not loaded by test suite");
  });
});

// ---------------------------------------------------------------------------
// T-03: runChangedLineCoverageGate integration tests
// ---------------------------------------------------------------------------

// TC-013: lcov 不在 + type-only ソース → gate passed・stdout に skip 可視化（#884 再現解消）
// Source: tasks.md > T-03 Acceptance Criteria / T-04 orchestrator テスト
//
// MUTATION CHECK (TC-016):
//   If the orchestrator were not modified to read sources and build typeOnlyFiles,
//   OR if the evaluator type-only skip branch were removed, this test would fail
//   because the gate would return status "failed" for src/types.ts (not-loaded).
describe("TC-013: lcov 不在 + type-only ソース → gate passed・stdout に skip 可視化（#884 再現解消）", () => {
  it("interface + JSDoc + multiline export type のみで構成された type-only ソース → gate passed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clg-type-only-test-"));

    try {
      await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

      // Type-only source mirroring #884 real example (reviewer-snapshot.ts JSDoc extension)
      const typeOnlySource = [
        "/**",
        " * Snapshot of reviewer findings.",
        " * @since 2024-01-01",
        " * @remarks Extended JSDoc — this edit triggered #884 false-positive.",
        " */",
        "export interface ReviewerSnapshot {",
        "  id: string;",
        "  findings: ReadonlyArray<{ file: string; line: number; message: string }>;",
        "}",
        "",
        "export type SnapshotStatus =",
        '  | "pending"',
        '  | "resolved"',
        '  | "wontfix";',
        "",
      ].join("\n");
      await fs.writeFile(path.join(tmpDir, "src", "types.ts"), typeOnlySource, "utf-8");

      // lcov WITHOUT src/types.ts — it's a type-only file, never emitted to lcov
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      await fs.writeFile(
        path.join(lcovDir, "lcov.info"),
        "SF:src/other.ts\nDA:1,5\nend_of_record\n",
        "utf-8",
      );

      // git shows src/types.ts was changed (e.g., JSDoc extended)
      const fakeSpawn = makeFakeSpawn({
        gitNameOnlyFiles: ["src/types.ts"],
        gitDiffOutput: {
          "src/types.ts": "@@ -1,3 +1,5 @@\n",
        },
      });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("passed");
      expect(result.exitCode).toBe(0);
      // stdout must contain a Type-only skip line for observability (R2: 観測可能性)
      expect(result.stdout).toContain("Type-only");
      expect(result.stdout).toContain("src/types.ts");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// TC-014: lcov 不在 + runtime ソース → gate failed（TC-CLG-04 相当不変）
// Source: tasks.md > T-03 Acceptance Criteria / T-04 orchestrator テスト
describe("TC-014: lcov 不在 + runtime ソース → gate failed（TC-CLG-04 相当不変）", () => {
  it("関数宣言を含む runtime ソースは lcov 不在のまま → gate failed・not-loaded として記録", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clg-runtime-test-"));

    try {
      await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

      const runtimeSource = [
        "// runtime code — has function declaration, not type-only",
        "export function greet(name: string): string {",
        "  return `Hello, ${name}!`;",
        "}",
        "",
      ].join("\n");
      await fs.writeFile(path.join(tmpDir, "src", "greet.ts"), runtimeSource, "utf-8");

      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      await fs.writeFile(
        path.join(lcovDir, "lcov.info"),
        "SF:src/other.ts\nDA:1,5\nend_of_record\n",
        "utf-8",
      );

      const fakeSpawn = makeFakeSpawn({
        gitNameOnlyFiles: ["src/greet.ts"],
        gitDiffOutput: {
          "src/greet.ts": "@@ -0,0 +1,4 @@\n",
        },
      });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("src/greet.ts");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// TC-006: ソースが読めないと fail する（fail-closed）
// Source: spec.md > Requirement: ソース読取り失敗は fail-closed
//         > Scenario: ソースが読めないと fail する
describe("TC-006: ソースが読めないと fail する（fail-closed）", () => {
  it("lcov 不在かつ disk 上にソースファイルが存在しない → gate failed（type-only skip にならない）", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clg-failclosed-test-"));

    try {
      // Create lcov WITHOUT src/gone.ts
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      await fs.writeFile(
        path.join(lcovDir, "lcov.info"),
        "SF:src/other.ts\nDA:1,5\nend_of_record\n",
        "utf-8",
      );

      // src/gone.ts does NOT exist on disk — source read will throw
      const fakeSpawn = makeFakeSpawn({
        gitNameOnlyFiles: ["src/gone.ts"],
        gitDiffOutput: {
          "src/gone.ts": "@@ -1,3 +1,5 @@\n",
        },
      });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      // fail-closed: unreadable source → not added to typeOnlyFiles → not-loaded fail
      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("src/gone.ts");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// TC-015: lcov 不在 + ソースファイル不在 → gate failed（fail-closed・orchestrator 層）
// Source: tasks.md > T-03 Acceptance Criteria / T-04 orchestrator テスト
describe("TC-015: lcov 不在 + ソースファイル不在 → gate failed（fail-closed・orchestrator 層）", () => {
  it("変更ファイルが disk 上に存在しない → type-only skip にならず gate failed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clg-missing-src-test-"));

    try {
      // src/missing.ts is listed as changed but NEVER written to disk
      const lcovDir = path.join(tmpDir, "coverage");
      await fs.mkdir(lcovDir, { recursive: true });
      await fs.writeFile(
        path.join(lcovDir, "lcov.info"),
        "SF:src/other.ts\nDA:1,5\nend_of_record\n",
        "utf-8",
      );

      const fakeSpawn = makeFakeSpawn({
        gitNameOnlyFiles: ["src/missing.ts"],
        gitDiffOutput: {
          "src/missing.ts": "@@ -0,0 +1,5 @@\n",
        },
      });

      const result = await runChangedLineCoverageGate({
        slug: "test-slug",
        cwd: tmpDir,
        coverage: {
          command: "true",
          lcovPath: "coverage/lcov.info",
          include: ["src/**"],
        },
        baseBranch: "main",
        spawn: fakeSpawn,
      });

      // fail-closed: source read exception → file not added to typeOnlyFiles → not-loaded fail
      expect(result.phase).toBe(CHANGED_LINE_COVERAGE_PHASE);
      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
