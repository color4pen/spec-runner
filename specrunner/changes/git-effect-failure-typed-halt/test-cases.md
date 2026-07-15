# Test Cases: git 書き込み副作用の失敗を typed halt 化する

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 18
- **Manual**: 3
- **Priority**: must: 14, should: 6, could: 1

---

## Step commit 経路 — git 操作失敗の typed halt

### TC-001: git add 失敗で halt する（silent no-op しない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: git add 失敗で halt する（silent no-op しない）

---

### TC-002: git diff の git エラー（exit≥2）で halt する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: git diff の git エラー（exit≥2）で halt する

---

### TC-003: git commit 失敗で halt し push しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: git commit 失敗で halt し push しない

---

### TC-004: 正当 no-op は silent に成功する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: 正当 no-op は silent に成功する

---

### TC-005: agent 自己 commit は push のみ行う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: agent 自己 commit は push のみ行う

---

## Round commit 経路 — git 操作失敗の throw

### TC-006: round の git add 失敗で throw する（silent return しない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: round commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: round の git add 失敗で throw する（silent return しない）

---

### TC-007: round の git commit 失敗で throw し push しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: round commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: round の git commit 失敗で throw し push しない

---

### TC-008: round の正当 no-op は保存される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: round commit 経路は git 操作失敗を正当 no-op から分離し throw する > Scenario: round の正当 no-op は保存される

---

## Finalize 挙動不変

### TC-009: finalize の commit / push 失敗は warn に留まる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: run 完了後の finalize は挙動不変（throw しない）> Scenario: finalize の commit / push 失敗は warn に留まる

---

## Error factory — commitEffectFailedError（T-01 / D1）

### TC-010: commitEffectFailedError が code COMMIT_AND_PUSH_FAILED の SpecRunnerError を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `commitEffectFailedError("step-name", "main", "stage", "detail")` を呼ぶ
**WHEN** 返り値を検査する
**THEN** `SpecRunnerError` で `code === "COMMIT_AND_PUSH_FAILED"` であること

---

### TC-011: commitEffectFailedError の message に label / operation / branch / detail が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `commitEffectFailedError("my-step", "feat/x", "commit", "exit 1")` を呼ぶ
**WHEN** 返り値の `message` を検査する
**THEN** `message` に `"my-step"` / `"commit"` / `"feat/x"` / `"exit 1"` がすべて含まれること

---

### TC-012: ERROR_CODES.COMMIT_AND_PUSH_FAILED が makeCommitFailHalt の default と一致する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D1

**GIVEN** `ERROR_CODES.COMMIT_AND_PUSH_FAILED` と `step-halt.ts` の `makeCommitFailHalt` が使う default code 文字列を比較する
**WHEN** 等値比較する
**THEN** 両者が `"COMMIT_AND_PUSH_FAILED"` で一致し、magic string が解消されていること

---

## git-exec helper — gitExecResult（T-02 / D4）

### TC-013: gitExecResult は spawn 成功時 `{ok:true, exitCode}` を返し throw しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `runSubprocess` が正常に完了し exit code 0 / 1 等を返すモックを与える
**WHEN** `gitExecResult(spawnFn, cwd, args)` を呼ぶ
**THEN** `{ ok: true, exitCode: <actual exit code> }` が返り、例外を throw しないこと

---

### TC-014: gitExecResult は spawn 例外時 `{ok:false, exitCode:-1}` を返し throw しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `runSubprocess` が spawn 例外（git コマンド不在等）で reject するモックを与える
**WHEN** `gitExecResult(spawnFn, cwd, args)` を呼ぶ
**THEN** `{ ok: false, exitCode: -1 }` が返り、例外を throw しないこと

---

### TC-015: gitExec / gitExecExitCode のシグネチャと挙動が不変

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D4

**GIVEN** `gitExec` / `gitExecExitCode` の既存テストスイートが存在する
**WHEN** T-02 の変更後に既存テストを実行する
**THEN** シグネチャ変更なし・全テスト green（新 helper は additive で既存 caller を破壊しない）

---

## commitAndPush — spawn 失敗経路（T-03 / D2 補足）

### TC-016: commitAndPush — git add spawn 失敗（ok:false）も throw する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D2

**GIVEN** `gitExecResult` が `git add` で `{ ok: false, exitCode: -1 }` を返す（spawn 失敗）
**WHEN** `commitAndPush` を実行する
**THEN** `commitEffectFailedError`（code `COMMIT_AND_PUSH_FAILED`, operation `"stage"`）が throw され、diff / commit / push が呼ばれないこと

---

## commitScopedPaths — B-15 保持（T-04 / D3）

### TC-017: commitScopedPaths は scoped pathspec（git add -A -- <paths>）を変更しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D3

**GIVEN** stage 対象 paths が `["src/a.ts", "src/b.ts"]` のとき
**WHEN** `commitScopedPaths` を実行する（add は成功、diff exit 0 で no-op に終わる前提）
**THEN** `git add` の呼び出し引数が `["-A", "--", "src/a.ts", "src/b.ts"]` であり、bare `git add -A` が使われていないこと（B-15 保持）

---

## round の diff エラー経路（T-04 / D3）

### TC-018: round の git diff exit≥2 で throw する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D3

**GIVEN** round commit 経路で `git add` が成功し、`git diff --cached --quiet` が exit 2（git エラー）を返す
**WHEN** `commitScopedPaths` を実行する
**THEN** typed error（code `COMMIT_AND_PUSH_FAILED`, operation `"diff"`）が throw され、commit / push が呼ばれないこと

---

## スコープ外の不変確認（T-06 / D3 / D5）

### TC-019: commitFinalState に変更がなく best-effort warn の挙動が保たれる

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D5

**GIVEN** `commit-push.ts` の diff を確認する
**WHEN** `commitFinalState`（行 91-131）の変更有無を目視する
**THEN** `commitFinalState` に差分がなく、commit / push 失敗時は warn に留まり throw しない設計が保たれること

---

### TC-020: parallel-review-round.ts に変更がない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria / design.md > D3

**GIVEN** `parallel-review-round.ts` の diff を確認する
**WHEN** ファイル変更有無を目視する
**THEN** `parallel-review-round.ts` に一行の差分もなく、round の try/catch 新設も行われていないこと

---

## 全体検証

### TC-021: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** T-01〜T-05 の変更が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラー・テスト失敗がゼロで完了し、更新テスト・既存テスト（commit-and-push / executor.commit / commit-scoped-paths の正当経路）がすべて green であること

---

## Result

```yaml
result: completed
total: 21
automated: 18
manual: 3
must: 14
should: 6
could: 1
blocked_reasons: []
```
