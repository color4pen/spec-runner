# Test Cases: awaiting-resume guard-halt を制御出口にし、attach 硬化を完了する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 15, should: 1, could: 1

---

## A. guard-halt 終端制御（Pipeline）

### TC-001: sequential step guard-halt で後続 step を実行しない

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Pipeline SHALL treat a guard-halt awaiting-resume as a terminal control exit > Scenario: sequential step の guard-halt が後続 step を実行しない

---

### TC-002: coordinator/round 経路の guard-halt で後続 step を実行しない

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Pipeline SHALL treat a guard-halt awaiting-resume as a terminal control exit > Scenario: coordinator/round 経路の guard-halt が後続 step を実行しない

---

### TC-003: escalation / exhaustion の終端挙動は不変

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Pipeline SHALL treat a guard-halt awaiting-resume as a terminal control exit > Scenario: escalation / exhaustion は従来どおり終端する

---

### TC-004: getStepOutcome が awaiting-resume を completionVerdict に素通りさせない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01（getStepOutcome 硬化・fail-safe）

**GIVEN** Pipeline.runInternal 内で step 実行後に `state.status` が `"awaiting-resume"` になっている  
**WHEN** `getStepOutcome(state, step, verdict)` が呼ばれる  
**THEN** 返り値は `"awaiting-resume"` であり、`step.completionVerdict`（`"success"`）や `"approved"` には落ちない

---

## B. branch cleanup 所有証明

### TC-005: check-create 間の race で他者 branch を削除しない

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Attach branch materialization SHALL only delete branches this call provably created > Scenario: check と create の間に同名 branch が出現しても他者 branch を削除しない

---

### TC-006: new-run 自己作成 branch は失敗時に cleanup される（不変）

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Attach branch materialization SHALL only delete branches this call provably created > Scenario: new-run の自己作成 branch は失敗時に cleanup される（不変）

---

### TC-007: attach arm が所有証明用の事前 rev-parse を実行しない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-03（attach arm の事前 rev-parse 削除）/ tasks.md T-04

**GIVEN** `WorkspaceMaterializer` が `attach-from-checkpoint` arm で実行される  
**WHEN** feature branch 名で worktree の materialize を行う  
**THEN** branch 存在確認のための `git rev-parse --verify refs/heads/<branch>` は実行されない

---

### TC-008: attach arm が preserveBranchOnFailure=true で manager.create を呼ぶ

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-03（preserveBranchOnFailure 渡し固定）/ tasks.md T-04

**GIVEN** `WorkspaceMaterializer` が `attach-from-checkpoint` arm で実行される  
**WHEN** `manager.create(...)` を呼ぶ  
**THEN** 第 7 引数 `preserveBranchOnFailure` に `true` が渡される  
**AND** combined `git worktree add -b` が失敗しても `git branch -D <branch>` は実行されない

---

### TC-009: lock-contention 経路でも preserveBranchOnFailure=true なら branch を削除しない

**Category**: unit  
**Priority**: could  
**Source**: tasks.md T-04（lock-contention 経路でも no-D を 1 ケース）

**GIVEN** `WorktreeManager.create` が `preserveBranchOnFailure=true` で呼ばれ  
**AND** lock-contention retry 経路（`-b` なし worktree add）が走る  
**WHEN** `git worktree add` が失敗する  
**THEN** `git branch -D <branch>` は実行されない

---

## C. 主役 E2E（publish → attach → resume）

### TC-010: 実 Pipeline.run() guard-halt → publish → 別 clone attach → resume 開始

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: A guard-halt awaiting-resume SHALL publish a resumable single-commit checkpoint attachable from a separate clone > Scenario: 実 pipeline guard-halt → publish → 別 clone attach → resume 開始

---

## D. reads() fail-closed

### TC-011: reads() が throw したら CHECKPOINT_NOT_ATTACHABLE で拒否し副作用を残さない

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: Checkpoint verification SHALL fail closed when the resume step reads() cannot be evaluated > Scenario: reads() が throw したら fail-closed で拒否し副作用を残さない

---

### TC-012: reads() 評価失敗時の reason が "resume-reads-unevaluable" で detail が step 名・原因を含む

**Category**: unit  
**Priority**: should  
**Source**: tasks.md T-05（reason / detail の仕様）/ tasks.md T-06

**GIVEN** attach 対象 checkpoint の resume step の `reads()` が評価中に例外を投げる  
**WHEN** `verifyCheckpoint` が resume-step tree-precheck を実行する  
**THEN** throw される `CHECKPOINT_NOT_ATTACHABLE` の `reason` が `"resume-reads-unevaluable"` である  
**AND** `detail` に `resolvedStepName` と例外の `message` が含まれる

---

## E. 既存挙動保存（回帰）

### TC-013: 既存 attach 統合テスト（TC-INT-001..006 / TC-010）が無変更で green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-08（既存 attach 挙動保存）

**GIVEN** 本 change（T-01〜T-07）を適用した後  
**WHEN** `bun run test` を実行する  
**THEN** `tests/attach/attach-integration.test.ts` の TC-INT-001〜TC-INT-006・TC-010 がすべて green で通過する  
**AND** それらテストコードへの変更は一切ない

---

### TC-014: 既存 worktree manager テスト（TC-WTM-*）が無変更で green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-08 / tasks.md T-04（リネーム後の positional 引数互換性）

**GIVEN** `manager.ts` の第 7 引数を `branchWasPreExisting` から `preserveBranchOnFailure` にリネームした後  
**WHEN** `bun run test` を実行する  
**THEN** `tests/core/worktree/manager.test.ts` の全テスト（TC-WTM-015/016/025/026 等）が無変更で green である

---

### TC-015: 既存 parallel-review-round テストが無変更で green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-08（parallel-review 挙動保存）

**GIVEN** D1 の state ベース終端ガードを pipeline.ts に挿入した後  
**WHEN** `bun run test` を実行する  
**THEN** `src/core/pipeline/__tests__/parallel-review-round-*.test.ts` 等の parallel-review 関連テストが無変更で green である

---

### TC-016: 既存 pipeline escalation / exhaustion テストが無変更で green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-08（escalation・exhaustion 挙動保存）/ tasks.md T-02（回帰確認）

**GIVEN** D1 の終端ガード挿入後  
**WHEN** `bun run test` を実行する  
**THEN** `pipeline.test.ts` の escalation（failed→error→escalate）/ exhaustion（loop 予算切れ）ケースが無変更で green である  
**AND** guard-halt 用の終端ガードが escalation/exhaustion 経路の resumePoint / error / publisher 到達を上書きしていない

---

### TC-017: typecheck && test が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-08（全体検証）/ request.md 受け入れ基準

**GIVEN** 本 change の全タスク（T-01〜T-07）実装後  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラーなし・テスト失敗なしで正常終了する

---

## Result

```yaml
result: completed
total: 17
automated: 17
manual: 0
must: 15
should: 1
could: 1
blocked_reasons: []
```
