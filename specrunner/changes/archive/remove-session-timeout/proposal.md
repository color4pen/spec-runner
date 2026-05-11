## Why

step session の wall-clock timeout（既定 10 分、propose は 30 分）は、長時間処理中の正常な session を `SESSION_TIMEOUT` として打ち切る誤動作の主因となっており、subprocess hang 等の本来 abort すべき経路と区別できない。session 完了/中断の検知は `streamEvents` の idle+end_turn / SSE disconnect / SDK の `stop_reason` / `maxIterations` / 手動 cancel という出口戦略で十分機能するため、wall-clock timeout は冗長かつ有害である。

## What Changes

- **BREAKING** `StepExecutor.getTimeoutMs` を削除し、`SessionClient.pollUntilComplete` および `pollUntilComplete` SDK 関数から `timeoutMs` オプションを除去する
- **BREAKING** `pollResult.status === "timeout"` 分岐と `ERROR_CODES.SESSION_TIMEOUT` / `sessionTimeoutError` ヘルパーを削除する
- **BREAKING** `SpecRunnerConfig.specReview.timeoutMs` / `SpecRunnerConfig.specFixer.timeoutMs` および top-level `timeout` config を schema から削除する
- 既存 state file の `state.error.code === "SESSION_TIMEOUT"` を `validateJobState` 読み取り時に `SESSION_TERMINATED` に lazy migrate する（書き戻しは次 update 時）
- 既存 config の `timeoutMs` / `timeout` キーは silently ignore する（warn なし、壊れない）
- 対象外: `doctor` の network/CLI check timeout、`Custom Tool Handler` の handler 内 timeout、Anthropic SDK 内部の HTTP timeout はそのまま残す

## Capabilities

### New Capabilities
<!-- 新規 capability なし。本 request は既存 spec の要件削除/修正のみ -->

### Modified Capabilities

- `propose-pipeline`: 失敗遷移表から `SESSION_TIMEOUT` 行と Scenario を削除する
- `session-completion-detection`: 「完了タイムアウトを実装する」Requirement を削除する
- `spec-review-session`: 「spec-review セッションは独立した timeout を持つ」Requirement を削除する
- `spec-fixer-session`: 「spec-fixer セッションは独立した timeout を持つ」Requirement を削除する
<!-- message-streaming: Next.js Web UI クライアント polling の仕様であり、CLI step session timeout とは別軸。本 request の scope 外のため変更なし -->
- `job-state-store`: `state.error.code` 列挙から `SESSION_TIMEOUT` を除外し、旧 state file の lazy migration ルールを追加する
- `cli-config-store`: top-level timeout config Requirement を削除し、`timeoutMs` / `timeout` を読み取り時に silently ignore する旨を明記する

## Impact

- **Affected code**:
  - `src/core/step/executor.ts`（`StepExecutor.getTimeoutMs` 削除、`pollUntilComplete` 呼び出しから `timeoutMs` 除去）
  - `src/core/session/client.ts` 等（`SessionClient.pollUntilComplete` シグネチャ変更）
  - SDK ラッパ層の `pollUntilComplete`（`timeoutMs` オプション削除、`pollResult.status === "timeout"` 分岐削除）
  - `src/core/errors.ts`（`ERROR_CODES.SESSION_TIMEOUT` / `sessionTimeoutError` 削除）
  - `src/state/schema.ts`（`validateJobState` で旧 SESSION_TIMEOUT → SESSION_TERMINATED の lazy mapping 追加。`validateJobState` は schema.ts:226 付近に存在）
  - `src/config/schema.ts`（`SpecRunnerConfig.specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` 削除、ignore ロジック。`getTimeoutMs(stepName, cfg)` ヘルパー削除も含む）
  - `src/adapter/anthropic/session-runner.ts`（`timeoutMs` 引数と `SESSION_TIMEOUT` フォールバック lines 99, 116 の削除）
  - `src/adapter/anthropic/completion.ts:74`（`SESSION_TIMEOUT` フォールバック / `timeoutMs` 関連コードの削除）
- **Affected tests**: timeout 関連 unit/integration テスト（`SESSION_TIMEOUT` を扱う既存ケース）を削除または書き換え。受け入れ基準は既存テスト全件 PASS の維持（変更前ベースライン比で减少なし、timeout 関連テスト削除分を除く）
- **Backward compatibility**:
  - 旧 state file は読み取り時 lazy migration で破壊的変更にならない
  - 旧 config の余分キーは silently ignore で破壊的変更にならない
- **Out of scope**: `propose-system.ts` 等の prompt deploy gap、`doctor` / custom-tool-handler / SDK 内部の timeout
