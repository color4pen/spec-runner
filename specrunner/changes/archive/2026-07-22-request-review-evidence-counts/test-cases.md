# Test Cases: request-review evidence counts

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 24
- **Manual**: 1
- **Priority**: must: 21, should: 4, could: 0

---

<!-- parse: parseRequestReviewReportInput -->

### TC-001: evidence 欠落の ok=true 報告が parse 拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts > Scenario: request-review report without evidence on ok=true is rejected

---

### TC-002: 有効な evidence 付き ok=true 報告が parse 受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts > Scenario: request-review report with valid evidence is accepted

---

### TC-003: 負値の evidence カウントが parse 拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts > Scenario: negative or non-integer counts are rejected

---

### TC-004: ok=false の自発失敗は evidence 不要で parse 受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review 完了契約 MUST carry required evidence counts > Scenario: voluntary failure does not require evidence

---

<!-- verdict: deriveRequestReviewVerdict -->

### TC-005: checked=0 + findings 空の完了が approve にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion > Scenario: zero checked with empty findings does not approve

---

### TC-006: checked>0 + findings 空の完了が approve になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion > Scenario: positive checked with empty findings approves

---

### TC-007: checked>0 + ブロッキング finding は needs-discussion のまま（導出不変）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion > Scenario: positive checked with blocking finding is unchanged

---

### TC-008: evidence 引数なし（旧形式呼び出し）は従来導出にフォールバック

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion > Scenario: absent evidence preserves legacy derivation

---

<!-- backward compat: legacy records -->

### TC-009: evidence 無しの旧 StepRun レコードが読み取りエラーなく処理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: past request-review records without evidence MUST remain readable and resumable > Scenario: legacy request-review record without evidence is read without error

---

### TC-010: evidence 無しの旧 record を含む job の resume が正常に進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: past request-review records without evidence MUST remain readable and resumable > Scenario: resume with legacy request-review records proceeds

---

<!-- prompt: single-source injection -->

### TC-011: REQUEST_REVIEW_SYSTEM_PROMPT が EVIDENCE_COUNTS_DEFINITION を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review prompt SHALL instruct evidence reporting from a single source > Scenario: request-review prompt contains the evidence-counts fragment

---

### TC-012: prompt への注入がインライン複製でなく単一ソース定数参照である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review prompt SHALL instruct evidence reporting from a single source > Scenario: the injected instruction is not a duplicated literal

---

<!-- TC-013〜025: 非 Scenario 由来（GWT 記述） -->

### TC-013: 非整数（浮動小数）の evidence カウントが parse 拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `parseRequestReviewReportInput` に `{ ok: true, evidence: { checked: 1.5, skipped: 0, unverified: 0 } }` が渡される
**WHEN** parse を実行する
**THEN** 戻り値は `{ ok: false }` であり `missingFields` に `"evidence"` が含まれる（非整数は非負整数条件違反）

---

### TC-014: REQUEST_REVIEW_REPORT_TOOL の zodSchema に evidence キーが存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `REQUEST_REVIEW_REPORT_TOOL.zodSchema` を参照する
**WHEN** キー一覧を検査する
**THEN** `"evidence"` キーが存在する（`optional(evidenceSchema)` として登録済み）

---

### TC-015: REQUEST_REVIEW_REPORT_TOOL の description に evidence 必須の説明が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `REQUEST_REVIEW_REPORT_TOOL.description` 文字列を参照する
**WHEN** キーワードを検索する
**THEN** `evidence`、`checked`、`skipped`、`unverified` の各語が含まれ、`ok=true` で REQUIRED であることが明記されている

---

### TC-016: 他の report tool（JUDGE / CODE_REVIEW / CONFORMANCE / PRODUCER）の zodSchema が変更されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `JUDGE_REPORT_TOOL`、`CODE_REVIEW_REPORT_TOOL`、`CONFORMANCE_REPORT_TOOL`、`PRODUCER_REPORT_TOOL` の各 zodSchema を参照する
**WHEN** 本変更前後でスナップショットを比較する（または既存テストを実行する）
**THEN** いずれの zodSchema にも本変更による差分がない

---

### TC-017: ok=false の verdict 導出が needs-discussion のまま変わらない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `deriveRequestReviewVerdict` を `([], false)` で呼び出す（evidence 引数なし）
**WHEN** verdict を導出する
**THEN** 戻り値は `"needs-discussion"`（ok=false の最優先ルール不変）

---

### TC-018: 非ブロッキング（low/medium fixable）+ checked>0 の完了が approve になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `deriveRequestReviewVerdict` を `([{ severity: "medium", resolution: "fixable", ... }], true, { checked: 2, skipped: 0, unverified: 0 })` で呼び出す
**WHEN** verdict を導出する
**THEN** 戻り値は `"approve"`（中低重要度 fixable finding は blocking でなく approve 導出不変）

---

### TC-019: checked=0 検知時に stderr へ診断が出力される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** request-review step が `{ ok: true, findings: [], evidence: { checked: 0, skipped: 3, unverified: 0 } }` を報告する
**WHEN** `deriveStepCompletion` がその結果を処理する
**THEN** stderr に「vacuous check」または「checked=0」「needs-discussion」を含む診断メッセージが出力される

---

### TC-020: evidence が persistToolResult に伝搬され state に永続化される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** request-review step が `{ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } }` を報告する
**WHEN** `deriveStepCompletion` が `persistToolResult` を呼び出す
**THEN** 永続化される `toolResult` オブジェクトに `evidence: { checked: 3, skipped: 0, unverified: 0 }` が含まれる

---

### TC-021: drift-guard（tool schema）が evidence 存在を固定する（TC-023 反転）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 — drift-guard 反転（tool schema）: `src/core/step/__tests__/report-tool-evidence-schema.test.ts` TC-023

**GIVEN** `src/core/step/__tests__/report-tool-evidence-schema.test.ts` の TC-023（旧: `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に evidence 無しを固定）が反転済みである
**WHEN** テストスイートを実行する
**THEN** TC-023 は「evidence キーが**存在する**」を asserts して緑になる

---

### TC-022: drift-guard（parse）が evidence 必須を固定する（TC-006 反転）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 — drift-guard 反転（parse）: `src/core/port/__tests__/evidence-enforcement.test.ts` TC-006

**GIVEN** `src/core/port/__tests__/evidence-enforcement.test.ts` の TC-006（旧: request-review は evidence 不要）が反転済みである
**WHEN** テストスイートを実行する
**THEN** TC-006 は「ok=true + evidence なし → `{ ok: false }` / `missingFields: ["evidence"]`」を asserts して緑になる

---

### TC-023: drift-guard（prompt）が fragment 注入を固定する（TC-018 反転）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 — drift-guard 反転（prompt）: `src/prompts/__tests__/evidence-fragment-coverage.test.ts` TC-018

**GIVEN** `src/prompts/__tests__/evidence-fragment-coverage.test.ts` の TC-018（旧: `REQUEST_REVIEW_SYSTEM_PROMPT` が fragment を含まない）が反転済みである
**WHEN** テストスイートを実行する
**THEN** TC-018 は「`REQUEST_REVIEW_SYSTEM_PROMPT` が `EVIDENCE_COUNTS_DEFINITION` を `toContain` する」を asserts して緑になる

---

### TC-024: e2e / integration fixture 追随後もパイプラインが approve ルートで正常に進む

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07 — e2e fixture 追随: `tests/helpers/pipeline-mock-client.ts:266`, `tests/reviewer-activation-e2e.test.ts:155`, `tests/custom-reviewers-e2e.test.ts:301`

**GIVEN** pipeline-mock-client / reviewer-activation-e2e / custom-reviewers-e2e の request-review mock 入力（旧: `{ ok: true, verdict: "approve", findings: [] }`）に `evidence: { checked: N>0, skipped: 0, unverified: 0 }` を追加する
**WHEN** 各 e2e / integration テストスイートを実行する
**THEN** pipeline-integration / multi-layer-defense / error-path-integration / reviewer-activation-e2e / custom-reviewers-e2e がすべて退行なく緑になり、request-review が approve → pipeline 次工程へ進む

---

### TC-025: 破壊確認 — vacuous check を外すと該当テストが fail する

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** T-03 の vacuous check（`evidence !== undefined && evidence.checked === 0 → "needs-discussion"`）を一時的に無効化する（または T-01 の evidence 必須化を外す）
**WHEN** TC-005（checked=0 + findings 空 → needs-discussion）を含むテストスイートを実行する
**THEN** TC-005 が fail する（approval 側に落ちるか parse が通過するため）ことを確認し、結果を検証記録に残す。確認後、必ず修正を元に戻す

---

## Result

```yaml
result: pending
total: 25
automated: 24
manual: 1
must: 21
should: 4
could: 0
blocked_reasons: []
```
