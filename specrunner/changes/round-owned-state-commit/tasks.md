# Tasks: 並列 round の state commit を coordinator が round 単位で所有する（member no-persist）

> 実装順の原則: まず interface-stable な pure logic（member verdict 導出）を T-01 で固定し、
> producer-only seam（T-02）と round commit seam（T-03）を確定させてから、coordinator を rewire（T-04）し、
> signature に依存する intended-invariant / behavior test を T-05 で置く。逐次経路（`CommitOrchestrator` の
> 逐次メソッド・`StepExecutor.execute`）は非改変。`architecture/` 配下・`specrunner/adr/` 配下は変更しない（スコープ外）。

## T-01: member verdict を `StepExecutionResult` から導出する pure helper を固定する（D3）

- [ ] `src/core/pipeline/reviewer-status.ts`（または新規の小さな sibling pure module）に `verdictOfResult(result: StepExecutionResult): string` を追加する（I/O なし）:
  - `result.kind === "success"` → `result.completion.verdict ?? "escalation"`。
  - `result.kind === "skipped"` → `"skipped"`。
  - `result.kind === "halt"` → `"escalation"`。
- [ ] 単体 test で以下を固定する: success(approved)→approved、success(needs-fix)→needs-fix、success(verdict:null)→escalation、skipped→skipped、halt→escalation。
- [ ] この導出が現状の「member 最終 `StepRun.outcome.verdict ?? "escalation"`、halt/reject→escalation」と一致することをコメントで明示する。

**Acceptance Criteria**:
- `verdictOfResult` が `StepExecutionResult` の 3 kind から member verdict を pure に導出する。
- test は executor / store / git に依存しない（pure function だけを駆動する）。

## T-02: member 実行を producer-only 経路にする（`produceResult`、D1）

- [ ] `src/core/step/executor.ts` に public `produceResult(step: Step, state: JobState, deps: PipelineDeps): Promise<StepExecutionResult>` を追加する:
  - `step:start` を emit する。
  - 既存の private `produce(step, state, deps)` を呼び、返った `StepExecutionResult` をそのまま返す（`orchestrator.begin` / `orchestrator.apply` は **呼ばない** = persist を発生させない）。
  - producer 外の予期せぬ throw（`buildStepContext` 等）は捕捉し `{ kind: "halt", halt: makeAgentThrowHalt(err, step.name, {}) }` に正規化して返す（**reject しない**）。
  - event fidelity: 正常 result で `step:complete`、halt / throw 正規化時に `step:error` を emit する（payload の `state` は引数の base state を使う）。
- [ ] `StepExecutor.execute`（逐次経路）は非改変であることをコード上で担保する（begin/apply/persist の逐次挙動不変）。

**Acceptance Criteria**:
- `produceResult` が `StepExecutionResult` を返し、`store.persist` / `store.update` / `store.appendHistory` / `store.fail` を一度も呼ばない。
- producer 内の guard halt はそのまま `{ kind: "halt" }` として返り、producer 外の throw は halt へ正規化されて reject しない。
- `execute` の逐次挙動（begin → produce → apply → persist）は不変。

## T-03: `CommitOrchestrator.commitRound` を追加する（D2）

- [ ] `src/core/step/commit-orchestrator.ts` に `commitRound(params)` を追加する（逐次メソッド `begin` / `commitSuccess` / `commitSkipped` / `commitHalt` / `apply` は **非改変**）。params:
  - `coordinatorName: string`、`base: JobState`、`deps: PipelineDeps`、
  - `members: ReadonlyArray<{ step: Step; startedAt: string; result: StepExecutionResult }>`（fan-out 順 = pending 順）、
  - `reviewerStatuses: ReviewerStatus[]`、`coordinatorRun: StepRun`、`roundError: ErrorInfo | null`。
- [ ] member を順に in-memory で畳み込む（`store` を呼ばずに新 state を積む）:
  - `success` → `pushStepResult(state, step.name, { session, verdict, findingsPath: step.resultFilePath(base, deps), completedAt, startedAt, error: null, toolResult, followUpAttempts, transientRetryAttempts, completionReportDiagnostics })` ＋ history `{member}-started`（begin agent と同文言）＋ `{member}-verdict`（commitSuccess と同文言）を state.history に in-memory append。
  - `skipped` → `pushStepResult(verdict:"skipped", skipReason)` ＋ history `{member}-started` ＋ `{member}-skipped`（commitSkipped と同文言）。
  - `halt` → `recordFailedStepResult(state, step.name, halt.error, halt.recordOpts ?? {})` ＋ `halt.history`（あれば in-memory append）。**`store.fail` / `transitionJob` は呼ばない**。
- [ ] 全 member 畳み込み後に coordinator patch を適用する: `reviewerStatuses` を set、`steps[coordinatorName]` に `coordinatorRun` を append、`error` を `roundError` に set、`updatedAt` を更新。
- [ ] **`store.persist(state)` を 1 回だけ**呼ぶ（round の唯一の state 書き込み）。
- [ ] persist **後**に best-effort で: 各 member（success）の usage（`appendInvocation` = `usage.json`）と lineage（`appendLineage` = `events.jsonl`）を append（commitSuccess と同型、try/catch で握り潰す）、各 member に `verdict:parsed` を emit する。
- [ ] `members: []`（fast path）でも coordinator patch ＋ 単一 persist が成立することを保証する。

**Acceptance Criteria**:
- `commitRound` が member 集合と coordinator patch から新 state を組み立て、`store.persist` を **ちょうど 1 回** 呼ぶ。
- member の StepRun / history が逐次 `commitSuccess` / `commitSkipped` / `commitHalt(record 部)` と同形で、`pushStepResult` / `recordFailedStepResult` を共有する。
- member halt は `store.fail` / `transitionJob` を呼ばず（job を落とさず）StepRun 記録のみに留める。
- usage / lineage は persist 後の best-effort で、失敗しても commit を巻き込まない。
- 逐次メソッドは byte-for-byte 不変（既存 `commit-orchestrator.test.ts` が回帰しない）。

## T-04: `ParallelReviewRound` を rewire する（D3 / D4）

- [ ] `src/core/pipeline/parallel-review-round.ts` の `run`:
  - 先頭で `const orchestrator = new CommitOrchestrator(deps.storeFactory, this.events)` を構築する（D4。Pipeline / executor の constructor は非改変）。
  - fan-out（L208-216）を `this.executor.execute(...)` から `this.executor.produceResult(memberStep, state, roundDeps)` へ差し替える。`roundDeps = { ...deps, roundOwnsGitEffects: true }` は不変。
  - 各 member の `StepExecutionResult` と `startedAt` を保持し、`verdictOfResult`（T-01）で `memberVerdicts` を作る。
  - `mergeParallelReviewerStates`（L48-81）を **削除**する（member JobState の merge は不要。他に呼び出し元なし）。
  - `applyRoundResults` / `aggregateVerdict` は `memberVerdicts` から従来どおり算出する（reviewer status 導出・invalidation・pending 選択は不変）。
  - R5 の git 副作用ブロック（`listWorktreeChanges` → `partitionRoundChanges` → halt or `commitRoundArtifacts`）は base `state` ＋ declared union（fan-out 前 base 算出、既存）に対し **commitRound の前** にそのまま実行する。halt 時は aggregate を escalation に上書きし `roundError = ROUND_NONDECLARED_CHANGE`（offending path 列挙）を作る（非 halt 時 `roundError = null`）。
  - synthetic coordinator `StepRun` を従来どおり組み立てる（verdict = aggregate、escalation 時 `outcome.error = roundError`）。
  - 末尾の `deps.storeFactory(...)` ＋ `store.persist(state)` 直接呼び出し（L327-329）を **削除**し、代わりに `state = await orchestrator.commitRound({ coordinatorName, base: state, deps, members, reviewerStatuses: statuses, coordinatorRun: syntheticRun, roundError })` を呼ぶ。
  - `{ outcome: aggregateVerdictResult, state }` を返す（返り値契約不変）。
- [ ] fast path（pending 無し = 全 approved）も `commitRound({ ..., members: [] })` で単一 commit する。
- [ ] 共有 `deps` は round 内で in-place 変更しない（`roundDeps` は新規オブジェクト、B-16 不変）。

**Acceptance Criteria**:
- member は `produceResult` で実行され、round は member state を merge しない（`mergeParallelReviewerStates` 削除）。
- round の state 書き込みは `orchestrator.commitRound` の単一 persist のみ（`store.persist` の直接呼び出しが coordinator から消える）。
- aggregate verdict / reviewer status / synthetic coordinator StepRun の算出が従来と一致する。
- R5 git 副作用（scoped staging / 非宣言変更 halt）は commitRound の前段で挙動不変。

## T-05: intended-invariant / behavior test（seam 確定後）

- [ ] executor level（`src/core/step/__tests__/executor-round-produce.test.ts` 新規）:
  - fake store（`persist` / `update` / `appendHistory` / `fail` を spy）を `deps.storeFactory` に据え、`produceResult` で agent step を実行する。
  - `produceResult` が `StepExecutionResult` を返し、上記 store mutation API を **一度も呼ばない** ことを固定する（AC #1、intended-invariant）。
  - producer guard（例: 非 success completion）→ `{ kind: "halt" }` が返る／producer 外 throw → halt へ正規化され reject しないことを固定する。
- [ ] orchestrator level（`src/core/step/__tests__/commit-orchestrator.test.ts` に describe 追加）:
  - `commitRound` に fake store（persist を counter spy）＋ 2 member（success approved / success needs-fix）＋ coordinator patch を渡す。
  - `store.persist` が **ちょうど 1 回** 呼ばれること、persist された state に両 member の `StepRun` ＋ coordinator `StepRun` ＋ reviewerStatuses が入ることを固定する（AC #2 / #3）。
  - member halt を渡したとき `store.fail` / `transitionJob` が呼ばれず、`StepRun` に error が記録されることを固定する。
- [ ] coordinator level（`src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts` 新規）で、`produceResult` を返す fake executor ＋ persist を counter spy にした fake store で `ParallelReviewRound.run` を駆動する:
  - fan-out round（2 member）で `store.persist` がちょうど 1 回呼ばれる（単一 commit）ことを固定する（AC #2）。
  - persist 前に「一部 member だけ反映された中間 state」が書き込まれない（部分 projection 非発生）ことを固定する（AC #3。persist の引数 state を capture し、常に全 member 反映済みであることを assert）。
  - member verdict {approved, needs-fix} → aggregate needs-fix、reviewerStatuses 更新が従来と一致することを固定する（AC #4）。
  - member 1 件が halt → aggregate escalation、job が failed に落ちない（`state.status` が failed でない、round outcome が escalation）ことを固定する。
- [ ] 既存 `parallel-review-round-git-effects.test.ts` / `parallel-review-round-resume.test.ts` の fake executor を `produceResult`（`StepExecutionResult` 返却）契約へ更新する:
  - git-effects test: fake が member ごとに `{ kind: "success", completion: { verdict: "approved", ... } }` を返すよう更新し、既存の scoped staging / halt / pipeline 管理 path 除外の assertion を維持する（R5 挙動不変）。
  - resume test: fake が `produceResult` 時点で resume prompt を capture するよう更新し、resume 入力配布（D4/B-16）の assertion を維持する。
- [ ] R5 の `executor-round-commit.test.ts`（`execute` 経由で finalize gate を検証）は `execute` 不変のため回帰しないことを確認する。

**Acceptance Criteria**:
- member 経路が state persist API を呼ばず（AC #1）、coordinator が round 完了後に一度だけ `CommitOrchestrator` 経由で commit する（AC #2）ことが test で固定される。
- fan-out 途中で on-disk state が member 部分 projection にならない（AC #3）ことが persist 引数 capture で固定される。
- round verdict / reviewer status の結果が従来と一致する（AC #4）ことが固定される。
- 既存 git-effects / resume test が `produceResult` 契約で回帰せず、R5 挙動が保たれる。

## T-06: 全体検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green（新規・更新 test 含む、既存 parallel-review / resume / executor / commit-orchestrator test の regression なし）。
- [ ] 変更ファイルが `src/core/step/executor.ts` / `src/core/step/commit-orchestrator.ts` / `src/core/pipeline/parallel-review-round.ts` / `src/core/pipeline/reviewer-status.ts`（verdict helper）と対応 test に限られることを確認する（Pipeline / `StepExecutor` constructor は非改変）。
- [ ] `architecture/` 配下・`specrunner/adr/` 配下に変更が無いことを確認する（B-13 の ratify は本 pipeline では行わない ― スコープ外）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- `architecture/` は不変（trust-root を out-of-loop に保つ）。
