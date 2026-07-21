# Regression Gate Result — approval-revision-binding (Iteration 1)

## Summary

5 findings checked. 1 confirmed fixed. 3 regressions detected (not fixed). 1 accepted design decision (no code change required).

---

## Evidence per Finding

### Finding 1 (MEDIUM): TC-011 / TC-012 統合テスト不在 — **FIXED ✅**

**Checked files:**
- `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` — exists in branch
- `src/core/pipeline/__tests__/parallel-review-round-resume.test.ts` — exists in branch

**Evidence:** Both files are present. `parallel-review-round-invalidation.test.ts` contains explicit describe blocks for TC-011 ("path-untouched member is re-anchored, skip maintained") at line 474 and TC-012 ("evidence unavailable: no re-anchor, member is re-run") at line 525. `parallel-review-round-resume.test.ts` covers coordinator D1–D4 resume invariants. The finding's requirement (tests fixing re-anchor and fail-closed invariants) is satisfied.

---

### Finding 2 (LOW): TC-016 describe コメントに旧関数名 — **REGRESSION ❌**

**Checked file:** `tests/unit/pipeline/transition-when.test.ts:224`

**Evidence:** Line 224 reads:
```
// TC-016: verification passed → adr-gen (when conformanceApprovedLatest)
```
The function was renamed to `conformanceApprovedForVerifiedRevision` per T-02. The describe block title at line 226 says "TC-016: verification passed → adr-gen when-guard exists" (correct), but the banner comment on line 224 still references the old name `conformanceApprovedLatest`. The fix (update comment to `conformanceApprovedForVerifiedRevision`) was not applied.

---

### Finding 3 (MEDIUM): TC-003/004/019 D4 の不変条件をテストしない phantom シナリオ — **REGRESSION ❌**

**Checked file:** `tests/unit/core/pipeline/pipeline.reverification.test.ts`

**Evidence:**

TC-003 (lines 385–408): The 3rd verification (build-fixer recovery) is given `commitOid = "sha-c"`:
```typescript
const commitOid = verificationCallCount >= 3 ? "sha-c" : undefined;
```
Conformance is also given `"sha-c"`:
```typescript
if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts, 0, "sha-c");
```
Matching shas → `conformanceApprovedForVerifiedRevision` guard returns true → adr-gen (no code-review re-entry). Comment says "T-05: 3rd verification needs commitOid matching conformance so that guard returns true → routes to adr-gen." This is the phantom scenario: production build-fixer advances HEAD (new sha ≠ conformance sha), but the test simulates matching shas, bypassing code-review re-entry.

TC-004 (lines 441–490): Same phantom pattern. The assertion at line 486 confirms `codeReviewCount === 1` (no re-entry), contradicting D4 which requires code-review re-entry when verification.commitOid ≠ conformance.commitOid.

TC-019 (lines 587–641): Same pattern. 5th verification gets `"sha-c"` matching conformance's `"sha-c"`.

T-05 in tasks.md requires "TC-003/004/019: update expectation to code-review re-entry → conformance re-approval → adr-gen." This update was not applied. The phantom scenario remains.

Note: D4 invariant itself IS tested in `pipeline.build-fixer-reentry.test.ts` (TC-013/TC-017). The issue is that TC-003/004/019 document misleading "build-fixer scenarios" with wrong expectations.

---

### Finding 4 (LOW): selectPendingMembers 2引数化未追随 — **REGRESSION ❌**

**Checked files:**
- `src/core/pipeline/__tests__/reviewer-status.test.ts` (lines 112–157)
- `src/core/pipeline/__tests__/member-resume-routing.test.ts` (lines 117–191)

**Evidence:**

All `selectPendingMembers` calls in `reviewer-status.test.ts` remain 2-argument:
- Line 118: `selectPendingMembers(statuses, ["security", "perf"])`
- Line 126: `selectPendingMembers(statuses, ["security", "perf"])`
- Line 134: `selectPendingMembers(statuses, ["security", "perf"])`
- Line 139: `selectPendingMembers(statuses, ["security"])`
- Line 148: `selectPendingMembers(statuses, ["a", "b"])`
- Line 156: `selectPendingMembers(statuses, ["security", "perf"])`

All `selectPendingMembers` calls in `member-resume-routing.test.ts` remain 2-argument:
- Line 130: `selectPendingMembers(statuses, ["cross-boundary-invariants"])`
- Line 146: `selectPendingMembers(statuses, ["cross-boundary-invariants"])`
- Line 155: `selectPendingMembers(statuses, ["cross-boundary-invariants"])`
- Lines 184–187: `selectPendingMembers(statuses, ["cross-boundary-invariants", "security"])`

The 3rd parameter `baselineCommit` is optional in the current signature (`baselineCommit?: string | null`). 2-argument calls use `baselineCommit = undefined`, which satisfies `undefined == null → true`, disabling the revision check (fallback path). The "approved member is excluded" test at line 121–127 of reviewer-status.test.ts passes via the fallback path — NOT via the revision-binding check.

T-05 requires adding `baselineCommit = approvedAtCommit` (matching) to cases where approved member should skip. This was not done in either file. The new behavior is tested only in `select-pending-revision-binding.test.ts`.

---

### Finding 5 (LOW): runCliStep が全 CLI step に commitOid を付与 — **ACCEPTED (no regression)**

**Checked file:** `src/core/step/executor.ts` (lines 551–600)

**Evidence:** `captureHeadSha` is called for ALL CLI steps (not restricted to verification) at lines 556–558. The result is included in the success return at line 599 when `entryHeadSha !== undefined`.

This is consistent with the T-01 explicit guidance: "CLI step 一般の entry-HEAD 打刻を導入する場合は他 CLI step の commitOid 消費者が無いことを確認する." The implementation applies to all CLI steps after confirming no consumers of bite-evidence/pr-create commitOid (B2 boundary). No functional impact. This is an accepted design decision, not a regression.
