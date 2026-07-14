# Cross-Boundary Invariants Review — round-owned-state-commit — iter 1

## Reviewer

cross-boundary-invariants

## Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope

変更ファイル（`git diff main...HEAD`）:

- `src/core/pipeline/parallel-review-round.ts` — rewire（D3/D4）
- `src/core/pipeline/reviewer-status.ts` — `verdictOfResult` 追加（T-01）
- `src/core/step/executor.ts` — `produceResult` 追加（T-02）
- `src/core/step/commit-orchestrator.ts` — `commitRound` 追加（T-03）
- 対応テスト群（新規 + 既存更新）

---

## Findings

### F-001: StepRun.startedAt のセマンティクスが逐次経路と round 経路で異なる（intentional design, LOW）

**観測点**: `CommitOrchestrator.commitRound` は `members` エントリの `startedAt`（`memberStartTimes` から、`produceResult` 呼び出し前に set）を `pushStepResult` の `startedAt` として使う。一方、逐次経路の `commitSuccess` は `result.startedAt`（`runAgentStep` 内で activation check / context build / `prepareStepArtifacts` の**後**に capture）を使う。

```
outer startedAt（memberStartTimes）: produceResult 呼び出し前
inner startedAt（result.startedAt）: runAgentStep 内、setup 後
```

`commitRound` の destructuring では `result.startedAt` を取り出さず、member entry の `startedAt`（outer）を優先している:

```typescript
const { completion, completedAt, session, modelUsage: _modelUsage, ... } = result;
// startedAt は result から取らず、member entry { step, startedAt, result } の startedAt を使う
state = pushStepResult(state, step.name, { ..., completedAt, startedAt, ... });
```

**影響**: `StepRun.startedAt` が round 経路では逐次経路より早い（setup 時間を含む）。design.md の D2 は member entry に `startedAt` を別フィールドで渡す構造を明示しており、これは `CommitOrchestrator.begin()` の `{member}-started` history timestamp と揃える**意図的な設計選択**と判断する（`begin()` は producer 実行前に timestamp を記録する）。

**判定**: NOT-A-BUG（意図的）。タイミングメトリクスのみへの影響。他 invariant への連鎖なし。

---

### F-002: pipeline のループ step 終了時 history エントリが coordinator round 後に in-memory のみで残る可能性（LOW）

**観測点**: `pipeline.ts` の `if (isAnyLoopStep)` ブロック（line 328-333）は `appendHistoryEntry`（pure function）で in-memory state を更新するが、この時点では persist しない。coordinator path はその前に `commitRound` で 1 回 persist 済みであり、pipeline `else` ブロック内の crash-resilience `store.persist`（line 300）を通らない。

coordinator が loop step（`loopNames.includes(coordinatorName)`）である通常構成では:

1. `commitRound` → persist ✓
2. `appendHistoryEntry`（pure）→ in-memory のみ
3. 非 terminal 時: `transitionStore.appendHistory(state, ...)` → persist ✓
4. terminal 時: `endStore.persist` / `escalateStore.persist` → persist ✓

非 terminal・terminal のいずれでも 3 or 4 で on-disk に書き込まれる。crash が 2→3 間に発生すると loop iteration history エントリが欠落するが、これは functional state ではなく観測可能な簿記エントリ（`${coordinatorName} iteration N completed with verdict: ...`）に限られる。pipeline の restart は `commitRound` 後の状態（全 member + coordinator StepRun 含む）から正しく再開できる。

**判定**: NOT-A-BUG。loop iteration history エントリの欠落は pipeline の resume/re-execution の正確性に影響しない。逐次 step も同様の crash window（`store.persist`（line 300）→ `appendHistory`（line 487）間）を持つため、新規に導入された窓ではない。

---

### F-003: `commitSkipped` と `commitRound` の `verdict:parsed` emit 順序の微差（INFO）

**観測点**:
- 逐次 `commitSkipped`: `store.appendHistory`（内部で persist）→ `verdict:parsed` emit → `store.persist`（二重）
- `commitRound` skipped: `store.persist`（単一）→ `verdict:parsed` emit

両ケースとも「emit は persist 後」という invariant は満たす。順序差は subscriber が emit 時に state.json を読み直す場合にのみ観測可能（通常の実装では in-memory state を受け取るため影響なし）。

**判定**: NOT-A-BUG。emit 後に persist が追いかける逆転はなく、既存 invariant（"state is committed before handlers react"）を破らない。

---

## Core Invariants — 確認済み ✓

| 不変条件 | 確認内容 | 結果 |
|---------|---------|------|
| **B-13 並列経路** | `produceResult` が `store.persist/update/appendHistory/fail` を一切呼ばない | ✓ |
| **単一 commit** | `commitRound` が `store.persist` をちょうど 1 回呼ぶ | ✓ |
| **部分 projection 非発生** | fan-out 途中に中間 state が on-disk に書かれない | ✓ |
| **verdict 集約不変** | `verdictOfResult` + `aggregateVerdict` が旧 `mergeParallelReviewerStates` + StepRun 読み出しと等価 | ✓ |
| **reviewer status 不変** | `applyRoundResults` / `computeInvalidations` は非改変 | ✓ |
| **逐次経路不変** | `execute` / `CommitOrchestrator` 逐次メソッドは非改変 | ✓ |
| **member halt で job 非 fail** | `commitRound` halt 畳み込みが `store.fail` / `transitionJob` を呼ばない | ✓ |
| **R5 git-effects 順序** | git effects ブロックが `commitRound` の前に実行される | ✓ |
| **fast path（pending=[]）** | `members: []` で coordinator patch + 単一 persist が成立 | ✓ |
| **rejection 正規化** | `produceResult` は reject しない（`Promise.allSettled` の rejection は step not found の programming error のみ） | ✓ |
| **`findingsPath` 正確性** | `base` を使う計算が `nextIteration(base, member)` として正しく、逐次 `state-after-begin` と等価 | ✓ |
| **`state.step` 不変** | `commitRound` 後の `state.step` は coordinator 名（旧 merge 後と一致） | ✓ |
| **architecture/ 非改変** | スコープ外の trust-root ファイルに触れていない | ✓ |

---

## 判定根拠

F-001〜F-003 はいずれも functional correctness に影響しない。F-001 は意図的設計（design.md に明示）、F-002 は逐次経路も同等の crash window を持つ既知パターン、F-003 は persist invariant を破らない emit 順差。コアの invariant 群（member no-persist / 単一 commit / 部分 projection 非発生 / 結果不変）はすべて確認済み。

- **verdict**: approved
