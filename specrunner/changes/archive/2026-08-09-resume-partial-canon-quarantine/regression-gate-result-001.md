# Regression Gate Result — Iteration 1

**Change**: resume-partial-canon-quarantine  
**Date**: 2026-08-09

## Evidence

All three findings from the ledger were verified against the current `tasks.md`
(new file, added in this branch — `git diff main...HEAD` shows full content).

### Finding 1: T-05 に condition 1（startStep ≠ interruptedStep → halt）の TC が欠落

**Status: Fixed (no regression)**

T-05 lines 118–119 in the current `tasks.md`:

```
- [x] TC: `startStep !== interruptedStep`（`--from` で別 step へ redirect）+ 中断裏づけあり + dirty canon
      = design writes → 隔離せず `PrepareError(1)` で halt する（条件 1 不成立で fail-closed）。
```

The condition-1 halt TC is present. Deletion of the else-if branch would make the signal TC
regress to halt — this destruction record is also inline in T-05 (line 120–121).

### Finding 2: T-04 AC が isInterruptedStepPartialCanon に 4 条件すべて含まれると誤読される

**Status: Fixed (no regression)**

T-04 Acceptance Criteria lines 97–99 explicitly state:

```
- `isInterruptedStepPartialCanon` は条件 2/3/4 のみを検証する関数である。条件 1（`startStep === interruptedStep`）は gate 配線（T-03）側で `isInterruptedStepPartialCanon` の呼び出し前に独立チェックされる。本テストでは条件 1 不一致のケースを `isInterruptedStepPartialCanon` に混入させない（条件 1 の欠落テストは T-05 の gate 配線レベルで固定する）。
```

The misread risk is resolved — condition 1 is explicitly carved out and redirected to T-05.

### Finding 3: minimalDeps の as unknown as StepDeps キャストが compile-time 安全性を迂回する

**Status: Fixed (no regression)**

T-03 lines 65–69 carry the obligation note:

```
（minimalDeps = `{ slug: resolvedSlug, request, config }` を `StepDeps` として渡す。
`writes()` が参照するフィールドは現在 `slug` / `request.type` のみだが、将来 `writes()` が
追加フィールドを参照するようになった場合は minimalDeps の構築を同期すること。
未同期でも例外は `declaredCanonWritesForStep` の try/catch が捕捉し `[]` を返すため
fail-closed になるが、runtime エラーになる前に minimalDeps を更新する義務がある。）
```

The ceiling and upgrade obligation are documented in the task body.

## Verdict

No regressions detected. All 3 findings are fixed in the current branch.
