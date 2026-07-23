# Test Cases: operator-canon-apply-on-resume

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 14, should: 4, could: 0

---

### TC-001: canon escalation → hand-edit → resume --apply-canon succeeds (mado-os 封鎖)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume --apply-canon commits operator canon changes before step execution > Scenario: canon escalation followed by hand-edit and resume --apply-canon succeeds

---

### TC-002: resume --apply-canon は clean worktree でも step を起動する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume --apply-canon commits operator canon changes before step execution > Scenario: resume --apply-canon is a no-op when worktree is clean

---

### TC-003: --apply-canon は保護正典パス以外の dirty を worktree に残す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --apply-canon applies only protected canon paths > Scenario: non-canon dirty files remain untouched after --apply-canon

---

### TC-004: flag なし resume は保護正典 dirty 時に案内付きで停止する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: flag-less resume fails closed when protected canon is dirty > Scenario: flag-less resume halts with guidance when protected canon is dirty

---

### TC-005: flag なし resume は clean worktree で正常起動する（リグレッション）

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: flag-less resume fails closed when protected canon is dirty > Scenario: flag-less resume succeeds when worktree is clean

---

### TC-006: egress チェックが operator-apply commit OID を通過させる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: operator-apply commit OID is recorded in synthesizedCommits before the step runs > Scenario: egress check passes for the operator-apply commit

---

### TC-007: CANON_FINDING_ESCALATION hint が --apply-canon を案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CANON_FINDING_ESCALATION hint mentions --apply-canon > Scenario: hint text guides operator to --apply-canon

---

### TC-008: buildCanonEscalationReason の出力が --apply-canon を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CANON_FINDING_ESCALATION hint mentions --apply-canon > Scenario: buildCanonEscalationReason output mentions --apply-canon

---

### TC-009: detectCanonDirtyPaths — clean worktree で [] を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01, T-07 > TC-U1

**GIVEN** `git status --porcelain -z` がゼロバイト出力を返す worktree (モック spawnFn)
**WHEN** `detectCanonDirtyPaths(slug, worktreePath, spawnFn)` を呼ぶ
**THEN** 戻り値が空配列 `[]` である

---

### TC-010: detectCanonDirtyPaths — 保護正典パスのみを返す（混在 dirty）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01, T-07 > TC-U2

**GIVEN** `git status --porcelain -z` が保護正典パスと非保護パスを混在で返す (モック spawnFn)
**WHEN** `detectCanonDirtyPaths(slug, worktreePath, spawnFn)` を呼ぶ
**THEN** 戻り値に保護正典パス(`specrunner/changes/<slug>/design.md` 等)のみが含まれ、非保護パス(`src/foo.ts` 等)は含まれない

---

### TC-011: detectCanonDirtyPaths — 非保護パスのみが dirty の場合 [] を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01, T-07 > TC-U3

**GIVEN** `git status --porcelain -z` が `src/feature.ts` のみを dirty として返す (モック spawnFn)
**WHEN** `detectCanonDirtyPaths(slug, worktreePath, spawnFn)` を呼ぶ
**THEN** 戻り値が空配列 `[]` である

---

### TC-012: detectCanonDirtyPaths — git status 失敗時に throw する (fail-closed)

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01, T-07 > TC-U4

**GIVEN** spawnFn が `git status` を non-zero exit で返す (モック)
**WHEN** `detectCanonDirtyPaths(slug, worktreePath, spawnFn)` を呼ぶ
**THEN** 例外が throw される（`[]` に縮退しない）

---

### TC-013: commitOperatorCanon — 正しいメッセージの commit を作成し OID を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01, T-07 > TC-U5, TC-U6

**GIVEN** 実 tmp git リポジトリにて保護正典パスに変更ファイルが存在する
**WHEN** `commitOperatorCanon(slug, worktreePath, [canonPath], spawnFn)` を呼ぶ
**THEN** `git log -1 --format=%s` が `operator-apply: <slug>` を返す
**AND** 戻り値が空でない OID 文字列である
**AND** `git diff-tree --name-only <oid>` が指定した canonPath のみを含む

---

### TC-014: commitOperatorCanon — git add 失敗時に throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01, T-07 > TC-U7

**GIVEN** spawnFn が `git add` を non-zero exit で返す (モック)
**WHEN** `commitOperatorCanon(slug, worktreePath, [canonPath], spawnFn)` を呼ぶ
**THEN** 例外が throw される

---

### TC-015: CLI --apply-canon フラグが ResumeCommand まで伝達される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `specrunner job resume --apply-canon <slug>` の argv をパースする
**WHEN** `command-registry.ts` のフラグ解析が実行される
**THEN** parse エラーが発生しない
**AND** `ResumeCommand` のコンストラクタに渡る options に `applyCanon: true` が含まれる

---

### TC-016: --no-worktree + --apply-canon の組み合わせは警告のみで step を開始する

**Category**: integration
**Priority**: should
**Source**: design.md > D6

**GIVEN** `resolvedWorktreePath` が null の状態 (`--no-worktree` モード)
**AND** `--apply-canon` フラグが指定されている
**WHEN** `ResumeCommand.prepare()` が実行される
**THEN** warning が stderr に出力される
**AND** dirty チェックはスキップされる
**AND** 例外を throw せず step が正常に起動する

---

### TC-017: 既存 resume フラグが --apply-canon 追加後もリグレッションしない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `--force`, `--from`, `--verbose`, `--quiet`, `--prompt`, `--prompt-file`, `--json`, `--no-worktree` の各フラグを個別に指定した argv
**WHEN** `command-registry.ts` のフラグ解析が実行される
**THEN** 全フラグが parse エラーなく解釈され、`ResumeCommand` に正しい値が渡る

---

### TC-018: 破壊確認 — fail-closed guard を除去すると TC-004 が fail する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 > TC-R6

**GIVEN** `ResumeCommand.prepare()` の `dirtyCanonPaths.length > 0 && !applyCanon` による fail-closed 停止ガードを除去するパッチを当てる
**WHEN** TC-004 と同一シナリオ（保護正典 dirty + flag なし resume）を実行する
**THEN** `PrepareError` が throw されず step が起動してしまうため TC-004 が fail する
（ガードが load-bearing であることの確認として記録する）

---

## Result

```yaml
result: completed
total: 18
automated: 18
manual: 0
must: 14
should: 4
could: 0
blocked_reasons: []
```
