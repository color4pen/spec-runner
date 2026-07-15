# Design: awaiting-resume guard-halt を制御出口にし、attach 硬化を完了する

## Context

`remote-checkpoint-publish-attach-closure`（#837）は「remote checkpoint を単一 immutable
commit として publish し、その同じ commit を検証・materialize して安全に再束縛する」不変を、
publisher seam・OID 固定・checkpoint 述語強化で実装した。しかし 4 点が閉じ残り、attach を
実運用で成立させる correctness に穴が残っている。本 change はその follow-up として、実装で
穴を埋める。構造判断は ADR-20260715 で ratify 済みであり、新規 architecture ADR は要さない。

### 現状コード（検証済みの前提）

- **guard-halt が pipeline を止めない（P0）**: `getStepOutcome`
  （`src/core/pipeline/pipeline.ts:578`）は `state.status === "failed"` のときだけ `"error"` を返す。
  guard-halt は `CommitOrchestrator.commitHalt`（`src/core/step/commit-orchestrator.ts:377`）が
  `transitionJob("awaiting-resume")` ＋ `attachStateAndRethrow` し、`Pipeline.runInternal` の step
  実行 try/catch（`pipeline.ts:279-294`）が `errWithState.state`（＝ awaiting-resume state）を受ける。
  この時点で `state.status === "awaiting-resume"` だが、`getStepOutcome` は `failed` 分岐を外れ、
  step verdict が null のため `step.completionVerdict`（producer step は `"success"`）または
  `"approved"` を返す。→ **通常遷移が引かれ、pipeline は後続 step を実行し続ける**。loop を break
  しないため、ループ末尾の publisher seam（`pipeline.ts:504-506`：`state.status === "awaiting-resume"`
  で `commitFinalState`）に到達しない。#837 の design は「guard halt は awaiting-resume state のまま
  loop を継続し最終的に terminal break に至る」と記述していたが、実際には至らない（＝本穴）。
  awaiting-resume の guard-halt を生むのは `makeTimeoutHalt`（`src/core/step/step-halt.ts:119`、poll
  timeout: `executor.ts:360-362`）と `makeDriftHalt`（`step-halt.ts:195`）。
- **branch cleanup が race で他者 branch を消しうる（P0）**: `WorkspaceMaterializer` の
  `attach-from-checkpoint` arm（`src/core/runtime/workspace-materializer.ts:122-153`）は、attach 時に
  `git rev-parse --verify --quiet refs/heads/<branch>`（check）で `branchWasPreExisting` を決め、
  `manager.create(..., branchName, plan, branchWasPreExisting)`（create）に渡す。check と create は
  **非 atomic**。`WorktreeManager.create`（`src/core/worktree/manager.ts:101-146`）は
  `git worktree add -b <branch>` 失敗時、`branchName && !branchWasPreExisting` なら
  `git branch -D <branch>`（`manager.ts:121-123`）する。check 後・create 前に別プロセスが同名 branch を
  作ると、`branchWasPreExisting=false`（観測時は不在）のまま worktree add が失敗し、**他者の branch を
  削除する（データ損失）**。new-run は branch 名が `<slug>-<jobId8>` で一意なので、この経路には race が無い。
- **主役 E2E が実 pipeline を通していない（P0/歯）**: `tests/attach/attach-integration.test.ts` の
  TC-INT-006 は `commitFinalState()` を直呼び（line 433）し、実 `Pipeline.run()` を通していない。
  TC-INT-005 は `resolveJobStateBySlug` までで、実 `job resume` を開始しない。この proxy が上の
  guard-halt 穴を隠していた（publisher が呼ばれることだけ確認し、pipeline が止まるかは検証しない）。
- **`reads()` 評価失敗が fail-open（P2）**: `verify-checkpoint.ts` の resume-step `reads()` tree-precheck
  （`src/core/attach/verify-checkpoint.ts:190-208`）は、`reads()` が throw すると
  `catch { /* skip */ }`（line 195-197）で precheck を丸ごと skip する。attachability を証明できないのに
  attach を通す（fail-open）。

### 参照 primitive

- publisher: `commitFinalState({ cwd, branch, slug, spawnFn, messageLabel })`
  （`src/core/step/commit-push.ts:105`）。`git add -A` → staged 差分があれば単一 commit
  （`checkpoint: <slug>`）→ `git push origin <branch>`（1 retry）。**throw しない**。seam は
  `RuntimeStrategy.commitFinalState(deps, state)`（`local.ts:666`。awaiting-resume なら
  messageLabel=`"checkpoint"`）。
- typed error: `checkpointNotAttachableError(reason, detail)`（`src/errors.ts:385`）は
  `CHECKPOINT_NOT_ATTACHABLE` を返し、`reason` を自由文字列で受ける。新 reason 追加に error code 追加は不要。
- attach 順序: `runAttachVerification`（fetch → OID 解決 → `readCheckpointFromRef` →
  `verifyCheckpoint`。`src/core/attach/orchestrator.ts`）が **materialize より前**に verify を実行する。
  verify が throw すれば worktree / sidecar / job state は一切作られない（TC-INT-001/002 が既に実証）。
- 実 pipeline scaffolding: `tests/pipeline-integration.test.ts` の `makeTestRuntimeStrategy` は
  最小 `RuntimeStrategy` を組み、`AgentRunner` を差し替えて実 `Pipeline.run()` を通す。fake runner が
  `completionReason: "timeout"` を返せば guard-halt（awaiting-resume）を発火できる。

## Goals / Non-Goals

**Goals**:

- guard-halt 由来の `awaiting-resume` を **終端制御出口**にする。step 実行（sequential・coordinator/round
  の両経路）が job を `status="awaiting-resume"` にしたら、pipeline は後続 step を実行せず、loop を抜けて
  publisher seam に到達する。
- attach の branch cleanup を **「この呼び出しが作成したと証明できる branch」のみ**に限定する。事前
  `rev-parse` の観測時不在を所有証明に使わない。
- 実 `Pipeline.run()` を guard-halt 経由で awaiting-resume に落とし → publish → 別 clone で attach →
  実 resume 開始、を **1 本の統合テスト**で固定する（proxy 直呼びでない）。
- checkpoint verify の resume-step `reads()` 評価失敗を **fail-closed** にする。

**Non-Goals**（request のスコープ外をそのまま踏襲）:

- `running` job の別マシン takeover / lease / epoch（別 ADR）。
- `origin/*` の暗黙走査による job 発見。
- attach 後の自動 resume。
- managed runtime の attach（local runtime のみ）。
- publisher seam / OID 固定 / checkpoint 述語そのものの再設計（#837 で完了済み。本 change は既存
  publisher seam に「到達させる」ことだけを扱う）。

## Decisions

### D1: guard-halt(awaiting-resume) を終端制御出口にする

`Pipeline.runInternal` に、step 実行ユニット（sequential step / coordinator round の両分岐）が収束した
直後の一点で、**state ベースの終端ガード**を置く。job が `status="awaiting-resume"` になっていたら、
halt を honor して `break` し、loop 末尾の publisher seam に落とす。あわせて `getStepOutcome` を硬化し、
awaiting-resume を completionVerdict に素通りさせない。

- **配置**: `pipeline.ts:314-315`（`firstUnitExecuted = true` の直後、loop step exit bookkeeping /
  transition lookup の**前**）に次を挿入する。
  ```
  if (state.status === "awaiting-resume") {
    // guard-halt honored → terminal control exit → publisher seam
    this.printPipelineFinished(state);
    break;
  }
  ```
  この位置は sequential 分岐（catch で `state = errWithState.state` 済み、`store.persist` 済み）と
  coordinator 分岐（`state = fanResult.state`、`commitRound` が persist 済み）の**両方が収束する唯一点**
  であり、どちらの経路で awaiting-resume になっても一様に止められる。awaiting-resume state は commitHalt
  が既に persist しているため、break 前に追加の persist は不要（publisher が push を担う）。
- **`getStepOutcome` 硬化**: `pipeline.ts:578` の `failed` 判定直後に
  `if (state.status === "awaiting-resume") return "awaiting-resume";` を足す。これは request が名指しした
  「`getStepOutcome` に awaiting-resume を素通りさせ completionVerdict に委ねる現状を塞ぐ」を source で
  閉じる。終端ガードが先に break するため routing には使われないが、万一ガードが将来 refactor で外れても、
  transition table に `"awaiting-resume"` 行は無いので `nextStep = "escalate"`（＝安全側の終端）に落ちる
  fail-safe になる。
- **coordinator/round 経路**: `ParallelReviewRound.run` は member の halt（timeout 含む）を
  `verdictOfResult` で `"escalation"` に畳み（`reviewer-status.ts:246-255`）、`commitRound` は job を
  awaiting-resume に遷移させない。したがって現状の coordinator 経路は escalation → escalate terminal
  （`pipeline.ts:374`）→ awaiting-resume + publisher で既に正しく終端する。D1 の state ベースガードは
  この経路の挙動を変えない（coordinator 直後は status が running のままなのでガードは発火しない）が、
  「round が job を awaiting-resume にした場合も後続を実行しない」不変を**構造的に**担保する（収束点に
  置くため）。

**Rationale（why X not Y）**: guard-halt(awaiting-resume) は「resumable checkpoint 生成イベント」であり、
pipeline は「halt を honor して停止」と「publisher で publish」の両方を満たさねばならない。state ベースの
終端ガードは、awaiting-resume がどう設定されたか（executor 直接遷移か、将来の round 遷移か）に依存せず
一様に止められる。

**Alternatives considered**:
- *却下*: `getStepOutcome` に awaiting-resume を素通りさせ completionVerdict に委ねる現状（＝halt が無視され
  後続 step が走る）。これが本穴そのもの。
- *却下（getStepOutcome だけ直す案）*: `getStepOutcome` が `"awaiting-resume"` を返し、transition table に
  `awaiting-resume → escalate` 行を足して escalate terminal に相乗りする案。escalate terminal は
  `transitionJob(awaiting-resume)` を**再度**呼ぶ（`pipeline.ts:374-389`）ため、既に awaiting-resume の
  state に対する二重遷移になり、resumePoint / error を escalate 用に上書きしてしまう（guard-halt が記録した
  timeout / drift の resumePoint を失う）。よって escalate 相乗りは採らず、専用の終端ガードで break する。
- *却下*: `escalate` terminal 分岐そのものに awaiting-resume 検出を足す案。escalate 分岐は
  `nextStep === "escalate"` でしか入らず、guard-halt は正常遷移（`escalate` にならない）で抜けてしまうため、
  そこに足しても手遅れ（既に後続 step が走った後）。

### D2: branch cleanup を「この呼び出しが作成した」所有証明で判定する

attach の branch cleanup を、combined `git worktree add -b` の失敗**後には branch を自動削除しない**方式に
変える（request が提示した選択肢の後者）。combined op は失敗理由（branch 既存 / worktree dir 既存 / その他）を
呼び出し側が事後に区別できず、「この呼び出しが branch を作成した」ことを証明できない。証明できない削除は
禁止する。

- **`WorktreeManager.create` の cleanup 判定**（`manager.ts`）: 7 番目の引数
  `branchWasPreExisting?: boolean` を、所有意味を正確に表す `preserveBranchOnFailure?: boolean`
  （既定 `false`）に**リネーム**する。boolean 意味と既定値は現状と同一（`true` = 失敗時に削除しない、
  `false` = 削除する）。cleanup 条件を `if (branchName && !preserveBranchOnFailure)` にする。
  positional 引数の値・既定値・挙動は不変なので、既存 manager テスト（TC-WTM-015/016/025/026 等）は
  **無変更で green**。
- **`WorkspaceMaterializer` attach arm**（`workspace-materializer.ts:122-153`）: 事前 `rev-parse`
  （`branchExistResult` / `branchWasPreExisting`。line 128-136）を**削除**し、`manager.create` へ
  `preserveBranchOnFailure: true` を**無条件**で渡す。attach は既存 feature branch 名を渡すため、combined
  op 失敗時に所有を証明できず、常に削除を避けるのが安全側。
- **new-run 経路**（`workspace-materializer.ts:155-239`）: `manager.create` を第 7 引数なし（既定 `false`）で
  呼ぶ現状を維持する。branch 名が一意で自己作成が保証されるため、失敗時 cleanup を続ける。**挙動不変**。

**Rationale（why X not Y）**: branch 所有は「この呼び出しが作成した」で判定すべきで、事前 `rev-parse` の
観測時不在で判定してはならない（check-then-create race で他者の branch を消す）。combined `-b` 失敗後は所有を
証明できないので、削除しない（データ損失を absolute に避ける）。

**Alternatives considered**:
- *却下*: 事前 `rev-parse` の観測時不在で所有判定する現状。race window で他者 branch を削除する（本穴）。
- *不採用*: branch 作成を独立 atomic 操作（`git branch <name> <oid>` を先に実行し、成功時のみ
  `createdByThisCall=true`）にして所有証明を得る案。安全性は同等だが、attach 用に「`-b` 無しの worktree add」
  経路を manager に新設する必要があり、lock-contention retry ロジック（`manager.ts:129-146`）とも干渉する。
  request が許容する後者（自動削除しない）で同じ安全性が最小変更で得られるため、atomic-create は採らない。
- **残留 branch のトレードオフ**: combined `-b` が成功し branch を作った後で setup（install 等）が失敗すると、
  worktree は掃除されるが branch は残る（既存挙動と同じ。`cleanupWorktree` は branch を消さない）。attach で
  worktree add 自体が失敗した場合も branch を残す。残留は fresh clone 上の孤立 branch であり、`git branch -D`
  で手動 or prune で回収でき、データ損失を招かない安全側。Risks に明記する。

### D3: 主役 E2E を実 `Pipeline.run()` で通す

`commitFinalState()` 直呼びの proxy（TC-INT-006）を、実 pipeline を通す 1 本の統合テストに置き換える
（既存 TC-INT-006 は残しても良いが、主役の歯は新テストが担う）。新テスト
（`tests/attach/attach-resume-e2e.test.ts`、新規）は real git（bare origin + 2 clone）を使い次を通す。

1. **Machine A（publish）**: 実 `Pipeline`（`STANDARD_TRANSITIONS`）＋ 実 `StepExecutor`＋ fake
   `AgentRunner`（対象 step で `completionReason: "timeout"` を返す）で `Pipeline.run(startStep, state, deps)`
   を実行する。`runtimeStrategy` は `makeTestRuntimeStrategy` 相当の最小実装だが `commitFinalState` は
   実 `commitFinalState()` primitive（cwd = source clone、branch = feature branch）へ委譲し、origin へ
   push する。guard-halt（timeout）→ D1 の終端ガード → awaiting-resume → publisher seam が発火する。
   - 検証: fake runner の呼び出しが **1 回**（後続 step が走っていない証拠）。返り値 `state.status ===
     "awaiting-resume"`。origin/<branch> の HEAD commit message が `checkpoint: <slug>` で、seed の上に
     **単一 commit**が積まれている。その commit tree の state.json が `status: "awaiting-resume"`。
   - guard-halt は timeout を第一候補とし、drift（`snapshotMainCheckoutGuard` で drift を返す）でも代替可。
2. **Machine B（attach → resume 開始）**: origin を fresh clone → `runAttachVerification` →
   `WorkspaceMaterializer.materialize({ kind: "attach-from-checkpoint", checkpointRef: verified.checkpointOid,
   branchName })` で worktree を作る。続けて、materialize した worktree を cwd に、実 `Pipeline.run()` を
   resumePoint.step から起動する（resume 開始）。fake runner が resume step で 1 回でも呼ばれれば「実 resume
   が開始した」ことを固定できる（完了まで通す必要はない）。
   - 検証: attach 後に resolve/attach 済みの awaiting-resume job から、実 `Pipeline.run()` が resume step の
     agent runner を **起動する**こと。

**Rationale**: 主役の歯は proxy でなく実 pipeline を通す E2E であるべき。`commitFinalState` 直呼びの半 E2E は
guard-halt バグ（pipeline が止まらない）を隠したため。実 `Pipeline.run()` を通せば、後続 step を実行しない
不変が主役テストで assert される。

**Alternatives considered**:
- *却下*: `commitFinalState` 直呼びの半 E2E で代替する（＝現状 TC-INT-006）。pipeline の停止・publisher 到達の
  因果を検証できない。
- *採否は実装裁量*: Machine B の resume を `ResumeCommand`（CommandRunner）全体で通すか、resume の中核
  （resolve → running 遷移 → `Pipeline.run`）で通すかは実装裁量。最低要件は「実 `Pipeline.run()` が resume
  step を起動する」こと。

### D4: resume-step `reads()` 評価失敗を fail-closed にする

`verify-checkpoint.ts:190-208` の resume-step `reads()` tree-precheck で、`reads()` が throw したときの
`catch { /* skip */ }`（line 195-197）を、`checkpointNotAttachableError` の throw に変える。

- reason は `"resume-reads-unevaluable"`（新規自由文字列。error code 追加不要）、detail に step 名と原因を含める。
- verify は materialize より前に走る（D-Context の attach 順序）ため、throw すれば job state / worktree /
  sidecar は一切作られない。

**Rationale**: 検証不能は fail-closed。resume step が必要とする入力を証明できない（`reads()` が評価できない）
なら、attachability を証明できないので拒否する。scope-unevaluable → fail-closed（#837 の B-11、round
inspection unavailable → escalation と同じ規律）と整合する。

**Alternatives considered**:
- *却下*: `reads()` throw で precheck を skip（fail-open）。証明できないのに attach を通す（本穴）。

## Risks / Trade-offs

- **[Risk] D1 の終端ガードが escalation/exhaustion の既存終端を壊す** → escalation は step 失敗
  （`status="failed"`）→ `getStepOutcome`→`"error"`→escalate terminal で awaiting-resume に遷移する。
  exhaustion は loop body 後半（`tryExhaust`→`handleExhausted`）で awaiting-resume に遷移し自前で break
  する。どちらも「step 実行直後の収束点」では status がまだ `running`/`failed` であり、D1 ガードは発火しない。
  よって escalation/exhaustion 経路は不変。既存の escalation/exhaustion 挙動保存テストが無変更 green で守る。
- **[Risk] D1 が loop step exit の history 追記を skip する** → guard-halt 時、loop step の
  「iteration completed」history（`pipeline.ts:320-334`）は追記されない。halt の interruption record と
  failed step result が中断を記録するため情報は失われない。guard-halt を pipeline レベルで終端させる既存
  テストは無く（現状はバグで継続していた）、退行リスクは無い。→ Mitigation: 新規 unit テストで終端挙動を固定。
- **[Risk] D2 で attach 失敗時に孤立 branch が残る** → combined `-b` 失敗後に削除しないため、fresh clone に
  孤立 local branch が残りうる。データ損失より遥かに軽微で、`git branch -D` 手動 or prune で回収可能。
  → Mitigation: 安全側の意図として design/spec に明記。
- **[Risk] D2 のリネームが呼び出し側を壊す** → `preserveBranchOnFailure` は positional 第 7 引数で、値・既定値・
  意味（true=削除しない）は不変。呼び出し側は materializer attach arm のみが明示指定（`true`）。manager テストは
  positional なので無変更 green。→ Mitigation: interface doc / jsdoc を所有意味で更新し、名前と挙動を一致させる。
- **[Risk] D3 の E2E が重く flaky** → real git（bare + 2 clone）＋実 pipeline で構成が大きい。既存
  `attach-integration.test.ts` / `pipeline-integration.test.ts` の確立パターン（git fixture、
  `makeTestRuntimeStrategy`、fake runner）を再利用して flakiness を抑える。fake runner の呼び出し回数で
  「後続 step 不実行」を決定的に assert する（時間依存にしない）。
- **[Trade-off] getStepOutcome 硬化と終端ガードの二重化** → routing 上は終端ガードだけで足りるが、
  request が名指しした穴を source で閉じる意図と fail-safe のため getStepOutcome も硬化する。二経路は
  相補的（ガード＝enforcement、getStepOutcome＝source of truth + 退行時の安全網）で、design に役割を明記する。

## Open Questions

- なし（構造判断は ADR-20260715 と #837 design で確定済み。本 change は behavior 実装のみ）。
