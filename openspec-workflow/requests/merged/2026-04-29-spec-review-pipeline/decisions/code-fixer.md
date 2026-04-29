# Code Fixer Decisions

## Fix History (Iteration 1)

### Finding #1 (HIGH) — findings サマリが stdout に伝搬しない

`StepResult` に `fileContent?: string | null` フィールドを追加する :: `run.ts` が `finalState.steps["spec-review"]` 経由でファイル内容にアクセスできる唯一の経路。`PipelineDeps` を CLI まで引き回す代替案は依存が増えるため最小変更を優先した。

`runSpecReviewStep` の step 6 で `fileContent` を `appendStepResult` に渡す :: `fileContent` は step 4 で取得済みのローカル変数。最小箇所の追加で済む。

`outputSpecReviewVerdict` で `specReviewResult.fileContent ?? undefined` を `parseSpecReviewFindingsSummary` に渡す :: `undefined` ハードコードを state 経由の実値に置換するだけ。既存ロジックは変更不要。

### Finding #2 (HIGH) — propose 失敗時に stale jobState を返す

propose.ts の各 `throw` 直前に `(err as Record<string, unknown>)["state"] = state;` を追加する :: `spec-review.ts` が採用済みのパターン。コードベース内で一貫した規約になる。新しい型や抽象は不要。

`runPipeline` の propose catch で `errWithState.state` を優先して返す :: spec-review の catch と対称にする。`jobState` fallback は残して最悪ケースに備える。

### Finding #4 (MEDIUM) — 動的 import の残存

`propose.ts:374` の dynamic import を `await persistJobState(state)` に置換する :: `persistJobState` は line 3 で静的 import 済み。単純な 1 行置換で一貫性が回復する。

### Finding #7 (LOW) — 未使用 import isProposeComplete

`propose.ts` の import から `isProposeComplete` を削除する :: 未使用シンボルはバンドルサイズと可読性に悪影響。typecheck でも警告対象。

### Finding #8 (LOW) — 未使用 import updateJobState

`pipeline.ts` の import から `updateJobState` を削除する :: 同上。
