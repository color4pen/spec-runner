# Spec Review Result — cli-run-progress-display

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-07

## Summary

request.md の 5 要件すべてが proposal / design / tasks で網羅されており、既存コードベースとの整合性も検証済み。EventBus の全イベント（step:start/complete/error, verdict:parsed, pipeline:complete/fail）は実装済みで emit されているが subscriber=0 の状態にあり、設計が前提とするインフラは揃っている。`runPipeline` / `runProposePipeline` の signature 拡張、`logWarn` の verbose guard、CLI フラグ解析はいずれも局所的な変更で後方互換を維持する。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:99-100 | D4 出力例で `step:complete` 時に `→ [next-step] running...` を同じ行に含めているが、Risks セクション（L135）で「complete 行には含めない方がシンプル」と矛盾。実装者が迷う | D4 の出力例を Risks の結論に合わせて `→ [next-step]` 部分を除去するか、Risks の記述を削除して D4 を正とする |
| 2 | LOW | completeness | tasks.md | `pipeline:fail` handler（task 4.8）の出力仕様が曖昧。failure reason のフォーマットが未定義 | design.md D4 に fail 時の出力例を追記する（例: `Pipeline failed: <reason>`） |
| 3 | LOW | consistency | design.md:117 | `runProposePipeline` への EventBus 注入（task 3.3）について design.md の D2 では `runPipeline` のみ記述。propose pipeline の呼び出し元がどこで EventBus を渡すかの記載がない | D2 に `runProposePipeline` の同様の変更を明記する。呼び出し元（run.ts 内の分岐）での配線も tasks に含まれているため実装上は問題ないが、設計文書としての一貫性のために追記推奨 |

## Completeness Check

| 要件 | proposal | design | tasks | 判定 |
|------|----------|--------|-------|------|
| step 遷移の stdout 表示 | ✓ progress-display | ✓ D1, D4 | ✓ 4.1-4.6 | OK |
| 各 step の所要時間表示 | ✓ progress-display | ✓ D4 | ✓ 4.4 | OK |
| 完了時の next action 表示 | ✓ proposal L13 | ✓ D4 L96 | ✓ 4.7 | OK |
| --verbose で warning 抑制 | ✓ cli-verbose-flag | ✓ D3, D6 | ✓ 1.1-1.3, 2.1-2.3 | OK |
| EventBus subscriber 方式 | ✓ run-pipeline-eventbus | ✓ D2 | ✓ 3.1-3.4, 5.1-5.2 | OK |
| typecheck + test green | — | — | ✓ 6.4-6.5 | OK |

## Feasibility

- EventBus は同期 pub/sub で subscriber 登録後に即 emit を受け取れる。タイミング問題なし
- `setVerbose` のグローバル state はテスト並列実行時に競合リスクあるが、Bun test はデフォルトで直列実行のため実害なし。design.md で afterEach リセットにも言及済み
- `runPipeline` の第3引数追加は後方互換（optional parameter）。既存の呼び出し元に影響なし
