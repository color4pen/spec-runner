# Regression Gate Result — halt-checkpoint-restack (Iteration 1)

Generated: 2026-08-22

## Evidence Summary

- **Checked**: 13
- **Skipped**: 0
- **Unverified**: 0

---

## Per-Finding Verification

### [1] `af388dac` — TC-027 in tasks.md T-07 (MEDIUM)

**Status: FIXED**

`tasks.md` T-07 now contains (lines 186–188):
```
- [x] TC（synthesizedCommits / TC-027）: state.json の `synthesizedCommits` 配列に
      restack commit OID と graft merge commit OID の両方が含まれることを assert する
```
TC-027 is explicitly listed in T-07 and the e2e test `tests/halt-checkpoint-restack-e2e.test.ts` covers this assertion.

---

### [2] `5ba1c96d` — reason field missing from spec.md (LOW)

**Status: FIXED**

`spec.md` requirement "積み直しの発生を journal event として publish される checkpoint に記録する" now reads (lines 80–82):
```
record は親 commit OID、push を拒否された local tip OID、publish されなかった commit の
OID 列、および push 失敗理由（センシティブ情報は伏字化して截断した文字列）を含む SHALL。
```
The `reason` field with security masking requirement is now present in spec.

---

### [3] `fc3b2c01` — TC-029 priority was "should" (LOW)

**Status: FIXED**

`test-cases.md` TC-029 line 351: `**Priority**: must`
The priority was upgraded from "should" to "must".

---

### [4] `8bceb2e9` — no-branch trigger condition missing from tasks.md T-02 (LOW)

**Status: FIXED**

`tasks.md` T-02 (line 35) now contains:
```
- [x] `branch` パラメータが空文字列の場合は fetch を試みず即座に `skipped: no-branch` を返す
      （`no-branch` の唯一のトリガー条件）
```
Implementation in `src/core/step/checkpoint-restack.ts` (lines 147–150) matches this.

---

### [5] `3689bdd9` — TC-008/014/015 unit tests missing (MEDIUM)

**Status: FIXED**

`src/store/__tests__/event-journal-checkpoint-restack.test.ts` is a new file with:
- **TC-008**: Multiple sub-tests verifying `fold()` does not count `checkpoint-restack` in `historyCount`/`stepCounts`/`history`/`steps`
- **TC-014**: Multiple sub-tests verifying `checkpointRestacks[]` collection
- **TC-015**: Integration test verifying `appendCheckpointRestack()` updates only `events.jsonl`, not `state.json`

All three TCs are fully implemented.

---

### [6] `472c648e` — TC-033 no explicit spy assertion (LOW)

**Status: FIXED**

`src/core/step/__tests__/commit-push-egress-invariant.test.ts` (lines 974–1026) now contains TC-033 with an explicit assertion:
```typescript
const subcommands = calls.map((c) => c[0]);
expect(subcommands).not.toContain("push");
expect(subcommands).not.toContain("fetch");
// Exact call count: 5 add + 1 diff + 1 commit + 1 rev-parse + 1 rev-list = 9
expect(calls).toHaveLength(9);
```
Since `restackCheckpointOntoPublishedTip` always begins with `git fetch`, its absence confirms the function was never called.

---

### [7] `6f513441` — TC-026 output order not tested (LOW)

**Status: FIXED**

`src/core/step/__tests__/commit-push-egress-invariant.test.ts` (lines 1029–1108) now implements TC-026:
```typescript
// TC-026: The existing warn MUST precede the restack result message
expect(warnIdx).toBeLessThan(restackIdx);
```
Output order is now explicitly asserted.

---

### [8] `4a634e3e` — recordRestack called before no-local-tip early return (MEDIUM)

**Status: FIXED**

`src/core/step/checkpoint-restack.ts`:
- Lines 196–198: `if (localTipFailed) { return { kind: "skipped", reason: "no-local-tip" }; }` — this early return comes **before** `recordRestack`
- Lines 200–222: `recordRestack` is called only after confirming `localTipOid` is valid

The guard is in place. `localTipOid: ""` records are no longer written to disk.

---

### [9] `8ca4a0dc` — FoldResult.checkpointRestacks undefined when empty (LOW)

**Status: FIXED**

`src/store/event-journal.ts` line 457:
```typescript
checkpointRestacks: checkpointRestackRecords,
```
`fold()` now always emits `checkpointRestacks` as an array (empty when no records). The previous conditional spread pattern (`...(length > 0 ? {...} : {})`) has been replaced with an unconditional field assignment.

---

### [10] `6490f6e6` — published restack commit state.json missing synthesizedCommits OIDs (LOW)

**Status: STILL PRESENT (regression)**

`src/core/step/checkpoint-restack.ts` step 4c (lines 312–335) only hashes `events.jsonl` to update the temp index. `state.json` is NOT re-hashed from disk after `persistCommit` writes `restackedOid`/`mergeOid` to it. The tree is written in step 4d using the temp index, which contains `state.json` from `localTipOid`'s committed tree (pre-restack). The proposed fix — "step 4c で events.jsonl blob を上書きする際、disk 上の最新 state.json blob も同様に `hash-object` して changeDir 内の state.json を差し替える" — was not applied. The published restack commit's `state.json.synthesizedCommits` does not include `checkpointOid`, `restackedOid`, or `mergeOid`.

---

### [11] `874172d4` — F-01 re-issue: recordRestack before no-local-tip (MEDIUM)

**Status: FIXED**

Same code path as finding [8]. Confirmed fixed at `src/core/step/checkpoint-restack.ts` lines 196–222.

---

### [12] `3cf860cc` — F-02 re-issue: 2 operator actions unimplemented (MEDIUM)

**Status: PARTIALLY PRESENT (regression)**

**Action (1)** — warn message in "published" case: **FIXED**
`src/core/step/commit-push.ts` lines 917–919:
```typescript
stderrWrite(
  `Warning: checkpoint-restack: 以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること`,
);
```

**Action (2)** — design.md Risks entry for non-ephemeral runner push rejection loop: **NOT FIXED**
`specrunner/changes/halt-checkpoint-restack/design.md` Risks section (lines 229–253) contains 8 entries but still has **no entry** covering "graft 後 non-ephemeral runner での push 再拒否ループのトレードオフ". The scenario where a non-ephemeral runner resumes after a successful restack and encounters the same push rejection (because the underlying cause was not resolved) has no documented risk/trade-off entry.

---

### [13] `385eac5e` — F-03 re-issue: checkpointRestacks undefined when empty (LOW)

**Status: FIXED**

Same fix as finding [9]. `fold()` now always emits `checkpointRestacks: checkpointRestackRecords` unconditionally at line 457.

---

## Verdict Summary

| Finding | Ref | Severity | Status |
|---------|-----|----------|--------|
| [1] TC-027 in T-07 | `af388dac` | MEDIUM | FIXED |
| [2] reason field in spec.md | `5ba1c96d` | LOW | FIXED |
| [3] TC-029 priority | `fc3b2c01` | LOW | FIXED |
| [4] no-branch trigger in T-02 | `8bceb2e9` | LOW | FIXED |
| [5] TC-008/014/015 unit tests | `3689bdd9` | MEDIUM | FIXED |
| [6] TC-033 spy assertion | `472c648e` | LOW | FIXED |
| [7] TC-026 output order test | `6f513441` | LOW | FIXED |
| [8] recordRestack guard | `4a634e3e` | MEDIUM | FIXED |
| [9] checkpointRestacks undefined | `8ca4a0dc` | LOW | FIXED |
| [10] state.json synthesizedCommits | `6490f6e6` | LOW | **REGRESSION** |
| [11] F-01 re-issue | `874172d4` | MEDIUM | FIXED |
| [12] F-02 re-issue (partial) | `3cf860cc` | MEDIUM | **REGRESSION (design.md action only)** |
| [13] F-03 re-issue | `385eac5e` | LOW | FIXED |

**Regressions: 2** ([10] LOW, [12] MEDIUM-partial)
