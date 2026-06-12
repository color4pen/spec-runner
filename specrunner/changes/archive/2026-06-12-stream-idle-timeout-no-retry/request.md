# transient 判定対象の stream idle timeout が code-review でリトライされず halt した

## Meta

- **type**: bug-fix
- **slug**: stream-idle-timeout-no-retry
- **base-branch**: main
- **adr**: false

## 背景

conformance-fix-target の run（job e9602244、2026-06-12）で、code-review step が 819 秒経過後に
`Claude Code SDK query failed: Claude Code returned an error result: API Error: Stream idle timeout - partial response received`
で halt した。このエラーは transient 判定トークンに該当するにもかかわらず、自動リトライが一度も発火していない（pipeline log に step:retry イベントなし、transientRetryAttempts 記録なし）。#626 が「stream idle timeout と error result 経路の取りこぼし」を修正した後の main で発生しており、未カバーの経路が残っている。

## 現状コードの前提

- `src/adapter/claude-code/transient-error.ts:34` — `"stream idle timeout"` は SIMPLE_TOKENS に含まれる。判定は `transient-error.ts:76-78` で toLowerCase 比較のため大文字小文字は無関係
- `src/config/schema.ts:244` — `DEFAULT_TRANSIENT_RETRY_MAX = 3`（既定で有効）。本 repo に transientRetry の設定上書きなし（project / user config とも該当なし、grep 確認済み）
- `src/adapter/claude-code/agent-runner.ts:360-377` — `retryWithBackoff` は `runMainWorkTurn`（main work query + resume fallback）のみを包む。report tool の follow-up・postWorkPrompts・output verification の追加 turn は wrapper の外側
- `src/adapter/claude-code/agent-runner.ts:303-318` — error result → transient throw 変換（`maybeThrowTransientResult`）は `errors[]` 配列の join のみを見る
- エラー文字列の `Claude Code returned an error result:` という接頭辞は src/ 内に構築箇所がない（grep 0 件）— SDK 側で生成されたテキスト
- 実証ログ: `.specrunner/logs/e9602244-4d28-46da-8cc8-d8a109881172.log` — code-review は step:start → step:error のみで、retry イベントが存在しない

## 要件

1. RCA: 本エラーがどの経路（follow-up turn / error result の形状差 / その他）で retryWithBackoff を迂回したかを、上記実証ログと再現テストで特定する
2. 特定した経路を transient リトライの対象に含める（リトライ上限・backoff・step:retry イベント・transientRetryAttempts 記録は既存機構と同一の意味論で動くこと）
3. #626 で追加された既存カバレッジに退行がないこと

## スコープ外

- codex / managed アダプタへの transient リトライ展開（別 request、provider 可搬性の系）
- リトライ上限・backoff パラメータの変更

## 受け入れ基準

- [ ] 特定経路で transient 判定対象エラーを注入するとリトライが発火することをテストで固定する
- [ ] リトライ発火時に step:retry イベントと transientRetryAttempts が記録されることをテストで固定する
- [ ] 既存の transient リトライテスト（#600 / #626 由来）が無変更で green
- [ ] `typecheck && test` が green

## 関連

- #626（同クラスの前回修正 — 本件はその未カバー経路）
- #600（transient リトライ機構の導入）
- 実証: job e9602244 の code-review halt（resume で復旧済み）