# Test Cases: post-merge-worktree-cleanup

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 9
- **Manual**: 1
- **Priority**: must: 7, should: 3, could: 0

---

### TC-001: sidecar フォールバックで worktreePath 解決・削除

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: post-merge cleanup は worktreePath を三段フォールバックで解決する > Scenario: state.worktreePath が null だが sidecar に記録されている

---

### TC-002: 規約パスフォールバックで worktreePath 解決・削除

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: post-merge cleanup は worktreePath を三段フォールバックで解決する > Scenario: state.worktreePath が null で sidecar もないが規約パスが存在する

---

### TC-003: フォールバック全段失敗時に警告が出力される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktreePath が解決できない場合は警告を出す > Scenario: フォールバック三段が全て失敗して worktreePath が null

---

### TC-004: --no-worktree モードでは worktree 未解決警告が出ない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: worktreePath が解決できない場合は警告を出す > Scenario: --no-worktree モードでは警告は出ない

---

### TC-005: フォールバック解決が liveness sidecar 削除より前に完了する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: フォールバック解決は liveness sidecar 削除より前に行う > Scenario: 解決後に cleanup が sidecar を削除しても解決済みパスは保持される

---

### TC-006: post-merge-cleanup — worktreePath=null かつ worktree モードで警告・削除スキップ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > TC-PMC-001

**GIVEN** `worktreePath: null`, `noWorktree: false`
**WHEN** `runPostMergeCleanup` を呼ぶ
**THEN** `process.stderr.write` に worktree パス未解決の警告メッセージ（`"worktree path could not be resolved"` を含む文字列）が出力される
**THEN** `worktreeManagerFn` から返した `manager.remove` は呼ばれない

---

### TC-007: post-merge-cleanup — worktreePath が設定済みで worktree 削除が実行され警告なし

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 > TC-PMC-002

**GIVEN** `worktreePath: "/tmp/wt/my-slug-abc12345"`, `noWorktree: false`
**WHEN** `runPostMergeCleanup` を呼ぶ
**THEN** `manager.remove` が `worktreePath` と `cwd` を引数として呼ばれる
**THEN** `process.stderr.write` に worktree 未解決の警告は出ない

---

### TC-008: post-merge-cleanup — --no-worktree モードでは警告・削除ともに行われない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 > TC-PMC-003

**GIVEN** `worktreePath: null`, `noWorktree: true`
**WHEN** `runPostMergeCleanup` を呼ぶ
**THEN** `manager.remove` は呼ばれない
**THEN** `process.stderr.write` に worktree 未解決の警告は出ない

---

### TC-009: merge-then-archive — state.worktreePath=null でも sidecar 解決済みパスが cleanup に渡る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 > TC-MTA-WORKTREE-FALLBACK

**GIVEN** `state.worktreePath: null`
**GIVEN** `resolveWorktreePathForArchive` が `"/resolved/path/my-slug-abc12345"` を返すようにモック設定済み
**GIVEN** PR が OPEN の状態でチェックが success → merge 成功
**WHEN** `runMergeThenArchive` を呼ぶ
**THEN** `runPostMergeCleanup` が `worktreePath: "/resolved/path/my-slug-abc12345"` で呼ばれる
**THEN** 終了コードとして `exitCode: 0` が返る

---

### TC-010: end-to-end — local 実行で archive --with-merge 後に worktree とブランチが削除される

**Category**: manual
**Priority**: must
**Source**: request.md > 受け入れ基準（local 再現テスト）

**GIVEN** local ジョブが pr-create まで完走しており、worktree が存在する
**GIVEN** `state.worktreePath` が job state に書かれていない（local 実行の既存挙動）
**WHEN** `job archive <slug> --with-merge` を実行する
**THEN** PR が merge される
**THEN** worktree ディレクトリが削除される（`git worktree list` に残らない）
**THEN** feature ブランチが削除される（ブランチ削除の警告が出ない）

---

## Result

```yaml
result: completed
total: 10
automated: 9
manual: 1
must: 7
should: 3
could: 0
blocked_reasons: []
```
