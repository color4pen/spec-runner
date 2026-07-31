/**
 * Architecture boundary test: B-18 — request 系入口は LLM 系 port / adapter を import しない
 *
 * TC-006: 入口に LLM 系 import を仕込むと red になる（B-18 の歯）
 * Source: spec.md > Requirement: request 系入口は LLM 系 port / adapter を import しない（B-18 の歯）
 *         > Scenario: 入口に LLM 系 import を仕込むと red になる
 *
 * 検査スコープ:
 *   - src/core/request/ (ディレクトリ再帰)
 *   - src/core/command/request-*.ts (glob)
 *
 * 禁止 import パターン:
 *   - LLM 系 port: port/agent-runner / port/session-client / port/anthropic-client
 *   - adapter: adapter/claude-code/ / adapter/managed-agent/ / adapter/codex/ / adapter/dispatching/
 *
 * 実装完了状態では 0 件で green。
 * sabotage（入口に該当 import を 1 行仕込む）で red になる歯。
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

/**
 * grep -rEn PATTERN DIR [--include GLOB]
 * Returns stdout on match, "" on no match (exit 1), throws on error.
 */
function grepE(pattern: string, dir: string, includeGlob?: string): string {
  try {
    const includeFlag = includeGlob ? `--include="${includeGlob}"` : "";
    return execSync(`grep -rEn ${includeFlag} ${pattern} ${dir}`, {
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

// ─── 禁止 import パターン ───────────────────────────────────────────────────

/**
 * LLM 系 port モジュール（port/agent-runner / port/session-client / port/anthropic-client）
 * の import パスパターン。
 */
const LLM_PORT_PATTERNS = [
  "port/agent-runner",
  "port/session-client",
  "port/anthropic-client",
];

/**
 * LLM 系 adapter モジュール（adapter/claude-code/ / adapter/managed-agent/ /
 * adapter/codex/ / adapter/dispatching/）の import パスパターン。
 */
const LLM_ADAPTER_PATTERNS = [
  "adapter/claude-code/",
  "adapter/managed-agent/",
  "adapter/codex/",
  "adapter/dispatching/",
];

const ALL_FORBIDDEN_PATTERNS = [...LLM_PORT_PATTERNS, ...LLM_ADAPTER_PATTERNS];

// ─── TC-006: src/core/request/ — LLM 系 port / adapter import 禁止 ────────────

describe("B-18 (TC-006): src/core/request/ は LLM 系 port / adapter を import しない", () => {
  for (const pattern of ALL_FORBIDDEN_PATTERNS) {
    it(`src/core/request/ に "${pattern}" の import が存在しない（sabotage で red になる歯）`, () => {
      // Grep for the pattern inside import statements in src/core/request/
      const result = grepE(`"${pattern}"`, "src/core/request");
      expect(
        result,
        `"${pattern}" への import が src/core/request/ に見つかりました。B-18 違反です。`,
      ).toBe("");
    });
  }
});

// ─── TC-006: src/core/command/request-*.ts — LLM 系 port / adapter import 禁止 ─

describe(
  "B-18 (TC-006): src/core/command/request-*.ts は LLM 系 port / adapter を import しない",
  () => {
    for (const pattern of ALL_FORBIDDEN_PATTERNS) {
      it(`src/core/command/request-*.ts に "${pattern}" の import が存在しない（sabotage で red になる歯）`, () => {
        // Grep only request-*.ts files in src/core/command/
        const result = grepE(`"${pattern}"`, "src/core/command", "request-*.ts");
        expect(
          result,
          `"${pattern}" への import が src/core/command/request-*.ts に見つかりました。B-18 違反です。`,
        ).toBe("");
      });
    }
  },
);

// ─── TC-006: sabotage 検知の regression guard ─────────────────────────────────

describe(
  "B-18 regression guard: sabotage（入口への LLM 系 import 追加）で検知される",
  () => {
    it(
      "src/core/request/ に AgentRunner port import を仕込んだ場合に grep が 0 件以外を返す（sabotage 模擬）",
      () => {
        // Verify the grepE detection mechanism works by writing a real temp file with a
        // forbidden import and confirming grepE finds it.
        const tmpDir = mkdtempSync(path.join(os.tmpdir(), "b18-guard-"));
        try {
          writeFileSync(
            path.join(tmpDir, "manager.ts"),
            'import type { AgentRunner } from "../port/agent-runner.js";\n',
          );
          const result = grepE('"port/agent-runner"', tmpDir);
          expect(
            result,
            "grepE が 'port/agent-runner' パターンを検知できませんでした（B-18 検知機構が壊れています）",
          ).not.toBe("");
        } finally {
          rmSync(tmpDir, { recursive: true });
        }
      },
    );

    it(
      "src/core/command/request-prompt.ts に adapter/claude-code/ import を仕込んだ場合に grep が 0 件以外を返す（sabotage 模擬）",
      () => {
        // Same regression guard: verify the detection mechanism works by writing a real
        // temp file with a forbidden adapter import.
        const tmpDir = mkdtempSync(path.join(os.tmpdir(), "b18-guard-"));
        try {
          writeFileSync(
            path.join(tmpDir, "request-prompt.ts"),
            'import { ClaudeCodeOneShotQueryClient } from "../../adapter/claude-code/one-shot-query-client.js";\n',
          );
          const result = grepE('"adapter/claude-code/"', tmpDir);
          expect(
            result,
            "grepE が 'adapter/claude-code/' パターンを検知できませんでした（B-18 検知機構が壊れています）",
          ).not.toBe("");
        } finally {
          rmSync(tmpDir, { recursive: true });
        }
      },
    );
  },
);
