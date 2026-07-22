# Spec: request-review 完了契約の evidence counts と vacuous 判定

## Requirements

### Requirement: request-review 完了契約 MUST carry required evidence counts

request-review（`REQUEST_REVIEW_REPORT_TOOL` を使う step）の完了報告は、`ok: true` のとき `evidence: { checked: number; skipped: number; unverified: number }` を MUST 含む。各カウントは非負の整数でなければならない。`evidence` の欠落または不正（負値・非整数・非オブジェクト）は完了として受理されず、`parseRequestReviewReportInput` は `{ ok: false }` と `missingFields` に `"evidence"` を返す。`ok: false`（自発的失敗）のときは `evidence` は不要とする。

findings は request-review では従来どおり任意のままとする（`ok: true` で findings 欠落は指摘なしとして扱う）。evidence の必須化は findings の任意性とは独立に適用する。

producer 系 step および judge 系 step の完了契約は本変更で変更しない。

#### Scenario: request-review report without evidence on ok=true is rejected

**Given** a request-review agent calls `report_result` with `{ ok: true, findings: [] }` and no `evidence` field
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: false }` with `missingFields` containing `"evidence"`

#### Scenario: request-review report with valid evidence is accepted

**Given** a request-review agent calls `report_result` with `{ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } }`
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: true }` and `value.evidence` equals `{ checked: 3, skipped: 0, unverified: 0 }`

#### Scenario: negative or non-integer counts are rejected

**Given** a request-review agent calls `report_result` with `{ ok: true, evidence: { checked: -1, skipped: 0, unverified: 0 } }`
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: false }` with `missingFields` containing `"evidence"`

#### Scenario: voluntary failure does not require evidence

**Given** a request-review agent calls `report_result` with `{ ok: false, reason: "cannot verify" }`
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: true }` (parse succeeds) and `value.ok` is `false`

---

### Requirement: deriveRequestReviewVerdict SHALL NOT approve a vacuous request-review completion

`deriveRequestReviewVerdict` SHALL treat a request-review completion whose `evidence.checked === 0` as indeterminate and return `"needs-discussion"` regardless of the findings content. When `evidence.checked > 0`, the existing derivation (`!ok` → needs-discussion, blocking finding → needs-discussion, else → approve) MUST be unchanged. When `evidence` is absent (`undefined`), the derivation MUST fall back to the existing behavior for backward compatibility.

The verdict return type MUST remain `"approve" | "needs-discussion"` — no new verdict value is introduced.

#### Scenario: zero checked with empty findings does not approve

**Given** a request-review step produces `report_result` with `ok: true`, `findings: []`, and `evidence: { checked: 0, skipped: 3, unverified: 0 }`
**When** the executor derives the verdict via `deriveRequestReviewVerdict([], true, { checked: 0, skipped: 3, unverified: 0 })`
**Then** the verdict is `"needs-discussion"` (not `"approve"`)

#### Scenario: positive checked with empty findings approves

**Given** a request-review step produces `report_result` with `ok: true`, `findings: []`, and `evidence: { checked: 5, skipped: 0, unverified: 0 }`
**When** the executor derives the verdict via `deriveRequestReviewVerdict([], true, { checked: 5, skipped: 0, unverified: 0 })`
**Then** the verdict is `"approve"`

#### Scenario: positive checked with blocking finding is unchanged

**Given** a request-review step produces `report_result` with `ok: true`, a `high`/`fixable` finding, and `evidence: { checked: 2, skipped: 0, unverified: 0 }`
**When** the executor derives the verdict
**Then** the verdict is `"needs-discussion"` (blocking derivation unchanged)

#### Scenario: absent evidence preserves legacy derivation

**Given** `deriveRequestReviewVerdict` is called with `([], true)` and no evidence argument
**When** the verdict is derived
**Then** the verdict is `"approve"` (legacy behavior for non-evidence callers)

---

### Requirement: past request-review records without evidence MUST remain readable and resumable

Existing persisted state and event records for request-review steps that lack the `evidence` field MUST NOT be re-evaluated. Reading such records and resuming a job MUST work normally. The persisted `toolResult` schema MUST accept records with or without `evidence` (additive optional field).

#### Scenario: legacy request-review record without evidence is read without error

**Given** a `JobState` containing a request-review `StepRun` whose `outcome.toolResult` has `findings` but no `evidence` field
**When** consumers read the record (e.g. `getLatestStepResult`, findings-ledger consumers)
**Then** the read succeeds and the persisted verdict is not re-derived

#### Scenario: resume with legacy request-review records proceeds

**Given** a job whose prior request-review step was persisted before this change (no `evidence` in its `toolResult`)
**When** the job is resumed
**Then** resume proceeds normally without requiring `evidence` on the historical record

---

### Requirement: request-review prompt SHALL instruct evidence reporting from a single source

The request-review system prompt SHALL include the shared `EVIDENCE_COUNTS_DEFINITION` fragment (from `src/prompts/judge-rules.ts`) in its Completion / Output section. The fragment MUST NOT be duplicated as inline text — the prompt MUST reference the single-source constant. The fragment content (`checked` / `skipped` / `unverified` fields and the `checked === 0` indeterminate rule) MUST remain identical to the one injected into the judge prompts.

#### Scenario: request-review prompt contains the evidence-counts fragment

**Given** the rendered `REQUEST_REVIEW_SYSTEM_PROMPT`
**When** a drift-guard test asserts fragment inclusion
**Then** the prompt contains the exact string of `EVIDENCE_COUNTS_DEFINITION` exported from `judge-rules.ts`

#### Scenario: the injected instruction is not a duplicated literal

**Given** the request-review prompt source references `${EVIDENCE_COUNTS_DEFINITION}`
**When** the fragment content changes at its single source
**Then** the request-review prompt output changes accordingly (no independent copy exists)
