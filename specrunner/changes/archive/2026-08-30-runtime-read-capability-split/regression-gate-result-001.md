# Regression Gate Result — Iteration 1

## Summary

All 3 ledger findings verified as fixed. No regressions detected.

---

## Finding [1] — `5baa7504` [MEDIUM]
**TC-005 / TC-020: detectNoOp — listChangedFiles unavailable path**

**Verified: FIXED**

`tests/unit/core/step/capability-consumers.test.ts` lines 82–133 now contain a dedicated
`describe("TC-005 / TC-020: ...")` block with two tests:

1. `listChangedFiles returns { kind: 'unavailable' } → changedFiles treated as empty → no-op detected`
   — directly passes `{ kind: "unavailable", reason: "managed runtime" }` to `detectNoOp` and asserts the
   result is `"needs-fix"` (unavailable → empty changedFiles → no source files → no-op).
2. `listChangedFiles returns { kind: 'success', files: ['src/a.ts'] } → source file present → no no-op`
   — negative case confirming the happy path is not regressed.

The title contradiction is also resolved: the describe title now reads
"変更ファイルは空として扱われる" which matches the actual code behavior.

---

## Finding [2] — `3bbf72ba` [MEDIUM]
**TC-010 / TC-021: derivePriorRoundContext — null-degrade at iteration≥2**

**Verified: FIXED**

Two new describe blocks cover the previously untested paths:

- **TC-010** (lines 207–238): `iteration=2`, `priorOid` resolvable via `steps["spec-fixer"][0].commitOid`,
  but `listCommitChangedFiles` is absent on the `CommitInspectionCapability` object → result is `null`.
- **TC-021** (lines 240–305): same setup, but `listCommitChangedFiles` present and returns
  `{ kind: "unavailable", reason: "managed runtime" }` → result is `null`.
  A positive control test (returns `success`) confirms the non-degrade path still works.

Both tests exercise iteration≥2 with a resolvable `priorOid`, satisfying the must-priority TC coverage.

---

## Finding [3] — `cd0bd1fb` [LOW]
**Stale comment in achieved-assurance.test.ts**

**Verified: FIXED**

Line 140 of `src/core/archive/__tests__/achieved-assurance.test.ts` now reads:

```
// AssuranceProvenanceRuntime is a consumer-owned capability interface with only readFileAtCommit.
```

The old text `Pick<RuntimeStrategy, "readFileAtCommit">` has been removed. The comment correctly
describes the post-T-08 state where `AssuranceProvenanceRuntime` is a consumer-owned explicit
interface, not a `Pick` alias.

---

## Evidence

- Checked: 3
- Skipped: 0
- Unverified: 0
