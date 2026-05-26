# Test Cases: request-review-complexity-eval

## TC-RR-015: prompt に複雑化リスク評価観点が含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準 1

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された  
**WHEN** prompt テキストを参照する  
**THEN** "Complexity risk" という文字列が含まれている  
**AND** "DRY violation" という文字列が含まれている  
**AND** "Existing asset reuse" という文字列が含まれている  

---

## TC-RR-016: 複数アプローチ検出時の推奨提示指示が含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準 2

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された  
**WHEN** prompt テキストを参照する  
**THEN** "recommend ONE approach" という文字列が含まれている  
**AND** "Do NOT list them in parallel" という文字列が含まれている  

---

## TC-RR-017: Step 5 の findings severity 上限が MEDIUM である

- **Category**: Prompt Content
- **Priority**: must
- **Source**: Task 2 / design.md D2

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された  
**WHEN** prompt テキストを参照する  
**THEN** "capped at MEDIUM severity" という文字列が含まれている  

---

## TC-RR-018: 最終判断が request 作成者に委ねられる旨が含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: design.md D3 / 要件 2

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された  
**WHEN** prompt テキストを参照する  
**THEN** 最終判断を request 作成者に委ねる旨の記述が含まれている  
（例: "The final decision remains with the request author"）

---

## TC-RR-019: Step 5 が Step 4 と Severity Scope Constraint の間に配置される

- **Category**: Prompt Structure
- **Priority**: should
- **Source**: design.md D1 / tasks.md Task 1 配置位置

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された  
**WHEN** prompt テキスト内の Step 順序を確認する  
**THEN** "Step 4" より後に "Step 5" が出現する  
**AND** "Step 5" より後に "Severity Scope Constraint" が出現する  

---

## TC-RR-020: 既存ユニットテスト (TC-RR-001〜014) が引き続き green

- **Category**: Regression
- **Priority**: must
- **Source**: 受け入れ基準「bun run test が green」

**GIVEN** Task 1 の prompt 変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** TC-RR-001 から TC-RR-014 のすべてのテストが pass する  

---

## TC-RR-021: verdict 体系が変更されていない

- **Category**: Regression / Non-Regression
- **Priority**: must
- **Source**: スコープ外定義「verdict 体系変更なし」/ design.md D4

**GIVEN** Task 1 の prompt 変更が適用されている  
**WHEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の verdict derivation rules を参照する  
**THEN** verdict 値（`approved` / `needs-discussion` / `needs-fix` 等）が変更前と同一である  
**AND** Verdict Derivation Rules セクションが削除・変更されていない  

---

## TC-RR-022: 他の agent prompt が変更されていない

- **Category**: Regression / Non-Regression
- **Priority**: must
- **Source**: スコープ外定義「他の agent への観点追加なし」

**GIVEN** 本 change の実装が完了している  
**WHEN** design / code-review / spec-review の各 agent prompt ファイルを参照する  
**THEN** それらのファイルに変更が加えられていない  

---

## TC-RR-023: typecheck が green

- **Category**: Build
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck が green」

**GIVEN** Task 1 および Task 2 の変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** TypeScript 型エラーが 0 件で完了する  

---

## TC-RR-024: delta spec ファイルが正規 path に存在する

- **Category**: Delta Spec
- **Priority**: must
- **Source**: tasks.md Task 3 / rules.md ファイル配置規則

**GIVEN** Task 3 が完了している  
**WHEN** `specrunner/changes/request-review-complexity-eval/specs/request-authoring-guard/spec.md` を参照する  
**THEN** ファイルが存在する  
**AND** `## Requirements` セクションが含まれている  

---

## TC-RR-025: delta spec に複雑化リスク評価の Requirement が含まれる

- **Category**: Delta Spec
- **Priority**: must
- **Source**: tasks.md Task 3 / 受け入れ基準 1

**GIVEN** delta spec ファイルが存在する  
**WHEN** `specrunner/changes/request-review-complexity-eval/specs/request-authoring-guard/spec.md` を参照する  
**THEN** "Request Review Prompt Complexity Evaluation Perspectives" という Requirement ヘッダが含まれている  
**AND** 3 観点（Complexity risk / DRY violation / Existing asset reuse）が Scenario として記述されている  

---

## TC-RR-026: delta spec に複数アプローチ推奨提示ルールの Requirement が含まれる

- **Category**: Delta Spec
- **Priority**: must
- **Source**: tasks.md Task 3 / 受け入れ基準 2

**GIVEN** delta spec ファイルが存在する  
**WHEN** `specrunner/changes/request-review-complexity-eval/specs/request-authoring-guard/spec.md` を参照する  
**THEN** "Request Review Prompt Multi-Approach Recommendation Rule" という Requirement ヘッダが含まれている  
**AND** 推奨案 1 案提示・並列列挙禁止・最終判断委譲の 3 点が Scenario として記述されている  

---

## TC-RR-027: 重複機構を持つ request に対して推奨案が 1 案 + 根拠付きで出力される (E2E)

- **Category**: Behavioral / E2E
- **Priority**: could
- **Source**: 受け入れ基準「動作確認可能なシナリオ」

**GIVEN** 既存アーキテクチャと重複する機構を持つ request.md がある  
**AND** その request が 2 つの設計アプローチ（明示または暗示）を含む  
**WHEN** `specrunner request review` を実行する  
**THEN** review output に推奨案が 1 案だけ提示されている  
**AND** 推奨根拠として複雑化リスク / DRY / 既存資産再利用のいずれかの観点が含まれている  
**AND** 並列列挙形式（"Approach A: ... Approach B: ..."）が出力されない  
**AND** findings の severity が MEDIUM を超えない  
