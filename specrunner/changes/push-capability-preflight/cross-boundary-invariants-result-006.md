# Cross-Boundary Invariants Review — push-capability-preflight

Reviewer: cross-boundary-invariants  
Iteration: 6  
Date: 2026-08-23

## Scope and evidence

- Ran `git diff main...HEAD --stat` and reviewed the current 47-file change surface.
- Read the current `design.md`, `tasks.md`, reviewer definition, and the iteration-5 report.
- Re-read the repaired round-commit path and traced it into the unchanged `captureHeadSha` nullable contract, `CommitOrchestrator.commitRound`, and the `synthesizedCommits` egress authorization ledger.
- Traced Layer 1 through all three adapter repair loops and the executor's post-run output gate. All adapters use 1-based attempt numbering and now honor the nullable prompt sentinel, so a persistent `unpushable-path` violation receives one repair turn while other contracts retain their second turn.
- Traced Layer 2 through both sequential `commitAndPush` and round-owned `commitScopedPaths`, including the unchanged staging, commit, inline-egress, push, and awaiting-resume persistence paths.
- Ran the focused suite covering round git effects, scoped commits, output-contract budgeting, escalation, and publishable-path collection. 94 tests passed; the direct `bun test` invocation could not load one Vitest-specific mock because Bun's compatibility shim lacks `vi.importActual`. This is a test-runner invocation limitation, not evidence of a product failure; the remaining four focused files completed green.

## Typed findings

None.

## Resolved prior finding

The iteration-5 HIGH finding is resolved. `headAdvanced` is now true only when both the before and after observations are non-null and differ. With a null pre-observation plus a pre-commit backstop rejection, the existing HEAD is not assigned to `roundCommitOid` and is not appended to `synthesizedCommits`; the round instead takes the required evidence-unavailable escalation path. The added tests also retain the positive control in which two non-null, different observations record the newly created commit.

## Verified cross-boundary invariants

- A pre-commit Layer 2 rejection cannot authorize a pre-existing commit in the synthesized-commit ledger, including when the pre-observation is unavailable.
- A post-commit push failure with two reliable, differing HEAD observations still records the locally created commit, preserving resume compatibility with the unchanged egress checker.
- Round-owned artifact publication receives the same full unpublished-range check as sequential step publication; safe `stagePaths` cannot hide a protected path in an earlier unpushed commit.
- Empty or absent capability patterns do not add publish-range git commands to either commit path or to output validation.
- The nullable `buildPrompt` boundary is implemented consistently by Claude Code, Codex, and managed-agent adapters; filtered-only violations do not produce an empty second repair turn.
- Persistent Layer 1 violations and typed Layer 2 errors preserve matched paths into the unchanged awaiting-resume persistence/notification machinery without parsing display text.
- Managed output validation skips the local-only contract before branch-dependent validation.
- Capability detection remains per-run, retains no token, and notice-only prediction does not alter request-review control flow.

## Evidence summary

- Checked: 24 cross-boundary invariants
- Skipped: 0
- Unverified: 0
