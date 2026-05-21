# Design: cli-step-observable-progress

## Summary

pipeline.ts の stdout 進捗表示を 2 軸で修正する:

1. **bug-fix**: `[iter N/M] starting <step>` が primary loopName (spec-review) しか出ない不具合を修正し、loopNames 全体 (verification / code-review / spec-review) で出力する
2. **spec-change**: 非 loopNames CliStep (dsv / pr-create) に `[step] <name>` 入場・完了表示を追加し silent 区間を解消する

## D1: isLoopStep ガードを isAnyLoopStep に拡大

**現状**: L157 `isLoopStep = currentStep === this.loopName` が L164 のガードに使われ、`[iter N/M] starting ...` は primary (spec-review) のみ出力。

**変更**: L164 のガードを `isAnyLoopStep` に変更。同時に L166 の `this.loopName` を `currentStep` に置換。これにより verification / code-review 入場時も `[iter N/M] starting verification` 等が stdout に出る。

**影響範囲**: L164-166 のみ。`isLoopStep` 変数自体は L240, L345, L361 で引き続き使われるため削除しない。

## D2: verdict / needs-fix 表示の step 名を currentStep に統一

**現状**: L242 / L244 / L346 で `this.loopName` リテラルが使われており、verdict 表示が常に `spec-review verdict: ...` になる。

**変更**:
- L240 のガードを `isAnyLoopStep` に拡大 (= loopNames 全体の terminal verdict を表示)
- L242 / L244 の `this.loopName` を `currentStep` に置換
- L344 のガードも `isAnyLoopStep` に拡大
- L346 の `this.loopName` を `currentStep` に置換

**維持**: L252 の `Pipeline finished: spec-review iterations=N` は primary loop のサマリなので `STEP_NAMES.SPEC_REVIEW` ハードコード維持（既存通り）。

## D3: retries exhausted 表示に exhaust した step 名を追加

**現状**: L304 / L330 で `retries exhausted, escalating` のみ出力。どの loop step が exhaust したか不明。

**変更**:
- L304: `[iter N/M] retries exhausted, escalating` → `[iter N/M] retries exhausted on ${nextStep}, escalating`。`nextStep` は exhaust した loop step を指す。
- L330: `[iter N/M] retries exhausted, escalating` → `[iter N/M] retries exhausted on ${exhaustedLoopName}, escalating`。`exhaustedLoopName` は既に L328-329 で計算済み。

## D4: 非 loopNames CliStep の [step] 入場・完了表示

**設計**: pipeline.ts の step 実行ループ内で、step 実行前後に stdout 出力を追加。

**実装箇所**: `runInternal()` 内、step 実行直前 (L186 付近) と step outcome 確定後 (L211 付近)。

**条件**: `step.kind === "cli" && !this.loopNames.includes(currentStep)`

- 入場: `stdoutWrite(`[step] ${currentStep}\n`)`
- 完了: verdict が non-null なら `stdoutWrite(`[step] ${currentStep}: ${verdict}\n`)`
- verdict が null (= parseResult が null を返した場合) は完了表示なし

**対象 step**: 現状 dsv (verdict: approved / needs-fix / escalation) と pr-create (verdict: success / error / null)。

**除外**: loopNames に含まれる CliStep (= verification) は `[iter N/M]` 表示が優先。AgentStep は本 request 対象外。

## D5: 出力フォーマットの階層

変更後の stdout 出力階層:

| step 種別 | loopNames 含 | 出力 |
|---|---|---|
| 任意 step (loopNames 含) | yes | `[iter N/M] starting <step>` / `[iter N] <step> verdict: ...` |
| CliStep (非 loopNames) | no | `[step] <step>` / `[step] <step>: <verdict>` |
| AgentStep (非 loopNames) | no | silent (本 request 対象外) |

## D6: TC-029 fixture 更新

TC-029 の `expect(stdout).toContain(...)` を `retries exhausted on <step>, escalating` 形式に更新。TC-029 は spec-review が exhaust するシナリオなので `retries exhausted on spec-review, escalating` になる。

## 不採用案

- **全 step に `[step]` 表示**: loop step で二重出力になり冗長。loop 表示は iter 情報を含むため優先。
- **executor.ts で出力**: pipeline 制御フロー (loopNames 判定) が executor に漏れる。pipeline.ts に閉じる。
- **AgentStep にも表示追加**: 別軸の UX 改善。本 request のスコープ外。
