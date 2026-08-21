# Conformance Result — finding-provenance-carry — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

- **Normative sources**: request.md (acceptance criteria), spec.md (Requirements + Scenarios)
- **Plan context** (non-gate): design.md (D1–D6), tasks.md (T-01–T-05)
- **Implementation diff scope** (`git diff main...HEAD --stat`): 9 source files modified, 2 test files added/extended

---

## 検証した項目

### spec.md — Requirement: The regression-gate ledger SHALL carry a machine-assigned provenance ref for every entry

**Scenario: Ledger block shows a provenance ref per entry**

- `regression-gate.ts`: `buildLedgerEntry()` calls `computeLedgerRef(finding)` and appends
  `- **Provenance Ref**: \`${ref}\`` to every ledger entry rendered in `buildMessage()`. ✅
- Test: `regression-gate-step.test.ts` TC-001 — asserts `msg.toContain(expectedRef)` using the
  actual `computeLedgerRef` value for a non-empty ledger. ✅

**Scenario: The same originating fingerprint yields the same ref**

- `findings-ledger.ts` `computeLedgerRef()` = `SHA-256(findingFingerprint(f)).slice(0,8)` —
  purely a function of `file|line|title`, deterministic and position-independent. ✅
- Test: `wontfix.test.ts` TC-010 — equal fingerprints yield equal refs; different titles yield
  different refs; rationale-only change does not affect the ref. ✅

---

### spec.md — Requirement: The regression-gate SHALL echo the provenance ref on each re-reported finding

**Scenario: A re-reported regression carries its ledger ref**

- `src/kernel/report-result.ts`: `Finding` type gains optional `ledgerRef?: string` with
  backward-compat doc comment. ✅
- `src/core/step/report-tool.ts`: `findingSchema` gains `ledgerRef: optional(string())`.
  `JUDGE_REPORT_TOOL` singleton object identity is unchanged; `conformanceFindingSchema` also
  gains the field additively. ✅
- `src/core/port/report-result.ts` `parseFindings()`: captures `ledgerRef` when a string;
  absent or non-string values are silently ignored (not added to `missingFields`). ✅
- System prompt (`regression-gate-system.ts`): Method §3 instructs gate to copy the
  Provenance Ref verbatim into `ledgerRef`; Completion section repeats the instruction
  with an explicit JSON example and emphasis on verbatim copy. ✅
- Test: `wontfix.test.ts` TC-011 — `parseFindings` round-trips a finding with `ledgerRef`. ✅

**Scenario: Non-gate steps are unaffected by the additive field**

- `ledgerRef` is optional across all schemas; absent value treated identically to pre-change. ✅
- Test: `wontfix.test.ts` TC-012 — absent, numeric, and null `ledgerRef` values parse without
  error; `finding.ledgerRef` is `undefined` in all three cases. ✅

---

### spec.md — Requirement: `--wontfix` SHALL resolve a gate finding to its origin via provenance ref, not regenerated prose

**Scenario: Paraphrased-title regression resolves successfully**

- `src/core/decision/wontfix.ts` `resolveWontfixDispositions()`:
  - Gate findings still indexed 1-based from `getLatestJudgeFindings(state, REGRESSION_GATE_STEP_NAME)`.
  - Provenance index built from `buildProvenanceIndex(reviewerChain, state)` (spec-review + impl chain).
  - Resolution reads `gateFinding.ledgerRef` and looks it up in the index — NOT `findingFingerprint(gateFinding)`. ✅
- Test: `wontfix.test.ts` TC-005 — gate finding with paraphrased Japanese title but correct
  `ledgerRef` resolves successfully; `rec.step === "code-review"`, snapshot captures the
  source finding's un-paraphrased title. ✅

---

### spec.md — Requirement: `--wontfix` provenance resolution SHALL cover every ledger-contributing step, including spec-review

**Scenario: spec-review-origin finding is disposed against its origin step**

- `findings-ledger.ts` `buildProvenanceIndex()`: walks `STEP_NAMES.SPEC_REVIEW` StepRuns
  first, then all impl reviewer chain StepRuns. Produces `Map<ref, Map<stepName, Finding>>`
  covering both source sets. ✅
- Test: `wontfix.test.ts` TC-014 (new) — finding only in spec-review → index entry with
  `stepName === STEP_NAMES.SPEC_REVIEW`. ✅
- Test: `wontfix.test.ts` TC-006 (new) — spec-review-origin gate finding (paraphrased title)
  resolves to `step: STEP_NAMES.SPEC_REVIEW`, snapshot captures the original title. ✅
- Test: `wontfix.test.ts` TC-015 (new) — shared fingerprint between code-review and
  spec-review maps to exactly 2 step entries in the index. ✅

---

### spec.md — Requirement: Unresolvable provenance SHALL fail all-or-nothing with exit code 2

**Scenario: Missing or unknown ref rejects the whole operation**

- `wontfix.ts`: absent `ledgerRef` → `{ ok: false, error: "…no provenance ref (ledgerRef absent)…" }`.
  Non-matching ref → `{ ok: false, error: "…not found in any reviewer chain step…" }`.
  Both return before writing any records. ✅
- Test: `wontfix.test.ts` TC-007 (new) — (a) absent ref → `ok: false`, message matches
  `/no provenance ref|ledgerRef absent/i`; (b) unresolvable ref → `ok: false`, message matches
  `/not found in any reviewer chain step/i`; (c) one valid + one absent ref → `ok: false`,
  zero records (all-or-nothing). ✅
- Existing invalid-index / non-integer / duplicate / empty-element / missing-reason /
  gate-not-run branches are all preserved. Tests TC-006/TC-008/TC-007(orig)/TC-014(orig)/
  TC-017/TC-018 all pass. ✅

---

### spec.md — Requirement: The persisted decisions format SHALL remain backward compatible

**Scenario: Disposed finding is excluded from the regression-gate ledger**

- `collectSpecReviewLedger()` now calls `filterUndecidedFindings(STEP_NAMES.SPEC_REVIEW, fixable, state.decisions)` per StepRun, mirroring the per-run exclusion already in `collectFindingsLedger()`. ✅
- Test: `wontfix.test.ts` TC-008 (new) — (a) disposed code-review finding absent from
  `collectFindingsLedger`; (b) disposed spec-review finding absent from
  `collectSpecReviewLedger`; (c) disposed spec-review finding absent from
  `computeRegressionLedger`. ✅
- Confirmed additionally in `regression-gate-false-loop.test.ts` TC-011. ✅

**Scenario: Disposed finding does not trigger the approved+fixable fixer route**

- `DispositionDecisionRecord` shape and persisted `decisions` format: verified unchanged
  against `src/state/schema/types.ts` (fields: `kind`, `id`, `step`, `findingKey`, `finding`,
  `disposition`, `reason`, `decidedAt`, `source` — no new fields). ✅
- Machine-respect filters key on `step` + `findingKey`, produced identically by the new path. ✅
- Test: `wontfix.test.ts` TC-009 (new) — approved+fixable guard returns `false` when the only
  fixable finding has a matching `DispositionDecisionRecord`. ✅
- Test: `wontfix.test.ts` TC-019 (new) — record produced via ref-based resolution has exactly
  the expected set of fields, no new required fields. ✅
- Test: `wontfix.test.ts` TC-020 (new) — disposed finding absent from
  `collectParallelFixerFindings`. ✅

---

### request.md Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| gate title-paraphrase `--wontfix` succeeds; origin step recorded | ✅ TC-005 / TC-003 (updated) |
| spec-review-origin `--wontfix` succeeds | ✅ TC-006 (new) |
| invalid index / unresolvable ref → all-or-nothing exit 2 | ✅ TC-007 (new) / TC-018 (new) |
| machine-respect still works under new resolution | ✅ TC-008 / TC-009 / TC-020 (new) |
| only wontfix.test.ts "title 照合" cases updated; other tests untouched | ✅ verification-result: all tests green |
| `typecheck && test` green | ✅ verification-result: all phases passed |

---

## 検証できなかった項目

None. All spec scenarios and acceptance criteria were directly verified against the implementation
and confirmed by the passing verification result (build, typecheck, test, lint all green).

---

## Plan Divergences (non-blocking notes)

- **`conformanceFindingSchema` gets `ledgerRef`**: tasks T-01 said "if needed"; implementation
  added the field. Additive only, consistent with D5. No spec violation.
- **`JUDGE_REPORT_TOOL` description updated to mention `ledgerRef`**: adds a guidance sentence
  instructing non-gate steps to leave the field absent. Does not change tool object identity
  (confirmed by TC-013 in `regression-gate-step.test.ts`). No spec violation.
- **`buildProvenanceIndex` does not call `filterUndecidedFindings`**: the index is a superset
  covering all source findings including already-disposed ones. Since `computeRegressionLedger`
  filters decided findings before building the gate's user message, the gate never reports
  disposed findings and the operator cannot select them. Resolution still fails-closed for
  any unresolvable ref. No spec violation.

---

## Findings 詳細

None. No normative violations found.
