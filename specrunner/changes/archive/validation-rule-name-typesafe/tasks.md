## T-01: RequestMdRuleName union 型の定義

- [x] `src/parser/rules/types.ts` に `RequestMdRuleName` 型を export する:
  ```typescript
  export type RequestMdRuleName =
    | "type-required"
    | "type-known"
    | "slug-required"
    | "base-branch-required"
    | "adr-required"
    | "adr-valid"
    | "title-required";
  ```

**受け入れ基準**: `bun run typecheck` が pass

## T-02: ValidationRule interface に TName 型パラメータを追加

- [x] `src/core/validation/types.ts` の `ValidationRule` interface を以下に変更:
  ```typescript
  export interface ValidationRule<TInput, TViolation, TName extends string = string> {
    name: TName;
    severity: "error" | "warning";
    check(input: TInput): TViolation[];
  }
  ```

**受け入れ基準**: `bun run typecheck` が pass。既存の `ValidationRule<X, Y>` 形式の参照が全て無修正で通る

## T-03: RuleRegistry クラスに TName 型パラメータを追加

- [x] `src/core/validation/registry.ts` の `RuleRegistry` クラスを以下に変更:
  ```typescript
  export class RuleRegistry<TInput, TViolation, TName extends string = string> {
    private rules: ValidationRule<TInput, TViolation, TName>[] = [];

    register(rule: ValidationRule<TInput, TViolation, TName>): void {
      if (this.rules.some((r) => r.name === rule.name)) {
        throw new Error(`Duplicate rule name: ${rule.name}`);
      }
      this.rules.push(rule);
    }

    validate(input: TInput): TViolation[] {
      return this.rules.flatMap((r) => r.check(input));
    }
  }
  ```

**受け入れ基準**: `bun run typecheck` が pass。既存の `RuleRegistry<X, Y>` 形式の参照が全て無修正で通る

## T-04: parser layer 7 rule file の specialize

各 rule file の型注釈を `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` に変更する。対象 7 ファイル:

- [x] `src/parser/rules/type-required.ts` — import `RequestMdRuleName` from `./types.js`、型注釈を更新
- [x] `src/parser/rules/type-known.ts` — 同上
- [x] `src/parser/rules/slug-required.ts` — 同上
- [x] `src/parser/rules/base-branch-required.ts` — 同上
- [x] `src/parser/rules/adr-required.ts` — 同上
- [x] `src/parser/rules/adr-valid.ts` — 同上
- [x] `src/parser/rules/title-required.ts` — 同上

各ファイルの変更パターン:
1. `import type { RequestMdRuleName } from "./types.js"` を追加（既存の `ParsedRequestRaw, RequestMdViolation` import に追加）
2. `ValidationRule<ParsedRequestRaw, RequestMdViolation>` を `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` に変更

**受け入れ基準**: `bun run typecheck` が pass。typo した name（例: `"type-requied"`）で tsc error になることを手動確認

## T-05: createRequestMdRegistry の返り型を明示

- [x] `src/parser/rules/index.ts` の `createRequestMdRegistry` 関数:
  - `RuleRegistry<ParsedRequestRaw, RequestMdViolation>` を `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` に変更（返り型注釈 + 内部の `new RuleRegistry` の型引数の両方）
  - `RequestMdRuleName` を `./types.js` から import

**受け入れ基準**: `bun run typecheck` が pass

## T-06: type-level test の追加

- [x] `tests/unit/parser/rules/` に type-level test ファイルを追加（例: `rule-name-typesafe.test.ts`）:
  - typo した name で `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` を作成すると型エラーになることを `@ts-expect-error` で検証
  - 正しい name で作成すると型エラーにならないことを検証
  - `RequestMdRuleName` union の member 数が 7 であることの sanity check（optional）

**受け入れ基準**: `bun run typecheck` と `bun run test` が pass

## T-07: 最終検証

- [x] `bun run typecheck` が pass
- [x] `bun run test` が全 pass（既存テストの regression なし）
- [x] DSV layer のファイル（`src/core/spec/rules/*.ts`）が無修正であることを確認
