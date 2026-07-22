# Conformance Result — request-review-evidence-counts — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Spec Requirements（4 件）

| # | Requirement | 検証箇所 | 結果 |
|---|-------------|----------|------|
| R1 | request-review 完了契約 MUST carry required evidence counts | `src/core/port/report-result.ts:459-474` の `parseRequestReviewReportInput`：`ok=true` ブロック内で `parseEvidence` を呼び、失敗時 `missingFields: ["evidence"]` を返す実装を確認 | ✓ |
| R2 | deriveRequestReviewVerdict SHALL NOT approve a vacuous completion | `src/core/step/judge-verdict.ts:168`：`evidence !== undefined && evidence.checked === 0 → "needs-discussion"` の vacuous check を確認 | ✓ |
| R3 | 旧 record は再評価しない（後方互換） | `evidence?` を optional 型で定義（`report-result.ts:398`）、parse 強制は live tool call のみ、verdict 導出は `evidence === undefined` でフォールバック確認 | ✓ |
| R4 | request-review prompt は EVIDENCE_COUNTS_DEFINITION を単一ソースで注入 | `src/prompts/request-review-system.ts:13` の import と `:93` の `${EVIDENCE_COUNTS_DEFINITION}` 埋め込みを確認 | ✓ |

### Design Decisions（D1–D6 実装確認）

| # | Decision | 検証箇所 | 結果 |
|---|----------|----------|------|
| D1 | `RequestReviewReportResult` に `evidence?: Evidence` 追加 | `src/core/port/report-result.ts:394-399` | ✓ |
| D2 | `parseRequestReviewReportInput` で ok=true 時に `parseEvidence` 呼び出し | `report-result.ts:469-474` | ✓ |
| D3 | `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に `evidence: optional(evidenceSchema)` 追加 | `src/core/step/report-tool.ts:241` | ✓ |
| D4 | `deriveRequestReviewVerdict` に `evidence?` 引数と vacuous check 追加（`!ok` 直後） | `judge-verdict.ts:162-168` | ✓ |
| D5 | `step-completion.ts` で evidence を渡し `checked===0` を stderr surfacing | `step-completion.ts:146-149` | ✓ |
| D6 | request-review prompt Completion 節に `${EVIDENCE_COUNTS_DEFINITION}` 注入 | `request-review-system.ts:93` | ✓ |

### Acceptance Criteria（7 件）

| # | 基準 | テスト固定箇所 | 結果 |
|---|------|--------------|------|
| AC1 | `checked:0` + `findings:[]` → needs-discussion | `request-review-verdict-evidence.test.ts` TC-005 | ✓ |
| AC2 | `checked>0` + `findings:[]` → approve | 同 TC-006 | ✓ |
| AC3 | evidence 欠落の新規報告が拒否される | `evidence-enforcement.test.ts` TC-006 (reversed) | ✓ |
| AC4 | 旧形式 record 読み取りが正常動作 | `request-review-legacy-compat.test.ts` | ✓ |
| AC5 | prompt に EVIDENCE_COUNTS_DEFINITION（単一ソース由来）が含まれる | `evidence-fragment-coverage.test.ts` TC-018 (reversed) | ✓ |
| AC6 | 破壊確認（evidence なしで approve に戻すと TC-005 が fail）が記録済み | `tasks.md T-08` チェックボックス確認 | ✓ |
| AC7 | `typecheck && test` が green | `verification-result.md`（595 test files, 8699 tests passed、build/typecheck/lint 全 passed） | ✓ |

### Task Checkboxes（T-01〜T-08）

`tasks.md` の全チェックボックスが `[x]` であることを読んで確認。

### Drift-guard 反転（T-07）

| Test | 反転前 | 反転後 | 結果 |
|------|--------|--------|------|
| TC-023 (`report-tool-evidence-schema.test.ts`) | evidence キー不在を固定 | evidence キー存在を固定 | ✓ |
| TC-006 (`evidence-enforcement.test.ts`) | request-review は evidence 不要を固定 | evidence 必須を固定 | ✓ |
| TC-018 (`evidence-fragment-coverage.test.ts`) | prompt が fragment 非注入を固定 | prompt が fragment 注入を固定 | ✓ |

### e2e fixture 追随

`tests/helpers/pipeline-mock-client.ts`・`tests/reviewer-activation-e2e.test.ts`・`tests/custom-reviewers-e2e.test.ts` の 3 ファイルが git diff --stat に含まれており、evidence フィールド追加済みを確認。

## 検証できなかった項目

None

## Findings 詳細

None（適合）
