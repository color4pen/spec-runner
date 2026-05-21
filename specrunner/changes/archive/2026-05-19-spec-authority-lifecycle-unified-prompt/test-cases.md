# Test Cases: spec authority lifecycle の統一規律を全 agent prompt に注入する

## Fragment Structure

### TC-01 AUTHORITY_SPEC_GUARD が 4 セクション構造を持つ
- **Category**: Fragment Structure
- **Priority**: must
- **Source**: Task 1 / 受け入れ基準

GIVEN `src/prompts/fragments.ts` を Read する  
WHEN `AUTHORITY_SPEC_GUARD` の定義内容を確認する  
THEN `### MUST NOT (全 agent 共通)` セクションが存在する  
AND `### 正規経路` セクションが存在する  
AND `### 書く側の規律` セクションが存在する  
AND `### 見る側の規律` セクションが存在する

---

### TC-02 MUST NOT セクションに 3 つの禁止規律が含まれる
- **Category**: Fragment Structure
- **Priority**: must
- **Source**: Task 1 / design.md §1

GIVEN `AUTHORITY_SPEC_GUARD` の `### MUST NOT (全 agent 共通)` セクションを参照する  
WHEN 規律の内容を確認する  
THEN `specrunner/specs/` 配下のファイルを直接編集してはならない（MUST NOT）が記述されている  
AND PR diff に authority spec（= baseline）の編集を含めてはならない（MUST NOT）が記述されている  
AND review-feedback / finding で authority spec の直接編集を要求してはならない（MUST NOT）が記述されている

---

### TC-03 正規経路セクションに mergeSpecsForChange と code-fixer 規律が含まれる
- **Category**: Fragment Structure
- **Priority**: must
- **Source**: Task 1 / request.md §設計判断

GIVEN `AUTHORITY_SPEC_GUARD` の `### 正規経路` セクションを参照する  
WHEN 内容を確認する  
THEN delta spec のパス形式 `specrunner/changes/<slug>/specs/<capability>/spec.md` が明示されている  
AND `mergeSpecsForChange` が finish 時に自動実行することが記述されている  
AND PR 内で baseline を更新する経路は存在しないことが記述されている  
AND code-fixer が review-feedback の baseline 編集要求に従わず report することが記述されている

---

### TC-04 書く側の規律セクションに ADDED/MODIFIED/REMOVED/RENAMED の判断基準が含まれる
- **Category**: Fragment Structure
- **Priority**: must
- **Source**: Task 1 / request.md §現状の不足

GIVEN `AUTHORITY_SPEC_GUARD` の `### 書く側の規律` セクションを参照する  
WHEN 内容を確認する  
THEN `ADDED` の定義（= baseline に存在しない新規 Requirement）が記述されている  
AND `MODIFIED` の定義（= baseline に存在する Requirement の変更、header は完全一致 MUST）が記述されている  
AND `REMOVED` の定義（= baseline に存在する Requirement の削除）が記述されている  
AND `RENAMED` の定義（= FROM / TO 明示、MODIFIED と併記必須）が記述されている  
AND delta spec を書く前に baseline を Read tool で確認する手順が記述されている

---

### TC-05 見る側の規律セクションに baseline identical 正常状態の記述が含まれる
- **Category**: Fragment Structure
- **Priority**: must
- **Source**: Task 1 / request.md §背景（PR #317 事故）

GIVEN `AUTHORITY_SPEC_GUARD` の `### 見る側の規律` セクションを参照する  
WHEN 内容を確認する  
THEN baseline が main branch と identical であることは正常状態であり defect ではないことが記述されている  
AND baseline の確認方法として Read tool で pull する手順が記述されている  
AND review-feedback / finding で authority spec の直接編集を要求してはならない（MUST NOT）が記述されている  
AND delta spec の修正のみを要求することが記述されている

---

### TC-06 AUTHORITY_SPEC_GUARD の JSDoc comment が更新されている
- **Category**: Fragment Structure
- **Priority**: should
- **Source**: Task 1

GIVEN `src/prompts/fragments.ts` を Read する  
WHEN `AUTHORITY_SPEC_GUARD` の直前の JSDoc comment を確認する  
THEN `Spec authority lifecycle — unified discipline for writers and reviewers.` またはそれに相当する内容が記述されている

---

## Inject Coverage

### TC-07 spec-review-system.ts が AUTHORITY_SPEC_GUARD を import している
- **Category**: Inject Coverage
- **Priority**: must
- **Source**: Task 2a / 受け入れ基準

GIVEN `src/prompts/spec-review-system.ts` を Read する  
WHEN import 文を確認する  
THEN `AUTHORITY_SPEC_GUARD` が `./fragments.js` または `./fragments` から import されている

---

### TC-08 spec-review-system.ts の buildSystemPrompt が AUTHORITY_SPEC_GUARD を含む
- **Category**: Inject Coverage
- **Priority**: must
- **Source**: Task 2a / 受け入れ基準

GIVEN `src/prompts/spec-review-system.ts` を Read する  
WHEN `buildSystemPrompt` 呼び出しの fragments array を確認する  
THEN `AUTHORITY_SPEC_GUARD` が fragments array に含まれている  
AND `PIPELINE_RULES` も引き続き含まれている

---

### TC-09 code-review-system.ts が AUTHORITY_SPEC_GUARD を import している
- **Category**: Inject Coverage
- **Priority**: must
- **Source**: Task 2b / 受け入れ基準

GIVEN `src/prompts/code-review-system.ts` を Read する  
WHEN import 文を確認する  
THEN `AUTHORITY_SPEC_GUARD` が `./fragments.js` または `./fragments` から import されている

---

### TC-10 code-review-system.ts の buildSystemPrompt が AUTHORITY_SPEC_GUARD を含む
- **Category**: Inject Coverage
- **Priority**: must
- **Source**: Task 2b / 受け入れ基準

GIVEN `src/prompts/code-review-system.ts` を Read する  
WHEN `buildSystemPrompt` 呼び出しの fragments array を確認する  
THEN `AUTHORITY_SPEC_GUARD` が fragments array に含まれている  
AND `PIPELINE_RULES` も引き続き含まれている

---

### TC-11 BUILD_FIXER / ADR_GEN には AUTHORITY_SPEC_GUARD が inject されていない
- **Category**: Inject Coverage
- **Priority**: should
- **Source**: design.md §2 / request.md §設計判断

GIVEN `tests/unit/prompts/fragment-coverage.test.ts` の EXPECTED 配列を Read する  
WHEN `BUILD_FIXER` と `ADR_GEN` の行を確認する  
THEN `AUTHORITY_SPEC_GUARD` が含まれていない（= spec を触らない role のため不要）

---

## Test Coverage

### TC-12 fragment-coverage test の SPEC_REVIEW 行に AUTHORITY_SPEC_GUARD が含まれる
- **Category**: Test Coverage
- **Priority**: must
- **Source**: Task 3 / 受け入れ基準

GIVEN `tests/unit/prompts/fragment-coverage.test.ts` を Read する  
WHEN `SPEC_REVIEW` の EXPECTED 行を確認する  
THEN fragments array に `AUTHORITY_SPEC_GUARD` が含まれている  
AND `PIPELINE_RULES` も含まれている

---

### TC-13 fragment-coverage test の CODE_REVIEW 行に AUTHORITY_SPEC_GUARD が含まれる
- **Category**: Test Coverage
- **Priority**: must
- **Source**: Task 3 / 受け入れ基準

GIVEN `tests/unit/prompts/fragment-coverage.test.ts` を Read する  
WHEN `CODE_REVIEW` の EXPECTED 行を確認する  
THEN fragments array に `AUTHORITY_SPEC_GUARD` が含まれている  
AND `PIPELINE_RULES` も含まれている

---

### TC-14 bun run test で fragment-coverage.test.ts が全 8 prompt で green になる
- **Category**: Test Coverage
- **Priority**: must
- **Source**: Task 3 / Task 5 / 受け入れ基準

GIVEN 全実装（Task 1〜3）が完了している  
WHEN `bun run test -- tests/unit/prompts/fragment-coverage.test.ts` を実行する  
THEN 8 prompt 全てのアサーションが pass する  
AND SPEC_REVIEW と CODE_REVIEW の AUTHORITY_SPEC_GUARD `toContain` assertion が green になる

---

### TC-15 bun run typecheck が pass する
- **Category**: Test Coverage
- **Priority**: must
- **Source**: Task 1〜3 / Task 5 / 受け入れ基準

GIVEN 全実装（Task 1〜3）が完了している  
WHEN `bun run typecheck` を実行する  
THEN TypeScript の型エラーが 0 件で pass する

---

### TC-16 bun run test が全 suite で green になる（regression なし）
- **Category**: Test Coverage
- **Priority**: must
- **Source**: Task 5 / 受け入れ基準

GIVEN 全実装（Task 1〜4）が完了している  
WHEN `bun run test` を実行する  
THEN 既存 prompt 関連 test を含む全 suite が pass する  
AND fragments.test.ts 等の既存 fragment export test に regression がない

---

## Duplicate Removal

### TC-17 base prompt 内の authority spec 直接編集禁止の重複規律記述が削除されている
- **Category**: Duplicate Removal
- **Priority**: should
- **Source**: Task 4 / request.md §要件4

GIVEN `src/prompts/` 配下の base prompt ファイルを grep する（パターン: `authority spec` / `baseline を直接編集` / `specrunner/specs/`）  
WHEN ヒットした箇所を fragment との重複判定基準（= MUST/MUST NOT の規律記述か否か）で分類する  
THEN fragment と重複する **規律記述** が削除されている  
AND `design-system.ts` の "Baseline Spec 参照" セクション（design step 固有の作業手順）は保全されている  
AND `design-system.ts` の Completion Checklist（self-check 手順）は保全されている  
AND `spec-review-system.ts` の "Baseline Spec Consistency Check" セクション（spec-review 固有の検証ロジック）は保全されている

---

## Delta Spec

### TC-18 delta spec が MODIFIED セクションで作成されている
- **Category**: Delta Spec
- **Priority**: must
- **Source**: request.md §要件6 / 受け入れ基準

GIVEN `specrunner/changes/spec-authority-lifecycle-unified-prompt/specs/prompt-fragment-registry/spec.md` を Read する  
WHEN delta spec の構造を確認する  
THEN `## MODIFIED` セクションが存在する  
AND 以下の 3 つの Requirement が MODIFIED 配下に含まれる:  
  - 「Fragment 集約 export」（header は baseline と完全一致）  
  - 「Inject 漏れの構造的検出」（header は baseline と完全一致）  
  - 「System prompt の builder 経由構成」（実装判断次第で含む）  
AND `## ADDED` または `## REMOVED` で baseline 確認なしに書かれた header が存在しない

---

### TC-19 delta spec の MODIFIED header が baseline の header と完全一致している
- **Category**: Delta Spec
- **Priority**: must
- **Source**: request.md §要件6 ⚠️規律 / request.md §背景（PR #306/#308 事故）

GIVEN `specrunner/specs/prompt-fragment-registry/spec.md`（baseline）を Read する  
AND `specrunner/changes/spec-authority-lifecycle-unified-prompt/specs/prompt-fragment-registry/spec.md`（delta spec）を Read する  
WHEN delta spec の MODIFIED 配下の各 Requirement header を baseline の header と照合する  
THEN 全ての MODIFIED header が baseline の対応する Requirement header と文字列レベルで完全一致している

---

## Behavioral（動作規律の文言確認）

### TC-20 SPEC_REVIEW_SYSTEM_PROMPT に見る側の規律文言が含まれる
- **Category**: Behavioral
- **Priority**: must
- **Source**: request.md §背景（PR #317 事故）

GIVEN `SPEC_REVIEW_SYSTEM_PROMPT` の内容を確認する（= `buildSystemPrompt` の出力）  
WHEN `### 見る側の規律` セクションの文字列が含まれるか確認する  
THEN `### 見る側の規律` または同等の見出し文字列が含まれている  
AND `defect ではない` の記述が含まれている

---

### TC-21 CODE_REVIEW_SYSTEM_PROMPT に見る側の規律文言が含まれる
- **Category**: Behavioral
- **Priority**: must
- **Source**: request.md §背景（PR #317 事故）

GIVEN `CODE_REVIEW_SYSTEM_PROMPT` の内容を確認する（= `buildSystemPrompt` の出力）  
WHEN `### 見る側の規律` セクションの文字列が含まれるか確認する  
THEN `### 見る側の規律` または同等の見出し文字列が含まれている  
AND `defect ではない` の記述が含まれている

---

### TC-22 IMPLEMENTER / DESIGN / SPEC_FIXER / CODE_FIXER のプロンプトに書く側の規律文言が含まれる
- **Category**: Behavioral
- **Priority**: should
- **Source**: design.md §1 / request.md §設計判断

GIVEN `fragment-coverage.test.ts` の IMPLEMENTER / DESIGN / SPEC_FIXER / CODE_FIXER の各行を確認する  
WHEN 各 system prompt の内容に `### 書く側の規律` または ADDED/MODIFIED/REMOVED/RENAMED の判断基準文字列が含まれるか確認する  
THEN 各 prompt に書く側の規律セクションの文言が含まれている（= AUTHORITY_SPEC_GUARD が inject 済みのため）
