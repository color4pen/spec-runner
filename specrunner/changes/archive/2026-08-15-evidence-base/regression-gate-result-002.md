# Regression Gate Result — Iteration 2

## Verification Summary

All 12 ledger findings verified against current branch code. No regressions found.

## Finding-by-Finding Verification

### [LOW] Finding 1 — Req 4 deferral list missing captureHeadSha→null path (spec.md)
**Status: FIXED**
`spec.md` Requirement 4 now includes `#### Scenario: Absent HEAD OID defers` (lines 107–112), covering the `captureHeadSha` returning null → `strategy-deferred` path.

### [LOW] Finding 2 — Archive floor fail-closed (absent Evidence Base ref) has no spec scenario (spec.md)
**Status: FIXED**
`spec.md` now contains `#### Scenario: Archive floor is fail-closed when the Evidence Base reference is absent` (lines 64–70) inside Requirement 3 (chronology-based contamination removal).

### [LOW] Finding 3 — D2 'same scopedTestCommand precedence' 記述が不正確 (design.md)
**Status: FIXED**
`design.md` D2 now includes the explicit exception paragraph: "**Exception: the default-bun path** (`scopedTestCommand` unset, no custom commands configured) is not available for `runTestsOnSynthesizedTree` — the overlay execution requires a resolved `scopedTestCommand`...".

### [LOW] Finding 4 — D7: 構造削除確認の TC 番号参照が誤っている (TC-014 → TC-016) (design.md)
**Status: FIXED**
`design.md` D7 now reads "**TC-016 verification mechanism** (structural removal of `detectBaseImplementationContamination`)" and "TC-016 in test-cases.md is categorized as structural/static". The erroneous TC-014 reference is gone.

### [MEDIUM] Finding 5 — BiteEvidenceRecord.baseOid JSDoc stale (types.ts:382)
**Status: FIXED**
The field was renamed from `baseOid` to `baseRef` (`src/state/schema/types.ts` line 391). JSDoc now reads: "Evidence Base revision expression used as the red-side base (e.g. 'bootstrapSha^'). This is a git revision expression, NOT a resolved 40-char OID." `gate.ts:289` stores `baseRef: evidenceBaseRev` and `operations.ts:331` iterates `["baseRef", "candidateOid", "testHash"]`.

### [LOW] Finding 6 — Catch block diagnostic message 'runTestsAtCommit threw' is stale (achieved-assurance.ts:497)
**Status: FIXED**
Catch block at `achieved-assurance.ts:500` now reads: `biteEvidence: bite evidence evaluation threw: ${reason}` — no longer attributes the throw specifically to `runTestsAtCommit`.

### [LOW] Finding 7 — runTestsOnSynthesizedTree empty-overlay early return bypasses scopedTestCommand guard (local.ts:1196)
**Status: FIXED**
`local.ts` now checks `scopedTestCommand` first (lines 1196–1203), returning `unavailable` if absent, and only then checks `overlayFiles.length === 0` (lines 1205–1207). The port contract is no longer violated.

### [LOW] Finding 8 — BiteEvidenceRecord.baseOid stores a revision expression, not a resolved OID (types.ts:390)
**Status: FIXED** (same rename as Finding 5)
Field renamed to `baseRef`. No remaining `baseOid` references in BiteEvidenceRecord.

### [LOW] Finding 9 — P2.5 EB ref check gates testDerivation even though testDerivation does not use the Evidence Base (achieved-assurance.ts:241)
**Status: FIXED**
`achieved-assurance.ts` lines 241–249 now wrap the Evidence Base ref check in `if (floorConstrainsBite)`, so a floor that only constrains `testDerivation` skips P2.5 entirely and does not return early for absent `synthesizedCommits`.

### [LOW] Finding 10 — BiteEvidenceRecord.candidateOid JSDoc states 'implementer step OID' but now stores HEAD OID (types.ts:384)
**Status: FIXED**
JSDoc for `candidateOid` now reads: "commit OID of the branch HEAD at gate execution time (green candidate = provenance-approved reachable tree, includes adopted operator commits)."

### [LOW] Finding 11 — runTestsOnSynthesizedTree tmp path lacks OID discriminator vs runTestsAtCommit (local.ts)
**Status: FIXED**
`local.ts` lines 1210–1213 now compute `revDiscriminator = baseRev.slice(0, 8).replace(/[^a-zA-Z0-9]/g, "")` and use `specrunner-bite-evidence-synth-${revDiscriminator}-${Date.now()}` as the tmp path, matching the discriminator pattern of `runTestsAtCommit`.

### [LOW] Finding 12 — testDerivation-only + synthesizedCommits absent: corrected behavior has no pinning test (achieved-assurance.test.ts)
**Status: FIXED**
`src/core/archive/__tests__/achieved-assurance.test.ts` lines 96–154 add: `"achieves testDerivation when synthesizedCommits is absent but floor only requires testDerivation"`. The test verifies `output.achieved.testDerivation === "frozen"` and that no "Evidence Base reference absent" diagnostic was emitted, using a runtime that throws if `runTestsAtCommit` or `runTestsOnSynthesizedTree` are called.

## Verdict

No regressions. All 12 findings are confirmed fixed.
