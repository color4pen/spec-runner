# Tasks: DeltaSpecRule.name を typo 安全な型に強化する

## Task 1 [x]: DeltaSpecRuleName union 型と DeltaSpecRule generic 化

**File**: `src/core/spec/rules/types.ts`

1. `DeltaSpecRuleName` union 型を追加:
   ```typescript
   export type DeltaSpecRuleName =
     | "canonical-spec-structure"
     | "no-legacy-flat-dir"
     | "no-legacy-flat-file"
     | "no-specs-for-required-type";
   ```
2. `DeltaSpecRule` interface を generic 化:
   ```typescript
   export interface DeltaSpecRule<TName extends string = string> {
     name: TName;
     severity: "error" | "warning";
     check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
   }
   ```

**検証**: `bun run typecheck` — default `string` なので既存コードは壊れない

## Task 2 [x]: DeltaSpecRuleRegistry generic 化

**File**: `src/core/spec/rules/registry.ts`

1. class 定義を `DeltaSpecRuleRegistry<TName extends string = string>` に変更
2. `private rules` の型を `DeltaSpecRule<TName>[]` に変更
3. `register()` の引数型を `DeltaSpecRule<TName>` に変更
4. `validate()` の戻り型・ロジックは変更不要（`DeltaSpecViolation[]` のまま）

**検証**: `bun run typecheck`

## Task 3 [x]: DSV rule 4 ファイルの型注釈を specialize

以下 4 ファイルの型注釈を `DeltaSpecRule` → `DeltaSpecRule<DeltaSpecRuleName>` に変更。import に `DeltaSpecRuleName` を追加。

- `src/core/spec/rules/canonical-spec-structure.ts`: `export const canonicalSpecStructure: DeltaSpecRule<DeltaSpecRuleName>`
- `src/core/spec/rules/no-legacy-flat-dir.ts`: `export const noLegacyFlatDir: DeltaSpecRule<DeltaSpecRuleName>`
- `src/core/spec/rules/no-legacy-flat-file.ts`: `export const noLegacyFlatFile: DeltaSpecRule<DeltaSpecRuleName>`
- `src/core/spec/rules/no-specs-for-required-type.ts`: `export const noSpecsForRequiredType: DeltaSpecRule<DeltaSpecRuleName>`

**検証**: `bun run typecheck` — typo を仕込んで compile error になることを手動確認後、元に戻す

## Task 4 [x]: createDeltaSpecRegistry() 戻り型と JSDoc 更新

**File**: `src/core/spec/rules/index.ts`

1. `DeltaSpecRuleName` を re-export: `export type { DeltaSpecRuleName } from "./types.js";`（既存 re-export 群と並べる）
2. `createDeltaSpecRegistry()` の戻り型を `DeltaSpecRuleRegistry<DeltaSpecRuleName>` に変更
3. 関数内部で `new DeltaSpecRuleRegistry<DeltaSpecRuleName>()` を使用
4. JSDoc を以下に更新:
   ```
   /**
    * Create a registry with all standard DSV rules (excluding no-specs-for-required-type,
    * which is run separately as an early-return check per D9).
    *
    * Note: `DeltaSpecRuleName` union constrains valid rule names for type safety.
    * It is NOT a 1:1 enumeration of rules registered here — `no-specs-for-required-type`
    * is a valid DeltaSpecRuleName but is intentionally excluded from this registry
    * because it runs as an early-return check (D9 design).
    */
   ```

**検証**: `bun run typecheck`

## Task 5 [x]: 全体検証

1. `bun run typecheck` green
2. `bun run test` green
3. typo テスト: rule ファイルの name を意図的に typo して tsc error が出ることを確認し、元に戻す
