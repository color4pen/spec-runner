# Test Cases: postwork-no-tool-fix

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 12
- **Manual**: 3
- **Priority**: must: 10, should: 5, could: 0

---

### TC-001: post-work self-check の文面が report_result 修正を指示しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: code-review post-work self-check は Markdown result file のみを検査・修正する > Scenario: post-work self-check の文面が report_result 修正を指示しない

---

### TC-002: Markdown 形式違反が post-work で修正される

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: code-review post-work self-check は Markdown result file のみを検査・修正する > Scenario: Markdown 形式違反が post-work で修正される

---

### TC-003: Markdown 形式違反がない場合は変更せず終了する

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: code-review post-work self-check は Markdown result file のみを検査・修正する > Scenario: Markdown 形式違反がない場合は変更せず終了する

---

### TC-004: 完了契約が findings 配列の必須性と空配列規約を明示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: typed findings の正当性は main work turn の完了契約が担保する > Scenario: 完了契約が findings 配列の必須性と空配列規約を明示する

---

### TC-005: 指摘なしの完了で空の findings が受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: typed findings の正当性は main work turn の完了契約が担保する > Scenario: 指摘なしの完了で空の findings が受理される

---

### TC-006: 全 agent step の post-work prompt が禁止マーカーを含まない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: post-work / follow-up prompt は captured tool の呼び出し・修正を指示しない（越境不変）> Scenario: 全 agent step の post-work prompt が禁止マーカーを含まない

---

### TC-007: post-work prompt に report_result 指示を追加すると歯が fail する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: post-work / follow-up prompt は captured tool の呼び出し・修正を指示しない（越境不変）> Scenario: post-work prompt に report_result 指示を追加すると歯が fail する

---

### TC-008: followUpPrompt が typed findings 提出語を含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `CodeReviewStep.followUpPrompt` の文字列  
**WHEN** 「findings 配列」「[] を渡し」等の typed-result 提出語をパターンマッチする  
**THEN** いずれのパターンにも一致しない

---

### TC-009: followUpPrompt が Markdown 検査 action 指示を保持している

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `CodeReviewStep.followUpPrompt` の文字列  
**WHEN** review-feedback ファイルの Read / Edit（Markdown 修正）に言及する語をパターンマッチする  
**THEN** Markdown 検査の action 指示（review-feedback への言及）が含まれる

---

### TC-010: followUpPrompt の Markdown 検査項目が連番保持されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** 変更後の `CodeReviewStep.followUpPrompt` の箇条書き連番  
**WHEN** 連番の欠番・重複を検査する  
**THEN** テーブル形式・必須カラム・Fix カラム値・Severity 定義準拠の各項目が欠番なく連番で保持されている

---

### TC-011: CODE_REVIEW_REPORT_TOOL.description が findings を REQUIRED と明記する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `CODE_REVIEW_REPORT_TOOL.description`（`src/core/step/report-tool.ts`）の文字列  
**WHEN** findings 配列を REQUIRED と指示する語をパターンマッチする  
**THEN** 「REQUIRED」かつ「findings」の言及が含まれる

---

### TC-012: rules follow-up wrapper が report_result を含まない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `buildRulesFollowUpPrompts` が生成する定型枠文字列  
**WHEN** `report_result`（大文字小文字無視）をパターンマッチする  
**THEN** マーカーが含まれない

---

### TC-013: 越境不変テストが registry 由来の動的 step 列挙を使う

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` の `steps` から `kind === "agent"` を動的に抽出するテスト実装  
**WHEN** テスト内で agent step を列挙する  
**THEN** step 名をハードコードせず registry から取得しており、新規 agent step が追加された場合に自動的に走査対象に含まれる

---

### TC-014: 既存テスト（code-review・types）が無変更で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** 変更前と同一内容の `tests/unit/step/code-review.test.ts` および `tests/unit/core/step/types.test.ts`  
**WHEN** `bun run test` を実行する  
**THEN** 両ファイルの全テストが green（既存テストファイルへの変更が無い）

---

### TC-015: typecheck && test が全体 green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** すべての変更（T-01〜T-04）が適用された状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** typecheck エラーが 0、全テストが green

---

## Result

```yaml
result: completed
total: 15
automated: 12
manual: 3
must: 10
should: 5
could: 0
blocked_reasons: []
```
