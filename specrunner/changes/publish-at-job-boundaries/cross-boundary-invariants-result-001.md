# Cross-Boundary Invariants Review Result

<!--
Evidence report only. The CLI derives the verdict from typed findings.
No verdict line is intentionally included.
-->

## Review scope

- Change: `publish-at-job-boundaries`
- Reviewer: `cross-boundary-invariants`
- Iteration: 1
- Scope was established with `git diff main...HEAD --stat` (83 changed files at review time).
- `design.md` and `tasks.md` were checked against the implementation.
- Existing verification evidence was reused; the project-wide test/lint/typecheck suite was not rerun.

## Cross-boundary paths examined

| New behavior | Unchanged or adjacent invariant checked | Result |
|---|---|---|
| Local step and fixer finalization is commit-only | Scoped/guarded staging, exclusions, synthesized-commit persistence, executor state persistence, and later revision binding still run before the next step | Preserved |
| Parallel review round is commit-only | Coordinator-owned state, round invalidation, and the single round commit boundary remain intact; member execution still does not publish independently | Preserved |
| Verification result is committed locally | The following local step reads the same worktree; the verification commit OID is added to the in-memory ledger before executor persistence | Preserved |
| Publication is separated from commit creation | A no-diff retry inspects the remote-relative commit range; all outgoing OIDs must already be in `synthesizedCommits`; dirty or excluded worktree content is not staged by publication | Preserved |
| PR-producing completion publishes before `pr-create` | The unchanged PR runner continues to assume its head exists remotely, and it is now entered only after successful pre-PR publication | Preserved |
| Final record publication occurs after PR processing | PR identity is persisted locally before the final commit/publication; existing-PR lookup remains the idempotency mechanism on retry | Preserved |
| No-PR and GitHub-disabled completion publishes at `awaiting-archive` | The common terminal transition commits the safe managed paths and publishes without requiring a GitHub client | Preserved |
| Controlled halt publication is policy-gated | Pipeline halts and the pre-pipeline fidelity gate persist a quiescent state, commit only managed paths, publish only when the stored policy permits it, and suppress remote-resume guidance unless publication succeeded | Preserved |
| Reopen after final publication failure | The existing `awaiting-archive -> awaiting-resume` operator-only transition remains the retry gate; the new exception is limited to a no-PR `PUBLICATION_FAILED` state | Preserved |
| Managed runtime and archive responsibilities | Managed terminal capabilities remain no-op/already-synchronized rather than adopting local Git behavior; archive retains its independent publication-before-cleanup contract | Preserved |

## Findings

No typed findings.

No concrete execution sequence was found in which a new publication boundary violates an implicit assumption in unchanged code.

## Evidence notes

- Inspected the changed publication orchestration and its callers/consumers in `pipeline.ts`, `runner.ts`, `local.ts`, `managed.ts`, `commit-push.ts`, verification propagation, notification rendering, state policy accessors, and reopen handling.
- Traced the two important persisted-state interactions: final-state commit OIDs are appended through the job store and mirrored into the caller's in-memory ledger; verification commit OIDs are appended before the executor's normal post-step persistence.
- Confirmed failure paths do not reach the PR API after pre-PR publication failure and do not advertise remote readiness after disabled or failed halt publication.
- Signal/before-exit behavior was left outside the new publication seam, matching the documented local-only abrupt-termination invariant.

## Observations

None.
