# Design: DeltaSpecRule.name を typo 安全な型に強化する

## 概要

PR #321 で `ValidationRule` (A 種) に適用した `TName extends string = string` パターンを、独立 interface である `DeltaSpecRule` (B 種) に対称的に適用する。

## 設計判断

### DJ1: DeltaSpecRule は ValidationRule を extend しない

**決定**: `DeltaSpecRule` は独自 interface を維持し、`TName` type parameter のみを追加する。

**理由**: sync (`ValidationRule.check`) vs async (`DeltaSpecRule.check`) の差異があり、無理に統合すると全 consumer に `await` の伝播が必要。PR #321 の ADR と同じ判断を踏襲。

### DJ2: TName の default は `string`

**決定**: `DeltaSpecRule<TName extends string = string>` — default `string` で backward compatibility 維持。

**理由**: 外部コードや将来の rule 追加時に、union 型を指定しなくても compile が通る。PR #321 の `ValidationRule` と同じパターン。

### DJ3: DeltaSpecRuleRegistry は TName のみ generic

**決定**: `DeltaSpecRuleRegistry<TName extends string = string>` とし、`TInput` / `TViolation` は generic 化しない。

**理由**: `DeltaSpecRuleRegistry` は `DeltaSpecRuleInput` / `DeltaSpecViolation` に固定されており（A 種の汎用 `RuleRegistry<TInput, TViolation, TName>` と異なる）、不要な type parameter の追加は複雑さを増すだけ。name の typo 安全化が目的であり、input/violation の generic 化は scope 外。

### DJ4: DeltaSpecRuleName union は「valid な rule name の制約」であり「registry 登録集合」ではない

**決定**: `no-specs-for-required-type` を `DeltaSpecRuleName` union に含める。

**理由**: D9 設計で `no-specs-for-required-type` は registry に登録せず early-return で個別実行されるが、rule の name 型としては valid。union から外すと、この rule だけ `DeltaSpecRule<string>` になり typo 安全化の恩恵を受けられない。`createDeltaSpecRegistry()` の JSDoc にこの区別を明記する。

## 変更対象ファイル

| File | 変更内容 |
|------|----------|
| `src/core/spec/rules/types.ts` | `DeltaSpecRuleName` union 追加、`DeltaSpecRule<TName>` 拡張 |
| `src/core/spec/rules/registry.ts` | `DeltaSpecRuleRegistry<TName>` 拡張 |
| `src/core/spec/rules/index.ts` | `createDeltaSpecRegistry()` 戻り型変更、JSDoc 追記、`DeltaSpecRuleName` re-export |
| `src/core/spec/rules/canonical-spec-structure.ts` | 型注釈を `DeltaSpecRule<DeltaSpecRuleName>` に変更 |
| `src/core/spec/rules/no-legacy-flat-dir.ts` | 同上 |
| `src/core/spec/rules/no-legacy-flat-file.ts` | 同上 |
| `src/core/spec/rules/no-specs-for-required-type.ts` | 同上 |

## 変更しないファイル

| File | 理由 |
|------|------|
| `src/core/spec/delta-spec-validator.ts` | `createDeltaSpecRegistry()` / `noSpecsForRequiredType` の利用箇所は型推論で自動的に narrow される。明示的な型注釈変更は不要 |
| `src/core/validation/types.ts` | A 種。scope 外 |
| `src/core/validation/registry.ts` | A 種。scope 外 |

## 型の Before / After

### types.ts

```typescript
// Before
export interface DeltaSpecRule {
  name: string;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}

// After
export type DeltaSpecRuleName =
  | "canonical-spec-structure"
  | "no-legacy-flat-dir"
  | "no-legacy-flat-file"
  | "no-specs-for-required-type";

export interface DeltaSpecRule<TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
```

### registry.ts

```typescript
// Before
export class DeltaSpecRuleRegistry {
  private rules: DeltaSpecRule[] = [];
  register(rule: DeltaSpecRule): void { ... }
  async validate(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> { ... }
}

// After
export class DeltaSpecRuleRegistry<TName extends string = string> {
  private rules: DeltaSpecRule<TName>[] = [];
  register(rule: DeltaSpecRule<TName>): void { ... }
  async validate(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> { ... }
}
```

### rule ファイル（4 件共通パターン）

```typescript
// Before
export const someRule: DeltaSpecRule = { name: "some-rule", ... };

// After
export const someRule: DeltaSpecRule<DeltaSpecRuleName> = { name: "some-rule", ... };
```

### index.ts

```typescript
// Before
export function createDeltaSpecRegistry(): DeltaSpecRuleRegistry { ... }

// After
/**
 * Create a registry with all standard DSV rules (excluding no-specs-for-required-type,
 * which is run separately as an early-return check per D9).
 *
 * Note: `DeltaSpecRuleName` union constrains valid rule names for type safety.
 * It is NOT a 1:1 enumeration of rules registered here — `no-specs-for-required-type`
 * is a valid DeltaSpecRuleName but is intentionally excluded from this registry
 * because it runs as an early-return check (D9 design).
 */
export function createDeltaSpecRegistry(): DeltaSpecRuleRegistry<DeltaSpecRuleName> { ... }
```
