## Context

`ValidationRule<TInput, TViolation>` の `name` フィールドは `string` 型（free string）。rule の register 時に typo しても tsc が検知できず、命名規約上の参照ミスが silent に通過する。#305 の `PromptFragment.applicableTo` と同型の問題。

parser layer（A 種）の rule は 7 件、全て sync で `src/parser/rules/` に存在する。DSV layer（B 種）は `DeltaSpecRule` という完全に独立した interface を持ち、async + fs 操作のため本 request のスコープ外。

現状の型構造:

- `ValidationRule<TInput, TViolation>` — `src/core/validation/types.ts`（name: string）
- `RuleRegistry<TInput, TViolation>` — `src/core/validation/registry.ts`
- 7 rule files — `src/parser/rules/*.ts`（各ファイルが `ValidationRule<ParsedRequestRaw, RequestMdViolation>` を export）
- `createRequestMdRegistry()` — `src/parser/rules/index.ts`（7 件を register する factory）
- `DeltaSpecRuleRegistry` — `src/core/spec/rules/registry.ts`（`RuleRegistry` とは別クラス、本 request 対象外）

## Goals / Non-Goals

**Goals:**

- `ValidationRule` interface に第 3 型パラメータ `TName extends string = string` を追加
- `RuleRegistry` クラスも同様に 3 型パラメータ化
- parser layer 用の `RequestMdRuleName` union 型を定義
- parser layer の 7 rule file を `RequestMdRuleName` で specialize
- `createRequestMdRegistry` の返り型で `TName=RequestMdRuleName` を明示
- 既存 test・既存 caller の後方互換を維持

**Non-Goals:**

- DSV layer（`DeltaSpecRule` / `DeltaSpecRuleRegistry`）の変更
- `RequestMdViolation.rule: string` の型強化
- rule name 自体の rename・体系再編
- RuleRegistry の API 変更（register / validate の signature 維持）

## Decisions

### D1: 第 3 型パラメータ TName with default = string

`ValidationRule<TInput, TViolation, TName extends string = string>` とし、`name: TName` とする。default が `string` のため、既存の `ValidationRule<X, Y>` という 2 型パラメータでの使用箇所は無修正で通る。

**Alternatives**: enum（参照が冗長）、runtime test で lock（tsc 段階で検知できない）

### D2: RequestMdRuleName は src/parser/rules/types.ts に配置

parser layer の rule namespace に閉じた union 型。7 件の string literal を列挙する。core の `ValidationRule` interface は `TName extends string` を受け取るだけなので、core が parser 固有の型に依存しない。

### D3: RuleRegistry も 3 型パラメータ化

`RuleRegistry<TInput, TViolation, TName extends string = string>` とし、`register(rule: ValidationRule<TInput, TViolation, TName>)` で受け取る。`private rules` の型も `ValidationRule<TInput, TViolation, TName>[]` に変更。既存の `RuleRegistry<X, Y>` 使用箇所は default により無修正で通る。

### D4: 既存テストの makeRule ヘルパーは無修正

`tests/unit/core/validation/registry.test.ts` の `makeRule(name: string, ...)` は `ValidationRule<unknown, SimpleViolation>` を返す。`TName` の default が `string` のため、`name: string` のまま型エラーにならない。既存テストの修正は不要。

## Risks / Trade-offs

- [Risk] 新しい parser rule を追加する際、`RequestMdRuleName` union への追加を忘れる → Mitigation: rule file で `ValidationRule<..., RequestMdRuleName>` と specialize しているため、union に含まれない name を書くと tsc error。union 追加忘れは tsc が検知する
- [Trade-off] 型パラメータが 3 つに増える → 既存 caller は default で 2 パラメータのまま使えるため実害なし
