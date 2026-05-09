# Proposal: SSE ストリーム / ポーリングのセッション状態ハンドリングを網羅する

## Why

SSE ストリーム（`sse-stream.ts`）とポーリング（`completion.ts`）が認識するセッション状態が不完全。SDK が定義する状態のうち `end_turn` の idle と `terminated` しかハンドリングしておらず、それ以外の状態が来ると SSE は素通り、ポーリングは無限ループに陥る。

2026-05-09 の並列実行で implementer と code-fixer が stuck した直接原因。全ステップ共通のインフラのため、どのステップでも発生しうる。

### 現状のギャップ

| 状態 | SSE (`sse-stream.ts`) | Polling (`completion.ts`) |
|------|----------------------|--------------------------|
| `idle` + `end_turn` | break（完了） | return（完了） |
| `terminated` | break（エラー） | throw（エラー） |
| `idle` + `requires_action` | 素通り | return（完了扱い — 誤判定） |
| `idle` + `retries_exhausted` | 素通り | return（完了扱い — 誤判定） |
| `session.error` | 無視 | N/A |
| `session.deleted` | 無視 | N/A |
| `session.status_rescheduled` | 無視 | 無限ループ |
| `rescheduling` (polling status) | N/A | 無限ループ |

## What Changes

### 1. `TerminationReason` 型を拡張（`sse-stream.ts`）
- `"requires_action"` / `"retries_exhausted"` / `"session_error"` / `"session_deleted"` を追加

### 2. SSE イベントハンドリングの網羅（`sse-stream.ts`）
- `idle` + `requires_action`: エラー終了（spec-runner では unexpected）
- `idle` + `retries_exhausted`: エラー終了（回復不能）
- `session.error`: `retry_status` を確認。`retrying` なら続行、`exhausted`/`terminal` ならエラー終了
- `session.deleted`: エラー終了
- `session.status_rescheduled`: ログ出力して続行
- 未知イベント: ログ出力して続行

### 3. ポーリングの状態ハンドリング拡張（`completion.ts`）
- `rescheduling` status: 上限（10 回）まで継続、超過でエラー throw
- `idle` の `stop_reason` 区別: `events.list()` で最新 idle イベントを取得し、`end_turn` 以外はエラー throw

### 4. SDK ナローイング関数の追加（`sdk/sessions.ts`）
- `isStatusRescheduledEvent`, `isSessionErrorEvent`, `isSessionDeletedEvent`
- `listEvents` ラッパー関数
- error 型の `retry_status` 判定ヘルパー

### 5. Port インターフェースの拡張（`core/port/session-client.ts`）
- `terminationReason` 型を拡張して新しい値を含める

### 6. エラーコード・ファクトリの追加（`errors.ts`）
- `SESSION_RETRIES_EXHAUSTED`, `SESSION_REQUIRES_ACTION`, `SESSION_RESCHEDULING_EXHAUSTED` 等

## Capabilities

### Modified Capabilities
- **session-completion-detection**: `rescheduling` / `session.error` / `session.deleted` の検知を追加
- **session-completion-handling**: `requires_action` / `retries_exhausted` をエラーとして分類

### Impact
- **変更ファイル**:
  - `src/adapter/managed-agent/sse-stream.ts` — イベントハンドリング追加
  - `src/adapter/managed-agent/completion.ts` — `isProposeComplete` → `isSessionIdle` リネーム、rescheduling + stop_reason 区別
  - `src/adapter/managed-agent/sdk/sessions.ts` — ナローイング関数 + listEvents 追加（`order: "desc"` で最新イベント優先取得）
  - `src/core/port/session-client.ts` — terminationReason 型拡張
  - `src/errors.ts` — 新規エラーコード
  - `tests/completion.test.ts` — テスト追加
- **後方互換性**: TerminationReason の型拡張は union 型への追加のため破壊的変更なし
- **エラー正規化パス**: `session-client.ts` の `AnthropicSessionClient.pollUntilComplete` は新規エラー（`SESSION_RETRIES_EXHAUSTED`、`SESSION_REQUIRES_ACTION`、`SESSION_RESCHEDULING_EXHAUSTED`）を catch し、`normalizeSessionError(err)` 経由で `{ status: "terminated", error: { code, message, hint } }` に変換する。`normalizeSessionError` は `SpecRunnerError` の `.code` プロパティ（非空文字列）をそのまま保持するため、新エラーコードは上流に正しく伝搬される。`session-client.ts` 自体への変更は不要。
- **テスト**: 各新規ハンドリングのユニットテストを追加

<!-- spec-fixer-deferred: 6 Port 側の terminationReason 型と sse-stream.ts の TerminationReason 型の共通 const tuple による一元管理は、今回スコープ外。両者は意図的に分離されている（core は adapter に依存できない）。実装ノートに注意事項を記載済み。 -->
<!-- spec-fixer-deferred: 7 SSE ストリーム全体のモック統合テスト（runSseStream を通したテスト）は scope が大きく今回の対象外。T10-3 のナローイング関数単体テストで受け入れ基準を満たす。 -->
