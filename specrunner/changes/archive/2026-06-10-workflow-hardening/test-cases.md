# Test Cases:

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
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 9
- **Manual**: 3
- **Priority**: must: 8, should: 3, could: 1

---

### TC-001: token 認証への参照が残っていない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: publish workflow は OIDC 認証で publish しなければならない > Scenario: token 認証への参照が残っていない

---

### TC-002: OIDC publish の構成が揃っている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: publish workflow は OIDC 認証で publish しなければならない > Scenario: OIDC publish の構成が揃っている

---

### TC-003: 全 uses 行がコメント付き SHA pin である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 workflow の action 参照はコメント付き commit SHA に固定しなければならない > Scenario: 全 uses 行がコメント付き SHA pin である

---

### TC-004: 4 action 全出現箇所が対象になっている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 workflow の action 参照はコメント付き commit SHA に固定しなければならない > Scenario: 4 action 全出現箇所が対象になっている

---

### TC-005: push trigger が specrunner/changes を無視する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ci.yml の push trigger のみ対象パスを絞り込み、pull_request trigger は無変更でなければならない > Scenario: push trigger が specrunner/changes を無視する

---

### TC-006: pull_request trigger が無変更である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ci.yml の push trigger のみ対象パスを絞り込み、pull_request trigger は無変更でなければならない > Scenario: pull_request trigger が無変更である

---

### TC-007: npm 更新 step が npm publish より前に配置されている

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-02

**GIVEN** `.github/workflows/publish.yml` のステップ一覧
**WHEN** step の出現順序を検査する
**THEN** `npm install -g npm@latest` 相当の step が `npm publish` step よりも前に存在する

---

### TC-008: publish.yml の job 構造・setup-node の registry-url が変更されていない

**Category**: unit
**Priority**: should
**Source**: design.md > D1 / tasks.md > T-02

**GIVEN** `.github/workflows/publish.yml`
**WHEN** job 構造と `setup-node` の `with:` block を検査する
**THEN** job 数は変わらず、`registry-url: https://registry.npmjs.org` が維持されており、npm 更新 step 追加以外の step 順序変更がない

---

### TC-009: release-please-action が annotated tag の dereference commit SHA に固定されている

**Category**: manual
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-01, T-03

**GIVEN** `.github/workflows/release-please.yml` の `uses:` 行と `git ls-remote https://github.com/google-github-actions/release-please-action v4 'v4^{}'` の実行結果
**WHEN** 固定されている SHA と `v4^{}` の dereference commit SHA を比較する
**THEN** workflow の SHA が tag object SHA ではなく dereference 後の commit SHA と一致している

---

### TC-010: 3 lightweight-tag action の SHA がタグ実 commit と一致している

**Category**: manual
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-01, T-03

**GIVEN** publish.yml / ci.yml の `actions/checkout`, `actions/setup-node`, `oven-sh/setup-bun` の `uses:` 行と各 `git ls-remote <repo> <tag>` の実行結果
**WHEN** 固定されている SHA と `refs/tags/<tag>` の SHA を比較する
**THEN** 3 action それぞれで一致している（design.md D2 の表と整合している）

---

### TC-011: typecheck && test が green である

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 変更後のリポジトリ（workflow ファイル + guard test）
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラー・test 失敗がゼロで終了する

---

### TC-012: guard test が将来の SHA 変更で壊れない設計になっている

**Category**: manual
**Priority**: could
**Source**: design.md > D5 / tasks.md > T-05

**GIVEN** `tests/grep-workflow-actions-pinned.test.ts`（または同等の guard test）
**WHEN** test の assert 対象を確認する
**THEN** SHA の具体値ではなく「40桁 hex + コメント」の構造のみを検証しており、タグ移動時に test が壊れない

---

### TC-013: push trigger の paths-ignore が push にのみ適用されている

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-04

**GIVEN** `.github/workflows/ci.yml`
**WHEN** `on:` ブロック全体を検査する
**THEN** `paths-ignore` が `on.push` ブロック内のみに存在し、`on.pull_request` ブロックに `paths` / `paths-ignore` キーが一切ない

## Result

```yaml
result: completed
total: 12
automated: 9
manual: 3
must: 8
should: 3
could: 1
blocked_reasons: []
```
