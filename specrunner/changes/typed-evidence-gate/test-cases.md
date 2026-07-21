# Test Cases: judge 完了契約に evidence counts を追加し、確認ゼロ・全 skip を非 green にする

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```
-->

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 28
- **Manual**: 0
- **Priority**: must: 19, should: 8, could: 1

---

## parse 強制（evidence 必須化）

### TC-001: ok=true の judge 完了報告で evidence フィールドが欠落した場合は拒否

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts > Scenario: judge report without evidence on ok=true is rejected

---

### TC-002: evidence を含む ok=true の judge 完了報告は受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts > Scenario: judge report with valid evidence is accepted

---

### TC-003: evidence の counts に負値または非整数を指定した場合は拒否

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts > Scenario: negative or non-integer counts are rejected

---

### TC-004: ok=false（自発的失敗）のとき evidence は不要

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts > Scenario: voluntary failure does not require evidence

---

### TC-005: code-review / conformance も evidence 必須化を継承する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts > Scenario: code-review and conformance inherit the requirement

---

### TC-006: request-review は evidence 必須化の対象外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge 完了契約 MUST carry required evidence counts > Scenario: request-review is unaffected

---

## vacuous 判定（checked === 0 → escalation）

### TC-007: checked=0 + findings:[] で escalation になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion > Scenario: zero checked with empty findings escalates

---

### TC-008: checked>0 + findings:[] で approved になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion > Scenario: positive checked with empty findings approves

---

### TC-009: checked>0 + blocking findings で needs-fix になる（導出不変）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion > Scenario: positive checked with blocking findings is unchanged

---

### TC-010: checked>0 + decision-needed finding で escalation になる（導出不変）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion > Scenario: positive checked with decision-needed finding is unchanged

---

### TC-011: conformance の checked=0 で escalation になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion > Scenario: conformance with zero checked escalates

---

### TC-012: evidence 引数なしの呼び出しは従来導出（後方互換）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion > Scenario: absent evidence preserves legacy derivation

---

## regression-gate の導出不変

### TC-013: regression-gate の verdict 導出は evidence に影響されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate reports evidence but its verdict derivation is unchanged > Scenario: regression-gate verdict derivation is unaffected by evidence

---

## 後方互換（legacy record の読み取り・resume）

### TC-014: evidence フィールドを持たない legacy judge record を例外なく読める

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: past records without evidence MUST remain readable and resumable > Scenario: legacy judge record without evidence is read without error

---

### TC-015: legacy record を含む job の resume が正常動作する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: past records without evidence MUST remain readable and resumable > Scenario: resume with legacy records proceeds

---

## prompt fragment（drift-guard）

### TC-016: 5 つの judge prompt が EVIDENCE_COUNTS_DEFINITION を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source > Scenario: five judge prompts contain the evidence-counts fragment

---

### TC-017: EVIDENCE_COUNTS_DEFINITION が必須フィールドと vacuous ルールを記述する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source > Scenario: the fragment describes the required fields and the vacuous rule

---

### TC-018: request-review prompt は EVIDENCE_COUNTS_DEFINITION を含まない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: judge prompts SHALL instruct evidence reporting from a single source > Scenario: request-review prompt omits the fragment

---

## parseEvidence 単体（追加粒度）

### TC-019: parseEvidence に非オブジェクト値を渡すと失敗

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** `parseEvidence` が `"string"`、`null`、`42` などの非オブジェクト値で呼ばれる
**WHEN** 関数が入力を評価する
**THEN** `{ ok: false }` を返す

---

### TC-020: parseEvidence にフィールドが欠落した場合は失敗

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** `parseEvidence` が `{ checked: 1, skipped: 0 }`（`unverified` が欠落）で呼ばれる
**WHEN** 関数が入力を評価する
**THEN** `{ ok: false }` を返す

---

### TC-021: parseEvidence に浮動小数点数が含まれる場合は失敗

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** `parseEvidence` が `{ checked: 1.5, skipped: 0, unverified: 0 }` で呼ばれる
**WHEN** 関数が入力を評価する
**THEN** `{ ok: false }` を返す（`Number.isInteger` 検証に失敗）

---

## report tool schema（zodSchema）

### TC-022: JUDGE / CODE_REVIEW / CONFORMANCE report tool の zodSchema に evidence キーが存在する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** `JUDGE_REPORT_TOOL`・`CODE_REVIEW_REPORT_TOOL`・`CONFORMANCE_REPORT_TOOL` の `zodSchema` 定義
**WHEN** 各スキーマを検査する
**THEN** それぞれに `evidence` キーが存在する

---

### TC-023: REQUEST_REVIEW_REPORT_TOOL の zodSchema に evidence キーが存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** `REQUEST_REVIEW_REPORT_TOOL` の `zodSchema` 定義
**WHEN** スキーマを検査する
**THEN** `evidence` キーが存在しない

---

## 永続化（evidence の state への保持）

### TC-024: evidence を含む toolResult が state に永続化され読み戻せる

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05 / tasks.md T-06

**GIVEN** judge step が `{ ok: true, findings: [], evidence: { checked: 2, skipped: 1, unverified: 0 } }` を完了として報告した
**WHEN** `pushStepResult` が toolResult を永続化し、`getLatestStepResult` で読み戻す
**THEN** 取得した `toolResult.evidence` が `{ checked: 2, skipped: 1, unverified: 0 }` に等しい

---

## 診断出力（stderr surfacing）

### TC-025: checked=0 を検出したとき step-completion が stderr に診断を出力する

**Category**: unit
**Priority**: should
**Source**: design.md D7 / tasks.md T-05

**GIVEN** judge step が `{ ok: true, findings: [], evidence: { checked: 0, skipped: 5, unverified: 0 } }` を報告した
**WHEN** `deriveStepCompletion` が toolResult を処理する
**THEN** `checked=0` または「検証実績ゼロ」に言及する診断メッセージが stderr に出力される（verdict 決定前または同時）

---

## 型互換性

### TC-026: deriveRegressionGateVerdict（2 引数）が judgeVerdictFn 型（3 引数 optional）に代入できる

**Category**: unit
**Priority**: could
**Source**: tasks.md T-04

**GIVEN** `judgeVerdictFn` 型が `(findings, ok, evidence?) => ...` の 3 引数（第 3 は optional）として定義される
**WHEN** TypeScript コンパイラが `deriveRegressionGateVerdict`（2 引数定義）を `judgeVerdictFn` 型変数に代入する
**THEN** 型エラーなしでコンパイルが通る（引数が少ない関数はより多い引数型に代入可能）

---

## 検証ゲート

### TC-027: bun run typecheck が型エラーゼロで成功する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-09

**GIVEN** T-01 から T-07 までのすべての実装変更が適用された状態
**WHEN** `bun run typecheck` をリポジトリルートで実行する
**THEN** exit code 0 で終了し、型エラーがゼロ件である

---

### TC-028: integration / e2e テストスイートがフィクスチャ更新後も後退なしで成功する

**Category**: integration
**Priority**: should
**Source**: tasks.md T-08 / tasks.md T-09

**GIVEN** `tests/helpers/pipeline-mock-client.ts` の judge 系（judge / code-review / conformance / regression-gate / custom-reviewer）が approved を返す `report_result` 入力に `evidence: { checked: <正整数>, skipped: 0, unverified: 0 }` が追加された状態
**WHEN** `bun run test`（`pipeline-integration`・`custom-reviewers-e2e`・`reviewer-activation-e2e` を含む）を実行する
**THEN** 全テストが green で終了し、既存の integration / e2e に後退がない

---

## Result

```yaml
result: completed
total: 28
automated: 28
manual: 0
must: 19
should: 8
could: 1
blocked_reasons: []
```
