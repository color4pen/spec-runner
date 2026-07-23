# Test Cases: setupWorkspace 後の in-memory state を store から reload し、field 手動 mirror を廃止する

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 13, should: 6, could: 0

---

## Section 1: Spec Scenario-derived

> これらの TC は spec.md の named Scenario に 1:1 対応する。GWT は省略し Source 参照のみを示す。behavior の正典は spec の Scenario 本文。

### TC-001: Bootstrap OID reaches pipeline in-memory state

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: State reload after setupWorkspace > Scenario: Bootstrap OID reaches pipeline in-memory state

---

### TC-002: Mirror code is absent

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: State reload after setupWorkspace > Scenario: Mirror code is absent

---

### TC-003: Store read fails after setupWorkspace

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Reload failure is fail-closed > Scenario: Store read fails after setupWorkspace

---

### TC-004: Reviewer snapshot survives reload

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: In-memory-only fields are preserved through reload > Scenario: Reviewer snapshot survives reload

---

### TC-005: Halt persist after reload preserves ledger

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Halt-path persist does not revert synthesizedCommits > Scenario: Halt persist after reload preserves ledger

---

## Section 2: Implementation tests (tasks.md 指定 TC)

> tasks.md が明示的に番号を付けた TC。spec Scenario に対応するが実装レベルの precondition と DESTROY 注記を含む。

### TC-010: LocalRuntime.reloadJobState — returns synthesizedCommits from store

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 > TC-010

**GIVEN** `LocalRuntime` が tempDir 上の実 `JobStateStore` を使い、slug store に `synthesizedCommits: ["abc123"]` を seed した状態
**WHEN** `runtime.reloadJobState(jobId, slug, workspace)` を呼ぶ
**THEN** 返された `JobState` の `synthesizedCommits` が `["abc123"]` を含む

> DESTROY: `LocalRuntime.reloadJobState` の store 読取りを削除/stubに差し替え → synthesizedCommits assert が fail する

---

### TC-011: Reload fail-closed — runner does not start pipeline

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 > TC-011

**GIVEN** `reloadJobState` が reject する `TestRuntime` を持つ `CommandRunner`
**WHEN** `execute()` が `setupWorkspace` 成功後に reload を呼ぶ
**THEN** `pipeline.run()` が一度も呼ばれず、戻り値が 1 である

> DESTROY: runner.ts の `reloadJobState` 呼び出しを削除し旧 mirror を復元 → このテストはパスする（fail-closed 経路のみを封鎖）。sealing は TC-013 / TC-014 が担う

---

### TC-012: Field preservation — reviewers / noWorktree / issueNumber survive reload

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 > TC-012

**GIVEN** `bootstrapState` に `reviewers: [mockReviewer]`, `noWorktree: true`, `issueNumber: 42` を設定し、実 `JobStateStore` (tempDir) に seed したあと `synthesizedCommits` と `branch` を第二の `persist()` で追記した状態
**WHEN** `runtime.reloadJobState(jobId, slug, workspace)` を呼ぶ
**THEN** 返された state に `reviewers`, `noWorktree: true`, `issueNumber: 42` かつ `synthesizedCommits` かつ `branch` が全て含まれる

---

### TC-013: E2E — bootstrap → reload → in-memory synthesizedCommits → egress passes

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 > TC-013

**GIVEN** `$TMPDIR` に `git init` / 初期 commit / bare remote `origin` を持つ実 git repo と `LocalRuntime`（real spawnFn）を用意し、手動 seed なし
**WHEN** `runtime.setupWorkspace(slug, jobId, { requestFilePath, branchName, bootstrapState })` 後に `runtime.reloadJobState(jobId, slug, workspace)` を呼ぶ
**THEN** `reloadedState.synthesizedCommits`（in-memory、store 直読みではない）が bootstrap commit OID を含み、続く `verifyEgressLedger` 呼び出しが `EGRESS_UNKNOWN_COMMIT` を発しない

> DESTROY: `LocalRuntime.reloadJobState` の実装を破壊（store 読取りを bootstrapState 返却に差し替え）→ step 6 の synthesizedCommits assert が fail する。本 TC は runtime 層のテストであり runner.ts の配線は封鎖しない（TC-014 が担う）

---

### TC-014: Runner 経路の封鎖 — pipeline に渡る state が reload 由来

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 > TC-013b

**GIVEN** fake `RuntimeStrategy` を注入した `CommandRunner`。fake の `setupWorkspace()` は `WorkspaceContext` を返し、`reloadJobState()` は `synthesizedCommits: ["sentinel-oid-123"]` を含む state を返す。pipeline は state を capture できる最小 stub
**WHEN** `CommandRunner.execute()` を呼ぶ
**THEN** pipeline が受け取った state の `synthesizedCommits` に `"sentinel-oid-123"` が含まれる（runner が reload 結果を下流へ渡している）

> DESTROY: runner.ts の `reloadJobState` 呼び出しを削除し旧 mirror（worktreePath/branch のみ）を復元 → capture した state に sentinel が含まれず TC-014 が fail する

---

### TC-015: Halt-path persist does not revert synthesizedCommits

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 > TC-014

**GIVEN** TC-013 と同じ実 git/store セットアップ。`reloadJobState()` で `synthesizedCommits: [bootstrapOid]` を含む state を取得済み
**WHEN** halt 経路を模擬して `new JobStateStore(...).persist(reloadedState)` を実行し、その後 store を再 load する
**THEN** store の `synthesizedCommits` が `bootstrapOid` を含み、null に退行していない

---

## Section 3: 設計判断由来の追加 TC

> design.md / tasks.md の設計判断に由来し、spec Scenario に 1:1 対応しない TC。GWT を記述する。

### TC-020: LocalRuntime — worktree mode では worktreePath を stateRoot に使う

**Category**: unit
**Priority**: must
**Source**: design.md > D2: LocalRuntime.reloadJobState — load from slug store

**GIVEN** `workspace.worktreePath` が `"/tmp/some-worktree"` に設定された `WorkspaceContext`
**WHEN** `LocalRuntime.reloadJobState(jobId, slug, workspace)` が内部で `JobStateStore` を構築する
**THEN** `stateRoot` として `workspace.worktreePath` (`"/tmp/some-worktree"`) が使われ、`cwd` は使われない

---

### TC-021: LocalRuntime — no-worktree mode では cwd を stateRoot に使う

**Category**: unit
**Priority**: should
**Source**: design.md > D2: LocalRuntime.reloadJobState — load from slug store

**GIVEN** `workspace.worktreePath` が `undefined` の `WorkspaceContext`（noWorktree モード）
**WHEN** `LocalRuntime.reloadJobState(jobId, slug, workspace)` が内部で `JobStateStore` を構築する
**THEN** `stateRoot` として `this.cwd`（リポジトリルート）が使われる

---

### TC-022: ManagedRuntime.reloadJobState は fail-closed で throw する

**Category**: unit
**Priority**: must
**Source**: design.md > D3: ManagedRuntime.reloadJobState — fail-closed throw

**GIVEN** `ManagedRuntime` インスタンスに `reloadJobState` が実装されている
**WHEN** `reloadJobState(jobId, slug, workspace)` を呼ぶ
**THEN** `Error` が throw される（managed runtime の store 安全性が別 request で検証されるまで pipeline は起動しない）

---

### TC-023: RuntimeStrategy の optional method — test fakes は reloadJobState なしで動作する

**Category**: unit
**Priority**: should
**Source**: design.md > D1, D4: optional-chaining call pattern

**GIVEN** `reloadJobState` メソッドを持たない `RuntimeStrategy` typed な test fake を注入した `CommandRunner`
**WHEN** `execute()` が setupWorkspace 成功後の reload 分岐に到達する
**THEN** optional-chain guard により `reloadJobState` は呼ばれず、既存の in-memory state のままで処理が継続する（既存 unit test への影響なし）

---

### TC-024: TypeScript — RealRuntimeStrategy は reloadJobState を必須で要求する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria; design.md > D1

**GIVEN** `RealRuntimeStrategy` を implements する class が `reloadJobState` を実装していない
**WHEN** `tsc` を実行する
**THEN** コンパイルエラーが発生し、実装の欠落が静的に検出される

---

## Section 4: Regression

> 既存テストを無改変で green に保つことの確認。

### TC-030: 既存 bootstrap-egress-ledger / egress テストが無改変で green

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07; request.md > 受け入れ基準

**GIVEN** 修正後の codebase（runner.ts mirror 削除・reload 追加済み）
**WHEN** `bun run test -- bootstrap-egress-ledger` および egress / 合成テスト群を実行する
**THEN** `bootstrap-egress-ledger-wm.test.ts`, `bootstrap-egress-ledger-local.test.ts`, `bootstrap-egress-ledger-e2e.test.ts` が全て green となり、テストファイルは一切変更されていない

---

### TC-031: runner.test.ts — test fakes のある既存 runner unit test が green

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07; design.md > Risks > Test fakes unaware of reload

**GIVEN** `reloadJobState` を持たない既存の `RuntimeStrategy` typed fakes を使う `runner.test.ts`
**WHEN** `bun run test -- runner.test` を実行する
**THEN** 既存の全 TC が green（optional-chain guard により新コードパスは影響を与えない）

---

### TC-032: typecheck && test が exit 0

**Category**: integration
**Priority**: must
**Source**: request.md > 受け入れ基準; tasks.md > T-07

**GIVEN** 全実装タスク（T-01〜T-06）が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** どちらも exit code 0 で終了し、新規 TypeScript エラーが存在しない

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 13
should: 6
could: 0
blocked_reasons: []
```
