# Test Cases: validation-rule-interface

Generated from: request.md, design.md, tasks.md  
Date: 2026-05-18

---

## Category Index

| Category | ID Range | Description |
|---|---|---|
| REG | TC-REG-01〜05 | RuleRegistry（core/validation）|
| PR | TC-PR-01〜14 | Parser rules（src/parser/rules/）|
| DSV | TC-DSV-01〜12 | DSV rules（src/core/spec/rules/）|
| MIG-P | TC-MIG-P-01〜04 | Parser layer migration（request-md.ts）|
| MIG-D | TC-MIG-D-01〜04 | DSV layer migration（delta-spec-validator.ts）|
| REG-END | TC-REG-END-01〜03 | Regression guard（既存テスト）|
| SPEC | TC-SPEC-01〜02 | Delta spec ファイル |

---

## RuleRegistry

### TC-REG-01
- **Category**: REG
- **Priority**: must
- **Source**: tasks.md Task 1.3, request.md 要件7

**GIVEN** RuleRegistry に `check` が `[{rule:"r1"}]` を返す rule "r1" を register した  
**WHEN** `validate(input)` を呼ぶ  
**THEN** 戻り値に `{rule:"r1"}` の violation が含まれる

---

### TC-REG-02
- **Category**: REG
- **Priority**: must
- **Source**: tasks.md Task 1.3, request.md 要件7, design.md D2

**GIVEN** RuleRegistry に rule "r1"（violation 1件）と rule "r2"（violation 2件）を register した  
**WHEN** `validate(input)` を呼ぶ  
**THEN** 戻り値は合計 3 件の violation を含む flat array である

---

### TC-REG-03
- **Category**: REG
- **Priority**: must
- **Source**: tasks.md Task 1.3, request.md 要件2, design.md D2

**GIVEN** RuleRegistry に name="dup" の rule を 1 件 register 済みである  
**WHEN** 同じ name="dup" の rule を再度 `register()` する  
**THEN** `Error: Duplicate rule name: dup` がスローされる

---

### TC-REG-04
- **Category**: REG
- **Priority**: must
- **Source**: design.md D1, request.md 要件1

**GIVEN** `ValidationRule<TInput, TViolation>` interface を実装したオブジェクトが存在する  
**WHEN** TypeScript コンパイラで型チェックする  
**THEN** `name: string`, `severity: "error" | "warning"`, `check(input: TInput): TViolation[]` の 3 プロパティが必須として要求される

---

### TC-REG-05
- **Category**: REG
- **Priority**: should
- **Source**: design.md D2

**GIVEN** rule が 1 件も register されていない空の RuleRegistry がある  
**WHEN** `validate(input)` を呼ぶ  
**THEN** 空の array `[]` が返る

---

## Parser Rules

### TC-PR-01 (title-required — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `title` フィールドが `null` である  
**WHEN** `titleRequired.check(raw)` を呼ぶ  
**THEN** `[{ rule: "title-required", severity: "error", field: "title" }]` を含む配列が返る

---

### TC-PR-02 (title-required — pass)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4

**GIVEN** `ParsedRequestRaw` の `title` フィールドが non-null の文字列である  
**WHEN** `titleRequired.check(raw)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-PR-03 (type-required — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `type` フィールドが `null` である  
**WHEN** `typeRequired.check(raw)` を呼ぶ  
**THEN** `[{ rule: "type-required", severity: "error", field: "type" }]` を含む配列が返る

---

### TC-PR-04 (type-required — pass)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4

**GIVEN** `ParsedRequestRaw` の `type` フィールドが `"new-feature"` である  
**WHEN** `typeRequired.check(raw)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-PR-05 (type-known — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `type` フィールドが `"unknown-type"` である（`isAllowedType` が false を返す）  
**WHEN** `typeKnown.check(raw)` を呼ぶ  
**THEN** `[{ rule: "type-known", severity: "warning" }]` を含む配列が返る

---

### TC-PR-06 (type-known — pass when null)
- **Category**: PR
- **Priority**: should
- **Source**: design.md D4（type-required が先に検出するため type-known は null を skip）

**GIVEN** `ParsedRequestRaw` の `type` フィールドが `null` である  
**WHEN** `typeKnown.check(raw)` を呼ぶ  
**THEN** `[]` が返る（null は type-required の責任範囲）

---

### TC-PR-07 (slug-required — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `slug` フィールドが `null` または空文字列である  
**WHEN** `slugRequired.check(raw)` を呼ぶ  
**THEN** `[{ rule: "slug-required", severity: "error", field: "slug" }]` を含む配列が返る

---

### TC-PR-08 (base-branch-required — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `baseBranch` フィールドが `null` または空文字列である  
**WHEN** `baseBranchRequired.check(raw)` を呼ぶ  
**THEN** `[{ rule: "base-branch-required", severity: "error", field: "baseBranch" }]` を含む配列が返る

---

### TC-PR-09 (adr-required — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `adrRaw` が `null` かつ `adrAnyValue` も `null` である  
**WHEN** `adrRequired.check(raw)` を呼ぶ  
**THEN** `[{ rule: "adr-required", severity: "error", field: "adr" }]` を含む配列が返る  
**AND** message に `"missing 'adr' in Meta section"` が含まれる

---

### TC-PR-10 (adr-required — pass)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4

**GIVEN** `ParsedRequestRaw` の `adrRaw` が `"true"` である  
**WHEN** `adrRequired.check(raw)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-PR-11 (adr-valid — violation)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4, design.md D4

**GIVEN** `ParsedRequestRaw` の `adrRaw` が `null` かつ `adrAnyValue` が `"yes"` などの invalid 文字列である  
**WHEN** `adrValid.check(raw)` を呼ぶ  
**THEN** `[{ rule: "adr-valid", severity: "error" }]` を含む配列が返る  
**AND** message に `"invalid value for 'adr'"` が含まれる

---

### TC-PR-12 (adr-valid — pass when adrRaw present)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.4

**GIVEN** `ParsedRequestRaw` の `adrRaw` が `"false"` である（valid value）  
**WHEN** `adrValid.check(raw)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-PR-13 (adr-valid — pass when both null)
- **Category**: PR
- **Priority**: should
- **Source**: design.md D4（adr-required が先に検出、adr-valid は both-null を skip）

**GIVEN** `ParsedRequestRaw` の `adrRaw` と `adrAnyValue` がどちらも `null` である  
**WHEN** `adrValid.check(raw)` を呼ぶ  
**THEN** `[]` が返る（両 null は adr-required の責任範囲）

---

### TC-PR-14 (registry 統合)
- **Category**: PR
- **Priority**: must
- **Source**: tasks.md Task 2.3, design.md D3

**GIVEN** `createRequestMdRegistry()` を呼ぶ  
**WHEN** 返された registry の `validate` を完全に欠損した raw（全フィールド null）で呼ぶ  
**THEN** 少なくとも `title-required`, `type-required`, `slug-required`, `base-branch-required`, `adr-required` の violation が含まれる

---

## DSV Rules

### TC-DSV-01 (no-legacy-flat-file — violation)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5, design.md D7

**GIVEN** `<changePath>/delta-spec.md` が存在するディレクトリ構造をモックする  
**WHEN** `noLegacyFlatFile.check(input)` を呼ぶ  
**THEN** `[{ reason: "legacy-flat-file" }]` を含む配列が返る

---

### TC-DSV-02 (no-legacy-flat-file — pass)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5

**GIVEN** `<changePath>/delta-spec.md` が存在しないディレクトリ構造をモックする  
**WHEN** `noLegacyFlatFile.check(input)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-DSV-03 (no-legacy-flat-dir — violation)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5, design.md D7

**GIVEN** `<changePath>/delta-spec/` ディレクトリ内に `.md` ファイルが存在するをモックする  
**WHEN** `noLegacyFlatDir.check(input)` を呼ぶ  
**THEN** `[{ reason: "legacy-flat-dir" }]` を含む配列が返る

---

### TC-DSV-04 (no-legacy-flat-dir — pass)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5

**GIVEN** `<changePath>/delta-spec/` ディレクトリが存在しないをモックする  
**WHEN** `noLegacyFlatDir.check(input)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-DSV-05 (no-specs-for-required-type — violation)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5, design.md D7

**GIVEN** `requestType` が `"new-feature"`（TYPES_REQUIRING_SPECS に含まれる）であり、`<changePath>/specs/` 内に `.md` ファイルが 0 件をモックする  
**WHEN** `noSpecsForRequiredType.check(input)` を呼ぶ  
**THEN** `[{ reason: "no-specs-for-required-type" }]` を含む配列が返る

---

### TC-DSV-06 (no-specs-for-required-type — pass for non-required type)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5

**GIVEN** `requestType` が `"bug-fix"`（TYPES_REQUIRING_SPECS に含まれない）である  
**WHEN** `noSpecsForRequiredType.check(input)` を呼ぶ  
**THEN** `[]` が返る（type が spec 必須でないため）

---

### TC-DSV-07 (no-specs-for-required-type — pass when specs exist)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5

**GIVEN** `requestType` が `"spec-change"` であり、`<changePath>/specs/` 内に `.md` が 1 件以上存在するをモックする  
**WHEN** `noSpecsForRequiredType.check(input)` を呼ぶ  
**THEN** `[]` が返る

---

### TC-DSV-08 (canonical-spec-structure — .delta.md violation)
- **Category**: DSV
- **Priority**: must
- **Source**: design.md D7, tasks.md Task 4.5

**GIVEN** `<changePath>/specs/foo/foo.delta.md` が存在するをモックする  
**WHEN** `canonicalSpecStructure.check(input)` を呼ぶ  
**THEN** `[{ reason: "legacy-flat-file" }]` を含む配列が返る

---

### TC-DSV-09 (canonical-spec-structure — non-canonical .md in specs/)
- **Category**: DSV
- **Priority**: must
- **Source**: design.md D7

**GIVEN** `<changePath>/specs/bar.md`（specs/ 直下の .md ファイル）が存在するをモックする  
**WHEN** `canonicalSpecStructure.check(input)` を呼ぶ  
**THEN** `[{ reason: "non-canonical-path" }]` を含む配列が返る

---

### TC-DSV-10 (canonical-spec-structure — missing section violation)
- **Category**: DSV
- **Priority**: must
- **Source**: design.md D7, request.md 要件4

**GIVEN** `<changePath>/specs/cap/spec.md` が存在するが ADDED/MODIFIED/REMOVED/RENAMED セクションヘッダを持たないをモックする  
**WHEN** `canonicalSpecStructure.check(input)` を呼ぶ  
**THEN** `[{ reason: "missing-requirements-section" }]` を含む配列が返る

---

### TC-DSV-11 (canonical-spec-structure — empty section violation)
- **Category**: DSV
- **Priority**: must
- **Source**: design.md D7

**GIVEN** `<changePath>/specs/cap/spec.md` が `## ADDED Requirements` セクションを持つが `### Requirement:` ブロックがないをモックする  
**WHEN** `canonicalSpecStructure.check(input)` を呼ぶ  
**THEN** `[{ reason: "empty-section" }]` を含む配列が返る

---

### TC-DSV-12 (canonical-spec-structure — pass)
- **Category**: DSV
- **Priority**: must
- **Source**: tasks.md Task 4.5

**GIVEN** `<changePath>/specs/cap/spec.md` が正規の `## ADDED Requirements` + `### Requirement:` ブロックを持つをモックする  
**WHEN** `canonicalSpecStructure.check(input)` を呼ぶ  
**THEN** `[]` が返る

---

## Parser Layer Migration

### TC-MIG-P-01
- **Category**: MIG-P
- **Priority**: must
- **Source**: tasks.md Task 3.2, request.md 受け入れ基準

**GIVEN** `src/parser/request-md.ts` が RuleRegistry 経由に書き換え済みである  
**WHEN** `bun vitest run tests/unit/parser/request-md.test.ts` を実行する  
**THEN** 改変なしで全テスト green である（regression なし）

---

### TC-MIG-P-02
- **Category**: MIG-P
- **Priority**: must
- **Source**: tasks.md Task 3.1, design.md D3

**GIVEN** `parseRequestMdContent` が呼ばれる  
**WHEN** `type` フィールドが欠損した content を渡す  
**THEN** `requestMdInvalidError` がスローされる（migration 前と同一の error）

---

### TC-MIG-P-03
- **Category**: MIG-P
- **Priority**: should
- **Source**: design.md D5（severity="warning" は throw せず stderrWrite）

**GIVEN** `type` に `isAllowedType` が false を返す unknown な値が含まれる content を渡す  
**WHEN** `parseRequestMdContent` を呼ぶ  
**THEN** スローされず、stderr に warning メッセージが出力される

---

### TC-MIG-P-04
- **Category**: MIG-P
- **Priority**: must
- **Source**: tasks.md Task 3.1, design.md D3

**GIVEN** `parseRequestMdRaw(content, filePath)` が新規 export されている  
**WHEN** 有効な request.md content を渡す  
**THEN** `ParsedRequestRaw` 型の object が返り、全フィールド（title/type/slug/baseBranch/adrRaw/issue/enabled/sections）が正しく抽出されている

---

## DSV Layer Migration

### TC-MIG-D-01
- **Category**: MIG-D
- **Priority**: must
- **Source**: tasks.md Task 5.2, request.md 受け入れ基準

**GIVEN** `src/core/spec/delta-spec-validator.ts` が DeltaSpecRuleRegistry 経由に書き換え済みである  
**WHEN** `bun vitest run tests/unit/core/spec/delta-spec-validator.test.ts` を実行する  
**THEN** 改変なしで全テスト green である（regression なし）

---

### TC-MIG-D-02
- **Category**: MIG-D
- **Priority**: must
- **Source**: design.md D9, tasks.md Task 5.1

**GIVEN** `requestType` が spec 必須タイプであり specs/ が空である  
**WHEN** `validateDeltaSpecPaths` を呼ぶ  
**THEN** `{ ok: false, violations: [{ reason: "no-specs-for-required-type" }] }` が返り、後続の legacy/canonical rule は実行されない（早期 return）

---

### TC-MIG-D-03
- **Category**: MIG-D
- **Priority**: must
- **Source**: design.md D8

**GIVEN** `validateDeltaSpecPaths(changePath, deps, requestType?)` の公開シグネチャが変更後も同一である  
**WHEN** 既存の呼び出し元コードをコンパイルする  
**THEN** 型エラーが発生しない

---

### TC-MIG-D-04
- **Category**: MIG-D
- **Priority**: should
- **Source**: design.md D9

**GIVEN** `no-specs-for-required-type` が violation を返さない場合  
**WHEN** `validateDeltaSpecPaths` が続く rule を実行する  
**THEN** legacy-flat-file, legacy-flat-dir, canonical-spec-structure の各 rule が実行される

---

## Regression Guard

### TC-REG-END-01
- **Category**: REG-END
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 6

**GIVEN** Task 1〜5 の実装が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 全テスト green であり型エラーが 0 件である

---

### TC-REG-END-02
- **Category**: REG-END
- **Priority**: must
- **Source**: request.md 要件5

**GIVEN** `tests/unit/parser/request-md.test.ts` が元のまま（改変なし）である  
**WHEN** vitest で実行する  
**THEN** 全テスト pass する

---

### TC-REG-END-03
- **Category**: REG-END
- **Priority**: must
- **Source**: request.md 要件5

**GIVEN** `tests/unit/core/spec/delta-spec-validator.test.ts` が元のまま（改変なし）である  
**WHEN** vitest で実行する  
**THEN** 全テスト pass する

---

## Delta Spec

### TC-SPEC-01
- **Category**: SPEC
- **Priority**: must
- **Source**: request.md 要件8, tasks.md Task 7.1

**GIVEN** `specrunner/changes/validation-rule-interface/specs/validation-rule-interface/spec.md` が存在する  
**WHEN** ファイル内容を確認する  
**THEN** `## ADDED Requirements` セクションが存在し、以下の 4 Requirement が記述されている:  
- ValidationRule interface は name / severity / check を持つ  
- RuleRegistry は rule の register と input に対する violation 集約を提供する  
- parser layer と dsv layer の rule が個別ファイルとして Registry に register される  
- 既存 inline 実装の振る舞いは migration 後も保たれる

---

### TC-SPEC-02
- **Category**: SPEC
- **Priority**: must
- **Source**: request.md 要件8, tasks.md Task 7.2

**GIVEN** `specrunner/changes/validation-rule-interface/specs/request-md-parser/spec.md` が存在する  
**WHEN** ファイル内容を確認する  
**THEN** `## MODIFIED Requirements` セクションが存在し、validation 経路が RuleRegistry を経由する旨が記述されている
