# Spec: awaiting-resume guard-halt を制御出口にし、attach 硬化を完了する

## Requirements

### Requirement: Pipeline SHALL treat a guard-halt awaiting-resume as a terminal control exit

A step execution unit — sequential step または coordinator round のいずれか — が job を
`status="awaiting-resume"` に遷移させた場合、`Pipeline.run()` は後続 step を **実行してはならない
（MUST NOT）**。pipeline は halt を honor して loop を停止し、loop 末尾の awaiting-resume publisher seam
（`commitFinalState`）に到達 **しなければならない（SHALL）**。既存の escalation（failed→error→escalate）
および exhaustion 経路の終端挙動は変更 **してはならない（MUST NOT）**。

#### Scenario: sequential step の guard-halt が後続 step を実行しない

**Given** 実行中の pipeline が sequential step（例: implementer）を実行し
**And** その step が guard-halt（timeout / drift）で job を `status="awaiting-resume"` にした
**When** `Pipeline.run()` が当該 step の実行を終えた
**Then** pipeline は transition table 上の後続 step（例: verification）を実行しない
**And** 返り値の `state.status` は `"awaiting-resume"` である
**And** awaiting-resume publisher seam（`commitFinalState`）に到達する

#### Scenario: coordinator/round 経路の guard-halt が後続 step を実行しない

**Given** parallel review coordinator の round が実行され
**And** member step が guard-halt（timeout）を起こし round が job を終端方向（awaiting-resume）に導く
**When** `Pipeline.run()` が当該 round を終えた
**Then** pipeline は round の後続 step（例: conformance）を実行しない
**And** 返り値の `state.status` は `"awaiting-resume"` である

#### Scenario: escalation / exhaustion は従来どおり終端する

**Given** step が `status="failed"`（escalation）または loop が予算を使い切った（exhaustion）
**When** `Pipeline.run()` が当該 step / loop を終えた
**Then** pipeline は従来どおり escalate / exhaustion 終端で awaiting-resume に遷移し publisher seam に到達する
**And** guard-halt 用の終端ガードはこの経路の resumePoint / error を上書きしない

### Requirement: Attach branch materialization SHALL only delete branches this call provably created

attach の worktree materialize は、cleanup 対象を「この呼び出しが作成したと証明できる branch」に限定
**しなければならない（SHALL）**。事前 `rev-parse`（観測時の branch 不在）を所有証明に使用 **してはならない
（MUST NOT）**。combined `git worktree add -b` の失敗後は、attach 経路では branch を自動削除 **してはならない
（MUST NOT）**。new-run 経路の自己作成 branch の失敗時 cleanup は変更 **してはならない（MUST NOT）**。

#### Scenario: check と create の間に同名 branch が出現しても他者 branch を削除しない

**Given** attach が feature branch 名で worktree を作ろうとし
**And** materialize が「この呼び出しが作成したと証明できない」状態で `git worktree add -b <branch>` が失敗する
（別プロセスが同名 branch を先に作った race を模す）
**When** WorktreeManager が失敗を処理する
**Then** `git branch -D <branch>` は実行されない
**And** 元の worktree add エラーが伝播する

#### Scenario: new-run の自己作成 branch は失敗時に cleanup される（不変）

**Given** new-run が一意名 branch（`<slug>-<jobId8>`）で worktree を作ろうとし
**And** `git worktree add -b <branch>` が失敗する（`preserveBranchOnFailure` 未指定＝既定 false）
**When** WorktreeManager が失敗を処理する
**Then** `git branch -D <branch>` が実行される（従来挙動）

### Requirement: A guard-halt awaiting-resume SHALL publish a resumable single-commit checkpoint attachable from a separate clone

制御された guard-halt（timeout / drift）由来の awaiting-resume 出口は、self-consistent な checkpoint を
origin へ **単一 commit** として publish **しなければならない（SHALL）**。別 clone は publish された同じ
commit を attach でき、その状態から実 `job resume`（実 `Pipeline.run()`）を **開始できなければならない
（SHALL）**。この不変は proxy 直呼びでない、実 pipeline を通す統合テストで固定 **しなければならない（SHALL）**。

#### Scenario: 実 pipeline guard-halt → publish → 別 clone attach → resume 開始

**Given** Machine A で実 `Pipeline.run()` が step を guard-halt（timeout / drift）させ job を
`status="awaiting-resume"` にした
**When** publisher seam が発火する
**Then** Machine A は後続 step を実行していない
**And** origin/<branch> の HEAD に `checkpoint: <slug>` の単一 commit が積まれ、その state.json は
`status="awaiting-resume"` である
**And** Machine B（別 clone）で `job attach` が当該 checkpoint を検証・materialize できる
**And** Machine B で実 `job resume`（実 `Pipeline.run()`）が resume step を起動する

### Requirement: Checkpoint verification SHALL fail closed when the resume step reads() cannot be evaluated

checkpoint verify の resume-step `reads()` tree-precheck は、`reads()` の評価が throw した場合、precheck を
skip **してはならず（MUST NOT）**、`CHECKPOINT_NOT_ATTACHABLE` で attach を拒否 **しなければならない（SHALL）**。
verify は materialize より前に実行されるため、拒否時に job state / worktree / sidecar は一切作られては
**ならない（MUST NOT）**。

#### Scenario: reads() が throw したら fail-closed で拒否し副作用を残さない

**Given** attach 対象の checkpoint の resume step の `reads()` が評価中に例外を投げる
**When** `verifyCheckpoint` が resume-step tree-precheck を実行する
**Then** `CHECKPOINT_NOT_ATTACHABLE`（reason: `resume-reads-unevaluable`）が throw される
**And** job state / worktree / sidecar は一切作られない
