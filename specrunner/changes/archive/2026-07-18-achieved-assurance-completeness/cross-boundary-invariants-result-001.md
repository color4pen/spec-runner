# Cross-Boundary Invariants Review — achieved-assurance-completeness
**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Date**: 2026-07-18

## Scope

Diff: 15 source/test files, 3656 insertions. Core changes:
- `src/core/archive/achieved-assurance.ts` (+210, rewrite of derivation logic)
- `src/core/port/runtime-strategy.ts` (+40, new `CommitFileResult` type + `readFileAtCommit` port)
- `src/core/runtime/local.ts` (+72, `readFileAtCommit` impl)
- `src/core/runtime/managed.ts` (+19, always-unavailable impl)
- `src/core/step/bite-evidence/gate.ts` (+17, exports `FORWARD_TYPES`)
- `src/state/schema/types.ts` (+4, doc fix for `testHash`)
- New integration + unit + primitive tests (3 test files, ~2235 lines)

## Reviewer Mandate

Detect whether new behavior **silently breaks implicit assumptions** in unchanged code. Implementation correctness and green tests are not the focus; cross-seam interaction, emergent invariant breaks, and control-flow contracts that span module boundaries are.

---

## Findings

### CBI-1 (low): `testDerivation` now requires `readFileAtCommit` via P3 even when floor constrains only `testDerivation`

**File**: `src/core/archive/achieved-assurance.ts:174–187`

The P3 runtime method check now gates BOTH `testDerivation` and `biteEvidence` on `typeof runtime.readFileAtCommit === "function"`. If the floor constrains only `testDerivation:"frozen"` (not `biteEvidence`), the derivation still exits absent at P3 when `readFileAtCommit` is missing — even though `testDerivation` derivation does not call `runTestsAtCommit`. This is an over-strict precondition for the `testDerivation`-only case.

**Impact on existing code**: `LocalRuntime` and `ManagedRuntime` both now implement `readFileAtCommit`, so production is unaffected. Any old test fake typed as `AssuranceProvenanceRuntime` that omits `readFileAtCommit` will fail-closed at P3 rather than at a later gate. The design acknowledges this in the Risk section and T-09 backward-compat audit explicitly handles it. All fail-closed fakes remain correctly fail-closed (different exit point, same outcome).

**Verdict impact**: None (fail-closed). No action required.

---

### CBI-2 (low): Suffix matching for `readFileAtCommit` can produce false-positive candidates when one archived slug is a proper suffix of another after a `-` boundary

**File**: `src/core/runtime/local.ts:1074–1076`

The filter `entry.endsWith("/" + pathSuffix) || entry.endsWith("-" + pathSuffix)` is correct for both active (`/`) and archived (`-<date>-`) paths. However, if slug `S` is a proper suffix of archived slug `X` (e.g. S=`slug`, X=`my-slug`), then the archived path for `X` would also match the `-` check for `S`, producing 2 candidates → `unavailable` (fail-closed).

**Impact on unchanged code**: `satisfiesFloor` receives `unavailable` → `testDerivation`/`biteEvidence` absent → floor fails-closed. No fail-open path exists. The mitigation (ambiguous → unavailable) is correctly implemented and is acknowledged in the design Risk section. In this repo's slug naming convention (descriptive kebab-case), a collision is practically impossible.

**Verdict impact**: None. Fail-closed behaviour preserved.

---

### CBI-3 (low): TC-010 (floor) e2e test uses `candidateOid` as `finalHeadOid`, exercising the ACTIVE path suffix (`/`) but not the ARCHIVED path suffix (`-`)

**File**: `src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts:222`

In the real archive flow, `finalHeadOid` = `archiveSha` (commit AFTER `git mv`). At that commit, the change folder is at `specrunner/changes/archive/<date>-<slug>/`, so `readFileAtCommit` resolves via the `-` suffix. TC-010 (floor) sets `finalHeadOid = candidateOid` (pre-archive), so `specrunner/changes/example/` is still at the active path, resolved via `/` suffix.

The `-` path is covered by the unit test `TC-008` in `read-file-at-commit.test.ts` with mock spawn, and by all integration tests using fake runtimes. No full end-to-end test goes through `runMergeThenArchive` with a real archived git tree.

**Impact**: If the `-` suffix resolution had a regression, TC-010 (floor) would not catch it. The unit test TC-008 does catch it. This is a coverage gap at the integration boundary, not a missing invariant. No action required for this review.

**Verdict impact**: None in practice; coverage gap is bridged by TC-008.

---

### CBI-4 (noted): `testDerivation = "frozen"` is set before biteEvidence checks; biteEvidence failure leaves `testDerivation` present in `achieved`

**File**: `src/core/archive/achieved-assurance.ts:322–327` (testDerivation assignment) and lines 338–412 (biteEvidence section)

After a scenario freeze success sets `achieved["testDerivation"] = "frozen"`, subsequent biteEvidence failures (type gate, base-red unavailable, HEAD-red, HEAD unavailable) return early WITHOUT clearing `testDerivation`. The resulting `achieved` object can carry `testDerivation = "frozen"` while `biteEvidence` is absent.

This is the **correct** and **intended** behaviour: TC-025 explicitly tests and documents it ("testDerivation is strategy-independent; type gate does NOT apply to testDerivation"). Any floor that requires ONLY `testDerivation:"frozen"` is satisfied; a floor requiring `biteEvidence:"required"` additionally fails-closed. `satisfiesFloor` evaluates each constrained dimension independently.

Future consumers of the `achieved` object must not assume `testDerivation:"frozen"` implies `biteEvidence:"required"`. This invariant is currently enforced only by convention — there is no explicit guard in the type system.

**Verdict impact**: None. Behaviour is correct and tested.

---

### CBI-5 (noted): `runTestsAtCommit(finalHeadOid, ...)` tests at the POST-ARCHIVE commit — implicit assumption that `git mv` does not affect test outcomes

**File**: `src/core/archive/achieved-assurance.ts:389`

The HEAD-green check runs the scoped test suite at `finalHeadOid` (the archive commit, which differs from `candidateOid` only by the `git mv` of `specrunner/changes/<slug>` → `specrunner/changes/archive/<date>-<slug>`). The tests in `materializedTestFiles` reside in `src/tests/` (outside `specrunner/changes/`) and are explicitly excluded from the `git mv` by `isExcludedPath`. Source code is also unchanged.

The implicit invariant: the archive commit ONLY does `git mv` of the change folder; it never touches `src/`. This invariant holds by `archive-change-folder.ts` design, but is not enforced at the `deriveAchievedAssurance` call site. If a future change caused the archive step to also modify source files, the HEAD-green result at `finalHeadOid` could differ from the in-loop gate result at `candidateOid`.

**Verdict impact**: None for the current implementation. Good to note for future maintainers.

---

## Positive Invariants Confirmed

| Invariant | Status |
|---|---|
| `satisfiesFloor` receives the new stricter `achieved` object and evaluates all dimensions | ✓ Unchanged interface, no drift |
| In-loop `gate.ts` continues operating on `candidateOid`; archive re-measures independently at `finalHeadOid` | ✓ No sharing of in-loop results |
| `FORWARD_TYPES` is a single exported constant shared between in-loop gate and archive gate | ✓ Single source of truth, no drift risk |
| `fold` is called with string content from `git show` stdout (UTF-8, matches `fold`'s input contract) | ✓ Type-correct |
| `computeContentHash` uses same algorithm as `digestArtifacts` (sha256, Buffer.from(str, "utf8")) | ✓ Round-trip verified by TC-019 |
| `resolveBaseCandidateOids` returns the same `baseOid` for both in-loop gate and archive gate | ✓ Both read `state.steps["test-materialize"][-1].commitOid` |
| `isExcludedPath` filter used identically by in-loop gate and archive gate for `materializedTestFiles` | ✓ Shared export from gate.ts |
| Fail-closed contract preserved across all early-return paths in `deriveAchievedAssurance` | ✓ All catch blocks return, never rethrow |
| `merge-then-archive.ts` Step 3.6 call site unchanged; receives new stricter `achieved` correctly | ✓ Same function signature, caller unchanged |
| Backward-compat: existing fail-closed tests remain fail-closed after P3 method check change | ✓ Verified in T-09 audit (different exit point, same outcome) |

---

## Summary

All 4 ADR gaps (P0-1 HEAD-green, P0-2 scenario two-layer freeze, P0-3 type↔strategy, P1 spec-review approved) are closed within the `achieved-assurance.ts` seam without breaking invariants in unchanged modules. The cross-boundary interactions (in-loop gate ↔ archive gate, runtime port ↔ derivation, floor ↔ satisfiesFloor) are all fail-closed. No invariant was found that the new behaviour silently violates in a fail-open direction.

The four findings above are either intentional design decisions (CBI-1, CBI-4), acknowledged risks with fail-closed mitigations (CBI-2, CBI-3), or implicit assumptions that are currently safe (CBI-5).

- **verdict**: approved
