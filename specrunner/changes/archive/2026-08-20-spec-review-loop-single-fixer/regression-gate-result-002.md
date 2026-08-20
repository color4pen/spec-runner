# Regression Gate Result — Iteration 002

## Summary

7 findings from the previous review were verified. All 7 are fixed. No regressions detected.

---

## Finding Verification

### [HIGH] spec-review-fixer-routing.test.ts が T-08 の更新対象に含まれていない

**Status: FIXED**

- `makeCanonScope()` at line 108: `"spec-fixer"` エントリに `TEST_CASES_MD` が追加済み。
- TC-013 (line 949, 955): medium test-cases.md finding → `"approved"` に変更済み。旧 `"needs-fix"` 期待は存在しない。
- TC-013 (line 958): `deriveStepCompletion` でも verdict === `"approved"` を確認する variant も追加済み。

### [MEDIUM] src/prompts/rules.ts が T-01 の更新対象に含まれていない

**Status: FIXED**

- `src/prompts/rules.ts` line 48: `spec-fixer` 行が `change folder 内の spec.md, design.md, tasks.md, test-cases.md` に更新済み。

### [LOW] spec-observation.ts の specReviewHasRoutableFixables JSDoc が T-01 更新対象に含まれていない

**Status: FIXED**

- `src/core/pipeline/spec-observation.ts` lines 26-28 JSDoc: `(spec.md, design.md, tasks.md, test-cases.md)` に更新済み。

### [MEDIUM] T-08 が STANDARD_TRANSITIONS.length カウント変化を pin する 3 テストを列挙していない

**Status: FIXED**

- `tests/unit/core/pipeline/pipeline.transitions.test.ts` (TC-030, line 275): `toBe(45)` に更新済み。
- `tests/unit/core/pipeline/spec-observation-autofix.test.ts` (TC-029, line 1430): `toBe(45)` に更新済み。
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts` (TC-026, line 1224): `toBe(45)` に更新済み。
- `tests/unit/pipeline/transition-when.test.ts` (TC-WHEN-02, line 196): `toBe(45)` に更新済み。

### [MEDIUM] TC-006 (#1015 歯) のテストが behavioral でなく structural proxy に留まる

**Status: FIXED** (partial mitigation implemented as per design)

- `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` TC-011/TC-009 (lines 616-621): `SPEC_FIXER_SYSTEM_PROMPT` に `"test-cases.md"` と `"再生成はしない"` が含まれることを pin するテストを追加済み。
- design.md Risk セクションに structural proxy の意図的採用が文書化されており、TC-009 prompt pin が提案された部分的閉鎖策として実装済み。T-07 本体 (pipeline-integration.test.ts) は structural proxy のままだが設計上の意図した選択。

### [LOW] specFixerObservationForward のコメントが test-case-gen ループ削除後も旧設計を参照している

**Status: FIXED**

- `src/core/pipeline/spec-observation.ts` line 56: コメントが `(spec-fixer is the single fixer for all spec-review findings; observation pass forwards directly to implementer)` に更新済み。

### [LOW] spec-fixer write scope 拡張が conformance 経路の escalation 判定を暗黙に変更する

**Status: FIXED**

- `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` TC-007 (lines 445-455): conformance + test-cases.md + fixTarget:spec-fixer → `"needs-fix:spec-fixer"` (旧: escalation) の変化を明示的に文書化し pin するテストが追加済み。コメントで以前の挙動との対比も記述されている。

---

## Evidence

- Checked: 7 findings × (source file + test file verification)
- Skipped: 0
- Unverified: 0
