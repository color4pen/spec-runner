# Test Cases: add-spec-fixer-format-rules

## Scenarios

---

### TC-01: Delta Spec Format Rules セクションが存在する

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1, request.md 受け入れ基準 |

**GIVEN** `src/prompts/spec-fixer-system.ts` の `SPEC_FIXER_SYSTEM_PROMPT` 文字列が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** `## Delta Spec Format Rules` セクションが含まれている

---

### TC-02: Delta Spec Format Rules セクションの配置が正しい

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1, design.md 実装方法 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` に `## 修正手順` と `## 修正不能な findings の扱い` の両セクションが存在する  
**WHEN** セクション順序を検査する  
**THEN** `## Delta Spec Format Rules` は `## 修正手順` より後に出現し、`## 修正不能な findings の扱い` より前に出現する

---

### TC-03: ADDED/MODIFIED/REMOVED/RENAMED のセクションヘッダーが全て記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1, request.md 要件 1 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の `## Delta Spec Format Rules` セクションが存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** 以下が全て含まれている:
- `` `## ADDED Requirements` ``
- `` `## MODIFIED Requirements` ``
- `` `## REMOVED Requirements` ``
- `` `## RENAMED Requirements` ``

---

### TC-04: `### Requirement:` ヘッダ書式ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 ルール 1, request.md 要件 1 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** 各 Requirement は `` `### Requirement:` `` で始まる header を持つべきことが明記されている

---

### TC-05: `#### Scenario:` 必須ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 ルール 2, request.md 要件 1 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** 各 Requirement に少なくとも 1 つの `` `#### Scenario:` `` が必要であることが記載されている（MODIFIED Requirements を含む）

---

### TC-06: normative keywords (SHALL/MUST) ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 ルール 5, request.md 要件 1 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** Requirement 本文に英語の `SHALL` または `MUST` を最低 1 つ含めることが明記されている

---

### TC-07: REMOVED セクションはヘッダーのみのルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | request.md 要件 1, design.md 移植するルール |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** `## REMOVED Requirements` の説明を検査する  
**THEN** REMOVED セクションでは Requirement の本文が不要（ヘッダーのみ）であることが読み取れる

---

### TC-08: 独自フォーマット禁止ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 ルール 4, design.md 移植するルール 5 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** `## Changed Requirement:` や `## Updated:` 等の独自フォーマットが禁止されていることが明記されている

---

### TC-09: コードブロック禁止ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 ルール 6, design.md 移植するルール 7 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** `` `### Requirement:` `` header と最初の `` `#### Scenario:` `` の間にコードブロックを挟まないことが明記されている

---

### TC-10: ファイル配置ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | should |
| Source | tasks.md Task 1 ファイル配置, design.md 移植するルール 8 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** delta spec は `specs/<capability-name>/spec.md` に配置すること、フラットファイル（`specs/<name>.delta.md` 等）は禁止であることが記載されている

---

### TC-11: テンプレート変数 `${_changesDir}` が含まれていない

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 注意事項, design.md 実装方法 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` に Delta Spec Format Rules が追加されている  
**WHEN** プロンプト文字列を検査する  
**THEN** `${_changesDir}` や他の TypeScript テンプレートリテラル変数は一切含まれていない

---

### TC-12: Self-review checklist が含まれていない

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 注意事項, design.md 移植しないもの |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` に Delta Spec Format Rules が追加されている  
**WHEN** プロンプト文字列を検査する  
**THEN** `Self-review checklist` セクションおよびそのチェックボックス項目は含まれていない

---

### TC-13: propose-system.ts との整合性

| Field | Value |
|-------|-------|
| Category | consistency |
| Priority | must |
| Source | request.md 要件 2, request.md 受け入れ基準 |

**GIVEN** `propose-system.ts` の Delta Spec Format Rules（L85-137）が存在する  
**WHEN** `spec-fixer-system.ts` の Delta Spec Format Rules と比較する  
**THEN** 各ルールの内容（セクション名、Requirement ヘッダ書式、Scenario 必須、MODIFIED header 一致、normative keywords、コードブロック制約）が propose-system.ts と矛盾していない

---

### TC-14: `buildSpecFixerSystemPrompt()` のシグネチャが変わっていない

| Field | Value |
|-------|-------|
| Category | architecture |
| Priority | must |
| Source | design.md 変更しないもの |

**GIVEN** `src/prompts/spec-fixer-system.ts` の変更後  
**WHEN** `buildSpecFixerSystemPrompt()` 関数のシグネチャを検査する  
**THEN** 引数型・戻り値型ともに変更前と同一であり、後方互換性が維持されている

---

### TC-15: `bun run typecheck` が pass する

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 2, request.md 受け入れ基準 |

**GIVEN** `spec-fixer-system.ts` に Delta Spec Format Rules が追加されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-16: `bun run test` が pass する

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 2, request.md 受け入れ基準 |

**GIVEN** `spec-fixer-system.ts` に Delta Spec Format Rules が追加されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、失敗件数が 0 である

---

### TC-17: MODIFIED Requirements の Scenario 必須が強調されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | should |
| Source | tasks.md Task 1 ルール 2, design.md 移植するルール 3 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules における Scenario ルールが存在する  
**WHEN** ルール 2 の記述を検査する  
**THEN** `## MODIFIED Requirements` 配下の Requirement にも Scenario が必須であることが明示されている（「差分の説明文」「変更概要」ではなく振る舞いを Given/When/Then で記述する旨が含まれている）

---

### TC-18: MODIFIED Requirements の header 一致ルールが記載されている

| Field | Value |
|-------|-------|
| Category | correctness |
| Priority | must |
| Source | tasks.md Task 1 ルール 3, design.md 移植するルール 4 |

**GIVEN** `SPEC_FIXER_SYSTEM_PROMPT` の Delta Spec Format Rules が存在する  
**WHEN** プロンプト文字列を検査する  
**THEN** `## MODIFIED Requirements` 配下の `### Requirement:` header は変更前の元 header と完全一致すること、header を変える場合は RENAMED を併記することが明記されている
