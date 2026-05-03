# セッション timeout の撤廃

## Meta

- **type**: spec-change
- **date**: 2026-05-03
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - pattern-reviewer

## 背景

spec-runner は Anthropic Managed Agent の session を起点にパイプラインを駆動する。現状、各 step の `pollUntilComplete` は固定の wall-clock timeout（既定 10 分、propose は spec 上 30 分）を持ち、超過すると `SESSION_TIMEOUT` で `error` 状態に遷移させる。

実利用では以下の問題が観測されている:

- 長時間 session（implementer 等）が処理中にもかかわらず timeout で打ち切られる
- subprocess 呼び出し（例: `openspec archive` の stdin プロンプト hang）と区別がつかず、SDK 側の正常動作も「timeout」として一律 abort される
- 残された session 側は実際には実行を継続しており、CLI 側の state とのズレが生じる

session 完了検知は `streamEvents` の idle + end_turn / SSE disconnect / SDK 側の `stop_reason` で十分機能する。spec-review / code-review の `maxIterations`、`*_RETRIES_EXHAUSTED`、user 手動 cancel（`canceled` status）など session を終端させる出口戦略が複数存在するため、wall-clock timeout は冗長であり、誤動作の原因となっている。

## 目的

step session に対する固定 wall-clock timeout を撤廃し、session 完了/中断は出口戦略（idle+end_turn / SSE disconnect / maxIterations / 手動 cancel）に一本化する。

## 要件

1. **step session の polling timeout 撤廃**
   - `StepExecutor.getTimeoutMs` を削除し、`pollUntilComplete` 呼び出しから `timeoutMs` を渡さない
   - `SessionClient.pollUntilComplete` および `pollUntilComplete` SDK 関数から `timeoutMs` オプションを削除する
   - timeout 検知ロジック（`pollResult.status === "timeout"`）を削除し、`SESSION_TIMEOUT` 由来の error 分岐を削る

2. **error code `SESSION_TIMEOUT` の廃止**
   - `ERROR_CODES.SESSION_TIMEOUT` 定義を削除
   - `sessionTimeoutError` ヘルパー削除
   - `state.error.code` の取り得る値から `SESSION_TIMEOUT` を除外

3. **既存 state file の lazy migration**
   - 旧 state file の `state.error.code === "SESSION_TIMEOUT"` を `validateJobState` 読み取り時に `SESSION_TERMINATED`（resume 不可な terminal error）にマップする
   - migration は読み取り時のみ。書き戻しは次回 update 時に lazy 反映

4. **設定スキーマからの timeout 除去**
   - `SpecRunnerConfig.specReview.timeoutMs` / `SpecRunnerConfig.specFixer.timeoutMs` を削除
   - top-level `timeout` config（`cli-config-store` spec の Requirement）を削除
   - 既存 config に `timeoutMs` / `timeout` があっても無視する（読み取り時に warn は不要、silently ignore）

5. **対象外（撤廃しない timeout）**
   - `doctor` の network/CLI 系短時間 check（5s / 30s）— 本 request の目的（step session 暴走防止の代替手段）に関係しない、UX のための fast-fail
   - `Custom Tool Handler` の handler 内 timeout（`custom-tool-handling` spec）— ローカル handler 用、session timeout とは別軸
   - HTTP リクエスト単位の SDK 内部 timeout — Anthropic SDK 側で管理

6. **影響を受ける spec の更新**
   - 以下の spec から timeout 関連の Requirement / Scenario を削除または修正:
     - `propose-pipeline/spec.md`（`SESSION_TIMEOUT` の transition 表行、Scenario）
     - `session-completion-detection/spec.md`（timeout abort Scenario）
     - `spec-review-session/spec.md`（独立 timeout Requirement）
     - `spec-fixer-session/spec.md`（独立 timeout Requirement）
     - `message-streaming/spec.md`（Polling timeout Scenario）
     - `job-state-store/spec.md`（error.code 列挙から `SESSION_TIMEOUT` を除外）
     - `cli-config-store/spec.md`（top-level timeout config Requirement の削除または `timeoutMs` 廃止後の用途明確化）

## 受け入れ基準

- [ ] step 実行から wall-clock timeout が完全に消える（`StepExecutor` の経路に `setTimeout` / `AbortSignal.timeout` を含む timeout 起因の abort が無いこと）
- [ ] `SESSION_TIMEOUT` を含む error が新規 job で発生しないこと
- [ ] 旧 state file（`error.code === "SESSION_TIMEOUT"`）が `validateJobState` で `SESSION_TERMINATED` に lazy migrate されること
- [ ] `~/.config/specrunner/config.json` の `timeoutMs` / `timeout` が無視されること（壊れない）
- [ ] 対象外 timeout（doctor / custom-tool-handler / SDK 内部）はそのまま残ること
- [ ] 関連 spec が更新され `openspec validate remove-session-timeout` が pass すること
- [ ] 既存テスト 706 件が全て pass すること（timeout 関連テストは削除または書き換え）
- [ ] `propose-system.ts` 等の prompt は本 request の対象外（別 request で deploy gap を是正する）

## 補足

### 出口戦略の確認

session が終端する経路（timeout 撤廃後も機能する）:

| 経路 | 駆動元 | 結果 |
|------|--------|------|
| idle + end_turn 検知 | `streamEvents` (SSE) | 正常完了 |
| SSE disconnect | `streamEvents` | `terminated` flag → step 終了 |
| SDK 側の `stop_reason` | Anthropic SDK | `retries_exhausted` 等のエラー伝播 |
| maxIterations 超過 | spec-review / code-review ループ | `*_RETRIES_EXHAUSTED` → escalation |
| 手動 cancel | `canceled` status | terminal |

### 関連 issue

- 直近の `implementer-timeout` 障害（PR #58 dogfooding-007 で観測、長時間 session が timeout で abort された）
- `openspec archive` subprocess hang（df9cc72、別 request `archive-subprocess-hang` 等で対応予定）

### スコープ外（本 request では扱わない）

- propose agent の system prompt deploy gap（agent definition と src の乖離）→ 別 request または `specrunner init` 再実行で対応
- `archive-openspec.ts` の `-y` flag 適用 → 別 bug-fix request で対応
