# Regression Gate Evidence — Iteration 1

## Scope

- Compared `main...HEAD` and inspected every site in the 10-item findings ledger.
- Reused the recorded successful build, typecheck, test, lint, changed-line coverage, and lockfile evidence in `verification-result.md`; no duplicate full-suite run was performed.
- Regressions found: none.

## Ledger verification

1. `0e2d4f13` — The design, tasks, spec, and TC-006/TC-035 consistently define the missing-remote-ref range as `HEAD --not --remotes=origin`. `publishCommittedBranch` implements that fallback and its unit tests assert it.
2. `8ac6e593` — All listed design/task sites require the authenticated transport seam and secret-safe diagnostics. `LocalRuntime.publishCommittedState` uses `wrappedSpawnFn`; publication results contain only generic inspect/egress/push errors and do not retain remote stderr or credential-bearing argv.
3. `eab8b507` — `commitFinalState` returns typed failures. Both terminal pipeline completion and the pre-pipeline gate check the result, persist `PUBLICATION_FAILED`, and do not publish after commit failure.
4. `566eb3c7` — The pre-PR publication throws `SpecRunnerError("PUBLICATION_FAILED", ...)`; the surrounding catch now preserves a `SpecRunnerError` code and hint. The crash-state test asserts persisted `pre-pr/push` diagnostics.
5. `1030d801` — Pipeline and pre-pipeline controlled-halt paths always call `commitFinalState`; only `publishCommittedState` is guarded by the saved halt-publication policy.
6. `b92353b2` — Pipeline and runner pass the explicit publication outcome to the notifier. `remoteResumeReady` is false unless publication is enabled and returned `published` or `already-synchronized`; disabled/failed paths render same-worktree guidance without compare or issue-resume guidance.
7. `f363c5a1` — The Actions example explicitly requires `pipeline.publishCheckpointOnHalt: true`, and both it and operations documentation condition remote recovery on successful publication.
8. `bf7f7517` — `isNoPrPublicationRetry` permits an awaiting-archive GitHub-enabled job with no PR and `PUBLICATION_FAILED` to pass the reopen PR gate. Dedicated command/CLI tests cover the exception.
9. `c897704b` — Verification propagation returns failure for add, commit, or HEAD inspection failure. The verification step throws `PUBLICATION_FAILED` and only appends a successfully resolved commit OID to the synthesized ledger; subsequent pipeline persistence occurs before any publication boundary.
10. `41ff9320` — Terminal-state tests assert `no-change`, `committed`, and typed stage/commit failures and verify that failure paths never push; the obsolete undefined-result assertions are absent.

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
