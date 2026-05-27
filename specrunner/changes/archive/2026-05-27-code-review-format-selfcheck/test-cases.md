# Test Cases: code-review-format-selfcheck

## TC-001: followUpPrompt プロパティが CodeReviewStep に存在する

- **Category**: Structure
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 受け入れ基準

GIVEN `src/core/step/code-review.ts` の `CodeReviewStep` オブジェクトを参照したとき  
WHEN `followUpPrompt` プロパティを確認する  
THEN `string` 型の `followUpPrompt` が定義されていること

---

## TC-002: followUpPrompt がテーブル形式の確認指示を含む

- **Category**: TableFormat
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN テーブル形式チェックの指示を探す  
THEN `| # | Severity | Category | File | Description | How to Fix | Fix |` 形式への言及があること  
AND 散文形式・リスト形式が不可であることが明示されていること

---

## TC-003: followUpPrompt が必須カラム確認指示を含む

- **Category**: RequiredColumns
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN 必須カラムのチェック指示を探す  
THEN `#`, `Severity`, `Category`, `File`, `Description`, `How to Fix`, `Fix` の 7 カラムが列挙されていること

---

## TC-004: followUpPrompt が Fix カラム値の確認指示を含む

- **Category**: FixColumn
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN Fix カラム値のチェック指示を探す  
THEN 全 finding の Fix カラムが `yes` または `no` のいずれかであることを要求する指示があること  
AND 空欄や他の値が不可であることが明示されていること

---

## TC-005: followUpPrompt が verdict 整合性チェック指示を含む

- **Category**: Verdict
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN verdict チェックの指示を探す  
THEN `CRITICAL >= 1 または HIGH >= 1 → needs-fix` のルールが記述されていること  
AND `CRITICAL = 0 かつ HIGH = 0 → approved` のルールが記述されていること

---

## TC-006: followUpPrompt が severity 定義準拠チェック指示を含む

- **Category**: Severity
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN severity 定義チェックの指示を探す  
THEN CRITICAL / HIGH / MEDIUM / LOW それぞれの定義が記述されていること

---

## TC-007: followUpPrompt が違反時の修正指示を含む

- **Category**: ViolationHandling
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1, design.md D1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN 違反時の動作指示を探す  
THEN review-feedback ファイルを修正するよう指示があること

---

## TC-008: followUpPrompt が違反なし時の end_turn 指示を含む

- **Category**: ViolationHandling
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1, design.md D1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN 違反なし時の動作指示を探す  
THEN 変更せず `end_turn` するよう指示があること

---

## TC-009: followUpPrompt が出力ファイルを Read tool で読む指示を含む

- **Category**: Structure
- **Priority**: should
- **Source**: tasks.md Task 1

GIVEN `CodeReviewStep.followUpPrompt` を読んだとき  
WHEN review-feedback ファイルの読み取り指示を探す  
THEN Read tool で出力した review-feedback ファイルを読むよう指示があること

---

## TC-010: followUpPrompt が `[...].join("\n")` 形式で記述されている

- **Category**: Structure
- **Priority**: should
- **Source**: tasks.md Task 1 — "design.ts の followUpPrompt と同じく `[...].join(\"\\n\")` で記述する"

GIVEN `src/core/step/code-review.ts` のソースを確認するとき  
WHEN `followUpPrompt` の記述形式を確認する  
THEN 文字列配列に `.join("\n")` を適用した形式で記述されていること

---

## TC-011: `bun run typecheck` が green

- **Category**: Regression
- **Priority**: must
- **Source**: tasks.md Task 2, request.md 受け入れ基準

GIVEN `src/core/step/code-review.ts` に `followUpPrompt` を追加した状態で  
WHEN `bun run typecheck` を実行する  
THEN 型エラーなしで終了すること

---

## TC-012: `bun run test` が green

- **Category**: Regression
- **Priority**: must
- **Source**: tasks.md Task 2, request.md 受け入れ基準

GIVEN `src/core/step/code-review.ts` に `followUpPrompt` を追加した状態で  
WHEN `bun run test` を実行する  
THEN 既存テストが全て pass すること

---

## TC-013: executor が followUpPrompt を自動的にピックアップする

- **Category**: Integration
- **Priority**: should
- **Source**: design.md D2 — "executor.ts は既存の followUpPrompt 解決チェーン（L138）で自動的にピックアップ"

GIVEN `executor.ts` の `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt` 解決ロジックを確認するとき  
WHEN `CodeReviewStep` に `followUpPrompt` が追加されている  
THEN executor 側の変更なしに follow-up turn が実行される構成になっていること

---

## TC-014: PIPELINE_RULES fragment が変更されていない

- **Category**: ScopeLimit
- **Priority**: should
- **Source**: request.md スコープ外, design.md D3

GIVEN `src/prompts/fragments.ts` を確認するとき  
WHEN このブランチの差分を確認する  
THEN `src/prompts/fragments.ts` が変更されていないこと

---

## TC-015: code-review system prompt が変更されていない

- **Category**: ScopeLimit
- **Priority**: should
- **Source**: design.md D3

GIVEN `src/prompts/code-review-system.ts` を確認するとき  
WHEN このブランチの差分を確認する  
THEN `src/prompts/code-review-system.ts` が変更されていないこと

---

## TC-016: parseFixableFindings のロジックが変更されていない

- **Category**: ScopeLimit
- **Priority**: should
- **Source**: request.md スコープ外

GIVEN `parseFixableFindings` の実装を確認するとき  
WHEN このブランチの差分を確認する  
THEN `parseFixableFindings` の parse ロジックが変更されていないこと
