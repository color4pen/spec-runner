# Test Cases: design-request-followup

## 凡例

- **Priority**: must / should / could
- **Source**: タスク番号 (T-01〜T-07) または受け入れ基準
- **Category**: Unit-Parser / Unit-Builder / Integration-Design / Integration-CodeReview / Regression / CI

---

## Category: Unit-Parser (`extractMarkdownSections`)

### TC-01: 単一 heading の抽出

- **Priority**: must
- **Source**: T-01

**GIVEN** `## スコープ外\n\n- item A\n- item B\n\n## 次のセクション\n...` という markdown テキストと headings `["スコープ外"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** Map に `"スコープ外"` キーが存在し、値が `"- item A\n- item B"` (先頭末尾空行 trim 済み) である

---

### TC-02: heading が存在しない場合

- **Priority**: must
- **Source**: T-01

**GIVEN** `## 背景\n\nsome text` という markdown テキストと headings `["スコープ外"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** 返された Map に `"スコープ外"` キーが存在しない (エントリなし)

---

### TC-03: 複数 heading を同時抽出

- **Priority**: must
- **Source**: T-01

**GIVEN** `## スコープ外\n\ncontent-A\n\n## 受け入れ基準\n\ncontent-B\n\n## architect 評価済みの設計判断\n\ncontent-C` という markdown テキストと headings `["スコープ外", "受け入れ基準", "architect 評価済みの設計判断"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** Map に 3 キーが全て存在し、それぞれの値が `content-A`, `content-B`, `content-C` である

---

### TC-04: heading 直下が空（本文なし）

- **Priority**: must
- **Source**: T-01

**GIVEN** `## スコープ外\n\n## 次のセクション\n\ncontent` という markdown テキスト (スコープ外に本文なし) と headings `["スコープ外"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** Map に `"スコープ外"` キーが存在しない、または値が空文字列である

---

### TC-05: `###` レベル heading は section 境界にならない

- **Priority**: must
- **Source**: T-01

**GIVEN** `## スコープ外\n\nline1\n\n### サブセクション\n\nline2\n\n## 受け入れ基準\n\ncontent-B` という markdown テキストと headings `["スコープ外"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** `"スコープ外"` の値に `"### サブセクション"` を含む `line1` から `line2` までが全て含まれ、`content-B` は含まれない

---

### TC-06: headings 配列に指定されていない heading は無視される

- **Priority**: should
- **Source**: T-01

**GIVEN** `## 背景\n\nbg-content\n\n## スコープ外\n\nscope-content` という markdown テキストと headings `["スコープ外"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** Map に `"スコープ外"` のみが含まれ、`"背景"` キーは存在しない

---

### TC-07: headings 配列が空の場合

- **Priority**: should
- **Source**: T-01

**GIVEN** 任意の markdown テキストと headings `[]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** 空の Map が返される

---

### TC-08: content が空文字列

- **Priority**: should
- **Source**: T-01

**GIVEN** content `""` と headings `["スコープ外"]`  
**WHEN** `extractMarkdownSections(content, headings)` を呼び出す  
**THEN** 空の Map が返される (エラーにならない)

---

## Category: Unit-Builder (`buildRequestConstraintsBlock`)

### TC-09: 3 section 全て存在する場合のブロック生成

- **Priority**: must
- **Source**: T-02

**GIVEN** `## スコープ外`, `## 受け入れ基準`, `## architect 評価済みの設計判断` の 3 section を含む request.md テキスト  
**WHEN** `buildRequestConstraintsBlock(requestContent)` を呼び出す  
**THEN** 返された文字列が `## Request Constraints (CLI-injected)` ヘッダーを含み、3 つの `###` heading とそれぞれの本文が含まれる

---

### TC-10: 全 section が存在しない場合は undefined を返す

- **Priority**: must
- **Source**: T-02

**GIVEN** `## 背景\n\ncontent\n\n## 要件\n\ncontent` のみを含む request.md テキスト (補助 section なし)  
**WHEN** `buildRequestConstraintsBlock(requestContent)` を呼び出す  
**THEN** `undefined` が返される

---

### TC-11: 一部 section のみ存在する場合

- **Priority**: must
- **Source**: T-02

**GIVEN** `## スコープ外` のみ存在し `## 受け入れ基準` と `## architect 評価済みの設計判断` が存在しない request.md テキスト  
**WHEN** `buildRequestConstraintsBlock(requestContent)` を呼び出す  
**THEN** 返された文字列に `### スコープ外` と本文が含まれ、存在しない 2 section のヘッダーは含まれない (または空の場合は省略)

---

### TC-12: `REQUEST_CONSTRAINT_HEADINGS` 定数が正しい値を持つ

- **Priority**: must
- **Source**: T-02

**GIVEN** `src/parser/extract-section.ts` から `REQUEST_CONSTRAINT_HEADINGS` をインポート  
**WHEN** 値を確認する  
**THEN** `["スコープ外", "受け入れ基準", "architect 評価済みの設計判断"]` と等しい

---

### TC-13: ブロック内の説明文 (CLI-injected 注記) が含まれる

- **Priority**: should
- **Source**: T-02

**GIVEN** 補助 section を含む request.md テキスト  
**WHEN** `buildRequestConstraintsBlock(requestContent)` を呼び出す  
**THEN** 返された文字列に「request.md から CLI が抽出した制約情報」という趣旨の説明文が含まれる

---

## Category: Integration-Design (design step `buildInitialMessage`)

### TC-14: 補助 section を含む request.md で `Request Constraints` が initial message に注入される

- **Priority**: must
- **Source**: T-03, T-05, 受け入れ基準

**GIVEN** スコープ外 / 受け入れ基準 / architect 評価済みの設計判断 の 3 section を含む request.md  
**WHEN** `buildInitialMessage` を呼び出す  
**THEN** 生成された initial message に `## Request Constraints (CLI-injected)` セクションが含まれる

---

### TC-15: `Request Constraints` は `<user-request>` タグ外に存在する

- **Priority**: must
- **Source**: T-03, D2

**GIVEN** 補助 section を含む request.md  
**WHEN** `buildInitialMessage` を呼び出す  
**THEN** `## Request Constraints (CLI-injected)` ブロックが `</user-request>` タグの**後**に配置されており、`<user-request>` タグ内には存在しない

---

### TC-16: 配置順が `<user-request>` → `Request Constraints` → `Repository Context`

- **Priority**: must
- **Source**: T-03

**GIVEN** 補助 section を含む request.md と repository context  
**WHEN** `buildInitialMessage` を呼び出す  
**THEN** 生成メッセージ内の出現順序が `</user-request>` → `## Request Constraints (CLI-injected)` → Repository Context になっている

---

### TC-17: 補助 section が存在しない request.md では `Request Constraints` が含まれない

- **Priority**: must
- **Source**: T-05, 受け入れ基準

**GIVEN** 補助 section を持たない request.md (背景・要件のみ)  
**WHEN** `buildInitialMessage` を呼び出す  
**THEN** 生成された initial message に `Request Constraints` の文字列が含まれない

---

### TC-18: `Request Constraints` 内にスコープ外の本文が含まれる

- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** `## スコープ外\n\n- rules ファイルでの対応\n- spec-review step への適用` を含む request.md  
**WHEN** `buildInitialMessage` を呼び出す  
**THEN** 生成メッセージの `### スコープ外` section に `rules ファイルでの対応` が含まれる

---

### TC-19: 既存の design step テストが引き続き green

- **Priority**: must
- **Source**: T-05

**GIVEN** 変更前に存在していた `tests/unit/prompts/design-system.test.ts` の全テストケース  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する (regression なし)

---

## Category: Integration-CodeReview (code-review step `buildCodeReviewInitialMessage`)

### TC-20: 補助 section を含む request.md で `Request Constraints` が code-review initial message に注入される

- **Priority**: must
- **Source**: T-04, T-06, 受け入れ基準

**GIVEN** 補助 section を含む request.md  
**WHEN** `buildCodeReviewInitialMessage` を呼び出す  
**THEN** 生成された initial message に `## Request Constraints (CLI-injected)` セクションが含まれる

---

### TC-21: code-review の配置順が `<user-request>` → `Request Constraints` → `Branch Context`

- **Priority**: must
- **Source**: T-04

**GIVEN** 補助 section を含む request.md と branch context  
**WHEN** `buildCodeReviewInitialMessage` を呼び出す  
**THEN** 生成メッセージ内の出現順序が `</user-request>` → `## Request Constraints (CLI-injected)` → `Branch Context` になっている

---

### TC-22: 補助 section が存在しない request.md では code-review initial message に `Request Constraints` が含まれない

- **Priority**: must
- **Source**: T-06, 受け入れ基準

**GIVEN** 補助 section を持たない request.md  
**WHEN** `buildCodeReviewInitialMessage` を呼び出す  
**THEN** 生成された initial message に `Request Constraints` の文字列が含まれない

---

### TC-23: `Request Constraints` が `<user-request>` タグ外に存在する (code-review)

- **Priority**: must
- **Source**: T-04, D2

**GIVEN** 補助 section を含む request.md  
**WHEN** `buildCodeReviewInitialMessage` を呼び出す  
**THEN** `## Request Constraints (CLI-injected)` ブロックが `</user-request>` タグの後に配置されている

---

### TC-24: 既存の code-review テストが引き続き green

- **Priority**: must
- **Source**: T-06

**GIVEN** 変更前に存在していた `tests/unit/step/code-review.test.ts` の全テストケース  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する (regression なし)

---

## Category: Regression (design / code-review 以外の step)

### TC-25: spec-review step に変更なし

- **Priority**: must
- **Source**: 受け入れ基準 (既存 pipeline に regression なし), スコープ外

**GIVEN** spec-review step に関連する既存テスト  
**WHEN** `bun run test` を実行する  
**THEN** spec-review step のテストが全て pass する

---

### TC-26: fixer step の followUpPrompts 機構に変更なし

- **Priority**: must
- **Source**: 受け入れ基準 (既存 pipeline に regression なし)

**GIVEN** fixer step に関連する既存テスト  
**WHEN** `bun run test` を実行する  
**THEN** fixer step のテストが全て pass する

---

### TC-27: design / code-review 以外の全 step テストが green

- **Priority**: must
- **Source**: T-07, 受け入れ基準

**GIVEN** 変更対象外の全 step (spec-review / fixer / その他) の既存テスト  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する

---

## Category: CI (typecheck + test)

### TC-28: TypeScript typecheck が clean pass

- **Priority**: must
- **Source**: T-07, 受け入れ基準

**GIVEN** 新規追加した `src/parser/extract-section.ts` および修正した `design-system.ts`, `code-review.ts`  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-29: 全テストスイートが green

- **Priority**: must
- **Source**: T-07, 受け入れ基準

**GIVEN** リポジトリ全体の変更後コード  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、失敗・エラーが 0 件である

---

## Category: Edge Cases

### TC-30: request.md に同一 heading が複数存在する場合

- **Priority**: could
- **Source**: T-01 (robustness)

**GIVEN** `## スコープ外` が 2 回出現する markdown テキスト  
**WHEN** `extractMarkdownSections(content, ["スコープ外"])` を呼び出す  
**THEN** いずれか一方の内容が返され、エラーにならない (最初または最後の出現、どちらかを一貫して採用)

---

### TC-31: heading 名に前後スペースがある場合

- **Priority**: could
- **Source**: T-01 (robustness)

**GIVEN** `##  スコープ外 ` のように heading 名に前後スペースが入った markdown テキスト  
**WHEN** `extractMarkdownSections(content, ["スコープ外"])` を呼び出す  
**THEN** trim 後に一致するか、エントリなしで gracefully skip する (エラーにならない)

---

### TC-32: request.md が非常に長い場合のパフォーマンス

- **Priority**: could
- **Source**: T-01, Risks/Trade-offs (token 増)

**GIVEN** 1000 行以上の大きな request.md テキスト  
**WHEN** `buildRequestConstraintsBlock(requestContent)` を呼び出す  
**THEN** エラーなく完了し、結果が正しく返される
