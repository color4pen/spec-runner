# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### spec ファイル全体の読み込みと整合性確認

- **request.md**: 背景・要件（1〜4）・受け入れ条件・スコープ外・#1058 との関係を確認
- **design.md**: D1〜D9 の設計決定と代替案・リスク・Open Questions を確認
- **spec.md**: 6 Requirement × 各 Scenario を確認
- **tasks.md**: T-01〜T-08 の実装タスクと Acceptance Criteria を確認
- **test-cases.md**: TC-001〜TC-039（計 39 件）の構造・出典・GWT 完全性を確認

### 受け入れ条件 → spec.md 要件のマッピング検証

| 受け入れ条件 | 対応 Requirement | 設計決定 |
|---|---|---|
| 累計 ModelUsage と active context metric が意味上・型上区別される | context metrics は累計 ModelUsage と別の型で表現される | D1（独立型 AgentContextMetrics）|
| provider が active context size を報告できる場合 peak を記録できる | Claude adapter は provider が報告した active context の peak を記録する | D4（assistant message usage の最大値）|
| provider が compaction を報告できる場合 回数と before/after を記録できる | Claude adapter は provider native compaction の発火を記録する | D4（compact_boundary event）|
| context exhaustion 時 context size が残る | context exhaustion 時に観測できていた context size が残る | D4 + D7（halt 経路 usage.json append）|
| 取得できない provider では捏造しない | 報告能力の無い provider では context metrics を捏造しない | D6（Codex/Managed は undefined）|
| job 完了後に step/model/provider 単位で確認できる | context metrics は usage.json に永続化され確認できる | D7（usage.json）+ D8（usage show）|
| 既存 ModelUsage/cost 集計の意味を変更しない | 既存の usage/cost 集計の意味を変えない | D7（halt entry は modelUsage:null）|
| Claude/Codex 片方の仕様を core 契約として固定しない | core 契約は provider 中立に保たれる | D9（optional field, provider は文字列）|
| typecheck/test green | T-08（全体回帰確認）| — |

すべての受け入れ条件に対応する spec.md Requirement が存在する ✓

### spec.md Scenario → test-cases.md TC マッピング検証

- TC-001〜TC-020 が spec.md の全 Scenario（20 個）を 1:1 カバーしている ✓
- TC-021〜TC-039（非 Scenario 由来）はすべて GWT を持つ ✓

### タスク依存関係の検証（T-01 → T-08 順序）

- T-01: `AgentContextMetrics` 型新設 → 後続タスク全体の前提 ✓
- T-02: `CommandInvocation.contextMetrics` 追加（T-01 の型に依存）✓
- T-03: `context-observer.ts` 実装（T-01 の型に依存）✓
- T-04: runner への observer 配線（T-03 に依存）→ `AgentRunResult.contextMetrics` が得られる ✓
- T-05: `StepHalt` / `StepExecutionResult` に contextMetrics 追加（T-01 + T-04 に依存）✓
- T-06: `CommitOrchestrator` での永続化（T-02 + T-05 に依存）✓
- T-07: `usage show` の context 行追加（T-02 に依存）✓
- T-08: 全体回帰（T-01〜T-07 完了後）✓

### アーキテクチャ制約との整合性

- **B-2 SDK 封じ込め**: `context-observer.ts` は adapter 層（`src/adapter/claude-code/`）に配置 ✓
- **B-3 shared-kernel は domain を import しない**: `src/kernel/context-metrics.ts` は他 module を import しない純粋型 module ✓
- **B-13 CommitOrchestrator 単一書き込みオーナー**: context metrics の usage.json 書き込みは `applySuccessPostPersistEffects` と `commitHalt` 経由で CommitOrchestrator が担う ✓
- **B-14 StepHalt 適用は CommitOrchestrator のみ**: executor は halt を返すだけで、apply → commitHalt の経路を変えない ✓

### 後退不変（TC-019 互換性）

既存 `tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts` の TC-019「error subtype の metrics は usage.json に記録されない」は、`contextMetrics` を持たない halt では append しないという D7 の設計で維持される ✓

### cost 集計不変の論理検証

- halt 由来 entry: `modelUsage: null`、invocation metrics フィールド（numTurns / durationMs / durationApiMs / totalCostUsd）なし
- `usage summary` は `inv.modelUsage` が falsy なら skip → 数値不変 ✓
- `job stats` は cost/turns を持つ entry のみ加算 → 数値不変 ✓

### `compactionCount` の "直近 before/after" 仕様の一貫性

- design.md D3: "後勝ち = 直近の compaction が残る"
- tasks.md T-03: `post_tokens` が無い場合は before のみ更新し after は前回値を残さず undefined にする
- spec.md Scenario「compaction 2 回で回数と直近の前後値が残る」/ 「after 値を返さない compaction」
- TC-006 / TC-007 がこれを検証 ✓

### parallel round member halt の既知限界

design.md Risk #4 に「parallel round（custom reviewer）member の halt では usage.json append 経路が無い」と明記されている。`CommitOrchestrator.commitRound` は halt 時に `recordFailedStepResult` のみ（`commitHalt` を呼ばない）。これは既存動作と整合しており、本機能の観測対象（implementer / fixer）は sequential step であるため受け入れ可能な限界として設計に明記されている ✓

### セキュリティレビュー

- **新規ネットワークアクセス**: なし（context metrics は SDK が返した値を記録するだけ）
- **入力バリデーション**: `isContextExhaustionError` は allowlist 方式で fail-closed（未知 error → false）
- **SDK 起源の数値**: `peakActiveContextTokens` 等はすべて provider が単一 request について報告した数値（ユーザー制御入力ではない）
- **usage.json 書き込み**: 既存の `atomicWriteJson` を使う（partial write 防止）
- **OWASP Top 10**: 新規 attack surface なし。injection リスクなし（`isContextExhaustionError` は substring 照合のみ）

## 検証できなかった項目

### node_modules SDK 型の直接検証

design.md は `@anthropic-ai/claude-agent-sdk/sdk.d.ts` の具体的な行番号（L2364 等）を参照しているが、worktree 内の node_modules を直接読み込んで確認はしていない。design が「SDKCompactBoundaryMessage」「compact_metadata.pre_tokens / post_tokens」等を正確に参照していることは設計者の事前調査に基づく。

### Codex / Managed adapter の実行時動作

`contextMetrics` が実際に `undefined` で返ることは、T-08 で追加される新規テストで確認される予定。現時点ではソースコード上「設定しない」ことの doc comment 追加のみが指定されており、動作の確認はテスト追加後となる。

### `isReplay` フィールドの SDK 定義

tasks.md T-03 で "isReplay !== true" を観測フィルタ条件として記載しているが、SDK の `SDKAssistantMessage` における正確なフィールド名・位置は node_modules 未参照のため直接確認していない。spec.md は「過去 session の replay を除く」と記述しており、フィールド名の特定は design.md / tasks.md の実装詳細に委ねられている。

## Findings 詳細

### F-01: T-02 テストファイル名が未指定（LOW）

tasks.md T-02 は「`tests/unit/core/usage/` に型 round-trip テストを追加する（`invocation-types.test.ts` と同じスタイルで」と記述しているが、新規ファイルを作成するか既存 `invocation-types.test.ts` を拡張するかが明示されていない。TC-023 / TC-024 はテストファイルパスを指定していない。

実装上の影響は軽微（どちらでも AC を満たせる）。`invocation-types.test.ts` を拡張する場合は既存のファイルが context metrics に関する TC と invocation metrics に関する TC を混在させることになる。別ファイル（例: `context-metrics-types.test.ts`）とする方が保守性は高い。

### F-02: executor の agent throw halt 経路では contextMetrics が伝播しない（LOW）

executor.ts は `runner.run()` が throw した場合に `makeAgentThrowHalt(thrownErr, ...)` を使うが、このとき `runResult` が得られないため `contextMetrics` は halt に含まれない。

これは設計上 acceptable（runner が throw するのは context exhaustion ではなく SDK 内部エラー等であり、context 観測値は runner 内の catch 節で AgentRunResult に乗って返るよう T-04 が指定している）。spec.md の文言「exhaustion で halt した step の metrics が usage.json に残る」は runner が AgentRunResult を返す正常失敗経路（`completionReason: "error"`）を指しており、runner が throw する例外経路とは区別されている。

設計の意図は明確だが、この区別は spec.md には明示されておらず、実装者が design.md/tasks.md T-04 を注意深く読まなければ誤解する可能性がある。

### F-03: spec.md が contextWindowTokens の multi-model 解決ロジックを記述していない（LOW）

spec.md は「その invocation で認識された context window」と抽象的に記述するのみで、複数 model が含まれる場合（resolved model 優先、無ければ最大値）を明示していない。これは design.md D4 に記載されている。spec.md に Scenario か note を追記することで実装者の迷いを減らせる。

機能的には影響なし（設計は D4 で明確）。
