# Tasks: regression-gate finding provenance carry

Implementation order: T-01 → T-02 → T-03 → T-04 → T-05 (tests may be written
alongside their production task but the suite is pinned in T-05).

## T-01: Add an additive provenance-ref field to the finding schema and parser

- [x] Add an optional provenance-ref field (e.g. `ledgerRef?: string`) to the `Finding` interface in `src/kernel/report-result.ts`, with a doc comment stating it is additive/backward-compatible (absent = pre-existing behavior) and is the machine-assigned regression-gate provenance token.
- [x] Add the same optional field to the shared `findingSchema` in `src/core/step/report-tool.ts` (used by `JUDGE_REPORT_TOOL`) as `optional(string())`. Do NOT change the `JUDGE_REPORT_TOOL` object identity, and do NOT add the echo instruction to the shared tool description (that is scoped to the gate prompt in T-03).
- [x] Also add the field to `conformanceFindingSchema` if needed to keep the schemas consistent, but only additively (optional).
- [x] Teach `parseFindings` in `src/core/port/report-result.ts` to capture the ref when present and a string (mirroring the existing `fixTarget` / `origin` / `fileMissing` capture), so it survives parse/persist. Non-string/absent values are silently ignored (not added to `missingFields`).

**Acceptance Criteria**:
- The `Finding` type exposes the new optional ref field; TypeScript compiles (`typecheck` green).
- `parseFindings` round-trips a finding that includes the ref (the parsed finding retains the ref); a finding without the ref parses identically to before.
- `JUDGE_REPORT_TOOL` remains the same singleton object (identity unchanged); no change to `isJudgeStep` wiring.
- No existing consumer of `Finding` requires the new field (it is optional everywhere).

## T-02: Derive the provenance ref and build the all-origins provenance index

- [x] In `src/core/pipeline/findings-ledger.ts`, add a pure `computeLedgerRef(finding: Finding): string` that derives a deterministic, collision-resistant ref from the finding's stable fingerprint (`findingFingerprint`, i.e. `file|line|title`). It MUST be positionally stable (independent of ledger membership/order — see design D3). Two findings with the same fingerprint yield the same ref.
- [x] Add a pure helper that builds the wontfix provenance index over ALL ledger-contributing steps: walk spec-review StepRuns (as `collectSpecReviewLedger` sources do) AND the impl reviewer chain StepRuns (as `collectFindingsLedger` sources do), collecting `collectFixableFindings` per run, and produce `Map<ref, Map<stepName, Finding>>` (first-occurrence-wins per step, mirroring the current step-level dedup). Signature takes `reviewerChain: string[]` and `state` (do not derive the chain internally — avoid the documented import cycle).
- [x] Update `collectSpecReviewLedger` to call `filterUndecidedFindings` per StepRun (mirroring the per-run exclusion already applied in `collectFindingsLedger` at line 55). Without this, a spec-review-origin finding disposed via wontfix (step="spec-review") would still appear in `computeRegressionLedger` → merged ledger, causing TC-008 to fail for spec-review-origin cases.
- [x] Do NOT modify `computeFindingKey`, `findingFingerprint`, or the ledger identity formula (scope-out). `computeLedgerRef` is derived FROM the existing fingerprint, not a redesign of it.

**Acceptance Criteria**:
- `computeLedgerRef` is deterministic and equal for equal fingerprints; unit-tested.
- The provenance index includes spec-review as a source step (verified by a finding that only exists on spec-review resolving to `step: spec-review`).
- The index yields one `(step, finding)` entry per source step for a shared fingerprint (matches TC-004 semantics).
- `computeRegressionLedger` behavior is unchanged; existing `findings-ledger` tests remain green without modification.
- A spec-review-origin finding disposed with `step: spec-review` is absent from `collectSpecReviewLedger` output (verifying the `filterUndecidedFindings` addition).

## T-03: Surface the ref in the regression-gate ledger block and instruct verbatim echo

- [x] In `src/core/step/regression-gate.ts`, update `buildLedgerBlock` (or the per-entry rendering it uses) so each ledger entry displays its `computeLedgerRef` value alongside the existing file / line / title. Keep the existing title/file text in the message so out-of-scope `regression-gate-step.test.ts` assertions (message contains titles/files) stay green.
- [x] Update the regression-gate prompt (`src/prompts/regression-gate-system.ts` and/or the `buildMessage` instructions in `regression-gate.ts`) to instruct the gate to echo each ledger entry's provenance ref verbatim into the corresponding reported finding's ref field when reporting a regression. This instruction is scoped to the gate, not the shared tool description.
- [x] Ensure the gate still reports the original file / line / title from the ledger (required for `verifyFindingRefs` ref existence checks in `step-completion.ts`).

**Acceptance Criteria**:
- `buildMessage` output for a non-empty ledger contains each entry's provenance ref AND its title/file.
- Existing `src/core/step/__tests__/regression-gate-step.test.ts` assertions (titles/files present, empty-ledger notice, result path) pass unchanged.
- The empty-ledger path is unchanged (still emits the "empty" notice; no ref block).

## T-04: Resolve `--wontfix` via provenance ref against the all-origins index

- [x] Rework `resolveWontfixDispositions` in `src/core/decision/wontfix.ts` to:
  - Keep indexing the latest regression-gate typed findings and all existing input validation (empty/undefined wontfix, required reason, non-integer, duplicate, empty element, out-of-range, gate-not-run) unchanged.
  - Replace the impl-chain-only fingerprint index with the T-02 all-origins provenance index (spec-review + impl reviewer chain), built from `deriveImplReviewerChain(state)` plus spec-review.
  - Resolve each selected gate finding by its carried provenance ref (the echoed field), NOT by recomputing `findingFingerprint` from the gate finding's title. If the gate finding has no ref, or the ref does not resolve to any ledger-contributing step, fail all-or-nothing with a clear error (updated message, e.g. references the unresolved provenance ref) and zero records.
  - For each resolved `(stepName, actualFinding)`, build the `DispositionDecisionRecord` exactly as today: `findingKey = computeFindingKey(stepName, actualFinding)`, unchanged record shape/fields (`kind`, `id`, `step`, `findingKey`, `finding` snapshot, `disposition`, `reason`, `decidedAt`, `source`).
- [x] Confirm the DispositionDecisionRecord shape and the persisted `decisions` array format are unchanged (no new required fields on the record).

**Acceptance Criteria**:
- A gate finding whose ref matches a source finding resolves to a DispositionDecisionRecord with the correct origin `step` and a `findingKey` computed from the source step's actual finding — even when the gate finding's title differs from the source title.
- A spec-review-origin gate finding resolves to `step: spec-review`.
- A selected gate finding with absent or unresolvable ref → `{ ok: false }`, zero records (all-or-nothing), preserving exit 2 behavior.
- Existing invalid-index / missing-reason / gate-not-run branches behave exactly as before.
- `typecheck` green.

## T-05: Pin the new contract in tests; keep out-of-scope tests untouched

- [x] In `tests/unit/core/decision/wontfix.test.ts`, add/adjust cases so that gate findings carry the provenance ref matching their source finding's `computeLedgerRef`. Update ONLY the cases that pin the old "title 文字列照合" contract to the new ref-based contract (allowed by the acceptance criteria). Leave input-validation cases (range, integer, duplicate, empty element, reason, gate-not-run, no-op) behaviorally intact.
- [x] Add a test reproducing the observed failure form: the gate re-reports a finding with a **paraphrased title** but the correct provenance ref; `--wontfix` succeeds and records the correct origin step (fixes the observed `not found in any reviewer chain step` exit 2).
- [x] Add a test: a **spec-review-origin** finding (present only on spec-review, echoed by the gate with its ref) is disposed successfully with `step: spec-review`.
- [x] Add a test: a selected gate finding with **absent/unresolvable ref** fails all-or-nothing (ok=false, zero records) — the new form of the exit-2 guarantee.
- [x] Add/confirm machine-respect coverage for the new resolution path: a DispositionDecisionRecord produced via the ref path is (a) excluded from the regression-gate ledger via `filterUndecidedFindings` in both `collectFindingsLedger` (impl chain) AND `collectSpecReviewLedger` (spec-review) — the TC-008 ledger-exclusion test MUST include a spec-review-origin DispositionDecisionRecord (step="spec-review") to verify the `collectSpecReviewLedger` path; (b) excluded from fixer input (`collectParallelFixerFindings`); and (c) does not trigger the approved+fixable reviewer-chain guard (`buildReviewerChainTransitions` / `buildParallelReviewerTransitions`). Reuse existing helpers; these keys are `step` + `findingKey`, unchanged.
- [x] Run the full suite; ensure all tests outside `wontfix.test.ts` remain green without modification.

**Acceptance Criteria**:
- Paraphrased-title `--wontfix` test passes and asserts the recorded origin `step`.
- spec-review-origin `--wontfix` test passes with `step: spec-review`.
- Absent/unresolvable-ref test asserts `ok: false` and zero records.
- Machine-respect tests (ledger exclusion / fixer-input exclusion / approved+fixable guard) pass under the new resolution; the ledger-exclusion test (TC-008) covers both impl-chain-origin and spec-review-origin DispositionDecisionRecords.
- Only `wontfix.test.ts` "title 文字列照合" pin cases are modified; every other existing test is unchanged and green.
- `typecheck && test` is green.
