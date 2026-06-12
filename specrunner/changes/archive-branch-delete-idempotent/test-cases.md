# Test Cases: archive-branch-delete-idempotent

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 13
- **Manual**: 1
- **Priority**: must: 9, should: 5, could: 0

### TC-001: auto-delete 済み branch を archive しても warning しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: remote branch 削除は冪等である > Scenario: auto-delete 済み branch を archive する

### TC-002: auto-delete 済み branch を cancel しても warnings に追加しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: remote branch 削除は冪等である > Scenario: auto-delete 済み branch を cancel する

### TC-003: archive 経路の認証エラーは従来通り warning する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 不存在以外の remote branch 削除失敗は warning を出す > Scenario: 認証エラーで削除失敗（archive 経路）

### TC-004: cancel 経路の認証エラーは warnings に追加する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 不存在以外の remote branch 削除失敗は warning を出す > Scenario: 認証エラーで削除失敗（cancel 経路）

### TC-005: archive 経路の remote branch 正常削除は silent に処理する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: remote branch 削除成功は silent に処理される > Scenario: 正常削除（archive 経路）

### TC-006: helper は空 stderr を remote ref 不存在と判定しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: `isRemoteRefNotFound` ヘルパーを作成する

**GIVEN** `stderr` が空文字列である
**WHEN** `isRemoteRefNotFound(stderr)` を呼び出す
**THEN** `false` を返す

### TC-007: helper は `remote ref does not exist` を含む stderr を remote ref 不存在と判定する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D3: マッチングのパターン

**GIVEN** `stderr` に `remote ref does not exist` が含まれている
**WHEN** `isRemoteRefNotFound(stderr)` を呼び出す
**THEN** `true` を返す

### TC-008: helper は大小文字差を無視して remote ref 不存在を判定する

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D3: マッチングのパターン

**GIVEN** `stderr` に `Remote Ref Does Not Exist` のような大文字混じりの文字列が含まれている
**WHEN** `isRemoteRefNotFound(stderr)` を呼び出す
**THEN** `true` を返す

### TC-009: helper は認証エラー stderr を remote ref 不存在と誤判定しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: `isRemoteRefNotFound` ヘルパーを作成する

**GIVEN** `stderr` が `Authentication failed` または `remote: Repository not found.` のような認証エラーである
**WHEN** `isRemoteRefNotFound(stderr)` を呼び出す
**THEN** `false` を返す

### TC-010: archive orchestrator は shared helper の結果で warning を抑止する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: archive orchestrator の remote branch 削除を冪等にする

**GIVEN** `git push origin --delete <branch>` が非 0 で終了し、`stderr` に `remote ref does not exist` が含まれている
**WHEN** archive orchestrator が remote branch 削除結果を評価する
**THEN** 条件式 `exitCode !== 0 && !isRemoteRefNotFound(stderr)` により remote branch 削除 warning は出力されない

### TC-011: cancel runner は shared helper の結果で warning を抑止する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: cancel runner の remote branch 削除を冪等にする

**GIVEN** `git push origin --delete <branch>` が非 0 で終了し、`stderr` に `remote ref does not exist` が含まれている
**WHEN** cancel runner が remote branch 削除結果を評価する
**THEN** 条件式 `exitCode !== 0 && !isRemoteRefNotFound(stderr)` により remote branch 削除 warning は `warnings` に追加されない

### TC-012: cancel 経路の remote branch 正常削除は warnings に追加しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: cancel runner のテストを追加する > T-cancel-branch-03

**GIVEN** cancel cleanup で remote branch が存在し、`git push origin --delete <branch>` が exitCode 0 で完了する
**WHEN** `cancelSingleJob` 経由で cleanup branch 削除を実行する
**THEN** `result.warnings` に remote branch 削除 warning は含まれない

### TC-013: ローカル branch 削除失敗の warning 挙動は変更しない

**Category**: integration
**Priority**: should
**Source**: request.md > スコープ外; design.md > Goals / Non-Goals

**GIVEN** archive Phase 2 の `git branch -D <branch>` が非 0 で失敗する
**WHEN** archive cleanup がローカル branch 削除結果を評価する
**THEN** 従来通りローカル branch 削除失敗の warning が出力され、remote branch 不存在の idempotency 判定は適用されない

### TC-014: typecheck と test が green である

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06: `typecheck && test` を green にする

**GIVEN** 実装とテスト追加が完了している
**WHEN** `bun run typecheck` と `bun run test` を実行する
**THEN** 両コマンドが exitCode 0 で終了する

## Result

```yaml
result: completed
total: 14
automated: 13
manual: 1
must: 9
should: 5
could: 0
blocked_reasons: []
```
