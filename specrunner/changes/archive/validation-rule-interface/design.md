# Design: validation-rule-interface

## Overview

validation rule を inline procedural style から `ValidationRule` interface + `RuleRegistry` pattern に抽象化し、rule の追加・テスト・保守コストを O(1) にする。

## Architecture Decision

### ADR: ValidationRule interface + RuleRegistry による validation 抽象化

**Status**: Proposed

**Context**: parser (`request-md.ts`) と dsv (`delta-spec-validator.ts`) の validation rule が inline で記述されており、rule 追加のたびに関数本体を編集する必要がある。rule 間の再利用性がなく、単独テストも不可能。

**Decision**: Generic な `ValidationRule<TInput, TViolation>` interface と `RuleRegistry<TInput, TViolation>` class を導入し、各 rule を独立ファイルとして定義・register する。

**Consequences**:
- rule 追加が「ファイル追加 + registry.register() 1行」に簡素化
- 各 rule を独立で unit test 可能
- 既存 inline 実装の振る舞いは migration 後も 100% 保持（既存テスト green のまま）

## Key Design Decisions

### D1: Generic type parameters で parser / dsv の両方に対応

```ts
// src/core/validation/types.ts
export interface ValidationRule<TInput, TViolation> {
  name: string;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
```

parser layer: `ValidationRule<ParsedRequestRaw, RequestMdViolation>`
dsv layer: `ValidationRule<DeltaSpecValidatorInput, DeltaSpecViolation>`

Generic にすることで共通基盤を 1 箇所に維持しつつ、layer ごとに input / violation 型を特殊化する。

### D2: RuleRegistry は同名 rule の重複を reject する

```ts
// src/core/validation/registry.ts
export class RuleRegistry<TInput, TViolation> {
  private rules: ValidationRule<TInput, TViolation>[] = [];

  register(rule: ValidationRule<TInput, TViolation>): void {
    if (this.rules.some(r => r.name === rule.name)) {
      throw new Error(`Duplicate rule name: ${rule.name}`);
    }
    this.rules.push(rule);
  }

  validate(input: TInput): TViolation[] {
    return this.rules.flatMap(r => r.check(input));
  }
}
```

`validate` は全 rule を順次実行し violation を flat list で返す。severity による fail/warn 判定は呼び出し側に委ねる。

### D3: parser layer の parse/validate 分離

現状の `parseRequestMdContent` は parse + validate が一体化している。これを 2 phase に分割:

1. **Parse phase**: `parseRequestMdRaw(content, filePath)` — text → raw extracted fields（null 許容）
2. **Validate phase**: `validateRequestMd(raw)` — RuleRegistry で violation 検出 → violation があれば `requestMdInvalidError` に変換して throw

`parseRequestMdContent` の公開シグネチャ・戻り値は変更しない（= 既存テスト・呼び出し元に影響なし）。

#### ParsedRequestRaw 型

```ts
interface ParsedRequestRaw {
  title: string | null;
  type: string | null;
  slug: string | null;
  baseBranch: string | null;
  adrRaw: string | null;       // "true" | "false" | null | invalid string
  adrAnyValue: string | null;  // adr pattern が不完全一致したときの raw value
  issue: string | undefined;
  enabled: string[];
  sections: ParsedRequestSections;
  filePath: string;
  content: string;
}
```

### D4: parser rule の抽出対象

`parseRequestMdContent` 内の inline check を以下の rule に抽出:

| rule name | severity | 対象 field | check 内容 |
|---|---|---|---|
| `title-required` | error | title | null → violation |
| `type-required` | error | type | null → violation |
| `type-known` | warning | type | `isAllowedType(type)` が false → violation（warning） |
| `slug-required` | error | slug | null or empty → violation |
| `base-branch-required` | error | baseBranch | null or empty → violation |
| `adr-required` | error | adrRaw | null + adrAnyValue も null → violation |
| `adr-valid` | error | adrRaw, adrAnyValue | adrRaw が null だが adrAnyValue が non-null → invalid value violation |

計 7 rule。`issue` は optional extraction のため rule 対象外。`enabled` / `sections` は extraction logic のみで validation なし。

### D5: RequestMdViolation 型

```ts
interface RequestMdViolation {
  rule: string;       // rule name
  severity: "error" | "warning";
  message: string;    // human-readable message
  field?: string;     // which meta field caused it
}
```

violation → `requestMdInvalidError` 変換は `parseRequestMdContent` 内で行う。severity="error" の violation が 1 つでもあれば throw。severity="warning" は `stderrWrite` で出力して続行。

### D6: dsv layer の rule 抽出

`validateDeltaSpecPaths` は **async** で fs アクセスを伴う。`ValidationRule.check` は sync signature だが、dsv rule は async が必要。

**対応**: dsv 用に `AsyncValidationRule` を追加するか、`check` の返り値を `TViolation[] | Promise<TViolation[]>` にする。

選択: **`check` を sync のまま維持し、dsv layer は独自の `DeltaSpecRule` interface を定義する**。

理由:
- parser rule は全て sync（text → violation の pure function）
- dsv rule は async fs アクセスが必要
- 基盤の `ValidationRule` を async にすると parser rule が不必要に await を書くことになる
- dsv layer は既に `DeltaSpecViolation` / `DeltaSpecValidatorFs` という独自型を持っており、完全に generic にするメリットが薄い

```ts
// src/core/spec/rules/types.ts
export interface DeltaSpecRule {
  name: string;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}

export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
}
```

`DeltaSpecRuleRegistry` は `RuleRegistry` の async 版:

```ts
export class DeltaSpecRuleRegistry {
  private rules: DeltaSpecRule[] = [];
  register(rule: DeltaSpecRule): void;
  async validate(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
```

これは `RuleRegistry` を継承せず独立 class とする。名前の重複チェックは同様に行う。

### D7: dsv rule の抽出対象

| rule name | severity | check 内容 |
|---|---|---|
| `no-specs-for-required-type` | error | type=spec-change/new-feature で specs/ に .md なし |
| `no-legacy-flat-file` | error | `<change>/delta-spec.md` 検出 |
| `no-legacy-flat-dir` | error | `<change>/delta-spec/<cap>.md` 検出 |
| `no-non-canonical-path` | error | `.delta.md` or `.md` directly in specs/ |
| `require-requirements-section` | error | canonical `spec.md` に ADDED/MODIFIED/REMOVED/RENAMED section なし |
| `require-requirement-block` | error | section はあるが `### Requirement:` block なし |

計 6 rule。

ただし現状の実装では Step 3 (specs/ entries scan) と Step 4 (canonical path validation) が密結合している（specsSubdirs を共有）。`no-non-canonical-path` rule は specs/ の readdir 結果を走査するが、同時に canonical subdirectory のリストを作る。

**対応**: `no-non-canonical-path` と `require-requirements-section` / `require-requirement-block` は共有コンテキスト（specsEntries のスキャン結果）に依存するため、以下の 2 つの粒度に再編する:

- `no-legacy-flat-file`: Step 1 相当（`delta-spec.md` 検出）
- `no-legacy-flat-dir`: Step 2 相当（`delta-spec/*.md` 検出）
- `no-specs-for-required-type`: Step 5 相当
- `canonical-spec-structure`: Step 3 + Step 4 を統合（specs/ エントリのスキャン → non-canonical 検出 → canonical spec.md のセクション検証）

Step 3 + 4 を 1 rule にまとめることで、specsSubdirs の共有コンテキスト問題を回避する。violation reason は複数返しうる（`non-canonical-path`, `missing-requirements-section`, `empty-section`）。

最終的な dsv rule 数: **4 rule**。

### D8: `validateDeltaSpecPaths` の公開シグネチャは変更しない

`validateDeltaSpecPaths(changePath, deps, requestType?)` の引数・戻り値はそのまま。内部で `DeltaSpecRuleRegistry` を構築し `validate` を呼び出す。呼び出し元・既存テストに影響なし。

### D9: 早期 return の保持

現状 dsv の `no-specs-for-required-type` は violation 検出時に即 return する。Rule 化後も同じ挙動を保つために、`DeltaSpecRuleRegistry.validate` で `no-specs-for-required-type` が violation を返した場合は後続 rule をスキップする、**のではなく**、`validateDeltaSpecPaths` 側で 2 段階に分けて実行する:

1. `no-specs-for-required-type` rule を先に check
2. violation なしなら残りの rule を validate

これにより registry の `validate` は「全 rule 実行」のシンプルなセマンティクスを維持できる。

## File Changes

### New files

| path | purpose |
|---|---|
| `src/core/validation/types.ts` | `ValidationRule<TInput, TViolation>` interface |
| `src/core/validation/registry.ts` | `RuleRegistry<TInput, TViolation>` class |
| `src/parser/rules/types.ts` | `ParsedRequestRaw`, `RequestMdViolation` 型定義 |
| `src/parser/rules/title-required.ts` | rule |
| `src/parser/rules/type-required.ts` | rule |
| `src/parser/rules/type-known.ts` | rule (severity: warning) |
| `src/parser/rules/slug-required.ts` | rule |
| `src/parser/rules/base-branch-required.ts` | rule |
| `src/parser/rules/adr-required.ts` | rule |
| `src/parser/rules/adr-valid.ts` | rule |
| `src/parser/rules/index.ts` | `createRequestMdRegistry()` factory |
| `src/core/spec/rules/types.ts` | `DeltaSpecRule`, `DeltaSpecRuleInput` 型定義 |
| `src/core/spec/rules/no-specs-for-required-type.ts` | rule |
| `src/core/spec/rules/no-legacy-flat-file.ts` | rule |
| `src/core/spec/rules/no-legacy-flat-dir.ts` | rule |
| `src/core/spec/rules/canonical-spec-structure.ts` | rule (Step 3+4 統合) |
| `src/core/spec/rules/index.ts` | `createDeltaSpecRegistry()` factory |
| `tests/unit/core/validation/registry.test.ts` | RuleRegistry unit test |
| `tests/unit/parser/rules/title-required.test.ts` | rule unit test |
| `tests/unit/parser/rules/type-required.test.ts` | rule unit test |
| `tests/unit/parser/rules/type-known.test.ts` | rule unit test |
| `tests/unit/parser/rules/slug-required.test.ts` | rule unit test |
| `tests/unit/parser/rules/base-branch-required.test.ts` | rule unit test |
| `tests/unit/parser/rules/adr-required.test.ts` | rule unit test |
| `tests/unit/parser/rules/adr-valid.test.ts` | rule unit test |
| `tests/unit/core/spec/rules/no-specs-for-required-type.test.ts` | rule unit test |
| `tests/unit/core/spec/rules/no-legacy-flat-file.test.ts` | rule unit test |
| `tests/unit/core/spec/rules/no-legacy-flat-dir.test.ts` | rule unit test |
| `tests/unit/core/spec/rules/canonical-spec-structure.test.ts` | rule unit test |

### Modified files

| path | change |
|---|---|
| `src/parser/request-md.ts` | parse/validate 分離。`parseRequestMdRaw` + `validateRequestMd` を追加し、`parseRequestMdContent` はこの 2 関数の合成に変更 |
| `src/core/spec/delta-spec-validator.ts` | `validateDeltaSpecPaths` 内部を DeltaSpecRuleRegistry 経由に書き換え |

### Unchanged files (regression guard)

| path | reason |
|---|---|
| `tests/unit/parser/request-md.test.ts` | 公開 API 不変のため改変不要 |
| `tests/unit/core/spec/delta-spec-validator.test.ts` | 公開 API 不変のため改変不要 |
| `src/core/request/types.ts` | `ParsedRequest` 型は変更なし |
| `src/errors.ts` | `requestMdInvalidError` はそのまま利用 |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| dsv rule の早期 return セマンティクス崩壊 | 既存テスト TC-V-11/12 が失敗 | D9 で 2 段階実行を明示 |
| parser の parse/validate 分離時に field 抽出漏れ | `parseRequestMdContent` の戻り値が不完全に | `ParsedRequestRaw` に全 field を列挙し、migration 後に既存テスト green を確認 |
| dsv の Step 3+4 統合で violation 順序変更 | テストが violation の配列順序に依存している場合 | 既存テストは `find` / `filter` で検索しており順序非依存（確認済み） |
