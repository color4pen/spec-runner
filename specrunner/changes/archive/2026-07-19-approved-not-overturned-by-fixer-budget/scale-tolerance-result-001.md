# Scale-Tolerance Review: approved-not-overturned-by-fixer-budget

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## Scope

変更対象:
- `src/core/pipeline/pipeline.ts` — T-03 再 routing ブロック挿入（+72 行）
- `src/core/pipeline/reviewer-chain.ts` — `lastReviewerFixableCount` 純関数追加（+14 行）
- `src/kernel/event-types.ts` / `src/core/event/types.ts` — 新 DomainEvent 型追加
- `src/logger/pipeline-logger.ts` / `src/cli/progress.ts` — event 購読追加
- テストファイル追加（1384 行）

## 観点：単調増加する対象へのコスト比例チェック

対象カテゴリ:
- archive（`specrunner/changes/archive/`）
- sidecar（`.specrunner/local/<slug>/`）
- GitHub issue / PR
- コメント
- journal（`events.jsonl`）

### 走査 / ロード

**archive / sidecar 走査なし**: 新規コードはいずれも `state` 引数（メモリ内 `JobState`）のみを参照する。ファイルシステム上の archive ディレクトリや sidecar ディレクトリを走査する処理は追加されていない。

**journal 走査なし**: `events.jsonl` への書き込み（`PipelineLogger.write` 1行）のみ。既存 `appendHistoryEntry` も append-only で、history の全件スキャンは発生しない。

**GitHub API 呼び出しなし**: 新規コードに GitHub REST / GraphQL 呼び出しは存在しない。

### `lastFindingsOf(state, reviewer)` の計算量

```ts
const runs = state.steps?.[reviewer] ?? [];   // O(1) ハッシュ参照
const lastRun = runs[runs.length - 1];          // O(1) 末尾参照
return toolResult?.findings ?? [];
```

`state.steps[reviewer]` の配列長は `maxIterations`（設定値、既定 2〜3）に上限される。外部の単調増加量（archive 件数・issue 件数等）には比例しない。`collectFixableFindings` は findings 配列の線形フィルタ（O(findings_per_run)）で、1 回のレビュー実行あたり返却される finding 件数に上限される。

### `this.transitions.find(...)` の計算量（line 453）

```ts
const cleanTransition = this.transitions.find(
  (t) => t.step === currentStep && t.on === "approved" && ...
);
```

`this.transitions` は pipeline 構築時に確定する静的な遷移テーブルで、サイズは custom reviewer 数（`specrunner/reviewers/` 内のファイル数）に比例する。これは時間とともに単調増加する外部カウントではなく、リポジトリ設定の定数。

### `new Set(Object.values(this.loopFixerPairs))` の繰り返し生成

line 440 で `fixerNamesForReroute` を生成し、line 523 と 561 でも同型の `fixerNames` を生成している。これはメインループの各イテレーションで計算されるが：

- `loopFixerPairs` は reviewer 数（O(1〜5) 程度）に比例する小さな Record
- ループ外にキャッシュする最適化は可能だが、コスト規模は無視できる（単調増加する外部量との比例なし）

この点は観察として記録するが、現行スケールでブロッカーとなる水準ではない。

### event emit（line 465）

`this.events.emit("pipeline:fixer:budget-skipped", ...)` は同期的な単一イベント発火。`PipelineLogger` が 1 行 JSONL を追記、`ProgressDisplay` が 1 行 stderr 出力を行う。どちらも O(1) で単調増加する外部量に依存しない。

### HistoryEntry append（line 471）

`appendHistoryEntry` は state.history への append 操作。history 配列長は `steps × iterations` に比例（設定上限あり）。archive 件数・journal 行数とは無関係。

## Findings

なし。新規コードはすべて：
- in-memory JobState 内の固定サイズ（`maxIterations` 上限）データを参照
- ファイルシステム・GitHub API・journal の読み取り走査を追加しない
- journal への書き込みは O(1) append のみ

単調増加する外部量（archive・sidecar・issue/PR・コメント・journal 件数）に対してコストが比例成長するコードは検出されなかった。

## Observations

- **`fixerNamesForReroute` の重複生成**（`pipeline.ts` line 440、523、561）: ループ内で同一 Set を 3 箇所に生成している。現行スケールで問題にはならないが、ループ前のキャッシュで実装を整理できる余地がある。スケール上のリスクは無く fixable 相当。
