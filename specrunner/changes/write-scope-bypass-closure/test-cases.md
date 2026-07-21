# Test Cases: write-scope bypass closure

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
-->

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 30 (unit: 26, integration: 4)
- **Manual**: 0
- **Priority**: must: 26, should: 4, could: 0

---

## 経路1: scoped commit の pathspec 化（index 混入の遮断）

### TC-001: 事前 stage された許可外ファイルが commit に含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する > Scenario: 事前 stage された許可外ファイルが commit に含まれない

### TC-002: staged 判定も pathspec scope で行われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する > Scenario: staged 判定も pathspec scope で行われる

### TC-003: scoped で staging 対象が空のとき index 全体へ fallback しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する > Scenario: scoped で staging 対象が空のとき index 全体へ fallback しない

---

## 経路2: agent 自己 commit の write-scope 検査

### TC-004: guarded 自己 commit に保護正典が含まれる → push せず halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する > Scenario: guarded 自己 commit に保護正典が含まれる → push せず halt

### TC-005: scoped 自己 commit に宣言外 path が含まれる → push せず halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する > Scenario: scoped 自己 commit に宣言外 path が含まれる → push せず halt

### TC-006: 違反の無い自己 commit は push される（挙動保存）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する > Scenario: 違反の無い自己 commit は push される（挙動保存）

### TC-007: 変更 path の列挙に失敗したら fail-closed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: agent 自己 commit の内容を write-scope 規則で検査する > Scenario: 変更 path の列挙に失敗したら fail-closed

---

## 経路3: scoped 残余違反の halt 化

### TC-008: judge step が request.md を改変 → 復元後に halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped mode の保護正典残余違反は halt する > Scenario: judge step が request.md を改変 → 復元後に halt

### TC-009: 結果採用が halt により抑止される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: scoped mode の保護正典残余違反は halt する > Scenario: 結果採用が halt により抑止される

---

## 証跡退避（quarantine）

### TC-010: 自己 commit 違反は commit 差分を退避する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 3 経路の違反は証跡を退避し halt メッセージに退避先を含める > Scenario: 自己 commit 違反は commit 差分を退避する

### TC-011: scoped 残余違反は worktree 差分を退避する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 3 経路の違反は証跡を退避し halt メッセージに退避先を含める > Scenario: scoped 残余違反は worktree 差分を退避する

---

## 正常経路の挙動保存

### TC-012: guarded の境界内 worktree 変更は現行どおり commit + push

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 境界内のみの変更の挙動と commit 内容を現行と同一に保つ > Scenario: guarded の境界内 worktree 変更は現行どおり commit + push

### TC-013: scoped の境界内変更は宣言 path + 管理 path を現行どおり commit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 境界内のみの変更の挙動と commit 内容を現行と同一に保つ > Scenario: scoped の境界内変更は宣言 path + 管理 path を現行どおり commit

---

## T-01: findScopedCommitViolations 単体テスト

### TC-014: findScopedCommitViolations — 宣言 path が除外される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: scoped 自己 commit 規則を write-scope 単一ソースに追加（D5）

**GIVEN** `changedPaths = ["result.md", "src/secret.ts"]`、`declaredWritePaths = ["result.md"]`、`managedPaths = []`
**WHEN** `findScopedCommitViolations` が呼ばれる
**THEN** `["src/secret.ts"]` が返り、`"result.md"` は含まれない

### TC-015: findScopedCommitViolations — 管理 path が除外される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: scoped 自己 commit 規則を write-scope 単一ソースに追加（D5）

**GIVEN** `changedPaths = ["result.md", ".specrunner/local/slug/state.json"]`、`declaredWritePaths = []`、`managedPaths = [".specrunner/local/slug/state.json"]`
**WHEN** `findScopedCommitViolations` が呼ばれる
**THEN** `["result.md"]` が返り、`".specrunner/local/slug/state.json"` は含まれない

### TC-016: findScopedCommitViolations — 宣言外 path のみを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: scoped 自己 commit 規則を write-scope 単一ソースに追加（D5）

**GIVEN** `changedPaths = ["result.md", "request.md", "src/code.ts"]`、`declaredWritePaths = ["result.md"]`、`managedPaths = [".specrunner/local/slug/state.json"]`
**WHEN** `findScopedCommitViolations` が呼ばれる
**THEN** `["request.md", "src/code.ts"]` が返る（宣言 path・管理 path は含まれない）

### TC-017: findScopedCommitViolations — 空入力で空配列を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: scoped 自己 commit 規則を write-scope 単一ソースに追加（D5）

**GIVEN** `changedPaths = []`、`declaredWritePaths = []`、`managedPaths = []`
**WHEN** `findScopedCommitViolations` が呼ばれる
**THEN** `[]` が返り、エラーは発生しない

---

## T-02: quarantine の commit 差分レンジ対応

### TC-018: quarantine レンジ指定時に git diff \<base\>..\<head\> 内容が退避される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: quarantine を commit 差分レンジ対応に一般化（D6）

**GIVEN** 自己 commit 違反が検出され、`quarantineViolationEvidence` に `{ base: "abc123", head: "def456" }` を渡す
**WHEN** quarantine が実行される
**THEN** 退避ファイルの内容に `git diff abc123 def456 -- <violationPath>` の出力が記録される

### TC-019: quarantine 未指定時の既存挙動（worktree 差分）が保たれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: quarantine を commit 差分レンジ対応に一般化（D6）

**GIVEN** guarded の worktree 違反が検出され、`quarantineViolationEvidence` に range 指定なしで呼ばれる
**WHEN** quarantine が実行される
**THEN** 退避ファイルの内容が `git diff HEAD -- <violationPath>` の出力を含む（現行挙動と同一）

---

## T-03: commit 変更 path 列挙ヘルパ

### TC-020: 変更 path 列挙ヘルパ — git 正常時に path 配列を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: commit レンジの変更 path 列挙ヘルパ（D2, fail-closed）

**GIVEN** `headBeforeStep="abc123"`、`HEAD="def456"` で `git diff --name-only --no-renames abc123 def456` が `["src/a.ts", "result.md"]` を返す
**WHEN** commit range 列挙ヘルパが呼ばれる
**THEN** `["src/a.ts", "result.md"]` が返る（改行分割・trim・空行除去済み）

### TC-021: 変更 path 列挙ヘルパ — git error 時に null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: commit レンジの変更 path 列挙ヘルパ（D2, fail-closed）

**GIVEN** `git diff --name-only` が git error（`gitExec` が null）を返す
**WHEN** commit range 列挙ヘルパが呼ばれる
**THEN** `null` が返る（空配列 `[]` と区別される）

---

## T-09: mock spawn の subcommand 両立確認

### TC-022: mock diff — staged なし（exit 0）と range diff（path 列）が同一 spawn で両立する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09: 新規単体テスト（mock spawn・分岐網羅）

**GIVEN** 自己 commit 経路のテストで `makeGitSpawnFn` の `diff` レスポンスが exit 0 + stdout = 変更 path 列
**WHEN** `commitAndPushTail` が staged 判定（`--cached --quiet`）と range diff（`--name-only base head`）を順に実行する
**THEN** staged 判定は exit 0（staged なし）と解釈され、range diff は stdout の path 列を返し、subcommand 衝突が発生しない

---

## T-10: 実 git 統合テスト（3 経路 + 破壊確認）

### TC-023: 実 git — 経路1: 事前 stage した許可外ファイルが commit に含まれない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-10: real-git 統合テスト（3 経路の破壊確認）

**GIVEN** 実 git temp repo で scoped step 実行前に許可外ファイル `src/secret.ts` を `git add` した状態
**WHEN** `commitAndPush` が scoped commit（pathspec 付き）を実行する
**THEN** `git show --name-only HEAD` で commit tree に `src/secret.ts` が含まれない
> 破壊確認: T-04（pathspec 化）を revert すると本 TC が fail する

### TC-024: 実 git — 経路2: 自己 commit 違反（request.md 含む）で halt + push 抑止

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-10: real-git 統合テスト（3 経路の破壊確認）

**GIVEN** 実 git temp repo で agent が `request.md` を変更する commit を自分で作り、worktree は clean な状態
**WHEN** `commitAndPush` が `headBeforeStep..HEAD` を検査する
**THEN** `WRITE_SCOPE_VIOLATION` で halt し、intercept された push コールが発生しない
> 破壊確認: T-05（自己 commit 検査）を revert すると本 TC が fail する

### TC-025: 実 git — 経路3: scoped 残余違反（request.md 改変）で halt + worktree 復元

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-10: real-git 統合テスト（3 経路の破壊確認）

**GIVEN** 実 git temp repo で scoped step（judge）が `request.md` を worktree で改変した状態（commit はしていない）
**WHEN** `commitAndPush` の residual 検査が `request.md` を違反として検出する
**THEN** `WRITE_SCOPE_VIOLATION` で halt し、worktree の `request.md` が HEAD の内容に復元されている
> 破壊確認: T-06（残余 halt 化）を revert すると本 TC が fail する

---

## T-08: 既存テスト期待値更新の確認

### TC-026: 既存 TC-023 群が scoped 残余 halt 期待で green になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: 意図された挙動変更に伴う既存テスト期待の更新

**GIVEN** T-08 による期待値更新後の `commit-push-write-scope.test.ts`
**WHEN** TC-023 群（scoped 残余違反の既存テスト）を実行する
**THEN** `"rejects with WRITE_SCOPE_VIOLATION / commit・push 未実行"` の期待で全件 green になる（復元 clean/checkout が throw 前に呼ばれる点は維持）

### TC-027: 既存 quarantine-03 が throw 期待で green になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: 意図された挙動変更に伴う既存テスト期待の更新

**GIVEN** T-08 による期待値更新後の `commit-push-write-scope.test.ts`
**WHEN** quarantine-03 を実行する
**THEN** `"退避ファイル生成 + stderr note の後に throw"` の期待で green になる（現行の「resolves」期待は存在しない）

---

## T-11: architecture 不変とビルドゲート

### TC-028: write-scope-invariants.test.ts が全件 green（leaf module + 単一ソース）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-11: 検証（typecheck && test）と architecture 不変

**GIVEN** T-01 で `findScopedCommitViolations` が `write-scope.ts` に追加され、`commit-push.ts` が単一ソース経由で呼ぶ構造になっている
**WHEN** `tests/unit/architecture/write-scope-invariants.test.ts` を実行する
**THEN** TC-010（leaf module 制約）を含む全件が green になる

### TC-029: write-scope-rules-consistency.test.ts が全件 green

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-11: 検証（typecheck && test）と architecture 不変

**GIVEN** T-01 の実装後
**WHEN** `tests/unit/step/write-scope-rules-consistency.test.ts` を実行する
**THEN** 全件 green になる

### TC-030: typecheck && test が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-11: 検証（typecheck && test）と architecture 不変

**GIVEN** T-01 から T-09 までの全実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし・全テスト green になる（意図された挙動変更の期待更新（T-08）を反映済み）

---

## Result

```yaml
result: completed
total: 30
automated: 30
manual: 0
must: 26
should: 4
could: 0
blocked_reasons: []
```
