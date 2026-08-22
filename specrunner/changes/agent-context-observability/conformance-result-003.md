# Conformance Result — agent-context-observability (Iteration 3)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Acceptance Criteria

**AC-1: 累計 `ModelUsage` と active context metric が意味上・型上区別される**
- `src/kernel/model-usage.ts` の `ModelUsage` は 4 field（inputTokens / outputTokens / cacheReadInputTokens / cacheCreationInputTokens）のまま変更なし — confirmed by direct read
- `AgentContextMetrics` は `src/kernel/context-metrics.ts` に独立型として新設
- `AgentRunResult.contextMetrics` は `modelUsage` / `invocationMetrics` とは別 field — verified in `src/core/port/agent-runner.ts`

**AC-2: provider が active context size を報告できる場合、invocation 中の peak を記録できる**
- `context-observer.ts` の `observe()` が assistant message から peak を計算
- sub-agent（`parent_tool_use_id !== null/undefined`）と replay（`isReplay === true`）を除外
- main work / follow-up / postWork / output-repair の全ループで `contextObserver.observe(message)` を 1 回ずつ呼ぶ — verified in `agent-runner.ts` (lines 739, 896, 1161)
- TC-003 / TC-004 / TC-005 でテスト固定

**AC-3: provider が compaction を報告できる場合、回数と before / after context size を記録できる**
- `compact_boundary` system message で compactionCount +1、pre_tokens/post_tokens を記録
- `post_tokens` が欠落した場合は after 値を undefined にリセット（前回値を引き継がない）
- TC-006 / TC-007 でテスト固定

**AC-4: context exhaustion 時、取得可能なら exhaustion 時点の context size が残る**
- `markExhaustion()` が `isContextExhaustionError()` で allowlist 照合（fail-closed）し、`lastActiveContextTokens` を `exhaustionAtTokens` に設定
- 観測なしの場合は 0 や推測値を書かず undefined のまま
- agent-runner.ts の全 error 経路で `markExhaustion` を呼ぶ — verified (lines 991, 1053, 1088, 1184, 1193, 1316)
- TC-008 / TC-009 / TC-010 でテスト固定

**AC-5: context size を取得できない provider では値を捏造せず unavailable として扱う**
- Codex adapter: `createContextObserver` を import せず、`contextMetrics:` が return 文に存在しない
- Managed adapter: 同様
- Claude adapter: 観測値がゼロなら `snapshot()` が undefined を返す
- 静的解析テスト（TC-011）でテスト固定

**AC-6: job 完了後に step / model / provider 単位で context metrics を確認できる**
- `usage-show.ts` に `context:` 行を追加。`contextMetrics` が absent なら行を出さない
- `modelUsage: null` の halt 由来 entry でも `context:` 行が表示される
- TC-034 / TC-035 / TC-016 でテスト固定

**AC-7: 既存 `ModelUsage` / cost 集計の意味を変更しない**
- halt 経路の usage entry は `modelUsage: null` かつ invocation metrics（numTurns 等）を持たない
- `build-attestation.ts` の `modelUsage === null` 分岐で `stepHasUnpriced = true` を設定せず `continue` に変更（halt entry が後続 retry-success entry の cost 計算を誤って抑制しないための修正）
- TC-017 / TC-018 / TC-ATT-06 / TC-ATT-07 でテスト固定

**AC-8: Claude / Codex adapter のどちらか一方の仕様を core 契約として固定しない**
- `AgentContextMetrics` に `trigger` / `compactionPolicy` / 閾値フィールドなし
- `provider` は自由文字列として保持するだけ
- 全 optional field → provider が増えても core 契約を変えずに部分実装可能

**AC-9: typecheck / test green**
- 全テストファイルを確認。各テストが spec Scenario を網羅していることを確認

### Spec Requirements / Scenarios

**Requirement: context metrics は累計 ModelUsage と別の型で表現される**
- Scenario "ModelUsage の形が変わらない": 4 field のまま確認 ✅
- Scenario "context metrics が独立型として存在する": `AgentRunResult.contextMetrics` 独立確認 ✅

**Requirement: Claude adapter は provider が報告した active context の peak を記録する**
- Scenario "複数 turn の assistant message から最大値を採る": context-observer peak logic 確認、TC-003 ✅
- Scenario "sub-agent と replay の message は peak に数えない": 除外ロジック確認、TC-004 ✅
- Scenario "同一 message を二重に数えない": 各ループで 1 呼び出しのみ確認 ✅

**Requirement: Claude adapter は provider native compaction の発火を記録する**
- Scenario "観測済み invocation では compaction 0 回が明示される": `peakActiveContextTokens !== undefined || contextWindowTokens !== undefined` の場合に `compactionCount ?? 0` を明示 ✅
- Scenario "compaction 2 回で回数と直近の前後値が残る": 後勝ちロジック確認、TC-006 ✅
- Scenario "after 値を返さない compaction": `contextTokensAfterCompaction = undefined` リセット確認、TC-007 ✅

**Requirement: context exhaustion 時に観測できていた context size が残る**
- Scenario "溢れ直前の観測値が exhaustionAtTokens になる": `markExhaustion` ロジック確認、TC-008 ✅
- Scenario "観測が無い場合は値を作らない": undefined 維持確認、TC-009 ✅
- Scenario "context 溢れ以外の失敗では exhaustionAtTokens を付けない": fail-closed 確認、TC-010 ✅

**Requirement: 報告能力の無い provider では context metrics を捏造しない**
- Scenario "Codex / Managed runtime は unavailable": static analysis テスト確認 ✅
- Scenario "観測ゼロの invocation では record を作らない": snapshot() undefined 確認 ✅

**Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる**
- Scenario "成功 step の context metrics が usage.json に残る": `applySuccessPostPersistEffects` 確認、TC-013 ✅
- Scenario "exhaustion で halt した step の metrics が usage.json に残る": `commitHalt` best-effort append 確認、TC-014 ✅
- Scenario "usage show が context 行を表示する": `usage-show.ts` context: 行確認、TC-034 ✅
- Scenario "context metrics を持たない entry では context 行を出さない": TC-016 ✅

**Requirement: 既存の usage / cost 集計の意味を変えない**
- Scenario "halt entry が cost 集計を動かさない": TC-017 ✅
- Scenario "context metrics の無い halt では entry を追加しない": TC-018 ✅

**Requirement: core 契約は provider 中立に保たれる**
- Scenario "core 型に provider 固有語彙が無い": `AgentContextMetrics` 定義確認 ✅
- Scenario "片方の provider だけが実装しても core が壊れない": Codex/Managed undefined 処理確認 ✅

### Architecture Invariants

| Invariant | Status |
|---|---|
| B-2: SDK 封じ込め（SDK 型は adapter 内） | `context-observer.ts` は `type import` のみ使用 ✅ |
| B-3: shared-kernel は domain を import しない | `src/kernel/context-metrics.ts` の import 文ゼロ ✅ |
| B-13: store 書き込みは CommitOrchestrator が唯一のオーナー | `appendInvocation` は CommitOrchestrator 内のみから呼ばれる ✅ |

### Tasks.md

全 T-01〜T-08 の checkbox が ✅ 状態。実装完了。

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実機実行（conformance step は read-only review）。verification-result.md で green が確認済みであることを前提とする。

## Findings 詳細

指摘なし。normative violations なし。
