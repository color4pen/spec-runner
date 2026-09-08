# Cross-Boundary Invariants Review Result

<!--
Evidence report only. The CLI derives the verdict from typed findings.
No verdict line is intentionally included.
-->

## Review scope

- Change: `publish-at-job-boundaries`
- Reviewer: `cross-boundary-invariants`
- Iteration: 2
- Scope was established with `git diff main...HEAD --stat` (94 changed files at review time).
- `design.md` and `tasks.md` were checked against the implementation and the iteration-2 operator adjudications.
- Existing verification evidence was reused; project-wide test/lint/typecheck commands were not rerun.

## Cross-boundary paths examined

| New behavior | Unchanged or adjacent invariant checked | Result |
|---|---|---|
| Local normal/fixer/round finalization defers publication | The executor still serializes Git effects, retains scoped staging and exclusions, records exit revisions, and persists step state before later consumers run | Preserved |
| Local verification commits without publishing | The next local step reads the same worktree; the result commit is ledgered before executor persistence and remains bound to the evaluated entry revision | Preserved |
| Managed verification adds a narrow publication handoff | Only `ManagedRuntime.buildDeps` injects the handoff; the result OID is added before egress inspection, failure halts before the next remote agent, and an unchanged-result retry still attempts publication | Preserved |
| Publication operates independently of commit creation | Remote-relative outgoing commits are checked in full against `synthesizedCommits`; a clean worktree/no-new-commit retry does not bypass publication, and publication does not stage residual files | Preserved |
| PR processing gains a pre-API publication boundary | The unchanged PR runner's remote-head assumption is satisfied before both create and existing-open processing; a failed publication is converted to a resumable halt before the API is invoked | Preserved |
| Terminal records are committed and published after PR/no-PR completion | The store callback records the terminal commit OID both durably and in the caller's in-memory ledger before publication; publication failure preserves `awaiting-archive` state for the explicit reopen path | Preserved |
| Controlled halts are conditionally published | Pipeline and pre-pipeline gate paths save quiescent state and commit managed paths before consulting the stored policy; disabled, missing, commit-failed, and push-failed outcomes do not emit remote-ready guidance | Preserved |
| Reopen admits no-PR publication retries | The exception is limited to `awaiting-archive`, absent PR identity, and `PUBLICATION_FAILED`; the existing operator-only reopen transition remains the sole route back to resumable state | Preserved |
| Archive and managed terminal behavior remain separate | Archive still requires its own record push before archived/cleanup, while managed terminal publication stays a no-op and only the verification cross-checkout seam publishes | Preserved |
| Abrupt termination remains outside controlled publication | Signal/before-exit paths continue to persist locally and do not call the new publication capability | Preserved |

## Findings

No typed findings.

No concrete step-by-step execution sequence was found in which the new behavior violates an implicit invariant in unchanged adjacent code.

## Evidence notes

- Re-read the current publication orchestration and adjacent consumers in `pipeline.ts`, `runner.ts`, `local.ts`, `managed.ts`, `commit-push.ts`, verification propagation, notification rendering, state policy accessors, reopen handling, and the unchanged archive publisher.
- Specifically re-evaluated operator commit `87a6f558`: managed verification publishes through the authenticated/redacted Git transport only after its commit OID enters the ledger; local verification receives no such capability.
- Traced publication failures through executor halt application, terminal checkpoint commit, notification rendering, command result mapping, and reopen eligibility rather than treating isolated unit success as sufficient evidence.
- Confirmed the prior-round approved invariants remain present after the subsequent operator changes; no prior finding required reissue.

## Observations

None.
