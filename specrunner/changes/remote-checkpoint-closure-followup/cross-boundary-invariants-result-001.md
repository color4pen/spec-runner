# Cross-Boundary Invariants Review — remote-checkpoint-closure-followup — iter 001

- **verdict**: approved
- **iteration**: 001

## Scope

| # | File | 変更概要 |
|---|------|---------|
| 1 | `src/core/pipeline/pipeline.ts` | guard-halt 終端ガード（line 335-339）+ `getStepOutcome` 硬化（line 613-615） |
| 2 | `src/core/worktree/manager.ts` | `branchWasPreExisting` → `preserveBranchOnFailure` リネーム、cleanup 条件変更 |
| 3 | `src/core/runtime/workspace-materializer.ts` | attach arm の事前 `rev-parse` 削除、`preserveBranchOnFailure: true` 無条件渡し |
| 4 | `src/core/attach/verify-checkpoint.ts` | `reads()` throw → fail-closed（`checkpointNotAttachableError`） |
| 5 | `tests/attach/attach-resume-e2e.test.ts` | 主役 E2E（real git + 実 Pipeline.run()） |
| 6 | `tests/core/pipeline/pipeline.guard-halt.test.ts` | guard-halt unit tests（TC-GH-001..006） |
| 7 | `tests/attach/workspace-materializer-attach.test.ts` | attach arm の materializer tests |
| 8 | `tests/core/worktree/manager.test.ts` | TC-WTM-025/026/027 追加 |
| 9 | `tests/attach/verify-checkpoint.test.ts` | TC-VC-014 追加 |

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | correctness | `src/core/pipeline/pipeline.ts` | **`getStepOutcome` 硬化が escalate terminal 経由で resumePoint を上書きする経路が残る（fail-safe の射程）**。primary guard（line 335）が `break` する前に `getStepOutcome` が `"awaiting-resume"` を返し、transition table が `"escalate"` にフォールバックし、escalate terminal が `transitionJob("awaiting-resume")` を再呼びすると `resumePoint` が上書きされる。設計では「ガード＝enforcement、getStepOutcome＝source of truth + 退行時の安全網」と明記されており、一次ガードの単純 `if` が失敗するシナリオは実運用で想定されない。ただし fail-safe の副作用として resumePoint 上書きが起きることは design.md に明示されていない（"安全側の終端" の説明のみ）。 | design.md の Risks セクションに「万一ガードが bypass された場合、escalate terminal 経由で resumePoint が上書きされる副作用がある」旨を追記するとよい。実装変更は不要（設計判断で accepted のトレードオフ）。 | no |
| 2 | info | correctness | `src/core/pipeline/pipeline.ts` | **loop step の guard-halt 時に "iteration completed" history entry が欠落する**。loop step 開始時に "iteration N started" が appendHistoryEntry される（line 236-241）が、guard-halt break（line 338）は "iteration completed" 記録（line 344-357）の前なので、"started" のみが残る非対称 history になる。design.md の Risks に「halt の interruption record と failed step result が中断を記録するため情報は失われない」と明記されており、コード・テスト・既存コンシューマのいずれも対称 history を前提にしていないため実害はない。 | 情報として記録のみ。変更不要。 | no |

## 不変条件の確認

### I-01: guard-halt → beforeExit 二重遷移が起きない

`exit-guard.ts` の `handlePerJobExit` / `handleNoWorktreeExit` はいずれも `if (state.status !== "running") return` でガードする（line 62, 130）。guard-halt は `store.persist(state)` で `awaiting-resume` を書いてから break → publisher seam に進む。プロセスが `beforeExit` に到達した時点で state は既に `awaiting-resume` → exit guard はスキップ。二重 `transitionJob` は起きない。✅

### I-02: publisher seam は全 awaiting-resume 経路から到達する

- **guard-halt**: line 338 `break` → loop 後の line 528 seam に到達。✅
- **escalation terminal**: line 415 `break` → 同 seam。✅
- **exhaustion terminal**: `tryExhaust` → `handleExhausted` → break → 同 seam。✅

seam は `if (state.status === "awaiting-resume")` で発火し、`commitFinalState` は throw しない（best-effort push）。✅

### I-03: `preserveBranchOnFailure` リネームの呼び出し側不変

`manager.create` の第 7 引数（positional）の boolean 意味・既定値は変わらない（`false` = cleanup する、`true` = しない）。変更前: `branchWasPreExisting=true` が attach arm から渡されていた。変更後: `preserveBranchOnFailure=true` が渡される。値は同一。new-run arm は引数省略（既定 `false` = 変わらず）。TypeScript 型チェック green で確認。✅

### I-04: lock-contention retry の rev-parse は所有証明とは別物

manager.ts line 137-148 の lock-contention retry 中 `rev-parse` は「`-b` 無し args への切り替え用」であり、materializer が削除した「所有証明用 rev-parse」とは別物。`preserveBranchOnFailure=true` の場合もこの retry rev-parse は呼ばれるが、その結果は retry args 決定にのみ使われ、cleanup 判定には使われない（cleanup 条件は `!preserveBranchOnFailure` のみ）。データ損失リスクなし。設計 T-03 が「触らない」と明記。✅

### I-05: reads() fail-closed → verify → materialize の順序不変

`runAttachVerification`（`orchestrator.ts`）は verify が先、materialize が後。`verifyCheckpoint` が `reads()` throw で `checkpointNotAttachableError` を投げると orchestrator は materialize に進まない。job state / worktree / sidecar は作られない。TC-VC-014 と既存 TC-INT-001/002 の no-side-effects 構造で確認。✅

### I-06: E2E テストのストアファクトリとパイプライン状態の整合

Machine B の `machineBStoreFactory = makeStoreFactory(tmpDir)` はテスト隔離用ディレクトリへ書く。`machineBPipeline.run(resumeStep, runningState, machineBDeps)` はパスされた `runningState` をメモリで保持し、`store.persist` は `tmpDir/.specrunner/test-jobs/<jobId>/` へ書く。implementer step の fake runner は実ファイル読み込みをしない（`completionReason: "success"` を即返す）。worktree の `state.json`（checkpoint 由来）とテスト用ストアは用途が分離されており、パイプライン実行に支障なし。✅

### I-07: coordinator/round 経路でのガード発火有無

`fanResult.state` は `commitRound` が設定し、`status` は `"running"` のまま（`commitRound` は個々の halt を verdict として記録するが job を awaiting-resume に遷移させない）。guard-halt check（line 335）は coordinator 分岐では発火しない。round halt は `verdictOfResult → "escalation"` → transition table → escalate terminal → `transitionJob("awaiting-resume")` で正しく終端する。既存挙動不変。✅

### I-08: KeepAlive lifecycle との整合

`pipeline.run()` は guard-halt break → publisher seam → `return state` の正常リターンパスをたどる。KeepAlive sentinel の解放は `run()` 呼び出し元（`command/runner.ts`）が担う。guard-halt は `run()` を例外で抜けるのではなく正常 return するため、KeepAlive は正常に解放される。✅

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.45

## Summary

4 つの correctness hole（guard-halt 終端・branch cleanup race・主役 E2E・reads() fail-closed）に対して、既存機構との暗黙の前提を破る新挙動は**検出されなかった**。

**最重要クロス境界の健全性**:
- guard-halt が `store.persist` → `break` → publisher seam の順で実行されるため、`beforeExit` exit guard との二重遷移は発生しない。
- publisher seam は全 awaiting-resume 経路（guard-halt・escalation terminal・exhaustion）から収束し、`commitFinalState` は throw しないため seam 自体が後続処理を壊さない。
- `preserveBranchOnFailure` はリネームのみで positional 引数の値・既定値・bool 意味が不変。呼び出し側（attach arm = `true`、new-run arm = 省略）の挙動は一致。
- `reads()` fail-closed は verify → materialize の実行順序不変を前提にしており、orchestrator.ts がその順序を保証している。

Finding #1（low）は design.md に "安全側の終端" として記述されているが、fail-safe 発動時に resumePoint が上書きされる副作用の明示が欠けている旨の情報提供であり、実装変更は不要。
