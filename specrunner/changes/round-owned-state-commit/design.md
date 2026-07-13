# Design: 並列 round の state commit を coordinator が round 単位で所有する（member no-persist）

## Context

`architecture/adr/2026-07-13-execution-ownership-model.md`（accepted）の **D1 — state commit の単一所有者** の並列 round 実装。ADR の提案 invariant **B-13**（`StepExecutor` は state mutation / persist API を呼ばず実行結果を値で返し、commit は orchestrator が行う）を並列 round 経路で挙動として実現する request。R2（`sequential-single-writer`）で逐次経路の `CommitOrchestrator`（単一 writer）を導入済み、R3 で `ParallelReviewRound` を挙動不変で抽出済み、R4（`round-immutable-input`）で round 入力を immutable 化済み、R5（`round-owned-git-effects`）で git 副作用を round 所有へ移した。本 request（R6）で **state commit の所有** を round へ移す。

### 現状の構造

- **member 実行 = persist**（`src/core/pipeline/parallel-review-round.ts:208-216`）: `Promise.allSettled` で pending member を `this.executor.execute(memberStep, state, roundDeps)` に流す。`StepExecutor.execute`（`executor.ts:115-140`）は `orchestrator.begin`（`store.update` で `state.step=member` ＋ `{member}-started` history を **persist**）→ `produce`（producer、値を返す）→ `orchestrator.apply`（`commitSuccess`/`commitSkipped`/`commitHalt` が pushStepResult ＋ history ＋ **persist**）を実行する。**各 member が共有 base `state` から中間 state を persist する**。
- **member 結果の merge**（`parallel-review-round.ts:48-81, 250`）: 各 member が返した persist 済み `JobState` を `mergeParallelReviewerStates` で base へ畳み込む（member の `steps[member]` と history delta を copy）。member halt は `execute` が throw → `allSettled` が reject → `errWithState.state`（`commitHalt` が persist した failed/awaiting-resume state）を merge、verdict は `escalation`。
- **coordinator の終端**（`parallel-review-round.ts:302-329`）: merge / aggregate（`applyRoundResults` / `aggregateVerdict`）→ git 副作用（R5、`listWorktreeChanges` / `partitionRoundChanges` / `commitRoundArtifacts` / 非宣言変更 halt）→ synthetic coordinator `StepRun` を push → **`store.persist(state)` を直接呼ぶ**（`CommitOrchestrator` を通らない）。
- **`CommitOrchestrator`**（`src/core/step/commit-orchestrator.ts`）: R2 で導入された逐次 step の単一 writer。`begin` / `commitSuccess` / `commitSkipped` / `commitHalt` / `apply` を持ち、`store.persist` / `appendHistory` / `fail` / usage / lineage を所有する。header に「Parallel round commits (R6) will reuse this orchestrator in a future request.」、constructor に `_permissionScope`（"reserved for R6 parallel round"）が既に用意されている。

### 構造的欠陥

state commit の所有が「どの member が先に到達したか」という fan-out 解決順で偶然決まる。各 member が stale base から中間 persist するため、crash 時の on-disk `state.json`（projection）は **member 単位の部分 projection**（例: member A の StepRun だけ入り member B は未反映、あるいは member の halt が job を failed に落とした状態）になりうる。ADR D1 が閉じるべき残余そのものである。逐次経路は R2 で `CommitOrchestrator` へ収束済みだが、並列経路はまだ member が直接 persist している。

## Goals / Non-Goals

**Goals**:

- round member の実行が state を persist しない。member は immutable な実行結果値（`StepExecutionResult`）を返し、store mutation / persist API を一切呼ばない（B-13 の並列経路）。
- coordinator（`ParallelReviewRound`）が member の `StepExecutionResult` を集約し、**round 完了後に一度だけ `CommitOrchestrator` 経由で `state` へ commit** する（R2 の `CommitOrchestrator` を再利用。逐次・並列の両経路が同じ writer 型へ収束）。
- crash 相当で on-disk `state.json` が member 単位の部分 projection にならない（round の state 書き込みは fan-out 前 or round 完了後の単一 commit のみ）ことを保証する。
- round の verdict 集約・reviewer status 更新・synthetic coordinator StepRun の結果を従来と不変に保つ。
- 逐次経路（`StepExecutor.execute` を pipeline 本ループから直接呼ぶ経路）の commit 挙動を不変に保つ（`CommitOrchestrator` の逐次メソッドを触らない）。

**Non-Goals**:

- git 副作用の round 所有（R5、先行で landing 済み）。本 request は R5 の git-effects ブロックを挙動不変で温存し、state commit の所有だけを移す。
- `architecture/` 配下の変更。B-13 の ratify（`model.md` §4 / `conformance.md` (A) / `core-invariants.test.ts` の歯＝`StepExecutor` からの mutation API 禁止 call-edge）は本 request の pipeline では行わず、実装 merge 後に attended で行う（trust-root を out-of-loop に保つ）。
- managed runtime の並列 custom reviewer 対応（既知の Non-Goal）。managed は member を走らせても git を持たず、state commit は単一 persist として従来どおり成立する（fail-safe 温存）。
- round commit（git）と state persist の二相境界の解消（ADR の既知 Negative）。revision reconciliation は将来の別 request。
- `CommitOrchestrator` の逐次メソッド（`commitSuccess` 等）を projection と persist に分割する refactor。逐次経路の byte-for-byte 不変を優先し、round 用の畳み込みは新メソッドに閉じる（下記 D2 Alternatives）。

## Decisions

### D1 — member 実行を producer-only 経路にし、persist を発生させない

`StepExecutor` に **`produceResult(step, state, deps): Promise<StepExecutionResult>`** を追加する。既存の private `produce`（producer、値を返す）をそのまま呼ぶ public wrapper で、`orchestrator.begin` / `orchestrator.apply` を **呼ばない**。よって member 実行は `store.persist` / `store.update` / `store.appendHistory` / `store.fail` を一切呼ばず、実行結果を `StepExecutionResult`（`success` / `skipped` / `halt` の DU、R2 で定義済み）として返す。

`ParallelReviewRound` の fan-out（`parallel-review-round.ts:208-216`）を `this.executor.execute(...)` から `this.executor.produceResult(...)` へ差し替える。`roundDeps = { ...deps, roundOwnsGitEffects: true }`（R4/R5、B-16）は不変。`produce` 内の R5 finalize gate（`if (!deps.roundOwnsGitEffects)`）も不変で通る（member は git 副作用も持たない）。

`produceResult` は event 発火を `execute` と揃える: `step:start` を先頭で emit、正常な `StepExecutionResult` で `step:complete`、halt / 予期せぬ throw で `step:error` を emit（payload の `state` は base を使う。commit 前なので committed state は存在しない）。想定外の throw（`buildStepContext` 等 producer 外の失敗）は `produceResult` 内で捕捉して `{ kind: "halt", halt }` に正規化し、**reject しない**（fan-out の全 member が必ず `StepExecutionResult` に fulfill する）。

**Rationale**: B-13 は「`StepExecutor` が persist を呼ばない」。逐次経路は R2 で「executor は値を返し `CommitOrchestrator` が commit」で満たしたが、並列経路はまだ executor（の begin/apply）が persist していた。`produce`（既に値を返す producer）を persist なしで公開すれば、member は R2 と同じ `StepExecutionResult` を返す producer になり、commit だけを coordinator が所有できる。`execute` は逐次経路のためそのまま残す（begin/apply/persist の逐次挙動不変）。

**Alternatives considered**:

- *member 実行を「persist を no-op 化した store」で `execute` する*: member が in-memory `JobState` を返し、既存 `mergeParallelReviewerStates` を温存できる。しかし ADR D1 / 要件は「member は `StepExecutionResult` を返す」と明記し、R2 の `CommitOrchestrator` 再利用を求める。no-op store は「executor が persist を呼ばない」B-13 を満たさず（呼ぶが握り潰すだけ）、seam が濁る。却下。
- *`execute` に `commit: false` option を足す*: `execute` の signature を分岐で汚し、逐次経路と条件共有になる。producer は既に分離された private method なので、それを公開する方が最小。却下。

### D2 — `CommitOrchestrator.commitRound`: member 結果 ＋ coordinator patch を単一 persist で確定する

`CommitOrchestrator` に **`commitRound`** を追加する。逐次メソッド（`begin` / `commitSuccess` / `commitSkipped` / `commitHalt` / `apply`）は **一切変更しない**。`commitRound` は base `state` に対し、member の `StepExecutionResult` を順に in-memory で畳み込み、coordinator の patch を適用し、**`store.persist` を 1 回だけ**呼ぶ。

signature（概略）:

```
commitRound(params: {
  coordinatorName: string;
  base: JobState;
  deps: PipelineDeps;
  members: ReadonlyArray<{ step: Step; startedAt: string; result: StepExecutionResult }>;  // fan-out 順（= pending 順）
  reviewerStatuses: ReviewerStatus[];   // coordinator が算出
  coordinatorRun: StepRun;              // synthetic coordinator StepRun（aggregate verdict ＋ error）
  roundError: ErrorInfo | null;         // 非宣言変更 halt 等の round 級 error（無ければ null）
}): Promise<JobState>
```

member ごとの畳み込み（既存 pure helper を再利用、逐次メソッドは非改変）:

- `success` → `pushStepResult(state, step.name, { session, verdict, findingsPath: step.resultFilePath(base, deps), completedAt, startedAt, error: null, toolResult, followUpAttempts, transientRetryAttempts, completionReportDiagnostics })` ＋ history `{member}-started`（begin 相当）＋ `{member}-verdict`（commitSuccess 相当）を **in-memory で** append。
- `skipped` → `pushStepResult(verdict:"skipped", skipReason)` ＋ history `{member}-started` ＋ `{member}-skipped`。
- `halt` → `recordFailedStepResult(state, step.name, halt.error, halt.recordOpts ?? {})` ＋ `halt.history`（あれば）を append。**`store.fail` / `transitionJob` は呼ばない**（member halt で job 全体を落とさない。round は aggregate escalation で pipeline を escalate 終端へ落とす＝R5 と同じ handled path）。

全 member 畳み込み後、coordinator patch を適用: `reviewerStatuses` を set、`steps[coordinatorName]` に `coordinatorRun` を append、`error` を `roundError` に set、`updatedAt` を更新。最後に **`store.persist(state)` を 1 回**。persist 後、member の usage / lineage を best-effort で append（`appendInvocation` = `usage.json`、`appendLineage` = `events.jsonl`。いずれも pipeline 管理 path で state.json projection に影響しない）＋ member ごとに `verdict:parsed` を emit（commitSuccess/commitSkipped と同じ event 契約）。fast path（pending 無し = 全 approved）は `members: []` で呼び、coordinator patch ＋ 単一 persist だけを行う。

**Rationale**: 「round 完了後に一度だけ commit」を単一 `store.persist` として `CommitOrchestrator` に閉じ込め、逐次・並列の両経路が同じ writer 型を通る。member の StepRun / history / usage / lineage は逐次の `commitSuccess` と同じ low-level helper（`pushStepResult` / `recordFailedStepResult`）で組み立てるため、merge 由来の結果（AC #4）が保たれる。usage / lineage を persist **後** の best-effort に置くのは、state.json の crash 整合性（AC #3）を単一 persist に集約し、簿記の append 失敗が round commit を巻き込まないため（commitSuccess の usage/lineage best-effort と同型）。

**Alternatives considered**:

- *`commitSuccess` 等を「pure projection」＋「persist」に分割し round と共有*: DRY だが逐次経路の commit 順（appendHistory の journal 書き込み順、persist タイミング）を触り、逐次 byte-for-byte 回帰のリスクが高い。prior request（`sequential-single-writer`）が逐次不変を重視したのに反する。新メソッドに畳み込みを閉じ、low-level helper だけ共有する（逐次メソッド非改変）方を採る。将来 safe な抽出が見えたら別途。却下。
- *member ごとに `orchestrator.apply` を呼び最後にもう一度 persist*: `apply` は member ごとに persist するため「一度だけ commit」（AC #2）と部分 projection 非発生（AC #3）を破る。却下。
- *coordinator が全 patch を組んで `store.persist` を直接呼ぶ（現状の延長）*: `CommitOrchestrator` を通らず「両経路が同じ writer へ収束」（要件 2）を満たさない。却下。

### D3 — `ParallelReviewRound` を rewire: member verdict を結果から導出し、merge を廃し、commitRound へ収束する

`ParallelReviewRound.run` を以下へ変更する（reviewer status 導出・invalidation・pending 選択・R5 git 副作用ブロックは挙動不変で温存）:

- fan-out: `produceResult` で `Promise.allSettled` する。各 member の `StepExecutionResult` と `startedAt`（fan-out 前 or produceResult が返す result 内の startedAt）を保持する。
- member verdict 導出（新 pure helper、例 `verdictOfResult(result): string`）: `success` → `result.completion.verdict ?? "escalation"`、`skipped` → `"skipped"`、`halt` → `"escalation"`。現状の「member 最終 StepRun の `outcome.verdict ?? "escalation"`、halt/reject → escalation」と一致する。
- `mergeParallelReviewerStates` を **削除**する（member JobState を merge する必要が消える。他に呼び出し元なし）。
- `applyRoundResults` / `aggregateVerdict` は `memberVerdicts` から従来どおり算出。R5 git 副作用ブロック（`listWorktreeChanges` → `partitionRoundChanges` → halt or `commitRoundArtifacts`）は base `state` ＋ declared union（fan-out 前 base から算出、既存）に対しそのまま実行。halt 時は aggregate を escalation に上書きし `roundError = ROUND_NONDECLARED_CHANGE` を作る。
- synthetic coordinator `StepRun` を従来どおり組み立て、`orchestrator.commitRound({ coordinatorName, base: state, deps, members, reviewerStatuses: statuses, coordinatorRun: syntheticRun, roundError })` を呼び、返り値 state を `{ outcome, state }` として返す。末尾の `store.persist(state)` 直接呼び出しは削除する。

**Rationale**: member が state を返さなくなったので merge は不要になり、coordinator は verdict（reviewer status / aggregate の唯一の入力）だけを結果から取り出せばよい。git 副作用（R5）は worktree（disk）と declared union に依存し member state に依存しないため、base に対してそのまま動く。commit を `commitRound` に一本化することで、member no-persist（D1）＋ 単一 commit（D2）が coordinator 側で閉じる。

**Alternatives considered**:

- *git 副作用ブロックを commitRound の後段へ移す*: git commit（declared 出力）と state persist の順序が変わり、R5 の「git commit → 簿記 persist」二相順序（既存挙動）を崩す。R5 ブロックは commitRound の**前**に置き、順序不変を保つ。却下。

### D4 — round の `CommitOrchestrator` を run() 内で `deps.storeFactory` から構築する

`ParallelReviewRound.run` は先頭で `const orchestrator = new CommitOrchestrator(deps.storeFactory, this.events)` を構築し、`commitRound` を呼ぶ（`permissionScope` は現状未使用のため省略 = R2 と同じ）。`storeFactory` は per-run の `deps` にあり、`this.events` は R5 で round に注入済み。Pipeline / `StepExecutor` の constructor は変更しない。

**Rationale**: 「単一 writer」は `CommitOrchestrator`（persist を所有する型）であって単一インスタンスの identity ではない。`CommitOrchestrator` のインスタンス状態は jobId 別の store cache のみで、逐次 executor 用インスタンスと round 用インスタンスが同一 jobId の store を各自 cache しても正当（store は jobId で idempotent）。`deps.storeFactory` から構築すれば Pipeline / executor の constructor churn（多数の test 構築点）を避けられ、round-commit test は fake store の persist 回数で単一 commit を直接検証できる（fake orchestrator の spy より real な検証）。

**Alternatives considered**:

- *Pipeline が単一 `CommitOrchestrator` を構築し executor と round の双方へ inject*: identity 単一化で「同じ writer」が字義的になるが、`StepExecutor` constructor に optional param を足し全 test 構築点へ波及する。blast radius が要件に見合わない。型としての収束で足りる。却下。

## Risks / Trade-offs

- **[Risk] member StepRun / history の fidelity 差**（AC #4）→ `commitRound` の畳み込みが `commitSuccess` / `begin` の StepRun / history 形と乖離すると、merge 由来の従来結果とずれる。`pushStepResult` / `recordFailedStepResult` を共有し、history は `{member}-started` / `{member}-verdict` / `{member}-skipped` の既存文言をそのまま再現する。test で「同一 member 集合 → 同一 `steps[member]` / reviewerStatuses / aggregate」を固定する。
- **[Risk] usage / lineage の欠落**（cost 追跡回帰）→ member が `commitSuccess` を通らなくなると usage.json の member invocation が欠ける。`commitRound` が persist 後に best-effort で `appendInvocation` / `appendLineage` を再現する（従来と同じ append。state.json projection には無関与）。
- **[Risk] event 発火の fidelity**（progress UI）→ 逐次の `execute` は `step:start` / `step:complete` / `verdict:parsed` を出す。`produceResult` が `step:start` / `step:complete`（or `step:error`）を、`commitRound` が member ごとに `verdict:parsed` を出して補う。payload の committed state が無い点は base state で代替（step 名依存の UI に影響なし）。
- **[Risk] member halt での job 誤 fail**→ 逐次の `commitHalt` は `store.fail` / `transitionJob` で job を落とすが、round の member halt でこれをやると round 全体でなく job が failed に落ちる。`commitRound` の halt 畳み込みは `recordFailedStepResult`（StepRun 記録のみ）に留め、job 級遷移は行わない。escalation は aggregate → pipeline の escalate 終端（`(coordinator, escalation)` に transition 行が無く escalate へ落ちる既存 handled path）が担う。
- **[Risk] test churn**→ `parallel-review-round-git-effects.test.ts` / `parallel-review-round-resume.test.ts` の fake executor は `execute`（JobState 返却）を提供する。R6 で member は `produceResult`（`StepExecutionResult` 返却）を通るため、両 fake を `produceResult` 契約へ更新する（挙動＝ verdict / resume 配布は保存）。R5 の `executor-round-commit.test.ts`（finalize gate を `execute` 経由で検証）は `execute` が不変のため回帰しない。
- **[Risk] managed runtime**→ managed は member を走らせても git worktree を持たない。`commitRound` は単一 `store.persist` を行い（state 書き込みは runtime 非依存）、git 副作用（R5）は managed で no-op のまま。既存の managed fail-safe を崩さない。
- **[Risk] R5 git-effects と単一 persist の順序**→ R5 ブロックは `commitRound` の前に置く。member が persist しなくなるため、`listWorktreeChanges` 検出時に worktree の pipeline 管理 path（state.json 等）が member 実行由来では未変更になる（coordinator の commitRound が後で書く）。`partitionRoundChanges` は pipeline 管理 path を除外するため、path が有っても無くても判定・stage 対象は不変（挙動差なし）。

## Open Questions

なし（architect 評価済みの設計判断で確定）。member `{member}-started` history の再現は「従来結果と一致」（AC #4）維持のため実施する方針で確定。git round commit と state persist の二相境界は ADR の既知 Negative として温存（revision reconciliation は本 request の Non-Goal）。
