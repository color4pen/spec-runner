# DeltaSpecRule.name を typo 安全な型に強化する

## Meta

- **type**: spec-change
- **slug**: delta-spec-rule-name-typesafe
- **base-branch**: main
- **adr**: true

## 背景

PR #321 で `ValidationRule.name` (= parser layer / A 種、`src/parser/rules/`) の typo 安全化を `RequestMdRuleName` union 型 + `ValidationRule<TInput, TViolation, TName extends string = string>` 拡張で実現した。

`DeltaSpecRule` (= DSV layer / B 種、`src/core/spec/rules/`) は `ValidationRule` から独立した interface (= sync vs async + fs 操作の差) であるため、PR #321 の scope 外として #319 に切り出された。本 request はその姉妹タスク。

## 現状の不足

`src/core/spec/rules/types.ts`:

```ts
export interface DeltaSpecRule {
  name: string;  // free string = typo 検知不可
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
```

DSV rule 4 件 (`canonical-spec-structure` / `no-legacy-flat-dir` / `no-legacy-flat-file` / `no-specs-for-required-type`) の `name` が free string のため、register / 参照時に typo を tsc が拾えない。

## 要件

1. `src/core/spec/rules/types.ts` に `DeltaSpecRuleName` union 型を追加 (= 4 件の name を string literal union で列挙) する
2. `DeltaSpecRule` interface を `DeltaSpecRule<TName extends string = string>` に拡張する (= `name: TName`、TName default `string` で backward compatibility 維持)
3. `src/core/spec/rules/registry.ts` の `DeltaSpecRuleRegistry` を `DeltaSpecRuleRegistry<TName extends string = string>` に拡張する
4. DSV rule 4 ファイルを `DeltaSpecRule<DeltaSpecRuleName>` で specialize する
5. `src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` は `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返す
6. 既存 test の regression が無いこと (`bun run typecheck && bun run test` green)

## スコープ外

- A 種 (= `ValidationRule.name` 強化、PR #321 で完了済)
- `DeltaSpecRule` と `ValidationRule` の統合 refactor (= sync/async の差で独立 interface を維持する判断、別議論)
- `DeltaSpecViolation.rule: string` フィールドの強化 (= rule 構築時の typo は本 request 後も silent、別 issue)
- DSV rule の name 文字列自体の rename / 体系再編

## 受け入れ基準

- [ ] `DeltaSpecRuleName` union 型 (= 4 件列挙) が export されている
- [ ] `DeltaSpecRule` interface が `<TName extends string = string>` 拡張、`name: TName` に変更されている
- [ ] `DeltaSpecRuleRegistry` が `<TName extends string = string>` 拡張されている
- [ ] `DeltaSpecRuleRegistry.register()` の引数型が `DeltaSpecRule<TName>` であり、TName 外の name を持つ rule の register は tsc が compile error として拒否する (= PR #321 の `RuleRegistry` パターンと対称)
- [ ] DSV rule 4 ファイルが `DeltaSpecRule<DeltaSpecRuleName>` で specialize されている
- [ ] `createDeltaSpecRegistry()` の戻り型が `DeltaSpecRuleRegistry<DeltaSpecRuleName>` である (= MUST)
- [ ] DSV rule 内で typo (例: `"canonical-spec-strcuture"`) を書くと tsc が compile error として検知する
- [ ] `createDeltaSpecRegistry()` の JSDoc (= `src/core/spec/rules/index.ts`) に「`DeltaSpecRuleName` union は valid な rule name の制約であり、`createDeltaSpecRegistry()` が登録する rule 集合の列挙ではない」旨を明記する (= `no-specs-for-required-type` は早期リターン用途で union に含むが registry には登録しない D9 設計の誤読防止)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
