# Test Cases: ValidationRule.name を typo 安全な型に強化する

## Summary

| Category | P0 (must) | P1 (should) | P2 (could) | Total |
|---|---|---|---|---|
| Union Type Definition | 2 | 1 | 0 | 3 |
| Interface & Registry Generics | 3 | 1 | 1 | 5 |
| Backward Compatibility | 3 | 0 | 0 | 3 |
| Parser Rule Specialization | 3 | 1 | 0 | 4 |
| Scope Boundary | 2 | 0 | 1 | 3 |
| Type-Level Safety | 2 | 2 | 0 | 4 |
| **Total** | **15** | **5** | **2** | **22** |

---

## Category: Union Type Definition

### TC-01: RequestMdRuleName union が 7 件すべての literal を含む
- **Priority**: must
- **Source**: T-01, AC[1]

**GIVEN** `src/parser/rules/types.ts` に `RequestMdRuleName` が定義されている  
**WHEN** 型の定義を確認する  
**THEN** 以下の 7 つの string literal が union として含まれている:
- `"type-required"`
- `"type-known"`
- `"slug-required"`
- `"base-branch-required"`
- `"adr-required"`
- `"adr-valid"`
- `"title-required"`

---

### TC-02: RequestMdRuleName が export されており他ファイルから import できる
- **Priority**: must
- **Source**: T-01, AC[1]

**GIVEN** `src/parser/rules/types.ts` に `export type RequestMdRuleName` が定義されている  
**WHEN** `import type { RequestMdRuleName } from "./types.js"` で import する  
**THEN** tsc compile error が発生しない

---

### TC-03: RequestMdRuleName に存在しない literal を assign すると型エラーになる
- **Priority**: should
- **Source**: T-01, D2

**GIVEN** `RequestMdRuleName` が 7 件の literal union として定義されている  
**WHEN** `"type-requied"` (typo) のような union 外の string を `RequestMdRuleName` 型変数に代入しようとする  
**THEN** tsc が `Type '"type-requied" is not assignable to type 'RequestMdRuleName'` のコンパイルエラーを報告する

---

## Category: Interface & Registry Generics

### TC-04: ValidationRule interface に TName 第 3 型パラメータが追加されている
- **Priority**: must
- **Source**: T-02, AC[2]

**GIVEN** `src/core/validation/types.ts` の `ValidationRule` interface を確認する  
**WHEN** 型パラメータを検査する  
**THEN** `ValidationRule<TInput, TViolation, TName extends string = string>` の形式になっており、`name` フィールドの型が `TName` になっている

---

### TC-05: RuleRegistry に TName 第 3 型パラメータが追加されている
- **Priority**: must
- **Source**: T-03, AC[2]

**GIVEN** `src/core/validation/registry.ts` の `RuleRegistry` クラスを確認する  
**WHEN** 型パラメータを検査する  
**THEN** `RuleRegistry<TInput, TViolation, TName extends string = string>` の形式になっており、`private rules` フィールドが `ValidationRule<TInput, TViolation, TName>[]` 型になっている

---

### TC-06: RuleRegistry.register が TName で制約された rule を受け取る
- **Priority**: must
- **Source**: T-03, D3

**GIVEN** `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` のインスタンスがある  
**WHEN** `register()` に `name: "type-requied"` (typo) の rule オブジェクトを渡す  
**THEN** tsc compile error が発生し、runtime には到達しない

---

### TC-07: RuleRegistry.validate の挙動は変わらない
- **Priority**: should
- **Source**: T-03, D3, design Non-Goals

**GIVEN** `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` に 7 件の rule が register されている  
**WHEN** `validate(input)` を呼び出す  
**THEN** 全 rule の `check()` が呼ばれ、violations が flatMap で集約されて返される（API 変更なし）

---

### TC-08: createRequestMdRegistry の返り型が TName=RequestMdRuleName で明示されている
- **Priority**: must
- **Source**: T-05, AC[4]

**GIVEN** `src/parser/rules/index.ts` の `createRequestMdRegistry` 関数を確認する  
**WHEN** 返り型注釈を検査する  
**THEN** `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` が明示されており、`TName=string` の default に依存していない

---

## Category: Backward Compatibility

### TC-09: ValidationRule<X, Y> (2 型パラメータ) の既存利用箇所が無修正で通る
- **Priority**: must
- **Source**: T-02, D1, AC[6]

**GIVEN** `TName` の default が `string` に設定されている  
**WHEN** 既存の `ValidationRule<TInput, TViolation>` (2 型パラメータ形式) を使っているコードを typecheck する  
**THEN** tsc compile error が発生しない

---

### TC-10: RuleRegistry<X, Y> (2 型パラメータ) の既存利用箇所が無修正で通る
- **Priority**: must
- **Source**: T-03, D3, AC[6]

**GIVEN** `TName` の default が `string` に設定されている  
**WHEN** 既存の `RuleRegistry<TInput, TViolation>` (2 型パラメータ形式) を使っているコードを typecheck する  
**THEN** tsc compile error が発生しない

---

### TC-11: 既存の unit test suite が無修正で全 pass する
- **Priority**: must
- **Source**: T-07, AC[8], request 要件 5

**GIVEN** 変更前に通っていた全ての unit test（`tests/unit/core/validation/registry.test.ts` 等を含む）が存在する  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し regression が 0 件である

---

## Category: Parser Rule Specialization

### TC-12: parser layer 7 件の rule file が全て RequestMdRuleName で specialize されている
- **Priority**: must
- **Source**: T-04, AC[3]

**GIVEN** 以下の 7 ファイルが存在する: `type-required.ts`, `type-known.ts`, `slug-required.ts`, `base-branch-required.ts`, `adr-required.ts`, `adr-valid.ts`, `title-required.ts`  
**WHEN** 各ファイルの `ValidationRule` の型注釈を確認する  
**THEN** 全ファイルで `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` が使われており、`RequestMdRuleName` が `./types.js` から import されている

---

### TC-13: parser rule の name が union の member と一致する
- **Priority**: must
- **Source**: T-04, AC[3]

**GIVEN** 各 parser rule file が `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` で specialize されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 全 7 件の rule の `name` フィールド値が `RequestMdRuleName` union のいずれかと一致し、tsc error が発生しない

---

### TC-14: parser rule file に typo した name を書くと tsc error になる
- **Priority**: must
- **Source**: T-04, AC[7], 受け入れ基準

**GIVEN** parser rule file が `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` で specialize されている  
**WHEN** `name` フィールドを `"type-requied"` (typo) に変更して typecheck する  
**THEN** tsc が `Type '"type-requied"' is not assignable to type 'RequestMdRuleName'` のエラーを報告する

---

### TC-15: 新規 parser rule を追加する際 union 外の name が tsc で検知される
- **Priority**: should
- **Source**: T-04, design Risks

**GIVEN** `RequestMdRuleName` union が既存 7 件で定義されており、新規 rule ファイルが `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` で型付けされている  
**WHEN** `name: "new-rule-not-in-union"` の rule を作成して typecheck する  
**THEN** tsc が compile error を報告し、`RequestMdRuleName` への追加を強制する（union 追加忘れを tsc が検知できる）

---

## Category: Scope Boundary

### TC-16: DSV layer の 4 ファイルが無修正である
- **Priority**: must
- **Source**: T-07, AC[5]

**GIVEN** `src/core/spec/rules/` 配下に 4 件の DSV rule ファイルが存在する  
**WHEN** git diff で変更ファイルを確認する  
**THEN** `src/core/spec/rules/` 配下のファイルに変更が一切ない

---

### TC-17: DeltaSpecRuleRegistry が本変更で影響を受けない
- **Priority**: must
- **Source**: AC[5], request スコープ外, design Non-Goals

**GIVEN** `src/core/spec/rules/registry.ts` の `DeltaSpecRuleRegistry` は `RuleRegistry` とは独立した別クラスである  
**WHEN** `bun run typecheck` と `bun run test` を実行する  
**THEN** `DeltaSpecRuleRegistry` に関連する型エラーや test failure が発生しない

---

### TC-18: RequestMdViolation.rule フィールドが free string のまま残っている
- **Priority**: could
- **Source**: request スコープ外

**GIVEN** 各 parser rule の `check()` 内で `RequestMdViolation` を構築している  
**WHEN** violation オブジェクトの `rule` フィールドを確認する  
**THEN** `rule: string` 型のままであり、本変更による型強化を受けていない

---

## Category: Type-Level Safety

### TC-19: @ts-expect-error による typo name の型エラー確認
- **Priority**: should
- **Source**: T-06, request 要件 5

**GIVEN** `tests/unit/parser/rules/rule-name-typesafe.test.ts`（または同等の type-level test）が存在する  
**WHEN** `@ts-expect-error` アノテーション付きで `name: "type-requied"` の rule オブジェクトを `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` 型変数に代入する  
**THEN** `@ts-expect-error` が期待通りに型エラーを suppression しており、tsc が `Unused '@ts-expect-error' directive` を報告しない

---

### TC-20: 正しい name で作成した rule が型エラーにならない
- **Priority**: should
- **Source**: T-06

**GIVEN** type-level test ファイルが存在する  
**WHEN** `name: "type-required"` (正しい spelling) で `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` を作成する  
**THEN** `@ts-expect-error` なしで tsc error が発生しない

---

### TC-21: bun run typecheck が全体で pass する
- **Priority**: must
- **Source**: T-07, AC[8]

**GIVEN** T-01 〜 T-06 の全変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で pass する

---

### TC-22: bun run test が全体で pass する
- **Priority**: must
- **Source**: T-07, AC[8]

**GIVEN** T-01 〜 T-06 の全変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、新規追加した type-level test も含めて regression が 0 件である
