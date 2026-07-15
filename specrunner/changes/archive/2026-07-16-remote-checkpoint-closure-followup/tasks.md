# Tasks: awaiting-resume guard-halt を制御出口にし、attach 硬化を完了する

## T-01: [P0] guard-halt(awaiting-resume) を終端制御出口にする

- [x] `src/core/pipeline/pipeline.ts` の `runInternal` に、step 実行ユニットの収束点
  （`firstUnitExecuted = true` の直後、`pipeline.ts:314-315` 付近。loop step exit bookkeeping /
  transition lookup の**前**）へ state ベースの終端ガードを挿入する:
  ```
  if (state.status === "awaiting-resume") {
    // guard-halt honored: terminal control exit → publisher seam (pipeline.ts:504)
    this.printPipelineFinished(state);
    break;
  }
  ```
  この位置は sequential 分岐（catch で `state = errWithState.state`／`store.persist` 済み）と
  coordinator 分岐（`state = fanResult.state`／`commitRound` persist 済み）の両方が収束する唯一点である。
- [x] `getStepOutcome`（`pipeline.ts:578`）の `state.status === "failed"` 判定直後に
  `if (state.status === "awaiting-resume") return "awaiting-resume";` を足し、awaiting-resume を
  `step.completionVerdict` / `"approved"` に素通りさせない。
- [x] コメントで意図を明記する（guard-halt は resumable checkpoint 生成イベント。ガード＝enforcement、
  getStepOutcome 硬化＝source of truth + 退行時 fail-safe。escalate terminal には相乗りしない＝
  二重 `transitionJob(awaiting-resume)` で resumePoint/error を壊さないため）。
- [x] escalation（`pipeline.ts:374`）/ exhaustion（`tryExhaust`→`handleExhausted`）経路のコードは変更しない。

**Acceptance Criteria**:
- guard-halt で awaiting-resume になった step の直後、pipeline は後続 step を実行せず loop を break し、
  publisher seam（`pipeline.ts:504-506`）に到達する。
- escalation / exhaustion 経路の終端挙動（resumePoint / error / publisher 到達）は不変。
- `typecheck` が green。

## T-02: [P0] guard-halt 終端の Pipeline.run() 単体テスト（sequential + coordinator/round）

- [x] `tests/core/pipeline/pipeline.test.ts`（または新規 `pipeline.guard-halt.test.ts`）に **sequential**
  テストを追加する。mock executor の `execute` を、対象 step（例: implementer）で
  `Object.assign(new Error("timeout"), { state: <awaiting-resume state> })` を throw させ、guard-halt を模す
  （commitHalt の `attachStateAndRethrow` 相当。`.state` に `status="awaiting-resume"` を持たせる）。
  - assert: 対象 step 以降の step（verification / code-review 等）の `executeSpy` が呼ばれない。
  - assert: 返り値 `state.status === "awaiting-resume"`。
- [x] **coordinator/round** テストを追加する。parallelReview 構成の Pipeline を組み、member step の
  `produceResult` が guard-halt（timeout halt / awaiting-resume）になるようにして round を escalation に
  導く（`verdictOfResult` で escalation に畳まれる）。
  - assert: coordinator round の後続 step（例: conformance）が実行されない。
  - assert: 返り値 `state.status === "awaiting-resume"`（escalate terminal 経由）。
  - 既存の parallel-review テストの scaffolding（`src/core/pipeline/__tests__/parallel-review-round-*.test.ts`、
    `compose-reviewers.test.ts` 等）を参照して構成する。
- [x] 回帰確認: escalation（step failed）と exhaustion（loop 予算切れ）でも後続 step を実行せず終端する
  既存テストが green のままであることを確認する（無ければ最小限追加してよいが、既存挙動は変えない）。

**Acceptance Criteria**:
- sequential guard-halt で pipeline が次 step を実行しないことが `Pipeline.run()` のユニットテストで固定される。
- coordinator/round 経路でも後続 step を実行しないことが固定される。
- 追加テストが green、既存 pipeline テストが無変更で green。

## T-03: [P0] attach branch cleanup を所有証明ベースにする

- [x] `src/core/worktree/manager.ts`: `create` の第 7 引数 `branchWasPreExisting?: boolean`（既定 false）を
  `preserveBranchOnFailure?: boolean`（既定 false）に**リネーム**する。boolean 意味・既定値は不変
  （`true` = 失敗時に `git branch -D` しない）。cleanup 条件を `if (branchName && !preserveBranchOnFailure)`
  にする（`manager.ts:121-123`）。interface（`WorktreeManager.create` の jsdoc）を所有意味で更新する
  （「この呼び出しが作成したと証明できない branch は削除しない」）。
- [x] `src/core/runtime/workspace-materializer.ts` の `attach-from-checkpoint` arm
  （`workspace-materializer.ts:122-153`）: 事前 `rev-parse`（`branchExistResult` / `branchWasPreExisting`、
  line 128-136）を**削除**し、`manager.create(..., plan.branchName, setupPlan, /* preserveBranchOnFailure */ true)`
  を無条件で渡す。combined `git worktree add -b` 失敗時に所有を証明できないため常に削除を避ける旨を
  コメントする。
- [x] new-run arm（`workspace-materializer.ts:155-239`）と resume-recreated arm は `manager.create` を
  第 7 引数なし（既定 false）で呼ぶ現状を維持する（挙動不変）。
- [x] manager 内部の lock-contention retry の `rev-parse`（`manager.ts:129-141`。`-b` 無し args への
  切り替え用）は所有証明とは別物なので**触らない**。

**Acceptance Criteria**:
- attach arm は所有証明用の事前 `rev-parse` を行わず、`manager.create` に `preserveBranchOnFailure: true` を渡す。
- new-run / resume-recreated の branch cleanup 挙動は不変。
- `typecheck` が green。

## T-04: [P0] branch cleanup race テスト

- [x] `tests/core/worktree/manager.test.ts` に、`preserveBranchOnFailure=true` で `git worktree add -b` が
  失敗（別プロセスが同名 branch を先に作った race を模す）したとき `git branch -D` が呼ばれないことを
  固定するテストを追加する（既存 TC-WTM-025 と同趣旨だが「race」意味を明記。lock-contention 経路でも
  no-`-D` を 1 ケース追加してよい）。
- [x] `tests/attach/workspace-materializer-attach.test.ts` に、attach arm が (a) 所有証明用の事前
  `rev-parse` を呼ばない、(b) `manager.create` を `preserveBranchOnFailure: true`（第 7 引数）で呼ぶ、
  ことを固定するテストを追加する。
- [x] 既存の new-run 自己作成 branch cleanup テスト（TC-WTM-015 / TC-WTM-026）が**無変更で green** で
  あることを確認する。既存 TC-MA-001（attach arm の manager.create 呼び出し引数、第 7 引数 = true）も
  無変更で green であること（第 7 引数値は依然 true）。

**Acceptance Criteria**:
- 「この呼び出しが作成していない branch は `-D` されない」ことがテストで固定される。
- 既存 new-run 自己作成 branch cleanup テストは無変更で green。
- 追加テストが green。

## T-05: [P2] resume-step `reads()` 評価失敗を fail-closed にする

- [x] `src/core/attach/verify-checkpoint.ts:190-208`: resume-step `reads()` tree-precheck で `reads()` が
  throw したときの `catch { /* skip */ }`（line 195-197）を、`checkpointNotAttachableError` の throw に
  変える。reason は `"resume-reads-unevaluable"`（新規自由文字列。error code 追加不要）、detail に
  `resolvedStepName` と原因（`err.message`）を含める。
- [x] コメントを「検証不能は fail-closed（scope-unevaluable → 拒否）」に更新する。

**Acceptance Criteria**:
- resume step の `reads()` が throw すると `verifyCheckpoint` が `CHECKPOINT_NOT_ATTACHABLE`
  （reason: `resume-reads-unevaluable`）で拒否する。
- `typecheck` が green。

## T-06: [P2] reads() fail-closed テスト

- [x] `tests/attach/verify-checkpoint.test.ts` に、resolve される resume step の `reads()` が throw する
  ケースを固定するテストを追加する。標準 step の `reads()` は state+slug のみ参照して throw しない不変が
  あるため、`getPipelineDescriptor`（`src/core/pipeline/registry.js`）を `vi.mock` するなどして、
  resolve される step の `reads()` が例外を投げる descriptor を注入する。
  - assert: `verifyCheckpoint` が `CHECKPOINT_NOT_ATTACHABLE`（reason: `resume-reads-unevaluable`）を throw。
- [x] `tests/attach/attach-integration.test.ts`（または verify-checkpoint テスト）で、拒否時に job state /
  worktree / sidecar が作られないことを固定する（verify は materialize より前に走るため、TC-INT-001/002 と
  同型の no-side-effects assert）。descriptor 注入が統合テストで難しい場合は、verify 単体テストで throw を
  確認し、no-side-effects は「verify が materialize 前に throw する」順序（`orchestrator.ts`）で担保される旨を
  テストコメントに明記する。

**Acceptance Criteria**:
- `reads()` throw → `CHECKPOINT_NOT_ATTACHABLE` 拒否がテストで固定される。
- 拒否時に job state / worktree / sidecar が作られないことが（構造 or 統合テストで）固定される。
- 追加テストが green。

## T-07: [P0/主役 E2E] 実 pipeline を通した publish→attach→resume を固定する

- [x] `tests/attach/attach-resume-e2e.test.ts`（新規）を作る。real git fixture（bare origin + Machine A
  clone + Machine B clone）は `tests/attach/attach-integration.test.ts` の `setupGitFixture` パターンを
  再利用する。change folder に request.md / tasks.md / spec.md / state.json（status=running）を seed し、
  resume step（例: implementer）の `reads()` が満たされる状態にする。
- [x] **Machine A（publish）**: 実 `Pipeline`（`STANDARD_TRANSITIONS`）＋ 実 `StepExecutor`＋ fake
  `AgentRunner`（対象 step で `completionReason: "timeout"` を返す）で `Pipeline.run(startStep, state, deps)`
  を実行する。`runtimeStrategy` は `tests/pipeline-integration.test.ts` の `makeTestRuntimeStrategy` 相当の
  最小実装だが、`commitFinalState` は実 `commitFinalState()`（`src/core/step/commit-push.ts`。cwd=source
  clone、branch=feature branch、messageLabel="checkpoint"）へ委譲し origin へ push する。
  - assert (a): fake runner の呼び出しが **1 回**（後続 step 不実行の決定的証拠）。返り値
    `state.status === "awaiting-resume"`。`state.steps` に後続 step（verification 等）が無い。
  - assert (b): origin/<branch> の HEAD commit message が `checkpoint: <slug>`、seed の上に単一 commit。
    その commit tree の state.json が `status="awaiting-resume"`（`git show origin/<branch>:specrunner/changes/<slug>/state.json`
    等で確認）。
  - timeout を第一候補とし、drift（`snapshotMainCheckoutGuard` が drift を返す）でも代替可。
- [x] **Machine B（attach → resume 開始）**: origin を fresh clone → `runAttachVerification({ cwd: targetDir,
  branch, spawnFn, expectedRepo })` → `WorkspaceMaterializer.materialize({ kind: "attach-from-checkpoint",
  checkpointRef: verified.checkpointOid, branchName })`。続けて materialize した worktree を cwd に、実
  `Pipeline.run()` を resumePoint.step から起動する（実装裁量で `ResumeCommand` 全体を通してもよい）。
  - assert (c): resume の fake runner が resume step で **1 回以上呼ばれる**（実 resume が開始した証拠）。
- [x] proxy（`commitFinalState()` 直呼び）で publish を代替しないこと。既存 TC-INT-006 は残置可（主役の歯は
  本 E2E が担う）。

**Acceptance Criteria**:
- 実 `Pipeline.run()` が guard-halt（timeout or drift）で awaiting-resume に落ちた時、(a) 後続 step を
  実行しない、(b) publisher が origin へ checkpoint を単一 commit として publish、(c) 別 clone の
  `job attach` → 実 `job resume` が resume step を起動する、を 1 本の統合テストで固定する。
- publish が proxy 直呼びでない（実 pipeline を通す）。
- 追加テストが green。

## T-08: 全体検証と既存挙動保存

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。
- [x] 既存の attach / publisher / worktree / escalation・exhaustion 挙動保存テストが**無変更で** green で
  あることを確認する（TC-INT-001..006 / TC-010 / TC-WTM-* / parallel-review-round-* / pipeline.test.ts の
  escalation・exhaustion ケース 等）。挙動を変えたテストが出た場合は D1/D2 の設計意図に反する退行なので、
  テストを書き換えずに実装を見直す。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 既存 behavior-preservation テストが無変更で green。
