# Regression Gate Result — evidence-base, Iteration 1

## Verification Summary

All 12 findings were verified against the current code.

---

## Finding-by-Finding Verification

### 1. [LOW] Req 4 deferral list missing captureHeadSha→null path
**File**: specrunner/changes/evidence-base/spec.md
**Status**: FIXED
**Evidence**: spec.md lines 107-113 now contain "Scenario: Absent HEAD OID defers" with the captureHeadSha→null path explicitly enumerated as a deferral condition. The main Requirement body (line 76) also lists "absent HEAD OID (captureHeadSha returning null)".

---

### 2. [LOW] Archive floor fail-closed (absent Evidence Base ref) has no spec scenario
**File**: specrunner/changes/evidence-base/spec.md
**Status**: FIXED
**Evidence**: spec.md lines 64-70 now contain "Scenario: Archive floor is fail-closed when the Evidence Base reference is absent", covering the synthesizedCommits empty/absent → biteEvidence absent case.

---

### 3. [LOW] D2: default bun path exclusion not mentioned
**File**: specrunner/changes/evidence-base/design.md
**Status**: FIXED
**Evidence**: design.md D2 now has an explicit exception paragraph (lines 126-130): "**Exception: the default-bun path** (`scopedTestCommand` unset, no custom commands configured) is not available for `runTestsOnSynthesizedTree` — the overlay execution requires a resolved `scopedTestCommand` to run per-file scoped tests in the detached worktree; absent `scopedTestCommand` → `unavailable`."

---

### 4. [LOW] D7: TC-014 → TC-016
**File**: specrunner/changes/evidence-base/design.md
**Status**: FIXED
**Evidence**: design.md D7 now correctly reads "**TC-016 verification mechanism (structural removal of `detectBaseImplementationContamination`).**" and "TC-016 in test-cases.md is categorized as structural/static" (lines 262-266).

---

### 5. [MEDIUM] BiteEvidenceRecord.baseOid JSDoc stale
**File**: src/state/schema/types.ts:382
**Status**: FIXED
**Evidence**: types.ts lines 379-393 show the field has been renamed to `baseRef` with updated JSDoc: "Evidence Base revision expression used as the red-side base (e.g. `bootstrapSha^`). This is a git revision expression, NOT a resolved 40-char OID."

---

### 6. [LOW] Catch block diagnostic message 'runTestsAtCommit threw' is stale
**File**: src/core/archive/achieved-assurance.ts:497
**Status**: FIXED
**Evidence**: achieved-assurance.ts line 500 now reads `diagnostics.push(\`biteEvidence: bite evidence evaluation threw: ${reason}\`)` — correctly covering both `runTestsOnSynthesizedTree` and `runTestsAtCommit` in the same try block.

---

### 7. [LOW] runTestsOnSynthesizedTree empty-overlay early return bypasses scopedTestCommand guard
**File**: src/core/runtime/local.ts:1196
**Status**: FIXED
**Evidence**: local.ts lines 1196-1207: scopedTestCommand guard (lines 1196-1203) now comes BEFORE the `overlayFiles.length === 0` early return (line 1205-1207), satisfying the contract order.

---

### 8. [LOW] BiteEvidenceRecord.baseOid stores a revision expression, not a resolved OID
**File**: src/state/schema/types.ts:390
**Status**: FIXED
**Evidence**: The field was renamed from `baseOid` to `baseRef` (types.ts line 391). Fixes both the misleading name and the JSDoc.

---

### 9. [LOW] P2.5 EB ref check gates testDerivation even though testDerivation does not use the Evidence Base
**File**: src/core/archive/achieved-assurance.ts:241
**Status**: FIXED
**Evidence**: achieved-assurance.ts lines 237-249: P2.5 is now guarded with `if (floorConstrainsBite)` (line 241), and the comment explicitly reads "Only required for biteEvidence — testDerivation (blob freeze + scenario revision binding) is logically independent of the Evidence Base and must not be gated here."

---

### 10. [LOW] BiteEvidenceRecord.candidateOid JSDoc states 'implementer step OID' but now stores HEAD OID
**File**: src/state/schema/types.ts:384
**Status**: FIXED
**Evidence**: types.ts lines 384-385 now reads: "candidateOid: commit OID of the branch HEAD at gate execution time (green candidate = provenance-approved reachable tree, includes adopted operator commits)."

---

### 11. [LOW] runTestsOnSynthesizedTree tmp path lacks OID discriminator vs runTestsAtCommit
**File**: src/core/runtime/local.ts
**Status**: FIXED
**Evidence**: local.ts lines 1210-1213: tmp path is now `specrunner-bite-evidence-synth-${revDiscriminator}-${Date.now()}` where `revDiscriminator = baseRev.slice(0, 8).replace(/[^a-zA-Z0-9]/g, "")`, matching the OID-prefix pattern of `runTestsAtCommit`.

---

### 12. [LOW] testDerivation-only + synthesizedCommits absent: corrected behavior has no pinning test
**File**: src/core/archive/__tests__/achieved-assurance.test.ts
**Status**: NOT FIXED (regression present)
**Evidence**: The guard `if (floorConstrainsBite)` at achieved-assurance.ts:241 correctly prevents P2.5 from blocking testDerivation when synthesizedCommits is absent and the floor only constrains testDerivation. However, no test asserts this behavior. The existing test (achieved-assurance.test.ts line 54) verifies only the `biteEvidence:required + absent synthesizedCommits → both absent` direction. No test file was found that sets `floor: { testDerivation: "frozen" }` (without biteEvidence) with absent `synthesizedCommits` and asserts `testDerivation` is still achievable. A future refactor removing or weakening the guard would not be caught.

---

## Result

- **Fixed**: 11 / 12
- **Regressions**: 1 (Finding 12 — low severity, no pinning test for testDerivation-only + absent synthesizedCommits)
