/**
 * Unit tests for extractVerificationFailures
 *
 * Tests parse-result.ts against the verification-result.md format produced by runner.ts.
 */
import { describe, it, expect } from "vitest";
import { extractVerificationFailures } from "../../../../src/core/verification/parse-result.js";

/**
 * Build a verification-result.md string that matches the exact format
 * produced by runner.ts writeVerificationResult().
 */
function buildVerificationResultMd(
  slug: string,
  phases: Array<{
    phase: string;
    status: "passed" | "failed" | "skipped";
    exitCode?: number;
    output?: string;
    durationMs?: number;
  }>,
): string {
  const lines: string[] = [];

  lines.push(`# Verification Result — ${slug} — iter 1`);
  lines.push("");
  const anyFailed = phases.some((p) => p.status === "failed");
  lines.push(`## Verdict: ${anyFailed ? "failed" : "passed"}`);
  lines.push("");
  lines.push("## Phase Results");
  lines.push("");
  lines.push("| # | Phase | Status | Duration | Exit Code |");
  lines.push("|---|-------|--------|----------|-----------|");

  phases.forEach((p, i) => {
    const dur = p.status === "skipped" ? "—" : `${((p.durationMs ?? 1000) / 1000).toFixed(1)}s`;
    const code = p.status === "skipped" ? "—" : String(p.exitCode ?? "—");
    lines.push(`| ${i + 1} | ${p.phase} | ${p.status} | ${dur} | ${code} |`);
  });
  lines.push("");

  for (const p of phases) {
    lines.push(`## Phase: ${p.phase}`);
    lines.push("");
    if (p.status === "skipped") {
      lines.push("_(skipped — script not found in package.json)_");
    } else {
      const combined = p.output ?? "";
      lines.push("```");
      lines.push(combined || "(no output)");
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

// TC-A: typecheck のみ失敗（後続 skipped）→ 1 件の VerificationFailure を返す
describe("extractVerificationFailures — typecheck のみ失敗", () => {
  it("typecheck failed → 1 件, phase='typecheck', exitCode=1 が返る", () => {
    const content = buildVerificationResultMd("my-change", [
      { phase: "build", status: "passed", exitCode: 0, output: "Build succeeded" },
      { phase: "typecheck", status: "failed", exitCode: 1, output: "src/foo.ts:10 - error TS2345: Type error" },
      { phase: "test", status: "skipped" },
      { phase: "lint", status: "skipped" },
      { phase: "security", status: "skipped" },
    ]);

    const result = extractVerificationFailures(content);

    expect(result).toHaveLength(1);
    expect(result[0]?.phase).toBe("typecheck");
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.output).toContain("error TS2345");
  });
});

// TC-B: build 失敗（全後続 skipped）→ 1 件
describe("extractVerificationFailures — build 失敗", () => {
  it("build failed → 1 件, phase='build', exitCode=1", () => {
    const content = buildVerificationResultMd("my-change", [
      { phase: "build", status: "failed", exitCode: 1, output: "Build error: cannot find module" },
      { phase: "typecheck", status: "skipped" },
      { phase: "test", status: "skipped" },
      { phase: "lint", status: "skipped" },
      { phase: "security", status: "skipped" },
    ]);

    const result = extractVerificationFailures(content);

    expect(result).toHaveLength(1);
    expect(result[0]?.phase).toBe("build");
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.output).toContain("cannot find module");
  });
});

// TC-C: 全フェーズ passed → 空配列
describe("extractVerificationFailures — 全フェーズ passed", () => {
  it("全 passed → 空配列を返す", () => {
    const content = buildVerificationResultMd("my-change", [
      { phase: "build", status: "passed", exitCode: 0, output: "ok" },
      { phase: "typecheck", status: "passed", exitCode: 0, output: "ok" },
      { phase: "test", status: "passed", exitCode: 0, output: "pass" },
      { phase: "lint", status: "passed", exitCode: 0, output: "ok" },
      { phase: "security", status: "passed", exitCode: 0, output: "ok" },
    ]);

    const result = extractVerificationFailures(content);

    expect(result).toHaveLength(0);
  });
});

// TC-D: 全フェーズ skipped → 空配列
describe("extractVerificationFailures — 全フェーズ skipped", () => {
  it("全 skipped → 空配列を返す", () => {
    const content = buildVerificationResultMd("my-change", [
      { phase: "build", status: "skipped" },
      { phase: "typecheck", status: "skipped" },
      { phase: "test", status: "skipped" },
      { phase: "lint", status: "skipped" },
      { phase: "security", status: "skipped" },
    ]);

    const result = extractVerificationFailures(content);

    expect(result).toHaveLength(0);
  });
});

// TC-E: 出力が (no output) の場合
describe("extractVerificationFailures — (no output) の扱い", () => {
  it("出力なし（空文字列）の failed phase → output が '(no output)' を含む", () => {
    const content = buildVerificationResultMd("my-change", [
      // pass output="" to trigger the "(no output)" branch in buildVerificationResultMd
      { phase: "build", status: "failed", exitCode: 2, output: "" },
      { phase: "typecheck", status: "skipped" },
      { phase: "test", status: "skipped" },
      { phase: "lint", status: "skipped" },
      { phase: "security", status: "skipped" },
    ]);

    const result = extractVerificationFailures(content);

    expect(result).toHaveLength(1);
    expect(result[0]?.phase).toBe("build");
    expect(result[0]?.exitCode).toBe(2);
    // runner.ts writes "(no output)" when combined output is empty
    expect(result[0]?.output).toBe("(no output)");
  });
});
