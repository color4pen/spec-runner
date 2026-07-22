# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: Codebase Context

- `src/core/step/report-tool.ts` を全体 Read して `REQUEST_REVIEW_REPORT_TOOL` (lines 231-242) の zodSchema を確認
- `src/core/port/report-result.ts` を全体 Read して `parseEvidence`・`parseRequestReviewReportInput`・`RequestReviewReportResult` を確認
- `src/core/step/judge-verdict.ts` を全体 Read して `deriveRequestReviewVerdict` 関数シグネチャを確認
- `src/prompts/judge-rules.ts` を全体 Read して `EVIDENCE_COUNTS_DEFINITION` の定義と export を確認
- `src/prompts/request-review-system.ts` を全体 Read して import リストと使用 fragment を確認
- `EVIDENCE_COUNTS_DEFINITION` の注入状況を Grep で横断確認（judge prompts 5 件 + request-review 未注入）
- `src/core/step/step-completion.ts` を全体 Read して `deriveRequestReviewVerdict` 呼び出し箇所を確認
- `src/core/step/__tests__/judge-verdict.test.ts` を Read して既存テスト状況を確認
- `src/core/step/__tests__/judge-verdict-evidence.test.ts` を Read して evidence テスト状況を確認
- `src/core/step/__tests__/report-tool-evidence-schema.test.ts` を Read して TC-022/TC-023 を確認
- `src/core/port/__tests__/evidence-enforcement.test.ts` (TC-006) を確認

### Step 2: Code Assertion Fact-Check

| 断定 | 結果 | 根拠 |
|------|------|------|
| `src/core/step/report-tool.ts:231-242` — `REQUEST_REVIEW_REPORT_TOOL` の zodSchema に evidence フィールドなし | ✅ 一致 | lines 234-240: ok/reason/verdict/findings/observations のみ、evidence 欠如を確認 |
| `JUDGE_REPORT_TOOL` に evidenceSchema（checked/skipped/unverified 非負整数）と「REQUIRED when ok=true」記述 | ✅ 一致 | lines 83-87 (evidenceSchema)、line 139 (description に "REQUIRED when ok=true") |
| `parseEvidence` は `src/core/port/report-result.ts` に存在する | ✅ 一致 | lines 147-164 に `parseEvidence` 関数を確認 |
| `deriveRequestReviewVerdict` は findings と ok から導出（evidence 概念なし） | ✅ 実質一致 ※ | signature: `(findings: Finding[], ok: boolean): "approve" \| "needs-discussion"` — evidence パラメータなし |
| `EVIDENCE_COUNTS_DEFINITION` が `src/prompts/judge-rules.ts` に存在 | ✅ 一致 | lines 88-99 に export を確認 |
| judge 系 prompt の Completion 節に `EVIDENCE_COUNTS_DEFINITION` 注入済み | ✅ 一致 | spec-review/code-review/custom-reviewer/conformance/regression-gate の各 system.ts で注入確認 |
| request-review prompt に `EVIDENCE_COUNTS_DEFINITION` 未注入 | ✅ 一致 | request-review-system.ts は `EVIDENCE_DISCIPLINE` を import するが `EVIDENCE_COUNTS_DEFINITION` は import/使用なし |

※ 軽微な不正確: request.md は `deriveRequestReviewVerdict` が "approve / needs-discussion / **reject**" を導出するとしているが、実際の戻り値型は `"approve" | "needs-discussion"` のみ。"reject" は導出されない（関数コメント参照）。要件の本質（evidence 概念なし）には影響しない。

### Step 3: 関連テスト状況の確認

既存テストのうち、この request 実装後に変更が必要なものを把握した:
- `src/core/step/__tests__/report-tool-evidence-schema.test.ts` TC-023: `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に evidence キーが「存在しない」ことを assert → 実装後に反転が必要
- `src/core/port/__tests__/evidence-enforcement.test.ts` TC-006: `parseRequestReviewReportInput({ ok: true })` が evidence なしで `ok: true` を返すことを assert → 実装後に反転が必要

これらは実装によって自然に更新されるべきテストであり、request の要件（受け入れ基準 3・4）と整合する。

### Step 4: step-completion.ts 呼び出し箇所の確認

`src/core/step/step-completion.ts:146` に `deriveRequestReviewVerdict(undecidedFindings, tr.ok)` の呼び出しがある。`deriveRequestReviewVerdict` に evidence パラメータを追加した場合、この呼び出しも `tr.evidence` を渡すよう更新が必要。request.md には明示がないが要件 2 の実現に必然的に含まれる。

## 検証できなかった項目

None

## Findings 詳細

None
