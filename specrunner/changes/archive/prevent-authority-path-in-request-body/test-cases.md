# Test Cases: prevent-authority-path-in-request-body

## 凡例

- **Priority**: must / should / could
- **Source**: T1=Task1 / T2=Task2 / T3=Task3 / T4=Task4 / T5=Task5 / AC=acceptance-criteria
- **Category**: prompt-content / scaffold-template / review-rule / test-coverage / build

---

## TC-001: request-generate-system.ts — MUST NOT ルールの存在確認

- **Category**: prompt-content
- **Priority**: must
- **Source**: T1, AC

**GIVEN** `src/prompts/request-generate-system.ts` が存在し、`## Output Rules` セクションを持つ  
**WHEN** ファイルの内容を確認する  
**THEN** authority path（`specrunner/specs/` 配下のパス）を MODIFIED / ADDED の対象として直接記述することを `MUST NOT` として禁止するテキストが含まれている

---

## TC-002: request-generate-system.ts — delta spec path が代替として明示されている

- **Category**: prompt-content
- **Priority**: must
- **Source**: T1, AC

**GIVEN** `src/prompts/request-generate-system.ts` の MUST NOT ルールが追加されている  
**WHEN** ルールのテキストを確認する  
**THEN** delta spec path（`specrunner/changes/<slug>/specs/<capability>/spec.md` 形式）が正しい代替として示されている

---

## TC-003: request-generate-system.ts — Output Rules セクションの構造が壊れていない

- **Category**: prompt-content
- **Priority**: should
- **Source**: T1

**GIVEN** `src/prompts/request-generate-system.ts` が変更されている  
**WHEN** `## Output Rules` セクションの構造を確認する  
**THEN** 既存の bullet リストに追加されており、セクション見出し・箇条書き形式が維持されている

---

## TC-004: buildScaffoldTemplate — delta spec path guidance コメントの存在確認

- **Category**: scaffold-template
- **Priority**: must
- **Source**: T2, AC

**GIVEN** `src/core/command/request.ts` の `buildScaffoldTemplate` 関数が呼ばれる  
**WHEN** 返されたテンプレート文字列を確認する  
**THEN** delta spec path 規約を示す HTML コメント（`<!-- ... -->`形式）が含まれており、authority path ではなく delta spec path で表現することを guidance として伝えている

---

## TC-005: buildScaffoldTemplate — authority path を編集対象の例文として含まない

- **Category**: scaffold-template
- **Priority**: must
- **Source**: T2, AC

**GIVEN** `src/core/command/request.ts` の `buildScaffoldTemplate` 関数が呼ばれる  
**WHEN** 返されたテンプレート文字列を確認する  
**THEN** `specrunner/specs/` パターンが MODIFIED / ADDED 等の編集対象の例文として記述されていない

---

## TC-006: buildScaffoldTemplate — 既存コメントパターンと整合している

- **Category**: scaffold-template
- **Priority**: should
- **Source**: T2

**GIVEN** `src/core/command/request.ts` に `<!-- adr 判断基準: ... -->` などの既存 HTML コメントが存在する  
**WHEN** 追加された guidance コメントの形式を確認する  
**THEN** 既存コメントと同じ `<!-- ... -->` パターンを使用しており、テンプレートのセクション順序が変わっていない

---

## TC-007: request-review-system.ts — authority path + 編集動詞共起の HIGH finding ルール存在確認

- **Category**: review-rule
- **Priority**: must
- **Source**: T3, AC

**GIVEN** `src/prompts/request-review-system.ts` が存在する  
**WHEN** `### Step 2: Request Validation` セクション（または同等のバリデーションセクション）を確認する  
**THEN** authority path（`specrunner/specs/` 配下）と編集動詞（MODIFIED / ADDED / を更新 / を作成 等）の共起を HIGH severity finding として検出する旨のルールが含まれている

---

## TC-008: request-review-system.ts — referential 除外節の存在確認

- **Category**: review-rule
- **Priority**: must
- **Source**: T3, AC

**GIVEN** `src/prompts/request-review-system.ts` の authority path 共起検出ルールが追加されている  
**WHEN** 検出ルールのテキストを確認する  
**THEN** policy 言及・過去事例言及・「authority path であり編集禁止」のような説明文脈での参照は HIGH finding にしないという除外節が含まれている

---

## TC-009: request-review-system.ts — Severity Scope Constraint への反映

- **Category**: review-rule
- **Priority**: should
- **Source**: T3

**GIVEN** `src/prompts/request-review-system.ts` に `## Severity Scope Constraint` セクションが存在する  
**WHEN** HIGH severity の定義を確認する  
**THEN** authority path の直接指定（編集対象としての記述）が HIGH finding の該当ケースとして明示されている

---

## TC-010: TC-RR-011 テスト — 検出ルール本体の string assertion が追加されている

- **Category**: test-coverage
- **Priority**: must
- **Source**: T4, AC

**GIVEN** `tests/unit/command/request-review.test.ts` が変更されている  
**WHEN** TC-RR-011 として定義されたテストを確認する  
**THEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が authority path + 編集動詞共起を HIGH finding として検出する旨のキーフレーズを `toContain` で assert するテストが存在する

---

## TC-011: TC-RR-012 テスト — referential 除外節の string assertion が追加されている

- **Category**: test-coverage
- **Priority**: must
- **Source**: T4, AC

**GIVEN** `tests/unit/command/request-review.test.ts` が変更されている  
**WHEN** TC-RR-012 として定義されたテストを確認する  
**THEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が policy 言及・過去事例言及を HIGH finding から除外する旨のキーフレーズを `toContain` で assert するテストが存在する

---

## TC-012: TC-RR-011/012 テスト — REQUEST_REVIEW_SYSTEM_PROMPT が正しく import されている

- **Category**: test-coverage
- **Priority**: must
- **Source**: T4

**GIVEN** `tests/unit/command/request-review.test.ts` を確認する  
**WHEN** import 文を確認する  
**THEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が `src/prompts/request-review-system.ts` から named import されている

---

## TC-013: TC-RR-011/012 テスト — 既存テスト命名規約に従っている

- **Category**: test-coverage
- **Priority**: should
- **Source**: T4

**GIVEN** 既存テストが TC-RR-001〜010 の命名を持つ  
**WHEN** 追加テストのコメント・describe 文を確認する  
**THEN** TC-RR-011 / TC-RR-012 という識別子が使われており、ファイル先頭のテスト一覧コメントにも追記されている

---

## TC-014: TC-RR-011 実行 — テストが pass する

- **Category**: test-coverage
- **Priority**: must
- **Source**: T4, T5

**GIVEN** T3（request-review-system.ts 変更）と T4（テスト追加）が両方完了している  
**WHEN** `bun run test` で TC-RR-011 を実行する  
**THEN** `toContain` assertion が成功し、テストが green になる

---

## TC-015: TC-RR-012 実行 — テストが pass する

- **Category**: test-coverage
- **Priority**: must
- **Source**: T4, T5

**GIVEN** T3（request-review-system.ts 変更）と T4（テスト追加）が両方完了している  
**WHEN** `bun run test` で TC-RR-012 を実行する  
**THEN** `toContain` assertion が成功し、テストが green になる

---

## TC-016: 既存テスト非破壊 — TC-RR-001〜010 が引き続き pass する

- **Category**: test-coverage
- **Priority**: must
- **Source**: T5

**GIVEN** 変更前から存在する TC-RR-001〜010 テストがある  
**WHEN** `bun run test` を実行する  
**THEN** TC-RR-001〜010 が全て pass し、regression が発生していない

---

## TC-017: typecheck — 型エラーなしで完了する

- **Category**: build
- **Priority**: must
- **Source**: T5, AC

**GIVEN** 全変更（T1〜T4）が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラー 0 件で終了する

---

## TC-018: test suite — 全テストが green で完了する

- **Category**: build
- **Priority**: must
- **Source**: T5, AC

**GIVEN** 全変更（T1〜T4）が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、新規追加の TC-RR-011 / TC-RR-012 を含めて green になる

---

## TC-019: assertion 文字列 — 全文一致ではなくキーフレーズ contains である

- **Category**: test-coverage
- **Priority**: should
- **Source**: T4

**GIVEN** TC-RR-011 / TC-RR-012 の `toContain` で使用する文字列を確認する  
**WHEN** assert 対象のフレーズを確認する  
**THEN** prompt の全文ではなく、ルールの本質を示す短いキーフレーズ（例: 「HIGH」「authority path」「編集動詞」「除外」等のコアワード周辺）を contains している（prompt の細かいリファクタリングで壊れない粒度）

---

## TC-020: request-generate prompt — authority path 自体の言及が適切に扱われている

- **Category**: prompt-content
- **Priority**: could
- **Source**: T1

**GIVEN** `src/prompts/request-generate-system.ts` の MUST NOT ルールが追加されている  
**WHEN** ルールのテキストで authority path を定義・言及している箇所を確認する  
**THEN** authority path パターンの定義（`specrunner/specs/<capability>/spec.md`）はルール説明の文脈（禁止対象の明示）として記述されており、編集対象の例文として扱われていない
