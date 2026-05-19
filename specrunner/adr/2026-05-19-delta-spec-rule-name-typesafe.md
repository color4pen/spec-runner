# DeltaSpecRule.name の typo-safe 型強化パターン（B 種）

**Date**: 2026-05-19
**Status**: accepted

## Context

`2026-05-19-validation-rule-name-typesafe.md`（A 種 ADR）が `ValidationRule`（parser layer / sync）に `TName extends string = string` パターンを適用し、Known Design Debt として以下を記録した：

> DSV layer（B 種: `DeltaSpecRule` / `DeltaSpecRuleRegistry`）への同型強化が未適用。B 種は async + fs 操作のため独立 interface を持ち、同型パターンを別途適用する予定

本 ADR はその計画を実行に移した際の設計判断を記録する。

B 種固有の論点として、D9 設計（`no-specs-for-required-type` は early-return チェックとして個別実行、`DeltaSpecRuleRegistry` に登録しない）が存在する。このルールは型安全化の対象（valid な `DeltaSpecRuleName` のひとつ）でありながら `createDeltaSpecRegistry()` が返す registry の中に含まれない。union 型の集合と registry の登録集合が一致しない事実を明確にしないと、将来の誤読を招く。

## Decision

A 種 ADR と同型のパターンを B 種に適用しつつ、以下 2 点を B 種固有の判断として記録する。

### DJ-B1: DeltaSpecRuleRegistry は TName のみ generic 化する

A 種の `RuleRegistry<TInput, TViolation, TName>` と異なり、`DeltaSpecRuleRegistry<TName extends string = string>` は `TInput` / `TViolation` を generic 化しない。

`DeltaSpecRuleRegistry` は `DeltaSpecRuleInput` / `DeltaSpecViolation` に固定されており、汎用化する利点がない。name の typo 安全化が目的であり、input/violation の generic 化は scope 外。

### DJ-B2: DeltaSpecRuleName union は「valid な rule name の制約」であり「registry 登録集合」ではない

`no-specs-for-required-type` を `DeltaSpecRuleName` union に含める。D9 設計でこの rule は `createDeltaSpecRegistry()` には登録せず early-return で個別実行するが、rule の name 型としては valid であるため union に含める。

union から外すと、この rule だけ `DeltaSpecRule<string>` になり typo 安全化の恩恵を受けられない。この区別を `createDeltaSpecRegistry()` の JSDoc に明記することで誤読を防ぐ。

```ts
// src/core/spec/rules/types.ts
export type DeltaSpecRuleName =
  | "canonical-spec-structure"
  | "no-legacy-flat-dir"
  | "no-legacy-flat-file"
  | "no-specs-for-required-type";  // union に含むが registry には登録しない（D9 設計）

export interface DeltaSpecRule<TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}

// src/core/spec/rules/registry.ts
export class DeltaSpecRuleRegistry<TName extends string = string> {
  private rules: DeltaSpecRule<TName>[] = [];
  register(rule: DeltaSpecRule<TName>): void { ... }
  async validate(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> { ... }
}
```

`createDeltaSpecRegistry()` は `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返し、factory が `no-specs-for-required-type` 以外の 3 rule を登録する。

## Alternatives Considered

A 種 ADR の Alternative 1（中央 enum + `as const`）および Alternative 2（string literal + test lock）は B 種にも同様に検討済みだが、同じ理由で採用しない。詳細は `2026-05-19-validation-rule-name-typesafe.md` を参照。

## Consequences

### Positive

- A 種 ADR の Known Design Debt を解消。A 種 / B 種でパターンが対称化され、rule 追加ガイドラインが統一できる
- `DeltaSpecRuleName` に含まれない name を書くと tsc が compile error として検知。pipeline 実行前（静的解析段階）で typo を排除できる
- D9 設計（early-return チェック）との関係が JSDoc + ADR の 2 層で明文化され、誤解による registry 登録ミスを防ぐ

### Negative

A 種 ADR の Negative と同様。`createDeltaSpecRegistry()` の戻り型を明示しないと `TName = string` のまま推論される恐れがあるため、factory 側で明示的な型注釈が必要。

### Known Design Debt

- `DeltaSpecViolation.rule: string`（violation 構築時の rule 名）は free string のまま。rule **定義時** の typo は本 change で防げるが、violation **構築時** の typo 検知は別 issue で対応
- `DeltaSpecRule` と `ValidationRule` の統合 refactor（sync/async の差を解消する設計変更）は別議論。現時点では独立 interface 維持が適切
