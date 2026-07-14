# Scale-Tolerance Review: added-turns-persist-and-review-trim

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## Scope

Reviewer paths (`src/store/**`, `src/adapter/github/**`, `src/core/inbox/**`, `src/logger/**`) にヒットする変更は `src/store/event-journal.ts` のみ。`src/adapter/claude-code/agent-runner.ts` と `src/core/step/code-review.ts` はスコープ外だが、scale への影響を補足として確認した。

## Findings

なし。

## Analysis

### src/store/event-journal.ts — journal fold への影響

`fold()` は events.jsonl 全体を 1 パスで走査する O(n) 関数（n = レコード件数）。これは本変更以前から存在するパターンであり、変更はこの走査に以下の 2 点を追加するだけ：

1. **`StepAttemptRecord.outcome` への optional field 追加** (`addedTurns?: { reportRetry: number; postWork: number; outputRepair: number }`) — 固定サイズ（3 整数）、件数に比例して肥大しない
2. **`fold()` 内に conditional-spread 1 行追加** — 既存の `followUpAttempts` / `transientRetryAttempts` 等と同一パターン、O(1) per record

追加コストは「既存 O(n) 走査 1 イテレーションに O(1) 演算が 1 つ増える」だけで、成長軸（n）は変わらない。

`fold()` の呼び出し経路は crash-recovery（`job resume` 手動コマンド）と archive 閲覧の 2 つ。どちらも手動コマンド起点であり、定期実行（tick / exit-guard / polling ループ）経路ではない。また journal はジョブ単位（per-job）であり、全ジョブを横断するグローバル走査ではない。

**判定基準への照合**: 「成長依存のコストが手動コマンドに限定され、かつ走査前フィルタで必要分しか読まない」— 該当。approved 基準を満たす。

`stepRunToRecord()` も同様に conditional-spread 1 行追加のみ（step 完了時に 1 回、O(1)）。

### src/core/step/code-review.ts — followUpPrompt 除去（補足）

`followUpPrompt` の削除はコードレビュー step が実行されるたびに発火していた無条件の post-work API 呼び出しを 1 件削減する。定期実行ではなくジョブ内 1 回の手動起点だが、累積 API コストを減らす方向の変更。スケールに対して改善。

### src/adapter/claude-code/agent-runner.ts — addedTurns 会計（補足）

`postWork++` の移動、`ADDED_TURNS_ZERO` 定数の付与、エラー経路への `addedTurns` 付与はすべてカウンタ操作・定数参照であり O(1)。新規の走査・API 呼び出し・ファイルスキャンは皆無。

## Observations

| # | Severity | File | Title | Rationale |
|---|----------|------|-------|-----------|
| 1 | low | src/store/event-journal.ts | fold() は per-job O(n) 走査 — 既存設計 | addedTurns 追加は影響しないが、ジョブ内ステップ数が非常に多くなると fold コストは線形増加する。現状のジョブあたりステップ数（~13）では問題にならない。将来ステップ数が大幅に増える場合は indexed projection への移行を検討する価値がある。本変更の作為ではなく既存設計の性質。 |
