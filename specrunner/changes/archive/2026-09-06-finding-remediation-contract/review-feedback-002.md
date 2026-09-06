# Code Review — finding-remediation-contract — iter 2

## Scope

Branch: `feat/finding-remediation-contract-d394de74`  
Diff stat (main...HEAD): 55 files changed, 6666 insertions, 112 deletions

## Evidence Summary

| Category | Checked | Notes |
|---|---|---|
| iter-1 F-001 fix: TC-T10-01 reproduction fixture → `buildMessage` | ✓ | Fixture now calls `CodeFixerStep.buildMessage!` (remediation-parse.test.ts:498–568); asserts both `commit-push.ts:584` and `parallel-review-round.ts:401` in output |
| iter-1 F-002 fix: three-category scanning obligation in fragment | ✓ | `FINDING_REMEDIATION_DEFINITION` (judge-rules.ts:129) now includes "同じ検査を行う別レイヤ" |
| iter-1 F-002 fix: companion test assertion for three-category phrase | ✗ | TC-T04-04 specified in review-feedback-001 — no automated test for three-category phrase found in any test file |
| Kernel type (`report-result.ts`) | ✓ | `FindingRemediation`, `RemediationSite`, `Finding.remediation?` all present and correct |
| Tool schema (`report-tool.ts`) | ✓ | `remediationSchema` / `remediationSiteSchema`; injected as `optional` into `findingSchema` / `conformanceFindingSchema`; `REQUEST_REVIEW_REPORT_TOOL` description unchanged |
| Parse layer — fail-closed path | ✓ | `parseFindings(raw, strict, requireRemediation)` extension; `parseJudgeReportInput` passes `requireRemediation=true`; `missingFields: ["findings.remediation"]` on failure |
| Parse layer — request-review (D2) | ✓ | `parseRequestReviewReportInput` uses `parseFindings(…, true, false)` — no remediation required |
| Site normalization (D4) | ✓ | Self-site prepended when absent; dedup by `file|line` |
| Malformed remediation in non-strict mode | ✓ | Silent-drop (no crash) |
| `FINDING_REMEDIATION_DEFINITION` fragment content | ✓ | Invariant / sites / approach / scanning obligation (three categories) / 1-site note |
| `FINDING_REMEDIATION_DEFINITION` provider-neutral (no report_result / end_turn) | ✓ | Verified by existing T-07 fragment coverage test |
| Prompt injection: custom-reviewer / code-review / spec-review / conformance / regression-gate | ✓ | All 5 prompts include `FINDING_REMEDIATION_DEFINITION` via template expansion |
| request-review-system.ts excludes fragment (D2) | ✓ | No injection confirmed |
| `buildFindingsBlock`: remediation expansion | ✓ | Invariant / Sites / Approach per finding; all-site directive once per block; legacy output unchanged when no remediation |
| `renderEvidenceReference`: empty → "", 1+ paths → block | ✓ | Implemented; tested in remediation-parse.test.ts |
| code-fixer: all 3 structured paths include evidence path | ✓ | conformance / coordinator / normal paths all call `renderEvidenceReference` |
| spec-fixer: both structured paths include evidence path | ✓ | conformance / normal paths call `renderEvidenceReference`; fallback unchanged |
| `buildContinuationMessage`: evidence path in structured branch | ✓ | `evidencePaths = opts.findingsPaths ?? [opts.findingsPath]` — always renders |
| coordinator continuation: all member paths | ✓ | `findingsPaths: memberPaths` passed when non-empty |
| code-fixer-system prompt | ✓ | "最小限の機械的修正" removed; "全 site で成立させる最小の修正" in Question and Method 3; evidence path input described in Contract; write-set prohibition retained |
| spec-fixer-system prompt | ✓ | Method 2 and security constraint both reference "全 site"; read-only result file input described |
| regression-gate ledger (`buildLedgerEntry`) | ✓ | Sites emitted per entry when remediation present; entries without remediation unchanged |
| regression-gate ledger block (`buildLedgerBlock`) | ✓ | Sites note and all-site verification instruction injected when any entry has sites |
| regression-gate-system prompt | ✓ | Method step 3 instructs full-site verification; finding JSON example includes remediation; ledger inheritance described |
| Identity invariance (`findingFingerprint` / `computeLedgerRef` / `computeFindingKey`) | ✓ | Fingerprint unchanged; `computeLedgerRef` same with/without remediation (drift-guard test) |
| Backward compat: non-strict legacy parse | ✓ | `parseFindings()` (no args) accepts legacy findings; malformed remediation silently dropped |
| `fail-closed-drift-guard.test.ts` | ✓ | fixable+no-remediation → `ok:false`; `findings:[]` → approved; fixable+remediation → `ok:true` |
| Verification result (build / typecheck / test / lint) | ✓ | All phases green per `verification-result.md` |

## Findings

### F-001 · LOW · fixable

**File**: `src/prompts/__tests__/fragment-coverage.test.ts`  
**Title**: TC-T04-04 companion test for three-category scanning phrase is absent

**Rationale**: review-feedback-001 F-002 specified two corrective actions: (1) append "・同じ検査を行う別レイヤ" to the scanning obligation in `FINDING_REMEDIATION_DEFINITION`, and (2) "update TC-T04-04 to assert on the three-category phrase." Action (1) was performed correctly — `judge-rules.ts:129` now reads "隣接関数・並列経路・同じ検査を行う別レイヤ". Action (2) was not performed: `fragment-coverage.test.ts` contains no test for `FINDING_REMEDIATION_DEFINITION` content at all, and no other test file asserts the three-category phrase. A future refactor that accidentally drops the third category would not be caught.

TC-T04-04 (priority: must) in test-cases.md now documents the three-category requirement. The matching automated assertion is the missing guard.

**Invariant**: every FINDING_REMEDIATION_DEFINITION content change that affects the scanning obligation MUST be caught by an automated test.

**Sites**:
- `src/prompts/__tests__/fragment-coverage.test.ts` (new test case needed in this file)

**Approach**: add a `describe("FINDING_REMEDIATION_DEFINITION scanning obligation (TC-T04-04)")` block in `fragment-coverage.test.ts` that imports `FINDING_REMEDIATION_DEFINITION` from `"../judge-rules.js"` and asserts it contains "同じ検査を行う別レイヤ" (full three-category phrase). The block can optionally also assert "隣接関数" and "並列経路" to pin the two categories that were already required.

---

## Observations

### O-001 · LOW

**File**: `src/prompts/__tests__/fragment-coverage.test.ts`  
**Title**: TC-T04-03 ("全 prompt に FINDING_REMEDIATION_DEFINITION が含まれる") also has no automated test

The five-prompt coverage of `FINDING_REMEDIATION_DEFINITION` (TC-T04-03, priority: must) is verified only by inspection. `fragment-coverage.test.ts` already tests five-prompt coverage for `DECISION_NEEDED_DEFINITION` and `OBSERVATION_DEFINITION` — adding an equivalent block for `FINDING_REMEDIATION_DEFINITION` would complete the pattern. This is distinct from F-001 (which is about the content of the fragment itself). Recorded as an observation since review-feedback-001 did not raise this gap and the implementation is correct; the missing test is a coverage improvement rather than a correctness issue.

---

## Verification of iter-1 Findings

| Finding | Status | Evidence |
|---|---|---|
| F-001 (TC-T10-01 tests buildFindingsBlock, not buildMessage) | ✅ Fixed | `remediation-parse.test.ts:498–568` now calls `CodeFixerStep.buildMessage!` and asserts both site strings; the comment explicitly references the fix |
| F-002 (FINDING_REMEDIATION_DEFINITION missing third category) | ✅ Partially Fixed | judge-rules.ts:129 now includes "同じ検査を行う別レイヤ"; **companion test not added** (see F-001 above) |

## 検証した項目

- `src/kernel/report-result.ts`: `FindingRemediation` / `RemediationSite` 型定義、`Finding.remediation?` フィールド
- `src/core/step/report-tool.ts`: `remediationSchema` / `remediationSiteSchema`、`findingSchema` / `conformanceFindingSchema` へのオプショナル注入、`REQUEST_REVIEW_REPORT_TOOL` description の変更なし
- `src/core/port/report-result.ts`: `parseRemediation`、`parseFindings` 第 3 引数、fail-closed 経路、自 site 正規化（D4）、dedup、`parseJudgeReportInput` の requireRemediation=true 委譲、`parseRequestReviewReportInput` の requireRemediation=false 維持
- `src/prompts/judge-rules.ts`: `FINDING_REMEDIATION_DEFINITION` の内容（三カテゴリの走査義務確認）
- `src/prompts/custom-reviewer-system.ts` / `code-review-system.ts` / `spec-review-system.ts` / `conformance-system.ts` / `regression-gate-system.ts`: `FINDING_REMEDIATION_DEFINITION` 注入確認
- `src/prompts/request-review-system.ts`: 注入なし確認（D2）
- `src/core/step/fixer-helpers.ts`: `buildFindingsBlock` の remediation 展開・全 site 指令・legacy 互換、`renderEvidenceReference`、`buildContinuationMessage` structured 分岐の evidence path
- `src/core/step/code-fixer.ts`: 3 経路（conformance / coordinator / 通常）への `renderEvidenceReference`、coordinator continuation の `findingsPaths: memberPaths` 渡し
- `src/core/step/spec-fixer.ts`: 2 経路（conformance / 通常）への `renderEvidenceReference`、fallback 変更なし
- `src/prompts/code-fixer-system.ts`: "最小限の機械的修正" 削除確認、"全 site" 定義、evidence path 入力記述、write-set 禁止条項維持
- `src/prompts/spec-fixer-system.ts`: Method 2・セキュリティ制約の "全 site" 記述
- `src/core/step/regression-gate.ts`: `buildLedgerEntry` の Sites 展開、`buildLedgerBlock` の全 site 検証指示
- `src/prompts/regression-gate-system.ts`: Method 全 site 検証・退行 finding への remediation 引き継ぎ指示
- `src/core/pipeline/findings-ledger.ts`: `findingFingerprint` / `computeLedgerRef` 変更なし
- `src/core/port/__tests__/remediation-parse.test.ts`: 全ケース（valid/invalid/null 正規化/requireRemediation/fail-closed/自 site 補完/backward compat/buildFindingsBlock/buildMessage 再現 fixture/renderEvidenceReference）
- `src/core/step/__tests__/fail-closed-drift-guard.test.ts`: fixable+no-remediation → `ok:false`、`findings:[]` → approved、fixable+remediation → `ok:true`、identity invariance
- `tests/unit/step/fixer-findings.test.ts`: spec-fixer / code-fixer の初回・継続・fallback 経路、evidence path 含有確認
- `src/prompts/__tests__/fragment-coverage.test.ts`: `FINDING_REMEDIATION_DEFINITION` に関するテスト不在を確認
- `specrunner/changes/finding-remediation-contract/verification-result.md`: build / typecheck / test / lint / changed-line-coverage すべて passed

## 検証できなかった項目

- `src/core/step/__tests__/fixer-reviewer.test.ts`（TC-T06-01 coordinator 2-member path）: verification 合格を根拠とした（直接読取なし）
- `src/core/pipeline/__tests__/findings-ledger.test.ts` / `src/core/step/__tests__/regression-gate-step.test.ts`: verification 合格を根拠とした
- managed runtime（`src/adapter/managed-agent/`）での tool schema 通過: verification の test suite に委ねた

## Summary

iter-1 で指摘された 2 件はいずれも対応されている。F-001（TC-T10-01 が `buildMessage` ではなく `buildFindingsBlock` を直接テストしていた）は `CodeFixerStep.buildMessage!` を呼ぶ end-to-end assertion に置き換えられた。F-002（走査義務の三カテゴリ欠落）は `FINDING_REMEDIATION_DEFINITION` の本文が正しく修正された。

今回指摘するのは 1 件のみ:

- **F-001（LOW）**: F-002 の remediation が求めた "TC-T04-04 を三カテゴリの phrase で更新する" という companion test が追加されていない。`fragment-coverage.test.ts` に `FINDING_REMEDIATION_DEFINITION` のコンテンツチェックが存在しないため、将来の誤削除を防ぐガードがない。

コア実装（型・schema・parse・fail-closed・プロンプト・ledger・identity）はすべて正確に実装されており、Acceptance Criteria を満たしている。
