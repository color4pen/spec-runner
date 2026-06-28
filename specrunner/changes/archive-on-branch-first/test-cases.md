# Test Cases: archive on feature branch, base reached only via merge

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 15
- **Manual**: 1
- **Priority**: must: 10, should: 5, could: 1

---

### TC-001: 記帳 commit が feature branch に乗り remote feature branch へ push される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive recording lands on the feature branch, never on base > Scenario: 記帳 commit が feature branch に乗り remote feature branch へ push される

---

### TC-002: merge なし archive は base に触れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive recording lands on the feature branch, never on base > Scenario: merge なし archive は base に触れない

---

### TC-003: protected base 環境で merge なし archive が成功する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive completes when base is protected > Scenario: protected base 環境で merge なし archive が成功する

---

### TC-004: merge なしでも status が archived に確定する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Status finalizes to archived at recording time, independent of merge > Scenario: merge なしでも status が archived に確定する

---

### TC-005: merge 後の cleanup は status を書き換えない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Status finalizes to archived at recording time, independent of merge > Scenario: merge 後の cleanup は status を書き換えない

---

### TC-006: CI green を待ってから merge し merge 後に cleanup する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: with-merge waits for CI green on the post-archive head, then merges, then cleans up > Scenario: CI green を待ってから merge し、merge 後に cleanup する

---

### TC-007: merge が成立しなければ cleanup しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: with-merge waits for CI green on the post-archive head, then merges, then cleans up > Scenario: merge が成立しなければ cleanup しない

---

### TC-008: merge なし archive は feature branch を残す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: No-merge archive preserves the feature branch and worktree > Scenario: merge なし archive は feature branch を残す

---

### TC-009: status 集合と遷移が不変である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: No intermediate status is introduced > Scenario: status 集合と遷移が不変である

---

### TC-010: 記帳済み feature branch への再実行は no-op

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive recording and cleanup are idempotent and recoverable > Scenario: 記帳済み feature branch への再実行は no-op

---

### TC-011: with-merge 再実行で既に merged なら cleanup のみ実行する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Archive recording and cleanup are idempotent and recoverable > Scenario: with-merge 再実行で既に merged なら cleanup のみ実行する

---

### TC-012: worktree 撤去済みで status が terminal でない異常系は escalation を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** worktree path が存在しない（既に撤去済み）が job status が `awaiting-archive`（terminal でない）状態
**WHEN** merge なしの `job archive <slug>` を実行する
**THEN** resume 案内付き escalation が返される（exit 0 ではなくエラー扱い）
**AND** worktree への書き込みは一切行われない

---

### TC-013: --no-worktree モードの記帳前に feature branch が checkout される

**Category**: unit
**Priority**: should
**Source**: design.md > D1 / tasks.md > T-01

**GIVEN** `--no-worktree` モードで status `awaiting-archive` の job が存在し、main repo が任意の branch 上にある
**WHEN** merge なしの `job archive <slug>` を実行する
**THEN** 記帳 git 操作（`git mv` / `markJobArchived` / `git commit`）の前に `git checkout <feature-branch>` が main repo 上で実行される
**AND** `git checkout <base>` は実行されない

---

### TC-014: --no-worktree の cleanup では git checkout <base> が base の内容を変更しない

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-02

**GIVEN** `--no-worktree` モードで記帳済み（status `archived`）かつ PR が MERGED の job
**WHEN** merge 後の cleanup が実行される
**THEN** main repo が feature branch 上にあるため `git checkout <base>` が実行されて branch から離れる
**AND** その後 local feature branch が削除される
**AND** 当該 `git checkout <base>` の後に `git commit` / `git push origin <base>` は実行されない（base の内容を変更しない）

---

### TC-015: with-merge の CI 待ちは記帳 commit の headSha 一致確認後に check rollup を信頼する

**Category**: unit
**Priority**: could
**Source**: design.md > D5

**GIVEN** `--with-merge` 実行中に記帳 commit を push した直後、GitHub の eventual consistency により `getPullRequest` が旧 headSha を返す状態
**WHEN** CI green 待ちの wait loop が動作する
**THEN** `getPullRequest().headSha == 記帳 commit SHA` が観測されるまで check rollup の結果を採用しない
**AND** headSha 一致後に CI が green であれば squash merge へ進む

---

### TC-016: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 本変更後のコードベース
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** typecheck がエラーなく完了する
**AND** すべてのテストが green（0 failures）で完了する

---

## Result

```yaml
result: completed
total: 16
automated: 15
manual: 1
must: 10
should: 5
could: 1
blocked_reasons: []
```
