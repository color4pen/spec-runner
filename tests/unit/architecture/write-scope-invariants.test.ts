/**
 * Architecture invariant tests for write-scope enforcement.
 *
 * TC-010: write-scope module が leaf module であること (should)
 * TC-022: commitAndPush が write-scope 単一ソースを経由する (could)
 * TC-028: write-scope module exports findScopedCommitViolations (leaf + single-source)
 * TC-021: `src/` に裸の `git add -A` が存在しない (must) [pipeline-sole-committer]
 * TC-006: push-as-is 経路と自己 commit 範囲検査のコードが削除されている (should) [pipeline-sole-committer]
 *
 * TC-010 — NOTE: intentionally RED until src/core/step/write-scope.ts is created.
 *   The "file exists" assertion fails before implementation.
 *
 * TC-022 — NOTE: intentionally RED until commit-push.ts calls stagingModeFor and
 *   findWriteScopeViolations from write-scope single source.
 *
 * TC-021 — NOTE: intentionally RED until T-04/T-05 remove bare `git add -A` from commit-push.ts.
 * TC-006 — NOTE: intentionally RED until T-04 removes push-as-is path from commit-push.ts.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

/** Run grep and return matched lines, or "" when no matches. Throws on real errors. */
function grepFile(pattern: string, filePath: string): string {
  try {
    return execSync(`grep -n "${pattern}" "${filePath}"`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return ""; // no matches — expected success case
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: write-scope module が leaf module であること
//
// src/core/step/write-scope.ts は src/util/paths.ts 以外の src/ 内 module を
// import してはならない（leaf module 制約）。
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-010: write-scope module is a leaf module", () => {
  const writeScopePath = path.join(ROOT, "src/core/step/write-scope.ts");

  it("src/core/step/write-scope.ts exists", () => {
    // RED until T-01 creates the file
    expect(existsSync(writeScopePath)).toBe(true);
  });

  it("write-scope.ts does not import from src/ except src/util/paths", () => {
    if (!existsSync(writeScopePath)) return; // file-exists test already covers RED state

    const content = readFileSync(writeScopePath, "utf-8");
    // Extract all "from '...'" specifiers from import statements
    const fromSpecifiers = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1],
    );

    const violations = fromSpecifiers.filter((specifier) => {
      // Allow: node: built-ins
      if (specifier.startsWith("node:")) return false;
      // Allow: ../../util/paths (relative path from src/core/step/ to src/util/paths)
      if (
        specifier === "../../util/paths.js" ||
        specifier === "../../util/paths"
      ) {
        return false;
      }
      // Any other relative import starting with "./" or "../" is a violation
      if (specifier.startsWith(".")) return true;
      // Any bare src/ import is also a violation
      if (specifier.startsWith("src/")) return true;
      return false;
    });

    expect(
      violations,
      `write-scope.ts has imports outside src/util/paths: ${violations.join(", ")}`,
    ).toHaveLength(0);
  });

  it("write-scope.ts does not import from ./step-names or other peer step modules", () => {
    if (!existsSync(writeScopePath)) return;

    const result = grepFile("step-names", writeScopePath);
    // step-names is a peer module in src/core/step/ — importing it would break leaf constraint
    expect(
      result,
      "write-scope.ts must not import from ./step-names (leaf module constraint)",
    ).toBe("");
  });

  it("write-scope.ts does not import from src/state/ or src/core/ siblings", () => {
    if (!existsSync(writeScopePath)) return;

    const forbidden = [
      "state/schema",
      "core/port",
      "core/agent",
      "core/runtime",
      "./types",
      "./commit-push",
    ];

    const content = readFileSync(writeScopePath, "utf-8");
    for (const mod of forbidden) {
      expect(
        content,
        `write-scope.ts must not import from "${mod}"`,
      ).not.toContain(mod);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-022: commitAndPush が write-scope 単一ソースを経由する（architecture grep-pin）
//
// src/core/step/commit-push.ts の commitAndPush 実装内に stagingModeFor と
// findWriteScopeViolations の呼び出しが存在することを静的解析で確認する。
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TC-028: write-scope module exports findScopedCommitViolations (T-01 leaf constraint)
//
// T-01 adds findScopedCommitViolations to write-scope.ts (single source).
// commit-push.ts calls it via the single source (no duplicate logic).
// Leaf module constraint: write-scope.ts must still only import from src/util/paths.ts.
//
// RED until T-01 adds the export and T-05 calls it in commit-push.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-028: write-scope module exports findScopedCommitViolations (leaf + single-source)", () => {
  const writeScopePath = path.join(ROOT, "src/core/step/write-scope.ts");

  it("write-scope.ts exports findScopedCommitViolations", () => {
    if (!existsSync(writeScopePath)) {
      expect(existsSync(writeScopePath), "write-scope.ts must exist").toBe(true);
      return;
    }
    const content = readFileSync(writeScopePath, "utf-8");
    expect(
      content,
      "write-scope.ts must export findScopedCommitViolations (T-01)",
    ).toContain("findScopedCommitViolations");
    expect(
      content,
      "findScopedCommitViolations must be exported (not just defined)",
    ).toMatch(/export\s+(function|const|async function)\s+findScopedCommitViolations/);
  });

  it("commit-push.ts calls findScopedCommitViolations via write-scope single source (T-05)", () => {
    const commitPushPath = path.join(ROOT, "src/core/step/commit-push.ts");
    if (!existsSync(commitPushPath)) return;

    const result = grepFile("findScopedCommitViolations", commitPushPath);
    expect(
      result,
      "commit-push.ts must call findScopedCommitViolations from write-scope (T-05 single source)",
    ).not.toBe("");
  });

  it("write-scope.ts still satisfies leaf module constraint after T-01 addition", () => {
    if (!existsSync(writeScopePath)) return;

    const content = readFileSync(writeScopePath, "utf-8");
    const fromSpecifiers = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const violations = fromSpecifiers.filter((s) => {
      if (s.startsWith("node:")) return false;
      if (s === "../../util/paths.js" || s === "../../util/paths") return false;
      if (s.startsWith(".")) return true;
      if (s.startsWith("src/")) return true;
      return false;
    });

    expect(
      violations,
      `write-scope.ts must still be leaf-only after findScopedCommitViolations addition: ${violations.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-021: `src/` に裸の `git add -A` が存在しない (must)
//
// scoped / guarded 双方の staging は明示パス指定とし裸の `git add -A` を全廃する。
// 裸の `git add -A`（pathspec なし、または `--` も path も後続しない）が
// src/ 配下のいずれのファイルにも残っていないことを静的解析で固定する。
//
// RED until T-04 / T-05 remove bare git add -A from commit-push.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe('TC-021: `src/` に裸の `git add -A` が存在しない', () => {
  it('commit-push.ts に pathspec なし git add -A が存在しない（commitFinalState 全廃確認）', () => {
    // Detects bare `git add -A` (no trailing "--" on the same line) in commit-push.ts.
    //
    // Known violation before T-04/T-05:
    //   commitFinalState line: `await spawnFn("git", ["add", "-A"], { cwd })`
    //   This is bare (no pathspec "--" following it on the same line).
    //
    // TC-031 destruction confirmation: reverting to bare add -A will make this test FAIL.
    //
    // Detection: any line that contains `"add"` AND `"-A"` but NOT `"--"` is a bare add.
    // This pattern covers both:
    //   - spawnFn("git", ["add", "-A"], ...)     ← spawn.ts style
    //   - gitExec(spawnFn, cwd, ["add", "-A"])   ← git-exec.ts style
    // Both forms use the "-A" string literal and would lack "--" on the same line.

    const commitPushPath = path.join(ROOT, "src/core/step/commit-push.ts");
    if (!existsSync(commitPushPath)) return;

    const content = readFileSync(commitPushPath, "utf-8");
    const lines = content.split("\n");

    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match lines with "add" and "-A" but not "--" (bare git add -A)
      if (line.includes('"add"') && line.includes('"-A"') && !line.includes('"--"')) {
        violations.push(`line ${i + 1}: ${line.trim()}`);
      }
    }

    expect(
      violations,
      `Bare 'git add -A' (no pathspec "--") found in commit-push.ts:\n${violations.join("\n")}\n` +
      "(TC-021: T-04 and T-05 must replace bare add -A with managed pathspec staging — RED until implemented)",
    ).toHaveLength(0);
  });

  it('src/core/step/ 配下の全 .ts ファイルに pathspec なし git add -A が存在しない', () => {
    // Broader check: no bare add -A in any step file.
    // TC-031 destruction confirmation: reverting to bare add -A will make this test FAIL.

    const stepDir = path.join(ROOT, "src/core/step");
    if (!existsSync(stepDir)) return;

    const tsFiles = (readdirSync(stepDir) as string[])
      .filter((f) => f.endsWith(".ts"))
      .map((f) => path.join(stepDir, f));

    const violations: string[] = [];
    for (const filePath of tsFiles) {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('"add"') && line.includes('"-A"') && !line.includes('"--"')) {
          violations.push(`${path.basename(filePath)}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(
      violations,
      `Bare 'git add -A' found in src/core/step/ files:\n${violations.join("\n")}\n` +
      "(TC-021: all bare add -A must be replaced with explicit pathspec staging — RED until T-04/T-05)",
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: push-as-is 経路と自己 commit 範囲検査のコードが削除されている (should)
//
// T-04 の完了後、`src/core/step/commit-push.ts` の commitAndPushTail から
// push-as-is 経路（agent 著 commit をそのまま push）および
// 自己 commit 範囲検査ロジック（listCommitRangeChangedPaths 呼び出し）が消える。
//
// RED until T-04 removes push-as-is path from commit-push.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-006: push-as-is 経路と自己 commit 範囲検査のコードが削除されている", () => {
  const commitPushPath = path.join(ROOT, "src/core/step/commit-push.ts");

  it("push-as-is 分岐を示すメッセージ文字列が commit-push.ts に存在しない", () => {
    // The push-as-is path (before T-04) logs:
    //   "Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is."
    // After T-04, this message must be removed (replaced by mixed-reset synthesis).
    //
    // TC-033 destruction confirmation: restoring push-as-is will make this test FAIL.
    if (!existsSync(commitPushPath)) return;

    const content = readFileSync(commitPushPath, "utf-8");
    expect(
      content,
      "push-as-is log message must be removed from commit-push.ts (T-04 removes this path)",
    ).not.toContain("pushing as-is");
  });

  it("listCommitRangeChangedPaths が commitAndPushTail 内で呼ばれていない（自己 commit 範囲検査の除去）", () => {
    // After T-04, the inspection path (listCommitRangeChangedPaths in tail) is removed.
    // The function itself may remain as an internal helper, but it must NOT be called
    // from the commitAndPushTail's self-commit inspection gate.
    //
    // We check that the "range inspection already ran" comment and associated branch are gone.
    if (!existsSync(commitPushPath)) return;

    const content = readFileSync(commitPushPath, "utf-8");
    // The push-as-is decision comment (T-04 removes this section)
    expect(
      content,
      "push-as-is HEAD-advance detection block must be removed (T-04) — RED until implemented",
    ).not.toContain("Range inspection already ran");
  });

  it("自己 commit 範囲検査ブロック（headAtTailEntry の violation 検査）が存在しない", () => {
    // Before T-04: commitAndPushTail has an agent self-commit inspection gate
    // (headBeforeStep !== headAtTailEntry → listCommitRangeChangedPaths → findScopedCommitViolations / findWriteScopeViolations)
    // After T-04 (mixed-reset synthesis): this inspection gate is removed.
    // The violation check now happens at the synthesis commit stage (explicit pathspec), not via inspection.
    if (!existsSync(commitPushPath)) return;

    const content = readFileSync(commitPushPath, "utf-8");
    // The head-at-tail-entry variable captures current HEAD for self-commit inspection
    // After T-04 this variable name should not appear in the tail's inspection context
    expect(
      content,
      "headAtTailEntry self-commit inspection gate must be removed (T-04) — RED until implemented",
    ).not.toContain("headAtTailEntry");
  });
});

describe("TC-022: commitAndPush calls write-scope single-source functions", () => {
  const commitPushPath = path.join(ROOT, "src/core/step/commit-push.ts");

  it("src/core/step/commit-push.ts exists", () => {
    expect(existsSync(commitPushPath)).toBe(true);
  });

  it("commit-push.ts calls stagingModeFor (write-scope single-source)", () => {
    // RED until T-03/T-04 add guarded/scoped branching via write-scope single source
    const result = grepFile("stagingModeFor", commitPushPath);
    expect(
      result,
      "commitAndPush must call stagingModeFor from write-scope.ts (single source)",
    ).not.toBe("");
  });

  it("commit-push.ts calls findWriteScopeViolations (write-scope single-source)", () => {
    // RED until T-04 adds guarded diff-check via write-scope single source
    const result = grepFile("findWriteScopeViolations", commitPushPath);
    expect(
      result,
      "commitAndPush must call findWriteScopeViolations from write-scope.ts (single source)",
    ).not.toBe("");
  });

  it("commit-push.ts imports from write-scope module", () => {
    // RED until commit-push.ts imports from write-scope single source
    const content = existsSync(commitPushPath)
      ? readFileSync(commitPushPath, "utf-8")
      : "";
    expect(
      content,
      "commit-push.ts must import from write-scope.js (single source)",
    ).toMatch(/from\s+["']\.\/write-scope\.js["']/);
  });
});
