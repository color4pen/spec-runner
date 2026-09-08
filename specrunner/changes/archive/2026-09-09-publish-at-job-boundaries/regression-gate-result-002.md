# Regression Gate Evidence — Iteration 2

## Scope

- Compared `main...HEAD` and inspected every site in the 10-item findings ledger.
- Rechecked the implementation changed after iteration 1, especially the managed-runtime verification handoff added by `87a6f558`.
- Reused the successful build, typecheck, test, lint, changed-line coverage, and focused-test evidence recorded in `verification-result.md`; no duplicate full-suite run was performed.
- Regressions found: none.

## Ledger verification

1. `0e2d4f13` — Design, tasks, spec, and test cases consistently require the missing-remote-ref fallback equivalent to `HEAD --not --remotes=origin`; the current publisher retains that behavior.
2. `8ac6e593` — Publication boundaries continue to use the runtime's authenticated/redacted spawn seam. The subsequently restored managed verification handoff also uses `wrappedSpawnFn` and returns only sanitized phase diagnostics.
3. `eab8b507` — `commitFinalState` returns typed failures. Pipeline completion and the pre-pipeline gate stop before publication when the required terminal/checkpoint commit fails and persist `PUBLICATION_FAILED`.
4. `566eb3c7` — Pre-PR publication throws `SpecRunnerError("PUBLICATION_FAILED", ...)`, and the executor catch preserves its typed code and phase hint in persisted state.
5. `1030d801` — Both controlled-halt sites always attempt the scoped local checkpoint commit; the saved policy controls only the subsequent remote publication.
6. `b92353b2` — Pipeline and CommandRunner pass an explicit publication outcome to notification rendering. Remote compare/issue-resume guidance is emitted only for `published` or `already-synchronized` outcomes.
7. `f363c5a1` — The Actions workflow explicitly requires `pipeline.publishCheckpointOnHalt: true`, and it and `docs/operations.md` condition cross-runner recovery on successful publication.
8. `bf7f7517` — `isNoPrPublicationRetry` permits an awaiting-archive, PR-less job with `PUBLICATION_FAILED` through the reopen PR gate, preserving the supported no-diff retry path.
9. `c897704b` — Verification add/commit/HEAD-inspection failure returns a failed propagation result and aborts the step. A successful commit OID is added to `synthesizedCommits` before any optional managed handoff publication; local runtime retains commit-only behavior.
10. `41ff9320` — Terminal-state tests assert `no-change`, `committed`, and typed stage/commit failures, including that failure paths never push; the obsolete undefined-result assertions remain absent.

## Result data

```json
{
  "findings": [],
  "evidence": {
    "checked": 10,
    "skipped": 0,
    "unverified": 0
  }
}
```
