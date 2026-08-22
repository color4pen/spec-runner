# Regression Gate Result — halt-checkpoint-restack (Iteration 3)

Generated: 2026-08-22

## Evidence Summary

- **Checked**: 15
- **Skipped**: 0
- **Unverified**: 0

---

## Per-Finding Verification

### [1] `af388dac` — TC-027 in tasks.md T-07 (MEDIUM)

**Status: FIXED**

`tasks.md` T-07 contains:
```
- [x] TC（synthesizedCommits / TC-027）: state.json の `synthesizedCommits` 配列に
      restack commit OID と graft merge commit OID の両方が含まれることを assert する
```
TC-027 is explicitly listed. No regression.

---

### [2] `5ba1c96d` — reason field missing from spec.md (LOW)

**Status: FIXED**

`spec.md` lines 80–82:
```
record は親 commit OID、push を拒否された local tip OID、publish されなかった commit の
OID 列、および push 失敗理由（センシティブ情報は伏字化して截断した文字列）を含む SHALL。
```
`reason` field with `maskSensitive` requirement is present in spec. No regression.

---

### [3] `fc3b2c01` — TC-029 priority was "should" (LOW)

**Status: FIXED**

`test-cases.md` TC-029 (line 351): `**Priority**: must`

Priority is `must`. No regression.

---

### [4] `8bceb2e9` — no-branch trigger condition missing from tasks.md T-02 (LOW)

**Status: FIXED**

`tasks.md` T-02 contains:
```
- [x] `branch` パラメータが空文字列の場合は fetch を試みず即座に `skipped: no-branch` を返す
      （`no-branch` の唯一のトリガー条件）
```
Condition is defined. Implementation matches (`checkpoint-restack.ts` lines 147–150: `if (!branch) { return { kind: "skipped", reason: "no-branch" }; }`). No regression.

---

### [5] `3689bdd9` — TC-008/TC-014/TC-015 unit tests missing (MEDIUM)

**Status: FIXED**

`src/store/__tests__/event-journal-checkpoint-restack.test.ts` is present with:
- **TC-008**: 4 sub-tests verifying `fold()` does not alter `historyCount`/`stepCounts`/`history`/`steps`
- **TC-014**: 5 sub-tests verifying `checkpointRestacks[]` collection and chronological order
- **TC-015**: Integration test verifying `appendCheckpointRestack()` writes only to events.jsonl

All three TCs fully implemented. No regression.

---

### [6] `472c648e` — TC-033 no explicit spy assertion for egress failure path (LOW)

**Status: FIXED**

`src/core/step/__tests__/commit-push-restack-integration.test.ts` lines 51–100 implement TC-033:
```typescript
const subcommands = calls.map((c) => c[0]);
expect(subcommands).not.toContain("push");
expect(subcommands).not.toContain("fetch");
expect(calls).toHaveLength(9);
```
Explicit assertion that egress failure path does not invoke restack. No regression.

Note: tests were moved from `commit-push-egress-invariant.test.ts` to a dedicated `commit-push-restack-integration.test.ts` file; the assertions are still present and enforced.

---

### [7] `6f513441` — TC-026 output order not tested (LOW)

**Status: FIXED**

`src/core/step/__tests__/commit-push-restack-integration.test.ts` lines 106–181 implement TC-026 with order assertion:
```typescript
// TC-026: The existing warn MUST precede the restack result message
expect(warnIdx).toBeLessThan(restackIdx);
```
Output order explicitly verified via `process.stderr.write` spy. No regression.

---

### [8] `a58ad837` — TC-005 resumePoint.step explicit assertion missing (MEDIUM)

**Status: FIXED** (new finding in iteration 3)

`tests/halt-checkpoint-restack-e2e.test.ts` line 419:
```typescript
// AC-2: resume must restart from the halted step — assert the resolved resume step explicitly
expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer");
```
The explicit assertion for `resumePoint.step` is present. No regression.

---

### [9] `d219e919` — TC-027 graft merge OID assertion conditional (LOW)

**Status: FIXED** (new finding in iteration 3)

`tests/halt-checkpoint-restack-e2e.test.ts` lines 382–387:
```typescript
// TC-027: local HEAD (graft merge commit) must be unconditionally in persistedOids
const localTip = gitSync(["rev-parse", "HEAD"], repoDir);
expect(
  persistedOids,
  "graft merge commit (local HEAD) should be recorded in synthesizedCommits",
).toContain(localTip);
```
The `graftMergeOid` conditional guard has been replaced with an unconditional `rev-parse HEAD` assertion. No regression.

---

### [10] `4a634e3e` — recordRestack called before no-local-tip early return (MEDIUM)

**Status: FIXED**

`src/core/step/checkpoint-restack.ts`:
- Lines 196–198: `if (localTipFailed) { return { kind: "skipped", reason: "no-local-tip" }; }` — early return **before** `recordRestack`
- Lines 214–222: `recordRestack` called only after confirming `localTipOid` is valid

Comment at lines 193–196 explains: "Early exit: no local tip means … Skip both record and tree build." No regression.

---

### [11] `8ca4a0dc` — FoldResult.checkpointRestacks undefined when empty (LOW)

**Status: FIXED**

`src/store/event-journal.ts` line 457:
```typescript
checkpointRestacks: checkpointRestackRecords,
```
`fold()` now unconditionally assigns `checkpointRestacks` as an array (empty `[]` when no records). No regression.

---

### [12] `6490f6e6` — published restack commit state.json missing synthesizedCommits OIDs (LOW)

**Status: RESOLVED via design decision**

`specrunner/changes/halt-checkpoint-restack/design.md` lines 259–265 document this as a known issue (既知事項):
```
- **[既知事項] published restack commit の tree に含まれる state.json の `synthesizedCommits` は、
  restack commit 自身の OID（checkpointOid / restackedOid / mergeOid）を含まない**（publish 時点の
  snapshot に自身の OID を含められない構造のため）→ semantic inconsistency として既知とする。
  現行の attach / egress 契約上の functional impact は確認されていない: restack OID は origin に
  存在するため `rev-list HEAD --not --remotes=origin` の publish range に入らず、
  `EGRESS_UNKNOWN_COMMIT` は発生しない。runtime 側の台帳（disk / in-memory）は
  persist-before-push で両 OID を追記済み。
```
Semantic inconsistency accepted as a known trade-off with confirmed nil functional impact. Documentation still present. No regression.

---

### [13] `874172d4` — F-01 re-issue: recordRestack before no-local-tip (MEDIUM)

**Status: FIXED**

Same code path as finding [10]. Confirmed at `src/core/step/checkpoint-restack.ts` lines 196–222: `no-local-tip` early return precedes `recordRestack` call. No regression.

---

### [14] `3cf860cc` — F-02 re-issue: 2 operator actions unimplemented (MEDIUM)

**Status: FIXED**

**Action (1) — warn message in "published" case:**
`src/core/step/commit-push.ts` lines 917–919:
```typescript
stderrWrite(
  `Warning: checkpoint-restack: 以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること`,
);
```
Present. No regression.

**Action (2) — design.md Risks entry for non-ephemeral runner push rejection loop:**
`design.md` lines 254–258:
```
- **[Trade-off] graft（D6）後の non-ephemeral runner では、restack の原因となった push 拒否が
  解消されるまで halt → restack が繰り返され得る** → operator 裁定（2026-08-22, issue #1060）で
  許容範囲とした。halt 時の warn メッセージに「以降の push も同じ理由で拒否される可能性がある。
  ローカル branch を手当てしてから resume すること」を含め、operator の手当てへ誘導する。
  graft の無効化は non-fast-forward 問題を再発させるため採らない。
```
Both actions implemented. No regression.

---

### [15] `385eac5e` — F-03 re-issue: checkpointRestacks undefined when empty (LOW)

**Status: FIXED**

Same fix as finding [11]. `fold()` at `event-journal.ts` line 457 now always emits `checkpointRestacks: checkpointRestackRecords` unconditionally. No regression.

---

## Verdict Summary

| Finding | Ref | Severity | Status |
|---------|-----|----------|--------|
| [1] TC-027 in T-07 | `af388dac` | MEDIUM | FIXED |
| [2] reason field in spec.md | `5ba1c96d` | LOW | FIXED |
| [3] TC-029 priority | `fc3b2c01` | LOW | FIXED |
| [4] no-branch trigger in T-02 | `8bceb2e9` | LOW | FIXED |
| [5] TC-008/014/015 unit tests | `3689bdd9` | MEDIUM | FIXED |
| [6] TC-033 egress spy assertion | `472c648e` | LOW | FIXED |
| [7] TC-026 output order test | `6f513441` | LOW | FIXED |
| [8] TC-005 resumePoint.step | `a58ad837` | MEDIUM | FIXED |
| [9] TC-027 graft merge OID | `d219e919` | LOW | FIXED |
| [10] recordRestack guard | `4a634e3e` | MEDIUM | FIXED |
| [11] checkpointRestacks undefined | `8ca4a0dc` | LOW | FIXED |
| [12] state.json synthesizedCommits | `6490f6e6` | LOW | RESOLVED (design decision) |
| [13] F-01 re-issue | `874172d4` | MEDIUM | FIXED |
| [14] F-02 re-issue | `3cf860cc` | MEDIUM | FIXED |
| [15] F-03 re-issue | `385eac5e` | LOW | FIXED |

**Regressions: 0**
