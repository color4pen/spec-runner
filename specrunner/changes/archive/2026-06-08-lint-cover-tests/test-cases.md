# Test Cases: eslint covers tests/

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 12
- **Manual**: 0
- **Priority**: must: 10, should: 2, could: 0

---

## Category: Lint Configuration

### TC-001: lint が tests/ 配下ファイルを走査する

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: lint target includes the tests directory > Scenario: lint walks test files

---

## Category: Lint Gate

### TC-002: src + tests 全体で `bun run lint` が green になる

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: combined lint gate is green > Scenario: lint passes across src and tests

---

## Category: Rule Relaxation Auditability

### TC-003: 緩和ルールが tests スコープの override block として config で監査可能である

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: rule relaxations are tests-scoped and documented > Scenario: a relaxed rule is auditable in config

---

### TC-004: 全件コード修正で解消できた場合は override を追加しない

**Category**: integration  
**Priority**: should  
**Source**: spec.md > Requirement: rule relaxations are tests-scoped and documented > Scenario: no relaxation when fixes suffice

---

## Category: Regression

### TC-005: typecheck と tests が green のまま

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: no test regression > Scenario: typecheck and tests remain green

---

## Category: Violation Remediation

### TC-006: `no-unused-vars` 違反（63 件）が解消されている

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** `eslint.config.js` の `ignores` から test globs を除去した状態で、未使用 import / ローカル変数を削除または `_` prefix にリネームした  
**WHEN** `bun run lint` を実行する  
**THEN** `@typescript-eslint/no-unused-vars` の warning / error が 0 件である

---

### TC-007: `prefer-const` 違反（6 件）が解消されている

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** 再代入のない `let` 宣言を `const` に変更した  
**WHEN** `bun run lint` を実行する  
**THEN** `prefer-const` の warning が 0 件である

---

### TC-008: `no-non-null-asserted-optional-chain` 違反（2 件）が解消されている

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** `tests/state/helpers.test.ts` の `?.x!` 形を中間 const 取り出し等で解体した  
**WHEN** `bun run lint` を実行する  
**THEN** `@typescript-eslint/no-non-null-asserted-optional-chain` の error が 0 件である

---

### TC-009: `no-explicit-any` 違反（2 件）が解消されている

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** `tests/error-codes.test.ts` の `as any` を `as unknown as <Type>` 形の型付きキャストへ置換した  
**WHEN** `bun run lint` を実行する  
**THEN** `@typescript-eslint/no-explicit-any` の warning が 0 件である

---

### TC-010: stale な eslint-disable コメント（1 件）が削除されている

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** `tests/unit/core/pipeline/pipeline.crash-state.test.ts` の stale な `eslint-disable-line no-throw-literal` コメントを削除した  
**WHEN** `bun run lint` を実行する  
**THEN** "unused eslint-disable directive" の warning が 0 件である

---

### TC-011: テストの assertion・件数が変更されていない

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** 違反解消の編集が style / 未使用シンボルの修正のみに限定されている  
**WHEN** `bun run test` を実行する  
**THEN** テスト件数が変更前と同数であり、skip・追加・削除が発生していない

---

### TC-012: `src` のみを対象とした lint が単独で green のまま

**Category**: integration  
**Priority**: should  
**Source**: tasks.md > T-03

**GIVEN** tests override の有無にかかわらず、`src` に適用されるルール設定が変更されていない  
**WHEN** `eslint ./src --max-warnings 0` を実行する  
**THEN** exit 0 かつ error / warning が 0 件である

---

## Result

```yaml
result: completed
total: 12
automated: 12
manual: 0
must: 10
should: 2
could: 0
blocked_reasons: []
```
