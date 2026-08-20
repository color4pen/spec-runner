# Test Cases: job-start-from-issue

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
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 17
- **Manual**: 1
- **Priority**: must: 17, should: 2, could: 1

---

### TC-001: --from-issue が issue 本文を request として起動する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job start SHALL accept --from-issue to launch a job directly from an issue body > Scenario: --from-issue が issue 本文を request として起動する

---

### TC-002: fidelity gate が inboxOrigin により comparator を skip する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue 起動の job は issue fidelity comparator を実行してはならない > Scenario: fidelity gate が inboxOrigin により comparator を skip する

---

### TC-003: 現在 branch が base-branch と不一致なら副作用ゼロで停止する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from-issue はコマンド起動時に base-branch guard を適用しなければならない > Scenario: 現在 branch が base-branch と不一致なら副作用ゼロで停止する

---

### TC-004: detached HEAD は不一致として扱う

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from-issue はコマンド起動時に base-branch guard を適用しなければならない > Scenario: detached HEAD は不一致として扱う

---

### TC-005: --from-issue と positional の併用は usage エラー

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from-issue と positional / --issue は排他でなければならない > Scenario: --from-issue と positional の併用は usage エラー

---

### TC-006: --from-issue と --issue の併用は usage エラー

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from-issue と positional / --issue は排他でなければならない > Scenario: --from-issue と --issue の併用は usage エラー

---

### TC-007: --from-issue と --detach は併用できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from-issue と positional / --issue は排他でなければならない > Scenario: --from-issue と --detach は併用できる

---

### TC-008: parse 失敗時に draft も job state も生成されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: issue 本文の request parse 失敗は副作用ゼロでエラー終了しなければならない > Scenario: parse 失敗時に draft も job state も生成されない

---

### TC-009: 占有 slug に対する --from-issue は既存 SlugOccupiedError 経路で拒否される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: slug 占有時は既存の SlugOccupiedError 経路に乗らなければならない > Scenario: 占有 slug に対する --from-issue は既存 SlugOccupiedError 経路で拒否される

---

### TC-010: inbox と --from-issue が同一の core 関数を経由する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issue → draft → start の連鎖は単一の core 関数に統合されなければならない > Scenario: inbox と --from-issue が同一の core 関数を経由する

---

### TC-011: --from-issue なし + positional なし → usage エラー

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02: --from-issue flag 追加・positional optional 化・排他検査

**GIVEN** `job start` を positional も `--from-issue` も指定せずに呼ぶ
**WHEN** コマンドを実行する
**THEN** usage エラーで非ゼロ exit（ARG_ERROR）し、job state を作らない

---

### TC-012: getCurrentBranch が detached HEAD で null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: base-branch guard の git helper と専用エラー / design.md > D4

**GIVEN** リポジトリが detached HEAD 状態（`git symbolic-ref --short -q HEAD` が非ゼロ終了）である
**WHEN** `getCurrentBranch(cwd)` を呼ぶ
**THEN** `null` を返す

---

### TC-013: base-branch mismatch エラー文言が現在 branch と base-branch の両値を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: base-branch guard の git helper と専用エラー / design.md > D4

**GIVEN** `current = "develop"`, `baseBranch = "main"` で `baseBranchMismatchError` を生成する
**WHEN** 生成されたエラーのメッセージを確認する
**THEN** 文言に `"develop"` と `"main"` が両方含まれる

---

### TC-014: detached HEAD 時の mismatch エラー文言が detached HEAD を明示する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: base-branch guard の git helper と専用エラー / design.md > D4

**GIVEN** `current = null`（detached HEAD）, `baseBranch = "main"` で `baseBranchMismatchError` を生成する
**WHEN** 生成されたエラーのメッセージを確認する
**THEN** 文言に "detached" または "detached HEAD" の旨と `"main"` が含まれる

---

### TC-015: inbox の既存テストが無改変で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01: 単一 core 関数へ抽出し inbox を委譲化 Acceptance Criteria / tasks.md > T-06

充足確認: verification step（`bun run test src/core/inbox/__tests__/run-inbox.test.ts` が差分なしで green）

---

### TC-016: job start ヘルプ出力に --from-issue が現れる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05: help / guide の追随

**GIVEN** `job start -h` を実行する
**WHEN** usage テキストを確認する
**THEN** `--from-issue` の記述が usage 出力に存在する

---

### TC-017: guide jobs topic に --from-issue の契約が反映される

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05: help / guide の追随

**GIVEN** `specrunner guide jobs` を実行する
**WHEN** 出力内容を走査する
**THEN** `--from-issue` に関する記述（fidelity skip・base-branch guard・排他のいずれか）が出力に存在する

---

### TC-018: bun run typecheck と bun run test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: テストによる受け入れ基準の pin Acceptance Criteria

充足確認: verification step（`bun run typecheck` および `bun run test` が全て green）

---

### TC-019: issue fetch 失敗時に draft も job state も生成されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit しなければならない > Scenario: fetch 失敗時に draft も job state も生成されない

**GIVEN** GitHubClient の `getIssue()` が失敗する mock（404 相当の throw）
**WHEN** `job start --from-issue <n>` を実行する
**THEN** `specrunner/drafts/` に draft が書き込まれず、job state が作成されず、非ゼロ exit code で終了する

---

### TC-020: detach 親 fetch 成功後の子プロセス再 fetch 失敗（手動確認）

**Category**: manual
**Priority**: could
**Source**: design.md > Risks（detach で issue を二度 fetch/parse/guard する）

**GIVEN** `job start --from-issue <n> --detach` の親プロセスが issue fetch に成功し exit 0 を返した直後
**WHEN** 子プロセスの再 fetch が失敗する（issue 削除・編集・ネットワーク断）
**THEN** 親は exit 0（登録完了）を返しているが job は存在しない。この経路をリリース前に一度手動確認する

---

## Result

```yaml
result: completed
total: 20
automated: 17
manual: 1
must: 17
should: 2
could: 1
blocked_reasons: []
```
