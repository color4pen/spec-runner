# codex adapter に claude-code adapter と同等の運用機能（retry / 観測性 / 出力検証）を実装する

## Meta

- **type**: new-feature
- **slug**: codex-adapter-parity
- **base-branch**: main
- **adr**: false

## 背景

Claude → Codex 移行の前提整備。codex adapter（`src/adapter/codex/`）は AgentRunner port を充足し、model 名による provider routing（DispatchingAgentRunner）も既に機能しているが、claude-code adapter が持つ運用機能が欠落している。このまま codex で本番 run すると、transient エラーで即 halt し（#646 で claude 側を修正した問題が codex では未対策）、verbose log も progress イベントも出ない。

port 契約の変更は不要 — `ctx.session.logPath` / `ctx.emit` / `ctx.policy.outputVerification` はすべて port に定義済みで、claude-code adapter のみが消費している。

## 現状コードの前提

- `src/adapter/codex/agent-runner.ts` — `retryWithBackoff` / `isTransientAgentError` / `ctx.emit` / `logPath` への参照が 0 件（grep 確認済み）。port の run() 自体、resume、reportTool の structured output（outputSchema）注入、follow-up retry loop、postWorkPrompts、usage 集計は実装済み
- claude-code 側の対応実装: `src/adapter/claude-code/agent-runner.ts:419-435`（main work turn の transient retry）、`:394-408`（follow-up turns の retry、#646 の RCA で両方を包む構造になっている）、`src/adapter/claude-code/session-log-writer.ts`（JSONL verbose log、mode 0600）
- `retryWithBackoff` は `src/util/retry.ts`（provider 非依存 util）。transient 判定トークンは `src/adapter/claude-code/transient-error.ts` にあり、Codex SDK のエラー文言体系は異なるため codex 用の分類が必要（claude-code と共通化するか adapter 別に持つかは design で判断）
- `src/config/schema.ts:300,401` — transientRetry 設定の jsdoc が「Applied to the local ClaudeCodeRunner only」と記載
- `src/core/port/agent-runner.ts:186` — modelUsage の jsdoc が「Only populated by ClaudeCodeRunner」と記載（codex も usage 集計済みのため記述が古い）
- `AgentRunResult.transientRetryAttempts` を codex adapter は設定しない（undefined のまま）

## 要件

1. transient retry を main turn と follow-up turns の両方に適用する（claude-code と同じ収束則: `resolveTransientRetryConfig` の maxRetries / baseDelayMs、`step:retry` イベント発火、`transientRetryAttempts` の記録）
2. Codex SDK のエラーに対する transient 判定を整備する（判定トークンの置き場 — 共通 util か adapter 別か — は design で決定し、判断理由を design.md に記録する）
3. `ctx.session.logPath` 指定時に JSONL verbose log を出力する（SessionLogWriter の再利用可否は design で判断）
4. `step:progress` イベントを emit する
5. `ctx.policy.outputVerification` のループを実装する
6. 上記に伴い stale になっている jsdoc（schema.ts の transientRetry、port の modelUsage）を更新する

## スコープ外

- prompts の完了契約文言の provider 中立化（別 request: prompts-completion-contract-neutral）
- pricing / usage 表示の OpenAI 対応（別 request: usage-pricing-provider-neutral）
- provider SDK の optionalDependencies 化（別 request）
- port / state schema の変更

## 受け入れ基準

- [ ] codex adapter で transient 該当エラーを注入するとリトライが発火し、step:retry イベントと transientRetryAttempts が記録されることをテストで固定する（main turn / follow-up turn の両経路）
- [ ] 非 transient エラーはリトライせず従来通り失敗することをテストで固定する
- [ ] logPath 指定時に JSONL が出力され、未指定時に出力されないことをテストで固定する
- [ ] outputVerification 失敗時の follow-up 経路をテストで固定する
- [ ] `typecheck && test` が green

## 関連

- #646（claude-code 側の follow-up turns retry 欠落の修正。同じ穴を codex に作らないことが本 request の動機）
- Codex 移行の順序制約: 本 request と prompts-completion-contract-neutral の取り込み後に、実 request 1 本を codex runtime で end-to-end 完走させて移行可否を実証する
