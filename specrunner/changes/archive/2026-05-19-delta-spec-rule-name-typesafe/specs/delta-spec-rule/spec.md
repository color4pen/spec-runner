# Delta Spec: DeltaSpecRule Name Type Safety

## ADDED Requirements

### Requirement: DeltaSpecRuleName union type

`src/core/spec/rules/types.ts` に `DeltaSpecRuleName` union 型を export する。

- DSV rule 4 件の name を string literal union で列挙する: `"canonical-spec-structure" | "no-legacy-flat-dir" | "no-legacy-flat-file" | "no-specs-for-required-type"`
- この union は「valid な rule name の制約」であり、registry に登録される rule 集合の列挙ではない（`no-specs-for-required-type` は union に含むが registry には登録しない）

### Requirement: DeltaSpecRule interface に TName type parameter を追加

`DeltaSpecRule` interface を `DeltaSpecRule<TName extends string = string>` に拡張し、`name` フィールドの型を `TName` に変更する。

- default `string` で backward compatibility を維持する
- `DeltaSpecRule` は `ValidationRule` を extend しない（sync vs async の差異により独立 interface を維持）

### Requirement: DeltaSpecRuleRegistry に TName type parameter を追加

`DeltaSpecRuleRegistry` を `DeltaSpecRuleRegistry<TName extends string = string>` に拡張する。

- `register(rule: DeltaSpecRule<TName>)` の引数型を `DeltaSpecRule<TName>` にする
- `TName` 外の name を持つ rule の register は tsc が compile error として拒否する

### Requirement: DSV rule 4 ファイルを DeltaSpecRule<DeltaSpecRuleName> で specialize

以下 4 ファイルの型注釈を `DeltaSpecRule<DeltaSpecRuleName>` に変更する:

- `src/core/spec/rules/canonical-spec-structure.ts`
- `src/core/spec/rules/no-legacy-flat-dir.ts`
- `src/core/spec/rules/no-legacy-flat-file.ts`
- `src/core/spec/rules/no-specs-for-required-type.ts`

rule 内で typo（例: `"canonical-spec-strcuture"`）を書くと tsc が compile error として検知する。

### Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` が `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返す。

JSDoc に「`DeltaSpecRuleName` union は valid な rule name の制約であり、`createDeltaSpecRegistry()` が登録する rule 集合の列挙ではない。`no-specs-for-required-type` は D9 設計で early-return 用途のため registry には登録しない」旨を明記する。
