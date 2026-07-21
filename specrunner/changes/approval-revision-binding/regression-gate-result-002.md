# Regression Gate Result — approval-revision-binding (Iteration 2)

## Summary

5 findings checked. All 5 confirmed fixed or accepted. 0 regressions detected.

---

## Evidence per Finding

### Finding 1 (MEDIUM): TC-011 / TC-012 coordinator re-anchor 統合テストが不在 — **FIXED ✅**

**Checked file:** `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`

**Evidence:** TC-011 and TC-012 describe blocks are present at lines 474 and 524 respectively.

TC-011 ("path-untouched member is re-anchored, skip maintained"): verifies that when `listChangedFiles` returns `{ kind: "success", files: ["src/other/bar.ts"] }` and the member's activation path is `["src/specific/**"]` (no overlap), the coordinator re-anchors `approvedAtCommit` to `baselineCommit` ("current-sha") and the member is NOT re-run (`wasCalled() === false`, `outcome === "approved"`). The re-anchor assertion (`memberStatus?.approvedAtCommit === "current-sha"`) directly validates the D5 invariant.

TC-012 ("evidence unavailable: no re-anchor, member is re-run"): verifies that when `listChangedFiles` returns `{ kind: "unavailable" }`, no re-anchor occurs and the member IS re-run (`wasCalled() === true`), implementing fail-closed per D6 / req 6.

Both tests were present and confirming the same behavior as reported fixed in iteration 1.

---

### Finding 2 (LOW): TC-016 describe コメントに旧関数名 conformanceApprovedLatest が残存 — **FIXED ✅**

**Checked file:** `tests/unit/pipeline/transition-when.test.ts:224`

**Evidence:** Line 224 now reads:
```
// TC-016: verification passed → adr-gen (when conformanceApprovedForVerifiedRevision)
```
The old name `conformanceApprovedLatest` has been replaced with `conformanceApprovedForVerifiedRevision` in the banner comment. The comment is consistent with the renamed function.

---

### Finding 3 (MEDIUM): TC-003/004/019 が D4 の不変条件をテストしない phantom シナリオを使用 — **FIXED ✅**

**Checked file:** `tests/unit/core/pipeline/pipeline.reverification.test.ts`

**Evidence:** All three test cases have been updated to use distinct `commitOid` values that reflect the real production path (build-fixer commits advance HEAD → verification.commitOid ≠ conformance.commitOid).

TC-003 (line 398–420): 3rd verification uses `"sha-bf"`, while 1st conformance uses `"sha-conf"`. Guard: `sha-conf ≠ sha-bf → false → code-review re-entry`. 2nd code-review runs with 0 fixable findings → 2nd conformance uses `"sha-bf"` → match → adr-gen. The describe header documents the full D4 sequence.

TC-004 (line 484–527): Same pattern. The `codeReviewCount` assertion is updated from `=== 1` to `=== 2` (code-review appears twice: initial path + D4 re-entry). `verificationCallCount === 3` is unchanged (no 4th verification needed).

TC-019 (lines 649–673): 5th verification uses `"sha-bf"`, 1st conformance uses `"sha-conf"`, 2nd conformance uses `"sha-bf"`. D4 re-entry after episode-2 recovery is correctly simulated.

The phantom pattern (matching shas suppressing code-review re-entry) is eliminated. All three tests now document and exercise the D4 invariant correctly.

---

### Finding 4 (LOW): selectPendingMembers 呼び出しが T-05 指定の 3 引数化に未追随 — **FIXED ✅**

**Checked files:**
- `src/core/pipeline/__tests__/reviewer-status.test.ts`
- `src/core/pipeline/__tests__/member-resume-routing.test.ts`

**Evidence:**

`reviewer-status.test.ts`:
- Line 128: `selectPendingMembers(statuses, ["security", "perf"], "sha1")` — "excludes approved members" test now passes `baselineCommit = "sha1"` matching `approvedAtCommit: "sha1"`. Exercises revision-binding path, not the fallback.
- Line 160: `selectPendingMembers(statuses, ["security", "perf"], "sha1")` — "returns empty array when all approved or skipped" similarly updated.

`member-resume-routing.test.ts`:
- Line 132: `selectPendingMembers(statuses, ["cross-boundary-invariants"], "abc123")` — approved member at `approvedAtCommit: "abc123"` is excluded via revision-binding path.
- Line 149: Same 3-argument call, verifies empty pending result.
- Lines 189–193: Multi-reviewer call updated with `"abc123"` 3rd argument, approved cross-boundary-invariants member is skipped while pending security member is retained.

Both files now exercise the new revision-binding path (`approvedAtCommit === baselineCommit → skip`). Calls without `baselineCommit` remain for cases where it's legitimately absent (e.g., fresh members with no `approvedAtCommit`).

---

### Finding 5 (LOW): runCliStep が verification 以外の CLI step にも commitOid を付与 — **ACCEPTED (no regression)**

**Checked file:** `src/core/step/executor.ts` (lines 551–599)

**Evidence:** `captureHeadSha` is called for all CLI steps at lines 556–558 (not restricted to verification). The `entryHeadSha` is included in the success return at line 599 when non-undefined. This is unchanged from iteration 1.

As confirmed in iteration 1, this is a deliberate design decision consistent with T-01 guidance ("CLI step 一般の entry-HEAD 打刻を導入する場合は他 CLI step の commitOid 消費者が無いことを確認する"). No consumers of `bite-evidence.commitOid` or `pr-create.commitOid` exist (B2 boundary confirmed). No functional impact. Accepted as-is.
