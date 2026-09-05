# Code Review — finding-remediation-contract — iter 1

## Scope

Branch: `feat/finding-remediation-contract-d394de74`  
Diff stat: 38 files changed, 4652 insertions, 74 deletions

## Evidence Summary

| Category | Checked | Notes |
|---|---|---|
| Kernel type / schema | ✓ | `FindingRemediation`, `RemediationSite` added to `report-result.ts`; `Finding.remediation?` additive |
| Tool schema (`report-tool.ts`) | ✓ | `remediationSchema` + `remediationSiteSchema` defined; injected into `findingSchema` / `conformanceFindingSchema` as `optional`; `REQUEST_REVIEW_REPORT_TOOL` description unchanged |
| Parse layer (`report-result.ts`) | ✓ | `parseRemediation`, extended `parseFindings(raw, strict, requireRemediation)`, self-site normalization (D4), dedup, fail-closed path wired into `parseJudgeReportInput` |
| Reviewer prompts | ✓ | `FINDING_REMEDIATION_DEFINITION` in `judge-rules.ts`; injected into 5 reviewer prompts (custom-reviewer, code-review, spec-review, conformance, regression-gate); absent in `request-review-system.ts` (D2) |
| `buildFindingsBlock` / `renderEvidenceReference` | ✓ | Invariant / Sites / Approach emitted per finding; all-site directive added once when any remediation present; legacy output unchanged |
| code-fixer paths (conformance / coordinator / normal) | ✓ | All 3 structured paths now include `renderEvidenceReference`; coordinator continuation passes `findingsPaths: memberPaths` |
| spec-fixer paths (conformance / normal) | ✓ | Both structured paths include `renderEvidenceReference`; fallback unchanged |
| code-fixer-system prompt | ✓ | "最小限の機械的修正" removed; "全 site" definition and evidence path input description added; write-set prohibition retained |
| spec-fixer-system prompt | ✓ | "全 site で成立させる最小の変更" in Method 2; "finding が名指しした不変条件を全 site で成立させる最小の修正のみ" in security constraint |
| regression-gate ledger | ✓ | `buildLedgerEntry` emits Invariant + Sites for remediation-carrying entries; `buildLedgerBlock` adds sites verification instruction when any site present |
| regression-gate prompt | ✓ | Method section instructs full-site verification; finding JSON example includes `remediation` with ledger inheritance |
| Identity invariance | ✓ | `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` unchanged |
| Backward compat | ✓ | Non-strict `parseFindings()` accepts legacy findings without remediation; silent-drop for malformed remediation in non-strict mode |
| Fail-closed drift guard | ✓ | `fail-closed-drift-guard.test.ts`: fixable+no-remediation → `ok:false`, not approved; `findings:[]` → approved (happy path preserved) |
| Verification result | ✓ | All phases green: build / typecheck / test / lint / changed-line-coverage |

## Findings

### F-001 · LOW · fixable

**File**: `src/core/port/__tests__/remediation-parse.test.ts`  
**Line**: 495–521  
**Title**: TC-T10-01 reproduction fixture tests `buildFindingsBlock` rather than `CodeFixerStep.buildMessage`

**Rationale**: `tasks.md §T-10` specifies "code-fixer の `buildMessage` 出力に両 site が同時に現れることを assertion で検証する". The reproduction fixture at line 495 calls `buildFindingsBlock([f], "code-review")` directly and asserts on that output, which is the block that eventually gets composed into `buildMessage`. While functionally equivalent — `buildFindingsBlock` is the only source of sites content in `buildMessage` — the test bypasses the full composition path. A regression in the `renderEvidenceReference` call, the wrapping template, or the finding-selection step (`selectFixerTargetFindings`) in `buildMessage` would not be caught by this assertion.

The tests in `tests/unit/step/fixer-findings.test.ts` (TC-FF-C-001 etc.) do test `buildMessage` end-to-end but use generic fixtures without the specific two-site cross-boundary scenario required by T-10.

**Resolution**: fixable — add a companion assertion in `tests/unit/step/fixer-findings.test.ts` (or the remediation parse test) that calls `CodeFixerStep.buildMessage` with the cross-boundary fixture state and asserts both site strings appear in the result. The existing `buildFindingsBlock` test can remain as a unit-level guard.

---

### F-002 · LOW · fixable

**File**: `src/prompts/judge-rules.ts`  
**Line**: 129  
**Title**: `FINDING_REMEDIATION_DEFINITION` scanning obligation omits "同じ検査を行う別レイヤ" specified in design D8

**Rationale**: Design D8 prescribes the scanning obligation as "同じ不変条件を共有する隣接関数・並列経路・**同じ検査を行う別レイヤ**を走査し"。The actual fragment (line 129) stops at "隣接関数・並列経路" and omits the third category. TC-T04-04 only checks for the first two categories, so tests pass, but the fragment is narrower than D8's intent. The omission means reviewers are not explicitly instructed to scan across abstraction layers (e.g., a per-item loop and its batch variant) when they share the same invariant — which is precisely the pattern observed in the motivating `exclusion-aware-publish-prediction` evidence (`commit-push.ts` vs `parallel-review-round.ts`).

**Resolution**: fixable — append "・同じ検査を行う別レイヤ" to the scanning obligation line in `FINDING_REMEDIATION_DEFINITION`, and update TC-T04-04 to assert on the three-category phrase.

---

## Observations

### O-001 · LOW

**File**: `src/core/port/report-result.ts`  
**Line**: 158–162  
**Title**: `parseRemediation` validates non-empty (trimmed) but stores original whitespace

`parseRemediation` checks `o["invariant"].trim() === ""` and `o["approach"].trim() === ""` to reject empty strings, but stores the original (untrimmed) value in the returned `FindingRemediation`. A reviewer supplying `"  write-scope must precede filter  "` would pass validation and appear in the fixer prompt with leading/trailing spaces. This is cosmetically minor and has no semantic impact on verdict routing or identity.

---

### O-002 · LOW

**File**: `src/core/step/fixer-helpers.ts`  
**Line**: 172–181  
**Title**: Non-structured fallback in `buildContinuationMessage` ignores `findingsPaths` when `findings` is absent

When the coordinator continuation path is active but `aggregatedFindings` is empty (`findings: null`), `buildContinuationMessage` falls through to the non-structured template that emits only `opts.findingsPath` (first member). The `findingsPaths` array containing all member paths is computed but unused. Design D6 notes "現状 fallback は先頭 1 件しか出していない" and T-05 explicitly says "fallback 分岐は現状維持", so this is intentional. Recorded as an observation for future consideration if coordinator-with-no-aggregated-findings continuation becomes a real operational case.

---

## 検証した項目

- `src/kernel/report-result.ts`: `FindingRemediation`, `RemediationSite` 型定義、`Finding.remediation?` フィールド追加
- `src/core/step/report-tool.ts`: `remediationSchema` / `remediationSiteSchema` 定義、`findingSchema` / `conformanceFindingSchema` へのオプショナル注入、`REQUEST_REVIEW_REPORT_TOOL` description の変更なし確認
- `src/core/port/report-result.ts`: `parseRemediation`、`parseFindings` の第 3 引数拡張、fail-closed 経路、自 site 正規化（D4）、dedup ロジック、`parseJudgeReportInput` の `requireRemediation=true` 委譲、`parseRequestReviewReportInput` の `requireRemediation=false` 維持
- `src/prompts/judge-rules.ts`: `FINDING_REMEDIATION_DEFINITION` の内容（形式定義・走査義務・実例）
- `src/prompts/custom-reviewer-system.ts` / `code-review-system.ts` / `spec-review-system.ts` / `conformance-system.ts` / `regression-gate-system.ts`: `FINDING_REMEDIATION_DEFINITION` 注入確認（Grep + Read）
- `src/prompts/request-review-system.ts`: `FINDING_REMEDIATION_DEFINITION` が注入されていないこと確認（D2）
- `src/core/step/fixer-helpers.ts`: `buildFindingsBlock` の remediation 展開・全 site 指令・legacy 互換、`renderEvidenceReference` の空配列→空文字、`buildContinuationMessage` の structured 分岐への evidence path 挿入、`findingsPaths` フォールバック
- `src/core/step/code-fixer.ts`: conformance / coordinator / 通常 の 3 structured 経路への `renderEvidenceReference` 追加、coordinator continuation の `findingsPaths: memberPaths` 渡し
- `src/core/step/spec-fixer.ts`: conformance / 通常 の 2 structured 経路への `renderEvidenceReference` 追加、fallback 変更なし
- `src/prompts/code-fixer-system.ts`: "最小限の機械的修正" 削除確認、"全 site" 定義・evidence path 入力記述追加、write-set 禁止条項維持
- `src/prompts/spec-fixer-system.ts`: Method 2「全 site で成立させる最小の変更」、セキュリティ制約の"全 site"記述
- `src/core/step/regression-gate.ts`: `buildLedgerEntry` の Sites 展開、`buildLedgerBlock` の全 site 検証指示
- `src/prompts/regression-gate-system.ts`: Method の全 site 検証指示・退行 finding への remediation 引き継ぎ指示
- `src/core/pipeline/findings-ledger.ts`: `findingFingerprint` / `computeLedgerRef` の変更なし確認（remediation は identity に不含）
- `src/core/port/__tests__/remediation-parse.test.ts`: 全ケース（valid/invalid/null 正規化/requireRemediation/fail-closed/自 site 補完/backward compat/buildFindingsBlock/renderEvidenceReference）
- `src/core/step/__tests__/fail-closed-drift-guard.test.ts`: fixable+no-remediation → `ok:false`、`findings:[]` → approved、fixable+remediation → `ok:true`、identity invariance
- `tests/unit/step/fixer-findings.test.ts`: spec-fixer / code-fixer の初回・継続・fallback の各経路、evidence path 含有確認
- `specrunner/changes/finding-remediation-contract/verification-result.md`: build / typecheck / test / lint / changed-line-coverage すべて passed

## 検証できなかった項目

- `src/core/step/__tests__/fixer-reviewer.test.ts` の coordinator 2-member path テスト（TC-T06-01）: ファイルを直接 Read せず verification 合格を根拠とした（テストが実際に存在し coordinator paths をカバーしていることを個別確認していない）
- `src/core/pipeline/__tests__/findings-ledger.test.ts` / `src/core/step/__tests__/regression-gate-step.test.ts`: 内容を直接 Read せず verification 合格を根拠とした
- managed runtime（`src/adapter/managed-agent/`）での tool schema 通過確認: `toJSONSchema` / `toOpenAIStrictSchema` の実行は verification の test suite に委ねた

## Summary

The implementation correctly delivers all acceptance criteria. The remediation contract is wired end-to-end: kernel types → tool schema → parse validation (fail-closed) → reviewer prompt injection → fixer prompt expansion → regression-gate ledger. Identity (`findingFingerprint` / `computeLedgerRef` / `computeFindingKey`) is unchanged, and legacy persisted findings without remediation load cleanly in non-strict mode.

Two low-severity fixable findings are raised:
- F-001: the T-10 reproduction fixture tests the helper function rather than the composed `buildMessage` output.
- F-002: the scanning obligation fragment is one category short of design D8's specification.

Both are straightforward to address without design changes.
