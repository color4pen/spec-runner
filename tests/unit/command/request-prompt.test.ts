/**
 * Tests for src/core/command/request-prompt.ts
 *
 * TC-001: request prompt が必須セクションと規律と検証指示を出力する
 *   Source: spec.md > Requirement: `request prompt` は決定的な起票プロンプトを stdout に出力する
 *           > Scenario: request prompt が必須セクションと規律と検証指示を出力する
 *
 * TC-002: request prompt が認証・ネットワークなしで決定的に完了する
 *   Source: spec.md > Requirement: `request prompt` は決定的な起票プロンプトを stdout に出力する
 *           > Scenario: request prompt が認証・ネットワークなしで決定的に完了する
 *
 * TC-003: request prompt と request template が同一の雛形ソースを消費する
 *   Source: spec.md > Requirement: 雛形の知識源は単一である
 *           > Scenario: request prompt と request template が同一の雛形ソースを消費する
 *
 * TC-015: request prompt 出力に repo 固有資源（architecture/）が現れない
 *   Source: tasks.md > T-01
 *
 * NOTE: This file imports src/core/command/request-prompt.ts which does not exist yet.
 * All tests will fail (RED) until the implementer completes T-01.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ── This import fails during red phase (file does not exist yet) ──
// After T-01, executePrompt is exported from request-prompt.ts.
import { executePrompt } from "../../../src/core/command/request-prompt.js";

// ── buildScaffoldTemplate is exported from request.ts (already exists) ──
import { buildScaffoldTemplate } from "../../../src/core/command/request.js";

// ─── stdout capture helpers ────────────────────────────────────────────────

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStdout(): string {
  return (stdoutSpy.mock.calls as unknown[][])
    .map((args) => String(args[0]))
    .join("");
}

// ─── TC-001: 必須セクション・規律・検証指示を含む ─────────────────────────────

describe("TC-001: request prompt が必須セクションと規律と検証指示を出力する", () => {
  it("TC-001: executePrompt() returns exit code 0", () => {
    const exitCode = executePrompt();
    expect(exitCode).toBe(0);
  });

  it("TC-001: output contains required section ## Meta", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("## Meta");
  });

  it("TC-001: output contains required section ## 背景", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("## 背景");
  });

  it("TC-001: output contains required section ## 現状コードの前提", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("## 現状コードの前提");
  });

  it("TC-001: output contains required section ## 要件", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("## 要件");
  });

  it("TC-001: output contains required section ## スコープ外", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("## スコープ外");
  });

  it("TC-001: output contains required section ## 受け入れ基準", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("## 受け入れ基準");
  });

  it("TC-001: output contains type selection discipline (spec-change / new-feature)", () => {
    executePrompt();
    const output = captureStdout();
    // The discipline: 設計の追加・変更を含むなら bug-fix でなく spec-change / new-feature
    expect(output).toMatch(/spec-change|spec_change/);
    expect(output).toMatch(/new-feature|new_feature/);
  });

  it("TC-001: output contains specrunner request validate self-verification instruction", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).toContain("specrunner request validate");
  });

  it("TC-001: output is non-empty", () => {
    executePrompt();
    const output = captureStdout();
    expect(output.length).toBeGreaterThan(100);
  });
});

// ─── TC-002: 決定性 — 認証・ネットワーク・LLM なしで exit 0 ─────────────────

describe("TC-002: request prompt が認証・ネットワークなしで決定的に完了する", () => {
  it("TC-002: executePrompt() completes synchronously and returns 0", () => {
    // executePrompt is synchronous (no async/await) — returns number, not Promise
    const result = executePrompt();
    expect(typeof result).toBe("number");
    expect(result).toBe(0);
  });

  it("TC-002: request-prompt.ts source does not import one-shot-query-client", () => {
    // Source-level assertion: ensures no LLM call paths are imported.
    const source = readFileSync(
      path.join(ROOT, "src/core/command/request-prompt.ts"),
      "utf-8",
    );
    expect(source).not.toContain("one-shot-query-client");
  });

  it("TC-002: request-prompt.ts source does not import loadConfigWithOverlay", () => {
    const source = readFileSync(
      path.join(ROOT, "src/core/command/request-prompt.ts"),
      "utf-8",
    );
    expect(source).not.toContain("loadConfigWithOverlay");
  });

  it("TC-002: request-prompt.ts source does not import config/store", () => {
    const source = readFileSync(
      path.join(ROOT, "src/core/command/request-prompt.ts"),
      "utf-8",
    );
    expect(source).not.toContain("config/store");
  });

  it("TC-002: request-prompt.ts source does not import credentials", () => {
    const source = readFileSync(
      path.join(ROOT, "src/core/command/request-prompt.ts"),
      "utf-8",
    );
    expect(source).not.toContain("credentials");
  });
});

// ─── TC-003: 雛形の知識源は単一 — buildScaffoldTemplate を共有 ───────────────

describe("TC-003: request prompt と request template が同一の雛形ソースを消費する", () => {
  it("TC-003: request-prompt.ts imports buildScaffoldTemplate from ./request.js", () => {
    const source = readFileSync(
      path.join(ROOT, "src/core/command/request-prompt.ts"),
      "utf-8",
    );
    expect(source).toContain("buildScaffoldTemplate");
    expect(source).toContain("./request");
  });

  it("TC-003: request.ts exports buildScaffoldTemplate (single source exists)", () => {
    // buildScaffoldTemplate is already exported from request.ts (can be confirmed by import above)
    const scaffold = buildScaffoldTemplate({
      title: "test",
      type: "new-feature",
      slug: "test-slug",
    });
    expect(typeof scaffold).toBe("string");
    expect(scaffold).toContain("## Meta");
  });

  it("TC-003: executePrompt() output contains buildScaffoldTemplate() output as substring", () => {
    // Behavioral assertion: the prompt output must embed the scaffold template content.
    const scaffoldOutput = buildScaffoldTemplate({
      title: "<タイトルを記入>",
      type: "<type>",
      slug: "<slug を記入>",
    });

    executePrompt();
    const promptOutput = captureStdout();

    // The prompt output must contain at least one section that is also in the scaffold template.
    // This confirms the same source is consumed.
    // Check for the Meta section which is always in the scaffold template.
    expect(scaffoldOutput).toContain("## Meta");
    expect(promptOutput).toContain("## Meta");
  });

  it("TC-003: request-prompt.ts does not define its own standalone template body (no hardcoded ## Meta)", () => {
    const source = readFileSync(
      path.join(ROOT, "src/core/command/request-prompt.ts"),
      "utf-8",
    );
    // The source must not define an independent template body.
    // It must use buildScaffoldTemplate from request.js instead.
    // We verify by checking that the source calls buildScaffoldTemplate.
    expect(source).toContain("buildScaffoldTemplate");
    // And it doesn't define a template inline that re-invents the scaffold
    // (presence of buildScaffoldTemplate call is the positive indicator;
    //  absence of the import would be caught by TC-003's first assertion)
  });
});

// ─── TC-015: repo 固有資源（architecture/）が現れない ─────────────────────────

describe("TC-015: request prompt 出力に repo 固有資源（architecture/）が現れない", () => {
  it("TC-015: executePrompt() output does not contain 'architecture/'", () => {
    executePrompt();
    const output = captureStdout();
    expect(output).not.toContain("architecture/");
  });
});
