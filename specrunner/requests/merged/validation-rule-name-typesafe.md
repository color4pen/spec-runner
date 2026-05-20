# ValidationRule.name を typo 安全な型に強化する

## Meta

- **type**: spec-change
- **slug**: validation-rule-name-typesafe
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-19
- **author**: color4pen
- **issue**: #312

## 背景

PR #308 で導入された `ValidationRule.name: string` (= parser layer / A 種) は free string のため、rule の register / lookup 時に typo を検知できない:

```ts
// src/core/validation/types.ts
export interface ValidationRule<TInput, TViolation> {
  name: string;          // free string
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
```

```ts
// 例: typo した register
registry.register({ name: "type-requied", severity: "error", check: ... });  // typo
// → 重複 check は通る、rule は実行される、ただし「type-required」と命名規約上の参照や test 連携時に silent skip が起きうる
```

### 同型問題: #305 の applicableTo

`#305 prompt-fragment-registry` の議論で、初期案では `PromptFragment.applicableTo: string[]` (= free string) だったが、最終的に **「prompt 側が array で列挙 + test で対応表を lock」** の案 C に移行した。`ValidationRule.name` も同じ構造リスク。

### スコープ判断: A 種のみに絞る

調査の結果、validation rule には 2 種類存在:

| layer | interface | check | 場所 |
|---|---|---|---|
| **A 種 (parser)** | `ValidationRule<TInput, TViolation>` | sync (= 文字列パターンマッチ) | `src/parser/rules/` (= 7 件) |
| B 種 (DSV) | `DeltaSpecRule` | async + fs 操作 | `src/core/spec/rules/` (= 4 件) |

B 種 (= DSV layer) は **完全独立 interface** (= `ValidationRule` を継承せず、async/sync の意味論が異なる)。性質が違うため無理に同じ抽象で扱う設計は不自然。本 request は **A 種のみ** を対象とし、B 種は別 issue で同型パターンを適用する。

## 設計判断

### 1. 採用方針: 案 1 (union 型) を採用

3 案の比較:

| 案 | アプローチ | 採用判断 |
|---|---|---|
| 案 1 | union 型 (= `RequestMdRuleName` / `DeltaSpecRuleName`) を導入し interface に generics で渡す | **採用** (= TypeScript レベルで typo を tsc 段階で検知) |
| 案 2 | 中央 enum + `as const` | 案 1 と効果同等だが、enum 経由の参照が冗長 |
| 案 3 | rule 側が name を string literal で持ち test で lock | runtime test 段階での検知になる (= 案 1 より遅い) |

案 1 採用理由: tsc が typo を検知 = pipeline 実行前に拾える + #305 と同じ「型で表現する」設計方針との整合。

### 2. union 型の宣言場所

```ts
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

= parser layer (= A 種) の rule namespace に閉じる。DSV layer の `DeltaSpecRuleName` は **別 issue** で定義 (= 性質が異なるため本 request では触らない)。

### 3. ValidationRule interface の型パラメータ拡張

```ts
// src/core/validation/types.ts
export interface ValidationRule<TInput, TViolation, TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
```

= 第 3 型パラメータ `TName` を追加、default は `string` で既存 caller の後方互換を保つ。各 rule 側で `ValidationRule<TInput, TViolation, RequestMdRuleName>` のように union で specialize。

### 4. RuleRegistry 側の型パラメータ

`RuleRegistry<TInput, TViolation, TName>` も同様に 3 型パラメータ化し、`register` の rule 引数で name を union に制約する。`validate` の挙動は変えない (= violations 集約のみ)。

### 5. 各 rule file の更新

`src/parser/rules/*.ts` の 7 ファイル (= adr-required / adr-valid / base-branch-required / slug-required / title-required / type-known / type-required) で `ValidationRule<TInput, TViolation, RequestMdRuleName>` として `name` を union 経由で宣言する。

DSV layer (= `src/core/spec/rules/*.ts` の 4 件) は **別 issue で別 interface (`DeltaSpecRule`) に対して同型強化を適用** するため、本 request では touch しない。

## 要件

### 1. RequestMdRuleName union の定義

`src/parser/rules/types.ts` に `RequestMdRuleName` (= 7 件の literal union) を export する MUST。DSV layer の `DeltaSpecRuleName` は本 request 範囲外 (= 別 issue で対応)。

### 2. ValidationRule interface の型パラメータ拡張

`src/core/validation/types.ts` の `ValidationRule` 型に第 3 パラメータ `TName extends string = string` を追加し、`name: TName` とする MUST。default が `string` で既存 caller は無修正で通る MUST。

### 3. RuleRegistry の型パラメータ拡張

`src/core/validation/registry.ts` 等の `RuleRegistry` クラス (= ある場合) の型パラメータも同様に拡張する MUST。`register` で渡される rule の name を union で制約。

`src/parser/rules/index.ts` の `createRequestMdRegistry` factory は `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` を返す MUST (= TName=string default のまま放置されないことを担保)。

⚠️ `DeltaSpecRuleRegistry` (= `src/core/spec/rules/registry.ts`) は `RuleRegistry` から独立した別 class のため本 request 範囲外 (= 別 issue で対応)。

### 4. 各 rule file の specialize

parser layer 7 件の各 rule file が、自身の `ValidationRule` 実装で `TName` を `RequestMdRuleName` union で specialize する MUST。typo した name は tsc が compile error として検知する MUST。

DSV layer (= `src/core/spec/rules/*.ts` の 4 件) は別 interface (`DeltaSpecRule`) のため本 request 対象外。

### 5. test

- `tests/unit/parser/rules/registry-integration.test.ts` 等の既存 test が無修正で通過する MUST (= 後方互換)。
- 新規 type-level test (= ts-expect-error または unit test) で「typo した name で rule を作成すると tsc error になる」ことを示す SHOULD (= rule 作者の挙動契約を test で固定)。

### 6. delta spec target

target capability: `validation-rule-interface`

該当 Requirement:

- 「ValidationRule interface SHALL declare name, severity, and check」 (= `name: string` の型を typo-safe に強化) → MODIFIED
  - name の型を free string から union (= typo 検知可能な型) に強化
  - Scenario も typo 検知可能性を反映

delta spec path: `specrunner/changes/validation-rule-name-typesafe/specs/validation-rule-interface/spec.md`

⚠️ 規律: target capability の baseline (`validation-rule-interface`) を実装時に MUST Read で確認し、Requirement header を正確に複写する。MODIFIED 配下の header は baseline の header と完全一致 MUST。

## スコープ外

- **DSV layer (= B 種、`DeltaSpecRule` / `DeltaSpecRuleRegistry` + dsv 4 件) の同型強化** (= 別 issue で対応、性質 (async + fs) が異なるため別 interface のまま個別に union 拡張する)
- **`RequestMdViolation.rule: string` フィールドの強化** (= 各 rule の check() 内で violation を構築する際の rule 名 typo 検知は別 issue。本 request は rule **作成時** の name typo を対象とし、violation 構築時の rule 文字列は free string のまま残る)
- name 自体の rename / 体系再編 (= 既存 name 文字列はそのまま、型のみ強化)
- RuleRegistry の API 変更 (= register / validate の signature は維持)
- 他 interface (= 例: agent definition 等) の name 強化 (= 本 request では `ValidationRule.name` のみ)
- LLM agent への適用 (= 本 request は静的型のみ、agent prompt は触らない)
- `DeltaSpecRule` と `ValidationRule` の統合 refactor (= 性質差により別議論)

## 受け入れ基準

- [ ] `src/parser/rules/types.ts` に `RequestMdRuleName` union (= 7 件) が export されている
- [ ] `src/core/validation/types.ts` の `ValidationRule` interface に `TName extends string = string` 型パラメータが追加されている
- [ ] parser layer の各 rule file (= 7 件) が `ValidationRule<TInput, TViolation, RequestMdRuleName>` で `TName` を specialize している
- [ ] `src/parser/rules/index.ts` の `createRequestMdRegistry` factory が `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` を返す
- [ ] DSV layer (= `src/core/spec/rules/*.ts`) は **無修正** で残っている (= 別 issue で対応)
- [ ] 既存 caller (= RuleRegistry / validate 呼び出し側) の signature 変更なし、後方互換
- [ ] typo した parser rule の name で rule を作成すると tsc compile error になる
- [ ] `bun run typecheck && bun run test` が green、既存 test の regression なし
- [ ] delta spec が baseline 確認の上で MODIFIED で作成されている (= target capability `validation-rule-interface`)

## Workflow Options

- enabled: []
