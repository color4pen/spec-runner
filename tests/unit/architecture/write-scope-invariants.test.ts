/**
 * Architecture invariant tests for write-scope enforcement.
 *
 * TC-010: write-scope module が leaf module であること (should)
 * TC-022: commitAndPush が write-scope 単一ソースを経由する (could)
 *
 * TC-010 — NOTE: intentionally RED until src/core/step/write-scope.ts is created.
 *   The "file exists" assertion fails before implementation.
 *
 * TC-022 — NOTE: intentionally RED until commit-push.ts calls stagingModeFor and
 *   findWriteScopeViolations from write-scope single source.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
