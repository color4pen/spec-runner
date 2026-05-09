## Why

`pollUntilComplete()` にウォールクロックタイムアウトがない。`remove-session-timeout` で旧 `SESSION_TIMEOUT`（StepExecutor ベース）を撤廃した後、session 終端は SDK の idle/terminated シグナルに依存している。しかし API が `running` を返し続けるケース（API 側障害等）に対する defense-in-depth が存在しない。

2026-05-09 に implementer セッションが 20 分以上 stuck し手動 kill で復旧。#171 の状態ハンドリング修正が根本対策だが、API 側の想定外挙動に対する最終防御層としてウォールクロックタイムアウトを `pollUntilComplete()` に追加する。

旧 `SESSION_TIMEOUT` との違い:
- 旧: StepExecutor が外側から AbortSignal で打ち切り → `error` 状態（復帰不可）
- 新: `pollUntilComplete` 内部で Date.now() deadline 判定 → `POLL_TIMEOUT` → `awaiting-resume`（ユーザーが判断して resume or cancel）

## What Changes

| File | Change |
|------|--------|
| `src/errors.ts` | `POLL_TIMEOUT` error code + `pollTimeoutError()` factory 追加 |
| `src/adapter/managed-agent/completion.ts` | `PollOptions.timeoutMs` 追加、Date.now() deadline 判定、`PollTimeoutError` throw |
| `src/core/port/session-client.ts` | `pollUntilComplete` opts に `timeoutMs` 追加 |
| `src/adapter/managed-agent/session-client.ts` | `timeoutMs` をパススルー |
| `src/adapter/managed-agent/agent-runner.ts` | step config から `timeoutMs` を解決して `pollUntilComplete` に渡す。`POLL_TIMEOUT` → `completionReason: "timeout"` を返す |
| `src/core/step/executor.ts` | `completionReason: "timeout"` → `awaiting-resume` 状態遷移 |
| `tests/completion.test.ts` | `POLL_TIMEOUT` ユニットテスト追加 |
| `tests/unit/remove-session-timeout.test.ts` | TC-008, TC-011 の `timeoutMs` 不在アサーション更新 |

## Capabilities

### New Capabilities

- `pollUntilComplete()` がウォールクロックタイムアウトを持ち、API 無応答に対する defense-in-depth を提供する

### Modified Capabilities

- `session-completion-detection`: ポーリングタイムアウトによる新しい終端経路が追加される
- `step-execution-architecture`: `completionReason: "timeout"` の処理と `awaiting-resume` 遷移が追加される

## Impact

- **Affected code**: errors.ts, completion.ts, session-client.ts (port + adapter), agent-runner.ts, executor.ts
- **Affected tests**: completion.test.ts (新規 TC 追加)、remove-session-timeout.test.ts (TC-008, TC-011 更新)
- **Backward compatibility**: step config の `timeoutMs` フィールドは既に schema に存在する（step-config-externalization で追加済み）。未設定時は 15 分デフォルト。既存の config.json は変更不要
- **Out of scope**: SSE ストリーム側のタイムアウト、状態ハンドリング改善（#171）、timeout 値の自動チューニング
