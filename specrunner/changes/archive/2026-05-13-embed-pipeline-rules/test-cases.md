# Test Cases: embed-pipeline-rules

## Legend

- **Priority**: must / should / could
- **Category**: correctness / architecture / maintainability / completeness
- **Source**: Task ID from tasks.md

---

## TC-01: pipeline-rules.ts が存在し PIPELINE_RULES を export する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** 実装が完了した状態  
**WHEN** `src/prompts/pipeline-rules.ts` を確認する  
**THEN** ファイルが存在し、`export const PIPELINE_RULES` が定義されている

---

## TC-02: PIPELINE_RULES に Severity セクションが含まれる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** CRITICAL / HIGH / MEDIUM / LOW の 4 段階定義と承認阻止条件（CRITICAL ≥ 1 または HIGH ≥ 1）が含まれている

---

## TC-03: PIPELINE_RULES に Categories セクションが含まれる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** correctness / security / architecture / performance / maintainability / testing / completeness / consistency / feasibility の 9 カテゴリが含まれている

---

## TC-04: PIPELINE_RULES に Findings Format セクションが含まれる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** `#`, `Severity`, `Category`, `File`, `Description`, `How to Fix` の必須カラムを持つテーブル仕様が含まれている

---

## TC-05: PIPELINE_RULES に Scoring セクションが含まれる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** Score 基準テーブル（1-10）と Weight テーブル（6 カテゴリ）と pass threshold 7.0 が含まれている

---

## TC-06: PIPELINE_RULES に Verdict セクションが含まれる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** approved / needs-fix / escalation の 3 値と各条件が含まれている

---

## TC-07: PIPELINE_RULES に Iteration Comparison セクションが含まれる

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** Improvements / Regressions / Unchanged と Convergence Trend テーブル（improving / plateaued / regressing）と停滞検出ルールが含まれている

---

## TC-08: PIPELINE_RULES に Authority matrix が含まれない

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1 (除外セクション)

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `PIPELINE_RULES` 文字列の内容を確認する  
**THEN** 「責務の競合ルール」「Authority matrix」「testing カテゴリの責務境界」「Output Contract」「Skip/Status 報告」「参照リンク」が含まれていない

---

## TC-09: pipeline-rules.ts で typecheck が通る

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1 (Verification)

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-10: code-review-system.ts が PIPELINE_RULES を import する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 2

**GIVEN** `src/prompts/code-review-system.ts` が更新された状態  
**WHEN** ファイルの import 文を確認する  
**THEN** `import { PIPELINE_RULES } from "./pipeline-rules.js"` が存在する

---

## TC-11: code-review の system prompt に PIPELINE_RULES が展開されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 2

**GIVEN** `src/prompts/code-review-system.ts` が更新された状態  
**WHEN** `CODE_REVIEW_SYSTEM_PROMPT` の文字列を確認する  
**THEN** `${PIPELINE_RULES}` のテンプレートリテラル展開が含まれており、実行時に PIPELINE_RULES の内容が system prompt に含まれる

---

## TC-12: code-review-system.ts の .claude/rules 参照が削除されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 2

**GIVEN** `src/prompts/code-review-system.ts` が更新された状態  
**WHEN** ファイル内容を確認する  
**THEN** `.claude/rules/review-standards.md` への参照文字列が存在しない

---

## TC-13: code-review-system.ts の inline severity/verdict/categories 定義が削除されている

- **Priority**: should
- **Category**: maintainability
- **Source**: Task 2

**GIVEN** `src/prompts/code-review-system.ts` が更新された状態  
**WHEN** ファイル内容を確認する  
**THEN** `## Review Standards` セクション配下にあった inline の Severity Levels / Verdict Rules / Categories の列挙が重複して存在しない（PIPELINE_RULES が代替する）

---

## TC-14: code-review-system.ts の JSDoc が pipeline-rules を参照している

- **Priority**: should
- **Category**: maintainability
- **Source**: Task 2

**GIVEN** `src/prompts/code-review-system.ts` が更新された状態  
**WHEN** JSDoc コメントを確認する  
**THEN** `review-standards.md` の言及が `pipeline-rules` に更新されている

---

## TC-15: spec-review-system.ts が PIPELINE_RULES を import する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3

**GIVEN** `src/prompts/spec-review-system.ts` が更新された状態  
**WHEN** ファイルの import 文を確認する  
**THEN** `import { PIPELINE_RULES } from "./pipeline-rules.js"` が存在する

---

## TC-16: spec-review の system prompt に PIPELINE_RULES が展開されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3

**GIVEN** `src/prompts/spec-review-system.ts` が更新された状態  
**WHEN** `SPEC_REVIEW_SYSTEM_PROMPT` の文字列を確認する  
**THEN** `${PIPELINE_RULES}` のテンプレートリテラル展開が `## Your Output` の前に含まれており、実行時に PIPELINE_RULES の内容が system prompt に含まれる

---

## TC-17: spec-review-system.ts の `review-standards.md severity definitions` 参照が削除されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3

**GIVEN** `src/prompts/spec-review-system.ts` が更新された状態  
**WHEN** ファイル内容を確認する  
**THEN** `review-standards.md severity definitions` の文字列が存在せず、`Pipeline Rules above` に置き換わっている

---

## TC-18: spec-review-system.ts の inline Severity levels 定義が削除されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 3

**GIVEN** `src/prompts/spec-review-system.ts` が更新された状態  
**WHEN** ファイル内容を確認する  
**THEN** `Severity levels: CRITICAL, HIGH, MEDIUM, LOW` の inline 定義が存在しない（PIPELINE_RULES が代替する）

---

## TC-19: code-review.ts の initial message から .claude/rules 参照が削除されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 4

**GIVEN** `src/core/step/code-review.ts` が更新された状態  
**WHEN** `buildCodeReviewInitialMessage` 関数内の initial message テキストを確認する  
**THEN** `Read .claude/rules/review-standards.md for the findings format` の文字列が存在せず、`Refer to the Pipeline Rules in your system prompt` に置き換わっている

---

## TC-20: .claude/rules/review-standards.md が git から削除されている

- **Priority**: must
- **Category**: completeness
- **Source**: Task 5

**GIVEN** 実装が完了した状態  
**WHEN** `git ls-files .claude/rules/review-standards.md` を実行する  
**THEN** 出力が空（ファイルが git に追跡されていない）

---

## TC-21: src/ 内に review-standards.md への参照が存在しない

- **Priority**: must
- **Category**: completeness
- **Source**: Task 5 (Verification)

**GIVEN** 実装が完了した状態  
**WHEN** `grep -r "review-standards" src/` を実行する  
**THEN** ヒット 0 件

---

## TC-22: src/ 内に .claude/rules への参照が存在しない

- **Priority**: must
- **Category**: completeness
- **Source**: Task 6

**GIVEN** 実装が完了した状態  
**WHEN** `grep -r "\.claude/rules" src/` を実行する  
**THEN** ヒット 0 件

---

## TC-23: bun run typecheck が全 pass する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 6

**GIVEN** 実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-24: bun run test が全 pass する

- **Priority**: must
- **Category**: correctness
- **Source**: Task 6

**GIVEN** 実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、失敗が 0 件

---

## TC-25: spec-fixer-system.ts に .claude/rules 参照が存在しない

- **Priority**: should
- **Category**: completeness
- **Source**: Task 5 (spec-fixer 確認)

**GIVEN** 実装が完了した状態  
**WHEN** `src/prompts/spec-fixer-system.ts` を確認する  
**THEN** `.claude/rules` および `review-standards` への参照が存在しない

---

## TC-26: code-fixer-system.ts に .claude/rules 参照が存在しない

- **Priority**: should
- **Category**: completeness
- **Source**: Task 5 (code-fixer 確認)

**GIVEN** 実装が完了した状態  
**WHEN** `src/prompts/code-fixer-system.ts` を確認する  
**THEN** `.claude/rules` および `review-standards` への参照が存在しない

---

## TC-27: PIPELINE_RULES が TypeScript string 型として export されている

- **Priority**: must
- **Category**: correctness
- **Source**: Task 1

**GIVEN** `src/prompts/pipeline-rules.ts` が作成された状態  
**WHEN** TypeScript の型定義を確認する  
**THEN** `PIPELINE_RULES` が `string` 型（または型推論による string リテラル型）として export されており、他ファイルから import できる

---

## TC-28: fixer 系 system prompt に PIPELINE_RULES が注入されない

- **Priority**: should
- **Category**: architecture
- **Source**: design.md (注入しないファイル)

**GIVEN** 実装が完了した状態  
**WHEN** `src/prompts/spec-fixer-system.ts`, `src/prompts/code-fixer-system.ts`, `src/prompts/build-fixer-system.ts` を確認する  
**THEN** いずれも `PIPELINE_RULES` の import や展開を含まない

---

## TC-29: code-review system prompt の Review Standards セクションが Pipeline Rules セクションに置き換わっている

- **Priority**: should
- **Category**: correctness
- **Source**: Task 2

**GIVEN** `src/prompts/code-review-system.ts` が更新された状態  
**WHEN** `CODE_REVIEW_SYSTEM_PROMPT` の文字列を確認する  
**THEN** `## Review Standards` の下に `Follow .claude/rules/review-standards.md strictly` のテキストが存在せず、代わりに `## Pipeline Rules` セクションと PIPELINE_RULES の展開が存在する
