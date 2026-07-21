# Spec: judge 完了契約の evidence counts と vacuous 判定

## Requirements

### Requirement: judge 完了契約 MUST carry required evidence counts

judge 系 step（`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` を使う step: spec-review / code-review / custom-reviewer / conformance / regression-gate）の `report_result` 完了報告は、`ok: true` のとき `evidence: { checked: number; skipped: number; unverified: number }` を MUST 含む。各カウントは非負の整数でなければならない。`evidence` の欠落または不正は完了として受理されず、parse 失敗となる。`ok: false`（自発的失敗）のときは `evidence` は不要とする。

request-review（`REQUEST_REVIEW_REPORT_TOOL`）と producer 系 step の完了契約は変更しない。

#### Scenario: judge report without evidence on ok=true is rejected

**Given** a judge step agent calls `report_result` with `{ ok: true, findings: [] }` and no `evidence` field
**When** `parseJudgeReportInput` processes the input
**Then** the parse result is `{ ok: false }` with `missingFields` containing `"evidence"`

#### Scenario: judge report with valid evidence is accepted

**Given** a judge step agent calls `report_result` with `{ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } }`
**When** `parseJudgeReportInput` processes the input
**Then** the parse result is `{ ok: true }` and `value.evidence` equals `{ checked: 3, skipped: 0, unverified: 0 }`

#### Scenario: negative or non-integer counts are rejected

**Given** a judge step agent calls `report_result` with `{ ok: true, findings: [], evidence: { checked: -1, skipped: 0, unverified: 0 } }`
**When** `parseJudgeReportInput` processes the input
**Then** the parse result is `{ ok: false }` with `missingFields` containing `"evidence"`

#### Scenario: voluntary failure does not require evidence

**Given** a judge step agent calls `report_result` with `{ ok: false, reason: "cannot verify" }`
**When** `parseJudgeReportInput` processes the input
**Then** the parse result is `{ ok: true }` (parse succeeds) and `value.ok` is `false`

#### Scenario: code-review and conformance inherit the requirement

**Given** a code-review or conformance agent calls `report_result` with `{ ok: true, findings: [] }` and no `evidence` field
**When** `parseCodeReviewReportInput` / `parseConformanceReportInput` processes the input
**Then** the parse result is `{ ok: false }` with `missingFields` containing `"evidence"`

#### Scenario: request-review is unaffected

**Given** a request-review agent calls `report_result` with `{ ok: true }` and no `evidence` field
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: true }` (evidence is not required for request-review)

---

### Requirement: deriveJudgeVerdict SHALL NOT approve a vacuous judge completion

`deriveJudgeVerdict` SHALL treat a judge completion whose `evidence.checked === 0` as indeterminate and return `"escalation"` regardless of the findings content. When `evidence.checked > 0`, the existing derivation (decision-needed → escalation, critical/high → needs-fix, else → approved) MUST be unchanged. When `evidence` is absent (`undefined`), the derivation MUST fall back to the existing behavior for backward compatibility.

`deriveConformanceVerdict` SHALL inherit this rule by forwarding `evidence` to `deriveJudgeVerdict`.

#### Scenario: zero checked with empty findings escalates

**Given** a judge step produces `report_result` with `ok: true`, `findings: []`, and `evidence: { checked: 0, skipped: 3, unverified: 0 }`
**When** the executor derives the verdict via `deriveJudgeVerdict([], true, { checked: 0, skipped: 3, unverified: 0 })`
**Then** the verdict is `"escalation"` (not `"approved"`)

#### Scenario: positive checked with empty findings approves

**Given** a judge step produces `report_result` with `ok: true`, `findings: []`, and `evidence: { checked: 5, skipped: 0, unverified: 0 }`
**When** the executor derives the verdict via `deriveJudgeVerdict([], true, { checked: 5, skipped: 0, unverified: 0 })`
**Then** the verdict is `"approved"`

#### Scenario: positive checked with blocking findings is unchanged

**Given** a judge step produces `report_result` with `ok: true`, a `critical`/`fixable` finding, and `evidence: { checked: 2, skipped: 0, unverified: 0 }`
**When** the executor derives the verdict
**Then** the verdict is `"needs-fix"` (blocking derivation unchanged)

#### Scenario: positive checked with decision-needed finding is unchanged

**Given** a judge step produces `report_result` with `ok: true`, a `decision-needed` finding, and `evidence: { checked: 2, skipped: 0, unverified: 0 }`
**When** the executor derives the verdict
**Then** the verdict is `"escalation"` (decision-needed derivation unchanged)

#### Scenario: conformance with zero checked escalates

**Given** a conformance step produces `report_result` with `ok: true`, `findings: []`, and `evidence: { checked: 0, skipped: 0, unverified: 0 }`
**When** the executor derives the verdict via `deriveConformanceVerdict([], true, { checked: 0, skipped: 0, unverified: 0 })`
**Then** the verdict is `"escalation"`

#### Scenario: absent evidence preserves legacy derivation

**Given** `deriveJudgeVerdict` is called with `([], true)` and no evidence argument
**When** the verdict is derived
**Then** the verdict is `"approved"` (legacy behavior for non-evidence callers)

---

### Requirement: regression-gate reports evidence but its verdict derivation is unchanged

The regression-gate step (which shares the `JUDGE_REPORT_TOOL` singleton) MUST report `evidence` on `ok: true`, but its verdict derivation via `deriveRegressionGateVerdict` MUST remain unchanged — the vacuous (`checked === 0`) rule MUST NOT be applied to it.

#### Scenario: regression-gate verdict derivation is unaffected by evidence

**Given** the regression-gate step produces `report_result` with `ok: true`, `findings: []`, and any `evidence` value
**When** the executor derives the verdict via `deriveRegressionGateVerdict`
**Then** the verdict is `"approved"` (the existing regression-gate derivation is unchanged; no vacuous escalation)

---

### Requirement: past records without evidence MUST remain readable and resumable

Existing persisted state and event records for judge steps that lack the `evidence` field MUST NOT be re-evaluated. Reading such records and resuming a job MUST work normally. The persisted `toolResult` schema MUST accept records with or without `evidence` (additive optional field).

#### Scenario: legacy judge record without evidence is read without error

**Given** a `JobState` containing a judge `StepRun` whose `outcome.toolResult` has `findings` but no `evidence` field
**When** consumers read the record (e.g. `collectFindingsLedger`, `getLatestStepResult`)
**Then** the read succeeds and the persisted verdict is not re-derived

#### Scenario: resume with legacy records proceeds

**Given** a job whose prior judge steps were persisted before this change (no `evidence` in any `toolResult`)
**When** the job is resumed
**Then** resume proceeds normally without requiring `evidence` on the historical records

---

### Requirement: judge prompts SHALL instruct evidence reporting from a single source

Each judge prompt that reports evidence (code-review / spec-review / custom-reviewer / conformance / regression-gate) SHALL include the shared `EVIDENCE_COUNTS_DEFINITION` fragment in its Completion section. The fragment MUST describe the `checked` / `skipped` / `unverified` fields and MUST state that `checked === 0` is treated as indeterminate, consistent with `EVIDENCE_DISCIPLINE`. The request-review prompt MUST NOT include this fragment.

#### Scenario: five judge prompts contain the evidence-counts fragment

**Given** the rendered system prompts for code-review, spec-review, custom-reviewer, conformance, and regression-gate
**When** a drift-guard test asserts fragment inclusion
**Then** each prompt contains `EVIDENCE_COUNTS_DEFINITION`

#### Scenario: the fragment describes the required fields and the vacuous rule

**Given** the `EVIDENCE_COUNTS_DEFINITION` constant
**When** its content is inspected
**Then** it mentions `evidence`, `checked`, `skipped`, `unverified`, and states that `checked` of zero is indeterminate

#### Scenario: request-review prompt omits the fragment

**Given** the rendered request-review system prompt
**When** a drift-guard test inspects it
**Then** it does not contain `EVIDENCE_COUNTS_DEFINITION`
