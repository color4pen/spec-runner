# transient リトライが stream idle timeout と error result 経路を取りこぼす

## Meta

- **type**: bug-fix
- **slug**: transient-retry-coverage
- **base-branch**: main
- **adr**: false

## 背景

2026-06-11 の custom-reviewers run（design step）で、マシンスリープにより SDK セッションのストリームが死に、`Claude Code SDK query failed: Claude Code returned an error result: API Error: Stream idle timeout - partial response received` で halt した。transient リトライ機能は既定で有効（maxRetries=3）だったがリトライは 0 回 — 分類器が non-transient と判定したため。escalation 通知 → 人間の /resume で再開し、そのまま成功した。判断の要らない再開を人間が代行した形であり、分類の取りこぼしを塞げば無人ループ内で完結する。

## 現状コードの前提

- transient 分類は fail-closed のホワイトリスト方式（`src/adapter/claude-code/transient-error.ts:15-40`）。`request timed out` / `socket timeout` / `etimedout` 等のトークンはあるが `stream idle timeout` がない
- SDK は子プロセス exit 時、最後に受信した error result の本文を `Claude Code returned an error result: <text>` という throw に置き換えてストリームに流す（`@anthropic-ai/claude-agent-sdk` の Query.readMessages の catch 節）。この throw は retryWithBackoff の `isTransientError` → `isTransientAgentError` に届く（`src/adapter/claude-code/agent-runner.ts:335-339`）— 本事象はこの経路で分類器に届いた上で語彙不一致により非 transient 判定された
- プロセスが生きたまま `subtype !== "success"` の result が正常返却された場合のエラー化は retry wrapper を抜けた後で行われ（`src/adapter/claude-code/agent-runner.ts:372-386`）、本文がどれだけ transient でも分類器に届かずリトライされない
- リトライの単位は `runMainWorkTurn`（session resume → new-session fallback 込み、`src/adapter/claude-code/agent-runner.ts:302-325`）
- 既定値は `DEFAULT_TRANSIENT_RETRY_MAX = 3`（`src/config/schema.ts:244`）

## 要件

1. ホワイトリストに stream idle timeout 系のトークンを追加する。fail-closed 原則は維持し、transient と確信できる語彙のみ追加する
2. error result 経路（`subtype !== "success"` の正常返却）もリトライ対象にする — result 本文を transient 分類にかけ、transient であれば retry wrapper の単位内で再試行する。非 transient は従来どおり即エラー
3. リトライ枯渇時の挙動（halt → awaiting-resume → escalation 通知）は変えない

## スコープ外

- inbox 層での halt 後自動 resume（step レベルのリトライと #618 の crash 回復で経路は覆われる）
- managed runtime 側のエラー分類
- スリープ抑止（caffeinate 等）の運用設定

## 受け入れ基準

- [ ] `API Error: Stream idle timeout - partial response received` を含む throw が transient 判定され、リトライされる
- [ ] error result 経路で transient 本文の result がリトライされ、step:retry イベントが発火する
- [ ] 非 transient の error result は従来どおり即 halt し、既存テストが無変更で green
- [ ] リトライ枯渇で halt → escalation 通知の経路が不変
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- fail-closed ホワイトリスト方式を維持する。分類できないエラーは人間行きに倒す保守デフォルトを変えず、語彙と経路の漏れだけを塞ぐ
- 新しいリトライ層を作らない。再試行は既存の `runMainWorkTurn` 単位（resume fallback 込み）に揃え、error result を transient 判定時にその単位内の throw へ変換する形で既存 wrapper に乗せる
