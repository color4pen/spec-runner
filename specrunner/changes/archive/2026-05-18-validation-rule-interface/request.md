# validation rule を Rule interface + RuleRegistry に抽象化する

## Meta

- **type**: new-feature
- **slug**: validation-rule-interface
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #301

## 背景

現状、spec-runner の validation rule は parser / dsv の両方で **inline procedural style** で書かれている:

| layer | 現状 |
|---|---|
| `src/parser/request-md.ts` | `parseRequestMdContent` 関数内に `for + regex` を順に並べる procedural style。rule 追加 = if 文の追加 |
| `src/core/spec/delta-spec-validator.ts` (= dsv) | `DeltaSpecViolationReason` type union + `DeltaSpecViolation` interface はあるが、rule 自体は `validateDeltaSpecPaths` 関数内に inline (= 「Step 1: legacy-flat-file 検出」「Step 2: ...」が同一関数) |

### 問題

- rule の追加が inline 編集 → テスト・確認・改修コストが線形増加
- rule ごとの **再利用性なし** (= parser と dsv で似た rule を書き直す必要)
- rule の **on/off / severity 設定** が中央集権化できない
- 「rule を追加して」というユーザーリクエストに対し毎回 inline 編集が必要 (= 5 件連続事故 #289/#291 + 今 session 3 件のような再発時に補強コストが嵩む、#299 関連)

## 設計判断

### 1. ValidationRule interface

```ts
// src/core/validation/types.ts
export interface ValidationRule<TInput, TViolation> {
  name: string;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
```

### 2. RuleRegistry

```ts
// src/core/validation/registry.ts
export class RuleRegistry<TInput, TViolation> {
  private rules: ValidationRule<TInput, TViolation>[] = [];
  register(rule: ValidationRule<TInput, TViolation>): void;
  validate(input: TInput): TViolation[];
}
```

`validate` は全 rule を順次実行し、violation を flat list で返す。severity による fail/warn 判定は呼び出し側に委ねる (= rule は中立)。

### 3. parser layer の migration

`src/parser/request-md.ts`:

- `parseRequestMdContent` を **parse phase** (= text → ParsedRequestRaw) と **validate phase** (= ParsedRequestRaw → violations) に分割
- 既存 inline check (= type / slug / base-branch / adr / etc) を個別 Rule 化
- RequestMdRuleRegistry を新設、各 Rule を register

### 4. dsv layer の migration

`src/core/spec/delta-spec-validator.ts`:

- `validateDeltaSpecPaths` 内の Step 1 / Step 2 / ... を個別 Rule 化
- 既存 `DeltaSpecViolation` を `ValidationRule` の `TViolation` 型として再利用
- DeltaSpecRuleRegistry を新設、各 Rule を register

### 5. 既存 inline rule の抽出範囲

migration は **振る舞いを保つ** ことを最優先。新規 rule の追加 (= #299 で議論される baseline path 検出等) は本 request スコープ外。

### 6. RuleRegistry の test 戦略

- 各 Rule を単独で test 可能にする (= input → expected violations の組み合わせ)
- Registry の test は「register した rule が validate で呼ばれる」「violation が flat に集約される」の最小限

## 要件

### 1. ValidationRule interface 定義

`src/core/validation/types.ts` を新規作成し `ValidationRule<TInput, TViolation>` interface を定義する。

### 2. RuleRegistry class 実装

`src/core/validation/registry.ts` を新規作成:

- `register(rule: ValidationRule): void`
- `validate(input: TInput): TViolation[]` で全 rule を順次実行
- 同名 rule の重複 register は throw

### 3. parser layer の rule 抽出 + migration

`src/parser/request-md.ts`:

- 既存 `parseRequestMdContent` を以下に分割:
  - `parseRequestMdRaw(text): ParsedRequestRaw` (= text → raw struct)
  - `validateRequestMdRaw(raw): RequestMdViolation[]` (= raw struct → violations)
- 既存 inline check を以下の Rule に抽出 (`src/parser/rules/` 配下):
  - `type-required` / `type-valid`
  - `slug-required` / `slug-format`
  - `base-branch-required`
  - `adr-required` / `adr-valid`
  - その他既存 check (= 全列挙)
- `RequestMdRuleRegistry` を新設、全 Rule を register
- 既存 `requestMdInvalidError` への変換は呼び出し側で行う (= rule は violation を返すのみ)

### 4. dsv layer の rule 抽出 + migration

`src/core/spec/delta-spec-validator.ts`:

- 既存 `validateDeltaSpecPaths` 内の各 Step を以下の Rule に抽出 (`src/core/spec/rules/` 配下):
  - `no-legacy-flat-file`
  - `no-specs-for-required-type`
  - その他既存 check (= 全列挙)
- `DeltaSpecRuleRegistry` を新設、全 Rule を register
- 既存 `DeltaSpecViolation` 型はそのまま `TViolation` として利用

### 5. 既存 test の維持

既存 test (= `tests/unit/parser/request-md.test.ts` / `tests/unit/core/spec/delta-spec-validator.test.ts`) は **振る舞いを保つ** ため改変不要。Rule 化後も同じ入出力で pass する。

### 6. 新規 rule 単独 test

各 Rule について `tests/unit/parser/rules/<rule-name>.test.ts` / `tests/unit/core/spec/rules/<rule-name>.test.ts` を追加:

- 該当 rule に違反する input → expected violation
- 該当 rule に違反しない input → 空の violation list

### 7. RuleRegistry test

`tests/unit/core/validation/registry.test.ts` (= 新規):

- TC-REG-01: register した rule が validate で呼ばれる
- TC-REG-02: 複数 rule の violation が flat に集約される
- TC-REG-03: 同名 rule の重複 register で throw

### 8. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/validation-rule-interface/spec.md` を新規作成し、`## ADDED Requirements` セクションで Requirement を記述する (= finish 時に spec-merge が baseline を新規作成):

- Purpose: validation rule を ValidationRule interface + RuleRegistry で declarative に管理する
- Requirement:
  - ValidationRule interface は name / severity / check を持つ
  - RuleRegistry は rule の register と input に対する violation 集約を提供する
  - parser layer (request.md) と dsv layer (delta-spec) の rule が個別 file として Registry に register される
  - 既存 inline 実装の振る舞いは migration 後も保たれる

既存 capability への MODIFIED:

- `specrunner/changes/<slug>/specs/request-md-parser/spec.md` を作成し `## MODIFIED Requirements` で「validation 経路が RuleRegistry を経由する」旨を反映 (= baseline は spec-merge 経由で finish 時に更新)

## スコープ外

- 新規 rule の追加 (= 別 issue で扱う、特に #299 の baseline path 検出は本 request migration 後)
- request review / generator prompt 側の補強 (= 別 layer、本 request は validation layer のみ)
- Rule の severity による fail/warn 動的切り替え (= 呼び出し側で判定、本 request では「register 済 rule は全て実行される」前提)
- 中央集権的 config (= 「rule on/off の YAML 設定」等) は将来課題

## 受け入れ基準

- [ ] `src/core/validation/types.ts` で `ValidationRule` interface が定義されている
- [ ] `src/core/validation/registry.ts` で `RuleRegistry` class が実装されている
- [ ] `src/parser/rules/` 配下に request.md 用 Rule 群が抽出されている
- [ ] `src/parser/request-md.ts` の `parseRequestMdContent` が RuleRegistry 経由の validate を呼び出すように改修されている
- [ ] `src/core/spec/rules/` 配下に dsv 用 Rule 群が抽出されている
- [ ] `src/core/spec/delta-spec-validator.ts` の `validateDeltaSpecPaths` が RuleRegistry 経由に改修されている
- [ ] 既存 test (= `tests/unit/parser/request-md.test.ts` / `tests/unit/core/spec/delta-spec-validator.test.ts`) の regression なし (= 改変不要で green)
- [ ] 新規 rule 単独 test が `tests/unit/parser/rules/` と `tests/unit/core/spec/rules/` に追加されている
- [ ] `tests/unit/core/validation/registry.test.ts` が追加され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec `specrunner/changes/<slug>/specs/validation-rule-interface/spec.md` が `## ADDED Requirements` を持つ形で新規作成されている
- [ ] delta spec `specrunner/changes/<slug>/specs/request-md-parser/spec.md` が `## MODIFIED Requirements` を持つ形で新規作成されている

## Workflow Options

- enabled: []
