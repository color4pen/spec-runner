# Test Cases: `--no-worktree` 実行モード

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 16, should: 7, could: 0

---

### TC-001: run が --no-worktree フラグを受理する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: run / resume は `--no-worktree` フラグを受け付ける > Scenario: run が --no-worktree を受理する

---

### TC-002: resume が --no-worktree フラグを受理する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: run / resume は `--no-worktree` フラグを受け付ける > Scenario: resume が --no-worktree を受理する

---

### TC-003: --no-worktree run が worktree を作らず feature branch を作成する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --no-worktree の run は worktree を作らず cwd 上で feature branch を作成する > Scenario: worktree を作らず feature branch を作成する

---

### TC-004: --no-worktree resume が worktree を作らず cwd で再開する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --no-worktree の resume は既存 feature branch checkout を再利用する > Scenario: 既存 checkout 上で worktree を作らず再開する

---

### TC-005: dirty な working tree で WORKTREE_DIRTY エラーになる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --no-worktree は実行前に working tree が clean であることを要求する > Scenario: dirty な working tree で停止する

---

### TC-006: clean な working tree では --no-worktree が続行する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: --no-worktree は実行前に working tree が clean であることを要求する > Scenario: clean な working tree では続行する

---

### TC-007: no-worktree フラグが state.json に残る（strip されない）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: no-worktree モードは state に永続化され archive から判別できる > Scenario: no-worktree フラグが state.json に残る

---

### TC-008: archive Phase 0 が state から no-worktree を判別する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: no-worktree モードは state に永続化され archive から判別できる > Scenario: archive が no-worktree を判別する

---

### TC-009: no-worktree 時の sidecar に worktreePath: null が書かれる

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: no-worktree 時の sidecar は worktreePath を null とする > Scenario: sidecar に worktreePath: null を書く

---

### TC-010: no-worktree 実行中プロセス終了で awaiting-resume へ遷移する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: no-worktree 時の exit-guard は cwd の state から job を特定する > Scenario: 実行中プロセス終了で awaiting-resume へ遷移する

---

### TC-011: awaiting-resume へ遷移した no-worktree job を再開できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: no-worktree 時の exit-guard は cwd の state から job を特定する > Scenario: awaiting-resume へ遷移した job を再開できる

---

### TC-012: sidecar 不在の checkout で no-worktree resume が状態を永続化する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: no-worktree 時の state store 解決は sidecar に依存しない > Scenario: sidecar 不在の checkout で resume が状態遷移を永続化する

---

### TC-013: no-worktree job の archive で worktree remove/prune がスキップされる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive は no-worktree 時に worktree remove/prune をスキップし feature branch を削除する > Scenario: no-worktree job の archive で worktree 撤去をスキップする

---

### TC-014: worktree job の archive は従来通り worktree remove/prune を実行する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive は no-worktree 時に worktree remove/prune をスキップし feature branch を削除する > Scenario: worktree job の archive は従来通り worktree を撤去する

---

### TC-015: フラグ無し run が従来通り worktree を作成する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree モードの挙動は不変 > Scenario: フラグ無し run が worktree を作る

---

### TC-016: noWorktree フィールドが slug-mode persist で strip されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `JobState` に `noWorktree: true` をセットして slug-mode で persist する
**WHEN** `stateToStateJson` が state.json を生成する
**THEN** 出力 JSON に `noWorktree: true` が含まれ、machine-local フィールド（`worktreePath` / `pid` / `session`）のみが strip されている

---

### TC-017: noWorktree 欠如の既存 state が validateJobState を通る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `noWorktree` フィールドを持たない旧来形式の state.json
**WHEN** `validateJobState` でパースする
**THEN** バリデーションエラーなく通過し、`state.noWorktree` が `undefined` である

---

### TC-018: worktreeDirtyError が WORKTREE_DIRTY コードを持つ SpecRunnerError を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** 任意の detail 文字列
**WHEN** `worktreeDirtyError(detail)` を呼ぶ
**THEN** `code === "WORKTREE_DIRTY"` かつ `instanceof SpecRunnerError` であるエラーが返る

---

### TC-019: job start alias でも --no-worktree が受理される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `specrunner job start --no-worktree <slug>` を実行する
**WHEN** CLI がフラグをパースする
**THEN** フラグ解析エラーにならず、`noWorktree: true` が handler に渡る

---

### TC-020: フラグ無し run の state.json に noWorktree フィールドが含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `--no-worktree` を指定せずに run する
**WHEN** `PipelineRunCommand.prepare()` が jobState を seed する
**THEN** seed された state.json に `noWorktree` キーが存在しない（または `undefined`）

---

### TC-021: worktreePath 不在時に buildDeps / slugStoreOpts が cwd フォールバックで throw しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `workspace.worktreePath` が `undefined` の `WorkspaceContext`
**WHEN** `buildDeps` の `storeFactory` と `slugStoreOpts()` を呼ぶ
**THEN** 例外をスローせず、`stateRoot` として `workspace.cwd` が使われた `JobStateStore` が返る

---

### TC-022: worktreePath が null の場合 registerCleanup が worktree remove/prune をスキップする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `workspace.worktreePath` が `null` / `undefined` の状態で cleanup が発火する
**WHEN** `cleanupWorktreeOnFailure` が実行される
**THEN** worktree remove / prune が呼ばれず、エラーにならない

---

### TC-023: no-worktree job の archive で feature branch の local / remote 削除が実行される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-10

**GIVEN** `state.noWorktree === true` の完了済み job
**WHEN** `specrunner job archive <slug>` の Phase 2 が実行される
**THEN** worktree remove / prune は行われず、feature branch の local 削除と remote 削除がいずれも実行される

---

## Result

```yaml
result: completed
total: 23
automated: 23
manual: 0
must: 16
should: 7
could: 0
blocked_reasons: []
```
