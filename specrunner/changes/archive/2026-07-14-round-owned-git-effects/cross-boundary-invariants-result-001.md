# Cross-Boundary Invariants Review

- **change**: round-owned-git-effects
- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

---

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## 調査範囲

```
src/core/types.ts                     — PipelineDeps に roundOwnsGitEffects 追加
src/core/step/executor.ts             — finalize gate (if !roundOwnsGitEffects)
src/core/step/commit-push.ts          — commitScopedPaths 追加
src/core/port/runtime-strategy.ts     — listWorktreeChanges / commitRoundArtifacts 追加
src/core/runtime/local.ts             — 両メソッド実装
src/core/runtime/managed.ts           — 両メソッド no-op 実装
src/core/pipeline/round-git-scope.ts  — pure partition logic
src/core/pipeline/parallel-review-round.ts — roundDeps / declared / git effects 配線
src/core/pipeline/pipeline.ts         — ParallelReviewRound constructor に events 追加
```

---

## 不変条件チェック

### B-13: StepExecutor が store mutation API を呼ばない

`if (!deps.roundOwnsGitEffects)` gate は git 副作用の分岐のみを追加しており、`store.persist` / `store.fail` 等への新たな呼び出しは存在しない。B-13 は保持されている。

### B-14: StepHalt の適用は CommitOrchestrator が独占する

新しいコードは `makeCommitFailHalt` を呼ばない。round 内の halt は `parallel-review-round.ts` の `aggregateVerdictResult = "escalation"` という outcome 経由で pipeline transition を介して行われる（executor 内での halt 適用なし）。B-14 は保持されている。

### B-16: roundDeps は共有 deps の in-place 変更をしない

```ts
const roundDeps: PipelineDeps = { ...deps, roundOwnsGitEffects: true };
```

浅いコピーで新オブジェクトを生成しており、共有 `deps` を書き換えない。B-16 は保持されている。

### 逐次経路の commit 挙動（R4）

`!deps.roundOwnsGitEffects` は `undefined`（逐次経路）が falsy であることを利用した gate。`roundOwnsGitEffects` は `ParallelReviewRound.run` 内の `roundDeps` にのみ設定され、`pipeline.ts` から逐次 step に渡される `effectiveDeps` には存在しない。逐次経路の `finalizeStepArtifacts` 呼び出しは byte-for-byte 不変。

### commit mutex の invariant

executor の `commitMutex` は `if (!deps.roundOwnsGitEffects)` gate の中にあるため、round 下では mutex は acquire されない。round 内 member は commit しないのでこれは正しい。逐次経路の mutex は長さ 1 のチェーンとして従来どおり機能する。

### path 正規化の一致

`listWorktreeChanges` は `git status --porcelain -z --no-renames` を `cwd` で実行し、worktree ルート相対パス（例: `specrunner/changes/<slug>/result-001.md`）を返す。`writes()` が返す `IoRef.path` も `src/util/paths.ts` の関数が生成する同形式の相対パス。`pipelineManagedPaths` も同形式。`partitionRoundChanges` の set-membership 比較は一致する。

### git status --porcelain の untracked エントリ

新規ファイル（`??`）のパースは `part.slice(3)` で正しく処理される。`commitScopedPaths` が使用する `git add -A -- <paths>` は untracked ファイルも含めて stage できる。

### declared union の iteration 計算

```ts
const declared = [...declaredSet]; // fan-out 前の base state で計算
// ...
state = mergeParallelReviewerStates(state, fulfilledStates, pending); // merge は後
```

`nextIteration(state, name)` は fan-out 前の `state` を使うため、member agent が実際に書くパスと coordinator の declared が一致する。merge 後に計算すると iteration がずれる問題（D3 の「却下」節が指摘）が避けられている。

### all-approved fast path での git 副作用省略

`pending.length === 0` の分岐は `if-else` の `else` 外に git 副作用ブロックがあるため、全員 approved のとき worktree 変更検出・commit ともにスキップされる。pending なし → 書き込みなし → no-op が正しい。

### noOpDetect と round mode の相互作用

`noOpDetect` は finalize gate の**後**（L382–392）で実行される。カスタムレビュアーは `noOpDetect` を設定しない（`code-fixer` のみ `true`）ため、round mode での誤発火はない。

### managed runtime の fail-safe

`listWorktreeChanges → []` のため `toStage = []` / `offending = []` となり commit も halt も起きない。`listChangedFiles` の managed=`[]` と同じ fail-safe 方針で一貫している。

---

## 発見事項

### F-1 — round commit 失敗時に member 実行結果が失われる（low）

**該当箇所**: `parallel-review-round.ts run()` が `commitRoundArtifacts`（→ `pushOnly`）の例外を catch しない。`pipeline.ts` の coordinator branch:

```ts
const fanResult = await this.round!.run(currentStep, state, effectiveDeps);
state = fanResult.state; // round.run() が throw すると到達しない
```

`round.run()` が throw すると `pipeline.run()` の catch が `errState ?? jobState` で前 round の `jobState` を使うため、merge 済みの member StepRun は失われる。`PIPELINE_UNHANDLED_ERROR` で `awaiting-resume` に遷移し再開可能だが、再開時に member が全員 pending 扱いになり再実行される。

**影響**: 結果の正確性には影響しない（member 再実行で同じ結果が得られる）。push 失敗は1 retry 後のみ発生するレアケース。

**設計上の位置付け**: design.md Risks セクション「round commit が簿記を残す（二相境界）」および Non-Goal「round commit と state persist の二相境界の解消 = R6 / ADR の既知 Negative」として明示的に承知済み。ブロックしない。

---

## 総合評価

コアとなる不変条件（逐次経路の commit 不変・member no-commit・宣言 path 限定 stage・非宣言変更 halt・managed fail-safe・B-13/B-14/B-16）はすべて正しく実装されており、変更していないコードの暗黙の前提を破るケースは検出されなかった。

F-1 は設計で明示的に認識された二相境界の既知 Negative であり、今回の scope で修正が求められるものではない。

- **verdict**: approved
