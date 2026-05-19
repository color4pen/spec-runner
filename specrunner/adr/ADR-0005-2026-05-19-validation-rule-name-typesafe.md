# ValidationRule.name の typo-safe 型強化パターン

**Date**: 2026-05-19
**Status**: accepted

## Context

PR #308 で導入された `ValidationRule<TInput, TViolation>` の `name: string` は free string であり、rule の register / lookup 時の typo を tsc が検知できない。例えば `{ name: "type-requied", ... }` という typo は重複チェックを通過し、rule は実行される一方、命名規約上の参照や test 連携時に silent skip が起きうる。

同型の問題は PR #305（`PromptFragment.applicableTo: string[]`）でも観測済み。#305 では「prompt 側が array で列挙 + test で対応表を lock」（ADR-0001 案 C）で解決したが、ValidationRule の name 問題は型システム側で解決する方が適切と判断した（後述）。

parser layer（A 種: `ValidationRule<TInput, TViolation>` / sync / `src/parser/rules/`）と DSV layer（B 種: `DeltaSpecRule` / async + fs / `src/core/spec/rules/`）は完全独立 interface であり、性質が異なるため本 change は A 種のみを対象とした。B 種への同型強化は別 issue で個別に適用する。

## Decision

`ValidationRule` interface に第 3 型パラメータ `TName extends string = string` を追加し、`name: TName` とする。parser layer 固有の rule 名を列挙した `RequestMdRuleName` union 型を `src/parser/rules/types.ts` に定義し、各 rule file がこれで specialize する。

```ts
// src/core/validation/types.ts
export interface ValidationRule<TInput, TViolation, TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}

// src/parser/rules/types.ts
export type RequestMdRuleName =
  | "type-required"
  | "type-known"
  | "slug-required"
  | "base-branch-required"
  | "adr-required"
  | "adr-valid"
  | "title-required";
```

`RuleRegistry` も同様に `TName` 型パラメータを追加し、`register(rule: ValidationRule<TInput, TViolation, TName>)` で union を制約する。`default = string` により既存の 2 型パラメータでの使用箇所は無修正で通る（後方互換）。

`core/validation/` は parser 固有の union 型に依存しない。union 型は parser layer の namespace に閉じ、`ValidationRule` interface は `TName extends string` を受け取るだけの汎用設計を保つ。

## Alternatives Considered

### Alternative 1: 中央 enum + `as const`

```ts
export const RULE_NAMES = {
  TYPE_REQUIRED: "type-required",
  ...
} as const;
```

- **Pros**: tsc 段階で typo を検知できる点は union 型と同等。import ひとつで全名前を参照できる。
- **Cons**: 各 rule で `RULE_NAMES.TYPE_REQUIRED` のような間接参照が必要で冗長。union 型に比べて宣言量が多い。
- **Why not**: 型表現の目的に enum / `as const` の間接参照は不要なオーバーヘッド。union 型の方が簡潔でかつ型安全性が同等。

### Alternative 2: rule 側が string literal で name を持ち、test で lock

```ts
// 各 rule file
export const typeRequired: ValidationRule<...> = {
  name: "type-required" as const,
  ...
};
```

- **Pros**: interface の変更ゼロ。既存ファイルへの影響が最小。
- **Cons**: typo の検知が runtime test 段階になる（tsc が拾えない）。「型で表現する」設計方針（#305 / ADR-0001）との不整合。
- **Why not**: 検知を tsc 段階に前倒しできるなら前倒しすべきという設計判断。pipeline 実行前に拾えることが重要。

## Consequences

### Positive

- `RequestMdRuleName` に含まれない name を書くと tsc が compile error として検知。pipeline 実行前（静的解析段階）で typo を排除できる
- 新しい parser rule を追加する際、`RequestMdRuleName` union への追加を忘れると tsc error が発生する（追加忘れ自体を型システムが担保）
- `core/validation/` は parser 固有の union 型に依存しないため、汎用性を維持したまま typo 検知を層ごとに追加できる
- `default = string` による後方互換で、既存の `ValidationRule<X, Y>` 使用箇所は無修正

### Negative

- `ValidationRule` / `RuleRegistry` の型パラメータが 3 つに増え、fully specialized な型 (`RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>`) はやや冗長
- `createRequestMdRegistry` の返り型を明示しないと `TName = string` のまま推論される恐れがあるため、factory 側で明示的な型注釈が必要

### Known Design Debt

- DSV layer（B 種: `DeltaSpecRule` / `DeltaSpecRuleRegistry`）への同型強化が未適用（別 issue #312 スコープ外）。B 種は async + fs 操作のため独立 interface を持ち、同型パターン（`TName extends string = string`）を別途適用する予定
- `RequestMdViolation.rule: string`（各 rule の `check()` 内で violation 構築時の rule 名）は free string のまま。rule **作成時** の typo は本 change で防げるが、violation **構築時** の typo 検知は別 issue で対応
