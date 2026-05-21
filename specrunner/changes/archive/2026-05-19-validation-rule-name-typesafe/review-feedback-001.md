# Code Review Feedback — validation-rule-name-typesafe — iter 1

- **verdict**: approved

## Summary

実装は仕様通りに正確に完成している。全 P0 (must) テストケースをカバーし、verification (build + typecheck + test: 196 files, 2210 tests) が green。指摘事項なし。

## Test Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|---|---|---|---|
| TC-01 | must | ✅ | 7 literals すべて `RequestMdRuleName` に含まれている |
| TC-02 | must | ✅ | `export type RequestMdRuleName` が types.ts に定義されている |
| TC-04 | must | ✅ | `ValidationRule<TInput, TViolation, TName extends string = string>` |
| TC-05 | must | ✅ | `RuleRegistry<TInput, TViolation, TName extends string = string>` |
| TC-06 | must | ✅ | `register(rule: ValidationRule<TInput, TViolation, TName>)` で制約 |
| TC-08 | must | ✅ | `createRequestMdRegistry` が `RuleRegistry<..., RequestMdRuleName>` を返す |
| TC-09 | must | ✅ | default `= string` で既存 2 型パラメータ利用箇所は無修正で通る |
| TC-10 | must | ✅ | 同上（RuleRegistry） |
| TC-11 | must | ✅ | 2210 tests all passed |
| TC-12 | must | ✅ | 7 rule file 全て `RequestMdRuleName` で specialize 済み |
| TC-13 | must | ✅ | typecheck: 0 errors |
| TC-14 | must | ✅ | `@ts-expect-error` test で typo → compile error を確認 |
| TC-16 | must | ✅ | `src/core/spec/rules/` は diff に含まれない |
| TC-17 | must | ✅ | `DeltaSpecRuleRegistry` 無変更、typecheck pass |
| TC-21 | must | ✅ | `tsc --noEmit` exit 0 |
| TC-22 | must | ✅ | `vitest run` 196 files, 2210 tests passed |
| TC-03 | should | ✅ | type-level test で型エラーを `@ts-expect-error` により確認 |
| TC-07 | should | ✅ | `validate()` の実装・signature に変更なし |
| TC-15 | should | ✅ | union 外の name → tsc error（型システムが担保） |
| TC-19 | should | ✅ | `@ts-expect-error` 付きテストが `rule-name-typesafe.test.ts` に存在 |
| TC-20 | should | ✅ | 正しい name が型エラーなしでコンパイル通ることを検証済み |
| TC-18 | could | ✅ | `RequestMdViolation.rule` は free string のまま（スコープ外として確認） |

## Findings

指摘なし。

## Notes (non-blocking)

- `rule-name-typesafe.test.ts` の "accepts all 7 valid rule names" テストは runtime 配列の length チェックのため、型レベルの membership 検証ではない。実害はなく、`@ts-expect-error` テストが型安全性の主担体として機能しているため問題なし。
- `expect(true).toBe(true)` は type-level test の runtime pass のためのプレースホルダーとして許容範囲。
