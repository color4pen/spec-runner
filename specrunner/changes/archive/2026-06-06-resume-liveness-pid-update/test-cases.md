# Test Cases: resume 時の liveness sidecar pid 更新

## Summary

- **Total**: 7 cases
- **Automated** (unit/integration): 5
- **Manual**: 2
- **Priority**: must: 4, should: 3

---

### TC-001: 既存 worktree 再利用時に sidecar の pid が現在プロセスで更新される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存 worktree 再利用時に sidecar の pid を現在プロセスで更新する > Scenario: 既存 worktree を再利用する resume

---

### TC-002: resume 後の job ls が running（stale? なし）を表示する

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 既存 worktree 再利用時に sidecar の pid を現在プロセスで更新する > Scenario: resume 後の job ls 表示

---

### TC-003: 再利用 path で worktreePath / jobId が既存値のまま保持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: sidecar の worktreePath / jobId は既存値を保持する > Scenario: worktreePath / jobId が変わらない

---

### TC-004: 事前 sidecar 不在でも再利用 path で sidecar が新規生成される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** 既存 worktree ディレクトリが disk 上に存在し、sidecar ファイル（`liveness.json`）が存在しない
**WHEN** `setupWorkspace` が `existingWorktreePath` に当該 worktree を指定して呼ばれる
**THEN** `liveness.json` が新規生成され、`pid === process.pid` で書かれており、`setupWorkspace` は例外を投げずに workspace を返す

---

### TC-005: sidecar 書き込み失敗時も workspace が正常に返却される

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs

**GIVEN** sidecar ディレクトリへの書き込みが失敗する（I/O エラー等）
**WHEN** 再利用 path で `writeLivenessSidecar` が呼ばれる
**THEN** 例外が呼び出し元に伝播せず、`setupWorkspace` は workspace を正常に返す（best-effort 挙動）

---

### TC-006: 新規 worktree 作成 3 経路の writeLivenessSidecar 呼び出しが regression しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** run path・resume/recreate path・resume/null path それぞれで新規 worktree を作成する
**WHEN** `setupWorkspace` が各経路で呼ばれる
**THEN** 各経路で `writeLivenessSidecar` が引き続き呼ばれており、sidecar に `pid === process.pid` が書かれている（既存挙動を壊していない）

---

### TC-007: typecheck と全テストが green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** T-01・T-02 の実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** typecheck と全テストがエラーなく完了する

---

## Result

```yaml
result: completed
total: 7
automated: 5
manual: 2
must: 4
should: 3
could: 0
blocked_reasons: []
```
