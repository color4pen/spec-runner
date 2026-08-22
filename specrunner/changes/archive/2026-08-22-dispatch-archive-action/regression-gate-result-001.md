# Regression Gate Result — dispatch-archive-action (iteration 1)

## Ledger Entries Checked: 1

### [1] [LOW] 「neither path resolves」要件文が pre-existing の ARCHIVE_FROM_ISSUE_NO_PR ケースを暗黙的に包含
- **Provenance Ref**: `139df566`
- **File**: specrunner/changes/dispatch-archive-action/spec.md
- **Status**: FIXED — no regression

**Evidence**:
`spec.md` lines 91–94 (Requirement: Existing resolution paths shall retain priority and fallback behavior) now read:

> closing PR が存在するがいずれも identity 照合を通らない場合は `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を返 SHALL す。closing PR がゼロ件である場合は この Requirement のスコープ外であり、`ARCHIVE_FROM_ISSUE_NO_PR`（pre-existing 動作）を 返すことは本 Requirement に矛盾しない。

The SHALL clause is explicitly scoped to "closing PR が存在するがいずれも identity 照合を通らない" and the zero-PR case is called out as returning `ARCHIVE_FROM_ISSUE_NO_PR` (out of this Requirement's scope).
The Scenario "neither path resolves a target" (lines 112–118) likewise specifies "closing PR のいずれも identity 照合を通らない" in the Given, correctly excluding the zero-PR case.

## Summary

All 1 ledger finding verified as fixed. No regressions detected.
