# SSE ストリーム / ポーリングのセッション状態ハンドリングを網羅する

## Meta

- **type**: bug-fix
- **slug**: session-state-handling
- **base-branch**: main

## 背景

SSE ストリーム（`src/adapter/managed-agent/sse-stream.ts`）とポーリング（`src/adapter/managed-agent/completion.ts`）が認識するセッション状態が不完全。SDK が定義する状態のうち、`end_turn` の idle と `terminated` しかハンドリングしておらず、それ以外の状態が来ると SSE は素通り、ポーリングは無限ループに陥る。

2026-05-09 の並列実行で implementer と code-fixer が stuck した直接原因。全ステップ共通のインフラのため、どのステップでも発生しうる。

### SDK が定義する全状態

**Session status**: `running` / `idle` / `terminated` / `rescheduling`

**Idle stop_reason**: `end_turn` / `requires_action` / `retries_exhausted`

**SSE events**: `session.status_running` / `session.status_idle` / `session.status_terminated` / `session.status_rescheduled` / `session.error` / `session.deleted`

**session.error の error type**: `unknown_error` / `model_overloaded` / `model_rate_limited` / `model_request_failed` / `mcp_connection_failed` / `mcp_authentication_failed` / `billing_error`

**error の retry_status**: `retrying`（SDK 側がリトライ中）/ `exhausted`（リトライ上限到達）/ `terminal`（リトライ不可）

### 現状のハンドリング

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

## 要件

1. SSE ストリームで `idle` + `requires_action` をハンドリングする
   - spec-runner は custom_tool_use 以外のツール承認を要求しないため、unexpected な状態
   - `TerminationReason` に新しい値を追加し、呼び出し元でエラーとして処理する
2. SSE ストリームで `idle` + `retries_exhausted` をハンドリングする
   - SDK のリトライ上限に到達した状態。回復不能
   - `TerminationReason` に新しい値を追加し、呼び出し元でエラーとして処理する
3. SSE ストリームで `session.error` イベントをハンドリングする
   - `error.retry_status` を確認し、`retrying` なら続行（SDK が自動リトライ中）、`exhausted` / `terminal` ならエラー終了
4. SSE ストリームで `session.deleted` イベントをハンドリングする
   - セッション削除は回復不能。エラー終了
5. SSE ストリームで `session.status_rescheduled` イベントをハンドリングする
   - エラー復旧中。ログ出力して続行（SDK 側が復旧を試みている）
6. ポーリングで `rescheduling` status を認識する
   - 一定回数（例: 10 回）まではリトライ継続、超過したらエラーとして throw
7. ポーリングで `idle` の `stop_reason` を区別する
   - `end_turn` のみ完了。`requires_action` と `retries_exhausted` はエラーとして throw
8. `SseStreamResult` の `TerminationReason` を拡張して新しい状態を表現する
9. `sdk/sessions.ts` に不足しているナローイング関数を追加する
   - `isStatusRescheduledEvent`, `isSessionErrorEvent`, `isSessionDeletedEvent` 等
10. 未知の状態（将来の SDK 拡張）が来た場合はログ出力して続行する（silent fail 防止）

## スコープ外

- ウォールクロックタイムアウトの追加（#170 で対応）
- パイプラインレベルの escalation ロジック変更
- resume コマンドの修正
- session.error 発生時の自動リトライロジック（SDK の retry_status: retrying に委ねる）

## 受け入れ基準

- [ ] `sse-stream.ts` が `requires_action` / `retries_exhausted` / `session.error` / `session.deleted` / `session.status_rescheduled` を適切にハンドリングする
- [ ] `completion.ts` が `rescheduling` status を認識し、上限超過でエラーを throw する
- [ ] `completion.ts` が `idle` の `stop_reason` を区別し、`end_turn` 以外をエラーとして扱う
- [ ] `TerminationReason` 型が新しい状態を表現できる
- [ ] 各新規ハンドリングのユニットテストが存在する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `session.error` + `retry_status: retrying` は SDK 側がリトライ中のため、spec-runner はログだけ出して SSE ストリーム続行。`exhausted` / `terminal` のみエラー終了
- `rescheduling` のポーリング上限は config からの注入ではなく定数（10 回程度）。rescheduling が 10 回連続で返るのは異常事態
- `requires_action` は spec-runner の運用では発生しないはずだが、発生した場合はエラー終了が安全。silent ignore は危険


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/session-state-handling.md` by `merged-to-archive-consolidation`.
