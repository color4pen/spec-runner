# Code Review Feedback — request-review-evidence-counts — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル（diff 全量精読）

- `src/core/port/report-result.ts` — `RequestReviewReportResult` に `evidence?: Evidence` を追加。`parseRequestReviewReportInput` の `ok=true` ブロックで `parseEvidence` を呼び evidence 必須化。findings は任意のまま維持。`ok=false` は evidence を要求しない。既存 `parseEvidence` の再利用を確認。
- `src/core/step/report-tool.ts` — `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に `evidence: optional(evidenceSchema)` を追加。description に evidence / checked / skipped / unverified の記述と checked=0 が判定不能であることを明記。既存 `evidenceSchema` を再利用（複製なし）。他ツール（JUDGE / CODE_REVIEW / CONFORMANCE / PRODUCER）の zodSchema・description は変更なし。
- `src/core/step/judge-verdict.ts` — `deriveRequestReviewVerdict` のシグネチャを `(findings, ok, evidence?)` に拡張。優先順位: !ok → needs-discussion / evidence?.checked===0 → needs-discussion（新規 vacuous check）/ blocking → needs-discussion / else → approve。evidence === undefined 時は従来導出（後方互換）。他の判定関数（deriveJudgeVerdict 等）は変更なし。
- `src/core/step/step-completion.ts` — `isRequestReviewStep` 分岐で `deriveRequestReviewVerdict(undecidedFindings, tr.ok, tr.evidence)` に変更。`tr.evidence?.checked === 0` 時に `stderrWrite` で診断出力。`persistToolResult` は evidence を spread で保持（追加ロジック不要を確認）。
- `src/prompts/request-review-system.ts` — `EVIDENCE_COUNTS_DEFINITION` を judge-rules.ts から import し Completion 節の `${OBSERVATION_DEFINITION}` の直後に `${EVIDENCE_COUNTS_DEFINITION}` を注入。文言のインライン複製なし。既存の `EVIDENCE_DISCIPLINE`（散文の根拠規律）は残存。

### テストファイル（新規・反転・追随）

- `src/core/port/__tests__/request-review-evidence-parse.test.ts` — TC-001〜004, TC-013 を確認。evidence 欠落/負値/非整数/ok=false の各ケースを網羅。
- `src/core/step/__tests__/request-review-verdict-evidence.test.ts` — TC-005〜008, TC-017, TC-018 を確認。checked=0 → needs-discussion、checked>0 → approve、legacy 2 引数呼び出し → 従来導出、blocking finding 不変を網羅。
- `src/core/port/__tests__/request-review-legacy-compat.test.ts` — TC-009, TC-010 を確認。evidence 無し旧 StepRun を含む JobState の読み取り・resume シミュレーションが例外なく成功。mixed (legacy + new) run も確認。
- `src/prompts/__tests__/request-review-evidence-prompt.test.ts` — TC-011, TC-012 を確認。`REQUEST_REVIEW_SYSTEM_PROMPT` が judge-rules.ts からの import（動的）と `toContain` で照合され、単一ソース由来を構造的に保証。
- `src/core/step/__tests__/request-review-step-completion-evidence.test.ts` — TC-019, TC-020 を確認。checked=0 で stderr 診断出力と needs-discussion 導出。checked>0 で approve。persistToolResult に evidence が伝搬される。
- 反転テスト:
  - `src/core/step/__tests__/report-tool-evidence-schema.test.ts` — TC-023（zodSchema に evidence キーが存在する）に反転を確認。
  - `src/core/port/__tests__/evidence-enforcement.test.ts` — TC-006（request-review が evidence 必須化の対象）に反転を確認。
  - `src/prompts/__tests__/evidence-fragment-coverage.test.ts` — TC-018（REQUEST_REVIEW_SYSTEM_PROMPT が EVIDENCE_COUNTS_DEFINITION を含む）に反転を確認。
- e2e fixture 追随:
  - `tests/helpers/pipeline-mock-client.ts:268` — `evidence: { checked: 5, skipped: 0, unverified: 0 }` 追加済みを確認。
  - `tests/reviewer-activation-e2e.test.ts:157` — 同様の追加を確認。
  - `tests/custom-reviewers-e2e.test.ts:303` — 同様の追加を確認。
- `tests/unit/core/port/report-result-findings.test.ts` / `report-result-observations.test.ts` — `ok: true` 系ケースに `evidence: { checked: 1, ... }` が追加され、findings 任意性の主眼アサートは変更なしを確認。

### 検証ゲート

- `specrunner/changes/request-review-evidence-counts/verification-result.md` — build / typecheck / test / lint / changed-line-coverage すべて passed。Test Files 595 passed, Tests 8699 passed / 1 skipped を確認。

### 受け入れ基準対応

| 基準 | 対応テスト | 確認 |
|------|-----------|------|
| `checked: 0` + `findings: []` → needs-discussion | TC-005 | ✅ |
| `checked > 0` + `findings: []` → approve | TC-006 | ✅ |
| evidence 欠落の新規報告が受理されない | TC-001、TC-006 reversed | ✅ |
| 旧形式 record の読み取りが正常動作 | TC-009, TC-010 | ✅ |
| prompt が単一ソース由来の evidence 記入指示を含む | TC-011, TC-012, TC-023 reversed | ✅ |
| 破壊確認記録 | TC-025、tasks.md T-08 チェック済み | ✅ |
| `typecheck && test` が green | verification-result.md | ✅ |

### 設計遵守確認

| 設計判断 | 実装箇所 | 確認 |
|---------|---------|------|
| checked=0 → needs-discussion（escalation 相当） | `judge-verdict.ts:168` | ✅ |
| parseEvidence / evidenceSchema / EVIDENCE_COUNTS_DEFINITION 再利用（複製なし） | import のみ、定義変更なし | ✅ |
| evidence === undefined（legacy）は従来導出 | `judge-verdict.ts:168`（`evidence !== undefined` guard） | ✅ |
| findings は任意のまま（request-review 固有） | `report-result.ts:460-474` | ✅ |
| drift-guard 3 件の反転が正しく適用された | 各テストファイル | ✅ |
| e2e fixture 3 箇所に evidence 追加済み | 各テストファイル | ✅ |

## 検証できなかった項目

None。

## Findings 詳細

なし。typed findings は空配列として report_result で報告する。
