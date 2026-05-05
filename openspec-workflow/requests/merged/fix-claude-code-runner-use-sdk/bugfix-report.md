# Bugfix Report: fix-claude-code-runner-use-sdk

## Meta

- **reported**: 2026-05-05
- **severity**: normal
- **status**: investigating

## Symptom

- **何が起きたか**: `ClaudeCodeRunner` が設計 (D2) で指定された `@anthropic-ai/claude-code` SDK の `query()` ではなく、`spawn("claude", ["--print", ...])` subprocess を使用している
- **発生条件**: `src/adapter/claude-code/agent-runner.ts` の実装
- **エラーメッセージ**: なし（動作はするが設計不整合）

## Reproduction

- **再現手順**:
  1. `src/adapter/claude-code/agent-runner.ts` を開く
  2. `import { spawn as nodeSpawn } from "node:child_process"` が存在する
  3. `runSubprocess()` → `spawn(claudeBin, ["--print", ...])` で CLI を子プロセス起動している
  4. SDK の `query()` import が存在しない
- **再現結果**: 再現した

## Fix

- **修正内容**: `spawn("claude", ["--print", ...])` subprocess を `@anthropic-ai/claude-agent-sdk` の `query()` async generator に置換。git操作用 subprocess は `git-exec.ts` に分離
- **変更ファイル**:
  - `src/adapter/claude-code/agent-runner.ts` — SDK query() による実装に書き換え
  - `src/adapter/claude-code/git-exec.ts` — git subprocess ヘルパー（新規）
  - `package.json` — `@anthropic-ai/claude-agent-sdk` を dependencies に追加
  - `tests/unit/adapter/claude-code/agent-runner.test.ts` — query mock ベースに書き換え
  - `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` — query mock ベースに書き換え

## Verification

- **修正確認**: agent-runner.ts に spawn/child_process の直接 import なし。query() import あり → OK
- **リグレッション**: Build ✓ | Type ✓ | Test ✓ (17/17 pass)
