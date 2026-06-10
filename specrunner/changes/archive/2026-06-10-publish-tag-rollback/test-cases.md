# Test Cases:

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 18
- **Manual**: 7
- **Priority**: must: 23, should: 2, could: 0

---

## publish.yml — トリガー定義

### TC-001: workflow_dispatch トリガーが定義されている

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** publish.yml の `on` セクションを参照する
**THEN** `workflow_dispatch` エントリが存在し、`inputs.tag`（required: true、type: string）が定義されている

---

### TC-002: tag push トリガーが保持されている

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** publish.yml の `on` セクションを参照する
**THEN** `push: tags: [v*, specrunner-v*]` のトリガーが引き続き存在する

---

### TC-003: tag push で publish ジョブが起動する（手動確認）

**Category**: manual
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml が tag push トリガーを持つ
**WHEN** `v0.2.0` という名前のタグを push する
**THEN** GitHub Actions 上で publish ジョブが自動起動する

---

### TC-004: workflow_dispatch で tag 指定して publish ジョブを起動できる（手動確認）

**Category**: manual
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml に workflow_dispatch トリガーが定義されている
**WHEN** GitHub Actions UI または `gh workflow run` で inputs.tag = "v0.2.0" を指定して手動実行する
**THEN** publish ジョブが起動する

---

## publish.yml — TAG 変数解決

### TC-005: tag push 時は TAG 変数が github.ref_name に解決される

**Category**: unit
**Priority**: must
**Source**: T-01, design.md D2

**GIVEN** publish.yml の `env` セクションに TAG 変数が定義されている
**WHEN** publish.yml の TAG 変数式を参照する
**THEN** tag push イベント時に `github.ref_name` を参照する条件分岐または expression が記述されている

---

### TC-006: workflow_dispatch 時は TAG 変数が inputs.tag に解決される

**Category**: unit
**Priority**: must
**Source**: T-01, design.md D2

**GIVEN** publish.yml の `env` セクションに TAG 変数が定義されている
**WHEN** publish.yml の TAG 変数式を参照する
**THEN** workflow_dispatch イベント時に `inputs.tag` を参照する条件分岐または expression が記述されている

---

### TC-007: 存在しない tag を workflow_dispatch で指定すると checkout で失敗する（手動確認）

**Category**: manual
**Priority**: should
**Source**: T-01, design.md D2 Risks

**GIVEN** publish.yml の checkout ステップが `ref: ${{ env.TAG }}` を使っている
**WHEN** workflow_dispatch で存在しない tag 名（例: "v9.9.9"）を input に渡す
**THEN** actions/checkout ステップがエラーで失敗し、npm publish ステップは実行されない

---

## publish.yml — Checkout

### TC-008: checkout ステップが ref に解決済み TAG を使う

**Category**: unit
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml の改修が完了している
**WHEN** actions/checkout@v4 ステップの `ref` パラメータを参照する
**THEN** `ref: ${{ env.TAG }}` または同等の TAG 変数参照が設定されており、latest HEAD ではなくタグの SHA をチェックアウトする

---

## publish.yml — Build/Test Steps

### TC-009: build ステップが存在する

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** publish ジョブのステップ一覧を参照する
**THEN** `bun run build` を実行するステップが存在する

---

### TC-010: typecheck ステップが存在しない

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** publish ジョブのステップ一覧を参照する
**THEN** `bun run typecheck` を実行するステップが存在しない

---

### TC-011: test ステップが存在しない

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** publish ジョブのステップ一覧を参照する
**THEN** `bun run test` を実行するステップが存在しない

---

## publish.yml — npm publish

### TC-012: npm publish ステップに id: publish が付与されている

**Category**: unit
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml の改修が完了している
**WHEN** npm publish を実行するステップを参照する
**THEN** そのステップに `id: publish` が定義されている

---

## publish.yml — Job Summary（成功時）

### TC-013: publish 成功時サマリーステップが存在する

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** publish ジョブのステップ一覧を参照する
**THEN** `$GITHUB_STEP_SUMMARY` に書き込む成功時サマリーステップが存在し、タグ・パッケージ情報を出力する記述がある

---

### TC-014: publish 成功時サマリーが job summary に記録される（手動確認）

**Category**: manual
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml が tag push または workflow_dispatch で起動した
**WHEN** npm publish ステップが成功する
**THEN** GitHub Actions の job summary にパッケージ名・バージョン・TAG が表示される

---

## publish.yml — Job Summary（失敗時）

### TC-015: 失敗時サマリーステップに if: failure() が設定されている

**Category**: unit
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml の改修が完了している
**WHEN** 失敗時サマリーステップの条件式を参照する
**THEN** `if: failure()` が設定されており、publish 成功時には実行されない

---

### TC-016: 失敗時サマリーステップが $GITHUB_STEP_SUMMARY に書き込む記述を持つ

**Category**: unit
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml の改修が完了している
**WHEN** 失敗時サマリーステップのスクリプトを参照する
**THEN** `$GITHUB_STEP_SUMMARY` に失敗メッセージと workflow_dispatch 再実行手順を出力する記述がある

---

### TC-017: publish 失敗時 job summary に再実行手順が記録される（手動確認）

**Category**: manual
**Priority**: must
**Source**: T-01

**GIVEN** publish.yml が起動した
**WHEN** npm publish ステップが失敗する
**THEN** job summary に失敗した旨と workflow_dispatch を使った手動再実行の手順（tag 入力方法を含む）が表示される

---

### TC-018: publish 失敗時に job summary が表示されるが成功時サマリーは表示されない（手動確認）

**Category**: manual
**Priority**: should
**Source**: T-01, design.md D3

**GIVEN** publish.yml が起動した
**WHEN** npm publish ステップが失敗する
**THEN** 失敗時サマリーが job summary に出力され、成功時サマリーステップは実行されない（互いに排他）

---

## publish.yml — YAML 整合性

### TC-019: publish.yml が YAML として valid である

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** publish.yml の改修が完了している
**WHEN** YAML パーサーで parse する（actionlint 等）
**THEN** 構文エラーなく parse でき、exit code 0 で終了する

---

## CI — コードベース品質

### TC-020: bun run typecheck が green である

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** リポジトリの TypeScript ソースが存在する
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなく終了し exit code 0 を返す

---

### TC-021: bun run test が green である

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** リポジトリのテストスイートが存在する
**WHEN** `bun run test` を実行する
**THEN** 全テストが pass し exit code 0 で終了する

---

## Delta Spec — 構造

### TC-022: delta spec ファイルが所定パスに存在する

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** T-02 の作業が完了している
**WHEN** `specrunner/changes/publish-tag-rollback/specs/release-automation/spec.md` を参照する
**THEN** ファイルが存在する

---

### TC-023: MODIFIED requirement "publish.yml trigger is unchanged" が存在する

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** delta spec が作成されている
**WHEN** spec.md のヘッダーと requirement 一覧を確認する
**THEN** baseline の requirement 名 "publish.yml trigger is unchanged" に対応する MODIFIED requirement が存在し、tag push + workflow_dispatch・build + publish のみの仕様に書き換えられている

---

### TC-024: publish 失敗時 job summary の新規 requirement が存在する

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** delta spec が作成されている
**WHEN** spec.md の requirement 一覧を確認する
**THEN** publish 失敗時に job summary へ失敗メッセージと再実行手順を出力することを規定する新規 requirement が存在する

---

### TC-025: branch protection 前提の新規 requirement が存在する

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** delta spec が作成されている
**WHEN** spec.md の requirement 一覧を確認する
**THEN** branch protection で `ci` が required status check であることを前提として明文化した新規 requirement が存在する

---

### TC-026: 各 requirement に SHALL または MUST が含まれる

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** delta spec が作成されている
**WHEN** spec.md の全 requirement 本文を確認する
**THEN** すべての requirement 本文に SHALL または MUST が少なくとも 1 つ含まれている

---

### TC-027: 各 requirement に Given/When/Then Scenario が存在する

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** delta spec が作成されている
**WHEN** spec.md の全 requirement を確認する
**THEN** それぞれの requirement に最低 1 つの Scenario が Given/When/Then 形式で記述されている

---

## Result

```yaml
result: completed
total: 27
automated: 19
manual: 8
must: 25
should: 2
could: 0
blocked_reasons: []
```
