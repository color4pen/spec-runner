# 追加 AI ターンの構造的削減 — 完了契約の初回注入 / 決定論 skip / ターン種別 metrics

## Meta

- **type**: spec-change
- **slug**: reduce-added-agent-turns
- **base-branch**: main
- **pipeline**: standard
- **adr**: true

<!-- adr: 完了契約の届け方・決定論 skip の意味論・ターン計測契約という 3 つの構造判断を含むため true。 -->

## 背景

agent step は本処理（main work turn）に加えて、品質に寄与しない追加 AI ターンを構造的に発生させている。本 request は品質を落とさずに削減できる 3 点を扱う: (1) 完了契約を初回 turn で成立させ report_result 再試行 turn を減らす、(2) 結果が決定論的に確定している step を agent 実行前に skip する、(3) ターン種別を分離計測し削減効果を検証可能にする。

## 現状コードの前提

- local Claude Code path（`src/adapter/claude-code/agent-runner.ts`）は SDK query に `step.agent.system`（COMPLETION_DIRECTIVE を含む step system prompt）を渡していない。`queryOptions`（`agent-runner.ts:431-456`）に systemPrompt 系キーは無く、query は `{ prompt: fullPrompt, options: queryOptions }`（`agent-runner.ts:467`）で呼ばれ、`step.agent.model` のみ参照される（`agent-runner.ts:341`）。`fullPrompt` は `buildMessage` + resume + `buildAdditionalInstructions`（`agent-runner.ts:327-335`）。→ 完了指示は buildMessage 末尾文と report_result tool description（`src/core/step/report-tool.ts:23` の "You MUST call this tool before ending your turn"）経由でのみ agent に届く。
- report_result 未呼び出し時の再試行 fallback は `agent-runner.ts:701-722`、policy は `DEFAULT_TOOL_RETRY`（`src/core/port/report-result.ts:76-84`, maxAttempts=2）。
- 既存の step activation（`activation?: ReviewerActivation`, `src/core/port/step-types.ts:244`）は宣言的で `requestTypes`（文字列一致）と `paths`（glob）のみ（評価: `src/core/reviewers/activation.ts:57-98`）。**state / deps を引数に取らないため `request.adr === false` や「findings ledger が空」は表現できない。** executor は activation を `src/core/step/executor.ts:268-284` で評価し、不成立なら `{ kind: "skipped", skipReason }` を返す。
- adr-gen は静的に登録され（`src/core/pipeline/registry.ts:44`）activation を持たず常に実行される。`adr:false` 時は no-op message を投げて即終了する（`src/core/step/adr-gen.ts:73-78`）が agent turn は消費する。
- regression-gate は custom-reviewer snapshot がある時のみ動的注入される（`src/core/pipeline/compose-reviewers.ts:50-56`）。ledger は `collectFindingsLedger(state, reviewerChain)` により turn 前に決定論的に算出でき、空でも agent に「approve immediately」を依頼する（`src/core/step/regression-gate.ts:53-56`）。
- skip の commit 経路は既存: `CommitOrchestrator.commitSkipped`（`src/core/step/commit-orchestrator.ts:338-364`）が `projectSkip` で skipped verdict を積み、`{step}-skipped` の history entry を残す。
- 追加ターン計測は `StepOutcome.followUpAttempts`（`src/state/schema/types.ts:137`）に単一カウンタとして記録され、report_result 再試行と output-repair を混在させ、post-work turn（`agent-runner.ts:726-777`）は計上されない。

## 要件

1. **完了契約の初回注入**: local path の初回 turn prompt（`fullPrompt` 組み立て、または `buildAdditionalInstructions`）に、report_result（provider 固有の MCP tool 名 `mcp__specrunner_report__report_result`）を turn 終了前に呼ぶよう指示する completion directive を注入する。既存の report_result 再試行は削除せず fallback として残す。core prompt の provider-neutral 方針は維持し、provider 固有の tool 名注入は adapter 層に閉じる。
2. **決定論 skip**: state / deps を参照できる skip 判定を導入し、結果が確定している step を agent 実行前に skip する。対象は (a) `request.adr === false` の adr-gen、(b) findings ledger が空の regression-gate。skip は既存の `commitSkipped` 経路（skipped verdict + `{step}-skipped` history）に載せ、新たな halt を導入しない。既存の宣言的 activation（paths / requestTypes）は壊さない。
3. **ターン種別 metrics 分離**: `StepOutcome` の追加ターン計測を種別分離する（report_result 再試行 / post-work / output-repair を区別）。post-work turn も計上する。既存 `followUpAttempts` は互換維持か移行を明示する。

## スコープ外

- post-work の無条件実行を detector 化する変更（別 request）。
- code-review post-work の typed-findings 指示除去（別 request）。
- design の探索量削減 / model routing（別 request）。
- managed adapter の completion 経路変更（本 request は local Claude Code path が対象）。

## 受け入れ基準

- [ ] local path の初回 turn prompt に report_result tool を呼ぶ completion directive が含まれることをテストで固定する。
- [ ] `request.adr === false` で adr-gen が agent を実行せず skipped verdict になることをテストで固定する。
- [ ] findings ledger が空のとき regression-gate が agent を実行せず skipped verdict になることをテストで固定する。
- [ ] ledger が非空のとき regression-gate は従来どおり実行される（skip は空時のみ）ことをテストで固定する。
- [ ] `StepOutcome` にターン種別の分離計測が入り、post-work turn が計上されることをテストで固定する。
- [ ] report_result 再試行 fallback が維持される（削除されない）ことをテストで確認する。
- [ ] skip 対象 step（adr-gen / regression-gate）以外の verdict 導出・pipeline 遷移の観測挙動は不変。skip 導入で期待が変わる箇所（adr:false の adr-gen / 空 ledger の regression-gate が success → skipped）以外の既存テストは無変更で green。
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: skip 判定は state / deps を取る新しい述語として executor の activation 評価点（`executor.ts:268-284`）に並べる。既存の宣言的 `ReviewerActivation`（paths / requestTypes）は別軸なので変更せず混ぜない。
- **採用**: skip は既存 `commitSkipped` 経路に載せ、新しい状態型・履歴型を作らない。
- **採用**: completion directive の provider 固有 tool 名注入は adapter 層（agent-runner / prompt-builder）に閉じ、core prompt の provider-neutral 方針を保つ。
- **却下**: adr:false を宣言的 activation の requestTypes で表現する案。adr は request.type ではなく boolean フラグで、宣言的 activation の語彙に載らない。状態依存述語が必要。
- **却下**: report_result 再試行の削除。provider が初回で tool を呼ばない例外時の安全網であり、fallback として残す。
