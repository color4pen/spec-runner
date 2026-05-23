# Spec Review Result: executor-pipeline-cleanup

- **verdict**: approved
- **date**: 2026-05-23
- **scope**: Lightweight (behavior-preserving refactoring)

---

## Architecture

**Decision 1 (commit-push.ts の配置)**: `src/core/step/commit-push.ts` は既存の `executor-helpers.ts` と同じ sibling-file パターンに合致。commit/push は step 後処理であり step ドメインに属するという判断は妥当。`gitExec`/`gitExecExitCode` が引き続き `util/git-exec.ts` に留まる（低レベル層に触らない）点も正しい依存方向。

**Decision 2 (Free functions + CommitPushInfra)**: `commitAndPush`/`pushOnly` は instance state を持たず `spawnFn`/`sleepFn`/`events` を受け取るだけで十分。class 化すると `StepExecutor` が中間サービスを持つ間接層が増えるだけ、という判断は合理的。

**Decision 3 (printPipelineFinished を Pipeline class の private method)**: 3 箇所とも `this.steps`（Map）にアクセスするため class method が自然。free function にすると `steps: Map` を引数で渡す必要が生じる。正しい設計。

依存方向: `commit-push.ts` が参照するのは `./types.js`（同層）・`../../state/schema.js`（下位）・`../../util/git-exec.js`（下位）等であり、循環なし。

---

## Correctness

### pipeline.ts stdout 3 ブロックの同一性確認

コードを直接照合した結果、L262-268 / L320-326 / L346-352 の 3 ブロックはすべて完全に一致している：

```ts
if (this.steps.has(STEP_NAMES.SPEC_REVIEW)) {
  const specReviewResults = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
  const finalVerdict = getLatestStepResult(state, STEP_NAMES.SPEC_REVIEW)?.verdict ?? "escalation";
  stdoutWrite(
    `Pipeline finished: spec-review iterations=${specReviewResults.length}, final verdict=${finalVerdict}\n`,
  );
}
```

`printPipelineFinished` の設計 API もこの構造と一致。stdout 文言不変。✓

### regression 注意箇所の検証

| 箇所 | 検証結果 |
|------|---------|
| `commitAndPush` catch (L234-246) が executor.ts に残る | design.md・tasks.md とも明記。エラー記録経路不変。✓ |
| `commitAndPush` 内の `this.pushOnly` 呼び出し 2 箇所（L313, L337） | "機械的に置換" で `pushOnly(branch, cwd, step.name, infra)` へ変換。tasks に包含。✓ |
| `stderrWrite` の import — executor.ts に残るか | `finalizeStep` L458 でも使用中。tasks に「他で使っていないか確認」と明記。削除してはならないことが正しく識別されている。✓ |
| `requiresCommit` guard + silent exit | `commitAndPush` 全体を移動するため挙動不変。✓ |
| `tryPush` 5 秒 retry (`sleepFn` injectable) | `infra.sleepFn` として注入経路が維持される。✓ |
| authority spec 検出と escalation | `findAuthoritySpecViolations` を `commit-push.ts` に export するため挙動不変。✓ |

### import 整理

`noCommitDetectedError`・`pushFailedError`・`authoritySpecEditViolationError` は `commitAndPush`/`pushOnly` 内でのみ使用。移動後に executor.ts から削除して良い。tasks に明記。✓

---

## Completeness (task decomposition)

| 要件 | 対応タスク |
|------|-----------|
| commit/push を `commit-push.ts` に抽出 | Task 1.1 + 1.2 |
| executor.ts を薄い orchestrator に | Task 1.2 |
| pipeline stdout 3 箇所を 1 helper に集約 | Task 2.1 + 2.2 |
| 振る舞い不変（spec scenario green） | Task 1.3 + 2.3 + Task 3 |

カバレッジ完全。行数目標が「努力目標」と明記されており、振る舞い保持優先が正しく指示されている。

---

## 総評

設計判断・API 設計・タスク分解のいずれも妥当。既存コードとの照合で設計と実装の乖離は見つからなかった。実装リスクは低い。
