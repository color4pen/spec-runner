# Test Cases: 中断 step の書きかけ canon を resume が自動隔離して再走する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
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
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 27
- **Manual**: 0
- **Priority**: must: 26, should: 2, could: 0

---

## 自動隔離・続行（Spec Scenario 由来）

### TC-001: untracked な書きかけ canon がある中断 resume は隔離して続行する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume は中断 step の書きかけ canon を機械的裏づけ完全一致時に自動隔離する > Scenario: untracked な書きかけ canon がある中断 resume は隔離して続行する

### TC-002: tracked-modified な書きかけ canon がある中断 resume は隔離して続行する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume は中断 step の書きかけ canon を機械的裏づけ完全一致時に自動隔離する > Scenario: tracked-modified な書きかけ canon がある中断 resume は隔離して続行する

### TC-003: 隔離後に退避先へ evidence が残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 自動隔離は削除前に読める形の evidence を退避する > Scenario: 隔離後に退避先へ evidence が残る

---

## fail-closed halt（Spec Scenario 由来）

### TC-004: 中断の裏づけが無い dirty canon は halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 機械的裏づけの無い dirty canon は fail-closed で halt する > Scenario: 中断の裏づけが無い dirty canon は halt する

### TC-005: 中断 step の writes() 外の canon が混在する場合は halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 機械的裏づけの無い dirty canon は fail-closed で halt する > Scenario: 中断 step の writes() 外の canon が混在する場合は halt する

### TC-006: 前 step が正常完了している場合は halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 機械的裏づけの無い dirty canon は fail-closed で halt する > Scenario: 前 step が正常完了している場合は halt する

---

## --apply-canon 優先（Spec Scenario 由来）

### TC-007: --apply-canon 指定時は operator-apply commit を行う

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `--apply-canon` 明示は自動隔離より優先する > Scenario: `--apply-canon` 指定時は operator-apply commit を行う

---

## 退避失敗時の fail-closed（Spec Scenario 由来）

### TC-008: 退避書き込み失敗時は何も削除せず halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 退避失敗時は削除せず fail-closed で halt する > Scenario: 退避書き込み失敗時は何も削除せず halt する

---

## stale-running 経路（Spec Scenario 由来）

### TC-009: resumePoint 無しの stale 経路でも隔離判定が働く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: stale-running（SIGKILL / hard-crash）経路でも部分出力判定が機能する > Scenario: resumePoint 無しの stale 経路でも隔離判定が働く

---

## 冪等性（Spec Scenario 由来）

### TC-010: 隔離後の再 resume は dirty canon を検出しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 自動隔離後の再 resume は clean な gate 通過になる > Scenario: 隔離後の再 resume は dirty canon を検出しない

---

## isInterruptionBacked 単体テスト（pure helper）

### TC-011: isInterruptionBacked — stale 検出で true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `staleRunningDetected = true`、`resumePoint = null`
**WHEN** `isInterruptionBacked(null, true)` を呼ぶ
**THEN** `true` を返す

### TC-012: isInterruptionBacked — 全 4 interruption reason で true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `staleRunningDetected = false`、`resumePoint.reason` が `"signal"` / `"timeout"` / `"failure"` / `"exhaustion"` のいずれか
**WHEN** `isInterruptionBacked(resumePoint, false)` を呼ぶ
**THEN** いずれの reason でも `true` を返す

### TC-013: isInterruptionBacked — escalation reason で false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `staleRunningDetected = false`、`resumePoint.reason = "escalation"`
**WHEN** `isInterruptionBacked(resumePoint, false)` を呼ぶ
**THEN** `false` を返す

### TC-014: isInterruptionBacked — resumePoint null かつ stale=false で false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `staleRunningDetected = false`、`resumePoint = null`
**WHEN** `isInterruptionBacked(null, false)` を呼ぶ
**THEN** `false` を返す

---

## declaredCanonWritesForStep 単体テスト（pure helper）

### TC-015: declaredCanonWritesForStep("design") が正しい canon paths を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `stepName = "design"`、`isSpecRequired = true`（request.type が spec を要求する type）
**WHEN** `declaredCanonWritesForStep("design", state, deps)` を呼ぶ
**THEN** `design.md` / `tasks.md` / `spec.md` を含み、`protectedCanonPaths` 外のパス（非 canon path）を含まない配列を返す

### TC-016: declaredCanonWritesForStep — isSpecRequired=false で spec.md を含まない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `stepName = "design"`、request.type が `isSpecRequired = false` の type
**WHEN** `declaredCanonWritesForStep("design", state, deps)` を呼ぶ
**THEN** `design.md` / `tasks.md` を含み `spec.md` を含まない配列を返す

### TC-017: declaredCanonWritesForStep — 未知 step 名で [] を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `stepName = "unknown-step-xyz"`
**WHEN** `declaredCanonWritesForStep("unknown-step-xyz", state, deps)` を呼ぶ
**THEN** `[]` を返す（fail-closed）

---

## isInterruptedStepPartialCanon 単体テスト（pure helper）

### TC-018: isInterruptedStepPartialCanon — 4 条件すべて成立で true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `interruptionBacked = true`、`completedStepRunAbsent = true`、`dirtyCanonPaths = ["design.md", "tasks.md"]`、`declaredCanonWrites = ["design.md", "tasks.md", "spec.md"]`（全 dirty が宣言内に含まれる）
**WHEN** `isInterruptedStepPartialCanon({ dirtyCanonPaths, declaredCanonWrites, interruptionBacked, completedStepRunAbsent })` を呼ぶ
**THEN** `true` を返す

### TC-019: isInterruptedStepPartialCanon — 宣言外 canon 混在で false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `interruptionBacked = true`、`completedStepRunAbsent = true`、`dirtyCanonPaths = ["design.md", "test-cases.md"]`（`test-cases.md` は design の writes() 外）、`declaredCanonWrites = ["design.md", "tasks.md", "spec.md"]`
**WHEN** `isInterruptedStepPartialCanon(...)` を呼ぶ
**THEN** `false` を返す（条件 2 不成立）

### TC-020: isInterruptedStepPartialCanon — interruptionBacked=false で false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `interruptionBacked = false`、`completedStepRunAbsent = true`、`dirtyCanonPaths = ["design.md"]`、`declaredCanonWrites = ["design.md", "tasks.md", "spec.md"]`
**WHEN** `isInterruptedStepPartialCanon(...)` を呼ぶ
**THEN** `false` を返す（条件 3 不成立）

### TC-021: isInterruptedStepPartialCanon — completedStepRunAbsent=false で false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `interruptionBacked = true`、`completedStepRunAbsent = false`（完了 StepRun あり）、`dirtyCanonPaths = ["design.md"]`、`declaredCanonWrites = ["design.md", "tasks.md", "spec.md"]`
**WHEN** `isInterruptedStepPartialCanon(...)` を呼ぶ
**THEN** `false` を返す（条件 4 不成立）

### TC-022: isInterruptedStepPartialCanon — dirtyCanonPaths が空で false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `interruptionBacked = true`、`completedStepRunAbsent = true`、`dirtyCanonPaths = []`
**WHEN** `isInterruptedStepPartialCanon(...)` を呼ぶ
**THEN** `false` を返す（dirty が空では部分出力なし）

---

## quarantinePartialCanon 単体テスト（T-01 リファクタ）

### TC-023: quarantinePartialCanon が指定 canon path を退避してから除去する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 実 git リポジトリに untracked な `design.md` / `tasks.md` が存在し、`canonPaths = ["design.md", "tasks.md"]`
**WHEN** `quarantinePartialCanon(slug, worktreePath, canonPaths, spawnFn)` を呼ぶ
**THEN** 退避先（`.specrunner/local/<slug>/canon-quarantine-<timestamp>/`）に両ファイルの内容が書き出され、worktree からは除去され、戻り値の `reconciled` に両 path が含まれ `quarantineDir` に退避先が入っている

### TC-024: quarantinePartialCanon — 退避書き込み失敗時は throw し削除しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 退避先ディレクトリへの書き込みが失敗する状態（退避先を書き込み不能に設定）で `canonPaths` に 1 件以上の dirty path がある
**WHEN** `quarantinePartialCanon(...)` を呼ぶ
**THEN** throw し、対象 canon path は worktree から削除されていない（evidence-first / fail-closed 不変）

### TC-025: quarantinePartialCanon — canonPaths 空で no-op を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `canonPaths = []`
**WHEN** `quarantinePartialCanon(slug, worktreePath, [], spawnFn)` を呼ぶ
**THEN** `{ reconciled: [], quarantineDir: null }` を返し git コマンドを発行しない

---

## reconcileWorktreeArtifacts 後方互換（T-01 リファクタ）

### TC-026: reconcileWorktreeArtifacts の外部シグネチャと動作が不変である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** T-01 のリファクタ（内部 core 切り出し）後の `reconcileWorktreeArtifacts`
**WHEN** 既存テスト群（`reconcile-worktree.test.ts` / `resume-reconcile.test.ts` / `resume-worktree-reconciliation-e2e.test.ts`）を無改変で実行する
**THEN** 全テストが green のまま（外部シグネチャ・戻り値型・git コマンド列が不変であることの機械的歯）

---

## gate 配線レベルの追加 TC（Scenario 外）

### TC-027: --from で別 step へ redirect した resume は dirty canon でも自動隔離しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D2（条件 1: startStep === interruptedStep）

**GIVEN** `state.step = "design"`、`resumePoint.reason = "signal"`、`state.steps["design"]` 不在（中断裏づけ完全成立）、`dirtyCanonPaths = ["design.md"]`（design の writes() 内）で、かつ `--from` で `startStep = "spec-review"`（≠ "design"）と指定されている
**WHEN** `--apply-canon` なしで resume する
**THEN** `quarantinePartialCanon` は呼ばれず `PrepareError(1)` で fail-closed halt する（条件 1 不成立）

---

## 検証ゲート

### TC-028: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07

`bun run typecheck` および `bun run test` の両コマンドが 0 exit で完了すること。

---

## Result

```yaml
result: completed
total: 28
automated: 27
manual: 0
must: 26
should: 2
could: 0
blocked_reasons: []
```
