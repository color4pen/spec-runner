# awaiting-resume guard-halt を制御出口にし、attach 硬化を完了する（closure follow-up）

## Meta

- **type**: spec-change
- **slug**: remote-checkpoint-closure-followup
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260715 で ratify 済み。本 request は #837 が閉じ残した correctness を実装で埋める follow-up。新規 architecture ADR を要さない。 -->

## 背景

#837（remote checkpoint publish/attach correctness closure）は publisher seam・OID 固定・述語強化を入れたが、以下が閉じ残った。これらは「remote checkpoint を単一 immutable commit として publish し、その同じ commit を検証・materialize して安全に再束縛する」不変の**穴**であり、attach を実運用で成立させるには必須。

- **guard-halt 由来の `awaiting-resume` が pipeline を止めない**（P0）。halt が honor されず、publisher seam にも到達しない。
- **branch cleanup の所有証明が race で崩れる**（P0）。他者の branch を削除しうる（データ損失）。
- **主役 E2E が実 pipeline を通していない**（P0/歯）。この食い違いが上の guard-halt 問題を隠した。
- **`reads()` 評価失敗が fail-open**（P2）。証明できないのに attach を通す。

## 現状コードの前提

- `getStepOutcome`（`src/core/pipeline/pipeline.ts:578`）は `state.status === "failed"` のみ `"error"` を返す。guard-halt が `status="awaiting-resume"` ＋ step verdict `null` にした場合、error 分岐を外れ、verdict null なので `step.completionVerdict`（producer step は `"success"`）or `"approved"` に落ちる。→ 通常遷移が引かれ **pipeline は後続 step を実行し続ける**。loop を break しないので publisher seam（`pipeline.ts:504`）にも到達しない。
- `awaiting-resume` の guard-halt を生むのは `makeTimeoutHalt`（`src/core/step/step-halt.ts:119`, poll timeout: `executor.ts:361`）と `makeDriftHalt`（`step-halt.ts:195`）。commit-orchestrator の `commitHalt` が `transitionJob(awaiting-resume)` ＋ rethrow し、`pipeline.ts:279` の catch が state を受ける。
- `src/core/runtime/workspace-materializer.ts` は attach 時、`git rev-parse --verify refs/heads/<branch>`（check）→ `manager.create`（`git worktree add -b`, create）の順で、check と create が**非 atomic**。`src/core/worktree/manager.ts:114` は add 失敗時 `branchWasPreExisting=false` なら `git branch -D <branch>`。check 後・create 前に別プロセスが同名 branch を作ると、他者の branch が削除されうる。
- `tests/attach/attach-integration.test.ts` の TC-INT-006 は `commitFinalState()` を直呼びで、実 `Pipeline.run()` を通していない。TC-INT-005 は state 解決までで `job resume` を開始しない。`tasks.md` の T-09 は3項目とも完了扱い（食い違い）。
- `src/core/attach/verify-checkpoint.ts` の resume-step `reads()` precheck は `reads()` が throw すると precheck を丸ごと skip する（fail-open）。

## 要件

1. **[P0] guard-halt の `awaiting-resume` を終端制御出口にする**: step 実行（sequential・coordinator/round の両経路）が job を `status="awaiting-resume"` にした場合、pipeline は**後続 step を実行してはならない**。halt を honor して停止し、loop 後の publisher seam（`pipeline.ts:504`）に到達させる。`getStepOutcome` に `awaiting-resume` を素通りさせ completionVerdict に委ねる現状を塞ぐ。既存の escalation（failed→error→escalate）/ exhaustion 経路の挙動は変えない。

2. **[P0] branch cleanup を所有証明ベースにする**: cleanup 対象は「この呼び出しが作成したと**証明できる** branch」のみ。事前 `rev-parse`（観測時の不在）を所有証明に使わない。branch 作成を独立した atomic 操作にして成功時のみ `createdByThisCall=true` にする、または combined `git worktree add -b` 失敗後は branch を自動削除しない。既存 new-run の自己作成 branch cleanup は挙動を変えない。

3. **[P0/主役 E2E] 実 pipeline を通した publish→attach→resume を固定する**: 実 `Pipeline.run()` を **guard-halt（timeout or drift）経由で** `awaiting-resume` に落とし → publisher が origin へ checkpoint を単一 commit として publish → 別 clone で `job attach` → 実 `job resume` が開始する、を1本の統合テストで固定する。`commitFinalState()` 直呼びの proxy で代替しない。

4. **[P2] `reads()` 評価失敗を fail-closed にする**: verify-checkpoint の resume-step `reads()` が throw した場合、precheck を skip せず `CHECKPOINT_NOT_ATTACHABLE` で拒否する（attachability を証明できないため。scope-unevaluable→fail-closed / B-11 と整合）。

## スコープ外

- `running` job の別マシン takeover / lease / epoch（別 ADR）。
- `origin/*` の暗黙走査による job 発見。
- attach 後の自動 resume。
- managed runtime の attach（local runtime のみ）。

## 受け入れ基準

- [ ] **【主役 E2E】** 実 `Pipeline.run()` が guard-halt（timeout or drift）で `awaiting-resume` に落ちた時、(a) 後続 step を実行しない、(b) publisher が origin へ checkpoint を publish、(c) 別 clone の `job attach` → 実 `job resume` が開始する、を1本の統合テストで固定する（proxy 直呼びでない）。
- [ ] guard-halt で `awaiting-resume` になった後、pipeline が次 step を実行しないことを `Pipeline.run()` のユニットテストで固定する（sequential）。coordinator/round 経路でも後続を実行しないことを固定する。
- [ ] check と create の間に同名 branch が出現する race を模しても、この呼び出しが作成していない branch は `-D` されないことをテストで固定する。既存 new-run の自己作成 branch cleanup テストは無変更で green。
- [ ] resume step の `reads()` が throw した場合、attach が `CHECKPOINT_NOT_ATTACHABLE` で拒否し、job state / worktree / sidecar を一切作らないことをテストで固定する。
- [ ] 既存の attach / publisher / worktree / escalation・exhaustion 挙動保存テストが無変更で green。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **guard-halt(awaiting-resume) は resumable checkpoint 生成イベント**。pipeline は「halt を honor して停止」かつ「publisher で publish」の両方を満たす。→ 却下: `getStepOutcome` に `awaiting-resume` を素通りさせ completionVerdict に委ねる現状（halt が無視され後続 step が走る）。
- **branch 所有は「この呼び出しが作成した」で判定**する。→ 却下: 事前 `rev-parse` の観測時不在で判定する現状（check-then-create race で他者の branch を削除）。
- **主役の歯は proxy でなく実 pipeline を通す E2E**。→ 却下: `commitFinalState` 直呼びの半 E2E（guard-halt バグを隠した）。
- **検証不能は fail-closed**。→ 却下: `reads()` throw で precheck skip（fail-open）。
