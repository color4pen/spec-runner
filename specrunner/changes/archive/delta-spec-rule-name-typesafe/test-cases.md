# Test Cases: DeltaSpecRule.name を typo 安全な型に強化する

## Overview

| Category | Count |
|----------|-------|
| A: 型システム / compile-time | 7 |
| B: ランタイム動作 / regression | 4 |
| C: API contract / exports | 3 |
| D: 設計ガード / JSDoc | 2 |
| **Total** | **16** |

---

## Category A: 型システム / compile-time

### A-01 DeltaSpecRuleName union 型が4件すべてを列挙する

- **Priority**: must
- **Source**: request.md (要件1), tasks.md (Task 1)

**GIVEN** `src/core/spec/rules/types.ts` に `DeltaSpecRuleName` が定義されている  
**WHEN** その型定義を参照する  
**THEN** `"canonical-spec-structure" | "no-legacy-flat-dir" | "no-legacy-flat-file" | "no-specs-for-required-type"` の4メンバーがすべて含まれている

---

### A-02 DeltaSpecRule interface が TName generic を持つ

- **Priority**: must
- **Source**: request.md (要件2), design.md (DJ2)

**GIVEN** `src/core/spec/rules/types.ts` の `DeltaSpecRule` 定義  
**WHEN** `DeltaSpecRule<TName extends string = string>` のシグネチャを確認する  
**THEN** `name` フィールドの型が `TName` であり、default は `string` で backward compatibility が維持されている

---

### A-03 DeltaSpecRule の型パラメータ省略時に既存コードが compile 通過する

- **Priority**: must
- **Source**: design.md (DJ2)

**GIVEN** 型パラメータを指定しない `DeltaSpecRule` を参照する既存コードがある  
**WHEN** `bun run typecheck` を実行する  
**THEN** compile error が発生しない（default `string` により backward compatible）

---

### A-04 DSV rule ファイル内の name に typo があると tsc が compile error を出す

- **Priority**: must
- **Source**: request.md (受け入れ基準), tasks.md (Task 3 検証, Task 5)

**GIVEN** いずれかの DSV rule ファイル（例: `canonical-spec-structure.ts`）で `name` フィールドの値を `"canonical-spec-strcuture"` などに typo する  
**WHEN** `bun run typecheck` を実行する  
**THEN** `Type '"canonical-spec-strcuture"` is not assignable to type `DeltaSpecRuleName` を含む compile error が発生する

---

### A-05 DeltaSpecRuleRegistry<DeltaSpecRuleName>.register() に union 外の name を渡すと compile error になる

- **Priority**: must
- **Source**: request.md (受け入れ基準 — `TName 外の name を持つ rule の register は tsc が拒否する`)

**GIVEN** `DeltaSpecRuleRegistry<DeltaSpecRuleName>` インスタンスがある  
**WHEN** `name: "unknown-rule"` を持つ `DeltaSpecRule<string>` を `register()` に渡す  
**THEN** tsc が型不適合として compile error を出す

---

### A-06 DSV rule 4 ファイルすべてが DeltaSpecRule<DeltaSpecRuleName> で specialize されている

- **Priority**: must
- **Source**: request.md (要件4), tasks.md (Task 3)

**GIVEN** 以下4ファイルの export 定数  
- `canonical-spec-structure.ts`: `canonicalSpecStructure`  
- `no-legacy-flat-dir.ts`: `noLegacyFlatDir`  
- `no-legacy-flat-file.ts`: `noLegacyFlatFile`  
- `no-specs-for-required-type.ts`: `noSpecsForRequiredType`  

**WHEN** 各定数の型注釈を確認する  
**THEN** いずれも `DeltaSpecRule<DeltaSpecRuleName>` であり、`DeltaSpecRule` または `DeltaSpecRule<string>` ではない

---

### A-07 createDeltaSpecRegistry() の戻り型が DeltaSpecRuleRegistry<DeltaSpecRuleName> である

- **Priority**: must
- **Source**: request.md (要件5, 受け入れ基準 MUST), tasks.md (Task 4)

**GIVEN** `src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` 関数  
**WHEN** 戻り型アノテーションを確認する  
**THEN** `DeltaSpecRuleRegistry<DeltaSpecRuleName>` が明示されており、`DeltaSpecRuleRegistry` または `DeltaSpecRuleRegistry<string>` ではない

---

## Category B: ランタイム動作 / regression

### B-01 bun run typecheck が green

- **Priority**: must
- **Source**: request.md (要件6), tasks.md (Task 5)

**GIVEN** 実装変更後のコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなしで終了する

---

### B-02 bun run test が green

- **Priority**: must
- **Source**: request.md (要件6), tasks.md (Task 5)

**GIVEN** 実装変更後のコードベース  
**WHEN** `bun run test` を実行する  
**THEN** 既存テストがすべて通過し、regression がない

---

### B-03 createDeltaSpecRegistry() が返す registry で validate() が正常動作する

- **Priority**: must
- **Source**: request.md (要件6), design.md

**GIVEN** `createDeltaSpecRegistry()` で作成した `DeltaSpecRuleRegistry<DeltaSpecRuleName>` インスタンス  
**WHEN** 有効な `DeltaSpecRuleInput` を渡して `validate()` を呼ぶ  
**THEN** `DeltaSpecViolation[]` が返り、型変更前と同じ挙動をする

---

### B-04 no-specs-for-required-type が registry に登録されていない

- **Priority**: must
- **Source**: design.md (DJ4), request.md (受け入れ基準 JSDoc 説明)

**GIVEN** `createDeltaSpecRegistry()` で作成した registry  
**WHEN** registry 内の rule リストを取得する（または `validate()` 実行時の trace を確認する）  
**THEN** `no-specs-for-required-type` rule は registry に含まれておらず、early-return チェックとして個別に実行される（D9 設計の維持）

---

## Category C: API contract / exports

### C-01 DeltaSpecRuleName が index.ts から re-export されている

- **Priority**: must
- **Source**: tasks.md (Task 4), request.md (受け入れ基準)

**GIVEN** `src/core/spec/rules/index.ts`  
**WHEN** `DeltaSpecRuleName` を named import する  
**THEN** import が成功し、型として利用可能である

---

### C-02 DeltaSpecRuleRegistry が TName generic を持つ

- **Priority**: must
- **Source**: request.md (要件3), design.md (DJ3), tasks.md (Task 2)

**GIVEN** `src/core/spec/rules/registry.ts` の `DeltaSpecRuleRegistry` class  
**WHEN** class 定義を確認する  
**THEN** `DeltaSpecRuleRegistry<TName extends string = string>` であり、`rules` フィールドは `DeltaSpecRule<TName>[]`、`register()` 引数は `DeltaSpecRule<TName>` である

---

### C-03 DeltaSpecRuleRegistry に TInput / TViolation の generic は追加されていない

- **Priority**: should
- **Source**: design.md (DJ3 — scope 外)

**GIVEN** `DeltaSpecRuleRegistry` の class 定義  
**WHEN** type parameter を確認する  
**THEN** `TName` のみ generic であり、`TInput` や `TViolation` は追加されていない（scope 外の変更がないことの確認）

---

## Category D: 設計ガード / JSDoc

### D-01 createDeltaSpecRegistry() の JSDoc に DeltaSpecRuleName の意味が明記されている

- **Priority**: must
- **Source**: request.md (受け入れ基準 JSDoc), design.md (DJ4), tasks.md (Task 4)

**GIVEN** `src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` 関数の JSDoc  
**WHEN** コメントを読む  
**THEN** 「`DeltaSpecRuleName` union は valid な rule name の制約であり、registry に登録する rule 集合の列挙ではない」旨（`no-specs-for-required-type` は union に含むが registry には登録しない D9 設計）が説明されている

---

### D-02 ValidationRule / A種 ファイルが変更されていない

- **Priority**: should
- **Source**: request.md (スコープ外)

**GIVEN** A種ファイル群（`src/core/validation/types.ts`, `src/core/validation/registry.ts`, `src/parser/rules/`）  
**WHEN** git diff で変更を確認する  
**THEN** これらのファイルに変更がない（scope 外の変更がないことの確認）
