# Test Cases: test-placement-convention

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 15
- **Manual**: 2
- **Priority**: must: 10, should: 5, could: 2

---

### TC-001: valid sibling placement loads

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Project config SHALL declare a test placement convention via `tests.placement` > Scenario: valid sibling placement loads

---

### TC-002: valid mirror placement loads

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Project config SHALL declare a test placement convention via `tests.placement` > Scenario: valid mirror placement loads

---

### TC-003: unknown style is rejected at load

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Project config SHALL declare a test placement convention via `tests.placement` > Scenario: unknown style is rejected at load

---

### TC-004: mirror without testsRoot is rejected at load

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Project config SHALL declare a test placement convention via `tests.placement` > Scenario: mirror without testsRoot is rejected at load

---

### TC-005: absent tests section stays valid

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Project config SHALL declare a test placement convention via `tests.placement` > Scenario: absent tests section stays valid

---

### TC-006: sibling placement appears in the implementer message

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A configured placement SHALL be injected deterministically into the implementer user message > Scenario: sibling placement appears in the implementer message

---

### TC-007: mirror placement appears in the implementer message

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: A configured placement SHALL be injected deterministically into the implementer user message > Scenario: mirror placement appears in the implementer message

---

### TC-008: custom suffix overrides the default

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: A configured placement SHALL be injected deterministically into the implementer user message > Scenario: custom suffix overrides the default

---

### TC-009: implementer message has no placement section when unset

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Unset placement SHALL leave existing prompts unchanged > Scenario: implementer message has no placement section when unset

---

### TC-010: test-case-gen prompt never mentions placement

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Unset placement SHALL leave existing prompts unchanged > Scenario: test-case-gen prompt never mentions placement

---

### TC-011: mirror の testsRoot が空文字のとき schema 検証エラーになる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `tests: { placement: { style: "mirror", testsRoot: "" } }` を含む config
**WHEN** `validateConfig` が呼ばれる
**THEN** `CONFIG_INVALID` を含む error が throw され、message に `tests.placement` が含まれる

---

### TC-012: suffix が空文字のとき schema 検証エラーになる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `tests: { placement: { style: "sibling", suffix: "" } }` を含む config
**WHEN** `validateConfig` が呼ばれる
**THEN** `CONFIG_INVALID` を含む error が throw され、message に `tests.placement` が含まれる

---

### TC-013: DEFAULT_TEST_SUFFIX が ".test.ts" としてエクスポートされる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `src/config/schema.ts` の exports
**WHEN** `DEFAULT_TEST_SUFFIX` を import する
**THEN** 値が `".test.ts"` である

---

### TC-014: mirror で sourceRoot 省略時のメッセージにソース完全パスが含まれる

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** `tests.placement = { style: "mirror", testsRoot: "tests" }`（`sourceRoot` 省略）
**WHEN** `renderTestPlacementInstruction` が呼ばれる
**THEN** 出力に `tests/` プレフィックスと、ソースの完全パスをそのまま `tests/` 配下に保持する変換例が含まれる（例: `src/foo/bar.ts` → `tests/src/foo/bar.test.ts`）

---

### TC-015: IMPLEMENTER_SYSTEM_PROMPT が変更されていない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `src/prompts/implementer-system.ts` の `IMPLEMENTER_SYSTEM_PROMPT`
**WHEN** その内容を検査する
**THEN** 既存のテスト（TC-011 相当）で固定されている「既存テストの配置パターンに従う」という文言が保持されており、`Test File Placement` セクションは存在しない

---

### TC-016: README に sibling / mirror の設定例が含まれる

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-07

**GIVEN** README ファイル
**WHEN** `tests.placement` セクションを目視確認する
**THEN** sibling と mirror の jsonc 設定例がそれぞれ掲載されている

---

### TC-017: README に未設定時の既定挙動説明が含まれる

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-07

**GIVEN** README ファイル
**WHEN** `tests.placement` セクションを目視確認する
**THEN** `tests.placement` 未設定時は implementer が既存テスト配置パターンに従う旨の説明が含まれている

---

## Result

```yaml
result: completed
total: 17
automated: 15
manual: 2
must: 10
should: 5
could: 2
blocked_reasons: []
```
