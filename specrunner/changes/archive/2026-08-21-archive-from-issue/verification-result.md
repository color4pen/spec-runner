# Verification Result — archive-from-issue — iter 1

## Verdict: passed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.5s | 0 |
| 2 | typecheck | passed | 5.9s | 0 |
| 3 | test | passed | 39.2s | 0 |
| 4 | lint | passed | 6.5s | 0 |
| 5 | changed-line-coverage | passed | 49.8s | 0 |
| 6 | lockfile-sync | skipped | — | — |

## Phase: build

```
CLI Building entry: bin/specrunner.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/specrunner.js 1.54 MB
ESM ⚡️ Build success in 80ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

 RUN  v4.1.5 .

Usage for: metrics-show-test-slug
────────────────────────────────────────────────────────────
[2026-01-01T10:00:00.000Z] job / design
  claude-opus-4-5: in=500 out=200 cacheRead=100 cacheCreate=50

────────────────────────────────────────────────────────────
Totals by model:
  claude-opus-4-5: in=500 out=200 cacheRead=100 cacheCreate=50
No jobs found.
[実行中]
JOB_ID	SLUG	STEP	STATUS	NEXT	AGE
job-run-	slug-job-run-1	init	running (stale?)	job resume slug-job-run-1	232d
{
  "categories": []
}
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: integration-slug
  Monitor: specrunner job wait integration-slug
  Details: specrunner job show integration-slug
Detached pipeline started for: ordering-test-slug
  Monitor: specrunner job wait ordering-test-slug
  Details: specrunner job show ordering-test-slug
Detached pipeline started for: wait-compat-slug
  Monitor: specrunner job wait wait-compat-slug
  Details: specrunner job show wait-compat-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug

 Test Files  805 passed (805)
      Tests  12023 passed | 1 skipped | 2 todo (12026)
   Start at  10:50:36
   Duration  38.79s (transform 6.61s, setup 4.10s, import 31.43s, tests 57.78s, environment 40ms)


$ vitest run
Warning: Could not parse verdict from agent step 'reviewer-A'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-B'. Treating as escalation.
Warning: Could not parse verdict from agent step 'code-review'. Treating as escalation.
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: /var/folders/s0/vp_nbg893qnchk0fxlkvb4sm0000gn/T/cred-test-kf6l0s/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /var/folders/s0/vp_nbg893qnchk0fxlkvb4sm0000gn/T/cred-test-he4ekw/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: Could not parse verdict from cli step 'pr-create'. Treating as escalation.
Warning: failed to push checkpoint commit for test-slug to origin/fix/test-branch-abc12345. Push manually to ensure state is on the branch.
Warning: checkpoint persistBeforePush failed for test-slug: disk-full: cannot persist. Continuing with push.
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-beta'. Treating as escalation.
Warning: Could not parse verdict from agent step 'implementer'. Treating as escalation.
Warning: Could not parse verdict from agent step 'implementer'. Treating as escalation.
Warning: pr-create: attestation comment failed: GitHub API error
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'implementer'. Treating as escalation.
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not json at all"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: ""
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: ""
Warning: linked branch registration failed: link failed
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
[specrunner] warn: session resume failed for 'implementer' (session: old-session-id): session not found: old-session-id. Falling back to new session.
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "plain prose no json"
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[inbox] started job slug=fix-login-bug from issue#1
[inbox] rejected issue#2: missing title (top-level # heading required) in issue#2
[inbox] started job slug=fix-login-bug from issue#1
[inbox] resumed job slug=fix-login-bug (issue#10)
[inbox] dry-run: no effects will be executed.
[inbox] plan: 1 start(s), 0 reject(s), 1 resume(s), 0 recover(s), 0 escalate(s)
  start    issue#1 → slug=fix-login-bug
  resume   fix-login-bug (issue#10)
[inbox] recovered stale job slug=my-feature (attempt 1)
[inbox] escalated stale job slug=my-feature to awaiting-resume
[inbox] dry-run: no effects will be executed.
[inbox] plan: 0 start(s), 0 reject(s), 0 resume(s), 1 recover(s), 1 escalate(s)
  recover  my-feature (attempt 1)
  escalate other-feat (step=design)
[inbox] warn: recover my-feature: disk full
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=old-feature (issue#50)
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "Sorry, no JSON here."
[codex] completion report parse failed (main turn): no-json-found; fragment: "not json"
Error: No job found for slug: not-found-slug
Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: /repo/.specrunner/logs/not-found-slug.detach.log
Error: No job found for slug: not-found-slug
Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: /repo/.specrunner/logs/not-found-slug.detach.log
Error: No job found for slug: not-found-slug
Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: /repo/.specrunner/logs/not-found-slug.detach.log
[specrunner] warn: steps.code-review.byRequestType.unknown-custom-type is not a known request type. Known types: bug-fix, spec-change, new-feature, refactoring, chore.
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (2/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (3/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (1/3)...
GitHub PR merge retry: Repository is in an unstable state. Please wait and try again., retrying (1/3)...
GitHub PR merge retry: Merge failed: branch locked (status 423), retrying (1/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (1/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (2/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (3/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Head branch was modified. Review and try the merge again., retrying (1/3)...
GitHub PR merge retry: Required status check "ci/build" is expected, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (2/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (3/3)...
GitHub PR merge retry: Required status check "ci/build" is expected, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (2/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (3/3)...
[inbox] started job slug=fix-login-bug from issue#99
Warning: issue-notifier: failed to write comment to issue #42: network error
Error: Detached pipeline for 'failure-slug' failed to start.
Detach log: /repo/.specrunner/logs/failure-slug.detach.log
--- log tail ---
Error: request.md preflight failed
Error: Detached pipeline for 'failure-discoverability-slug' failed to start.
Detach log: /repo/.specrunner/logs/failure-discoverability-slug.detach.log
--- log tail ---
preflight: provider not ready
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
failure reason
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
stale resume log
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
line1
line2
failure reason
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
spawn error: ENOENT
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
spawn pid undefined
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
(detach log is empty)
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
log content
Mapping resumePoint.step "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping resumePoint.step "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping resumePoint.step "test-materialize" → "implementer" (legacy alias)
Mapping resumePoint.step "test-materialize" → "implementer" (legacy alias)
Mapping state.step "test-materialize" → "implementer" (legacy alias)
Mapping state.step "test-materialize" → "implementer" (legacy alias)
Mapping state.step "build-fixer" → "implementer" (legacy alias)
Mapping state.step "build-fixer" → "implementer" (legacy alias)
[inbox] skip: occupancy comment for priorJobId=abc-1234-5678-90ab-cdef already posted on issue#1
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
Warning: archive-from-issue: skipping PR #99 (branch 'feat/my-feature'): 4-field identity mismatch (jobId=job-abc, issueNumber=5, branch=feat/my-feature, prNumber=42)
Warning: resume-from-issue: skipping branch 'feat/broken': fetch failed (exit 1)
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
ERROR: file not found
spawn ENOENT
Mapping --from "build-fixer" → "implementer" (legacy alias)
Warning: Could not verify change folder: this.githubClient.verifyPath is not a function
Warning: Could not verify change folder: this.githubClient.verifyPath is not a function
Mapping resumePoint.step "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping resumePoint.step "security" → "custom-reviewers" (member → coordinator)
Warning: Could not parse verdict from agent step 'design'. Treating as escalation.
Warning: Could not parse verdict from agent step 'spec-review'. Treating as escalation.
Mapping --from "build-fixer" → "implementer" (legacy alias)
Mapping resumePoint.step "build-fixer" → "implementer" (legacy alias)

```

## Phase: lint

```
$ eslint ./src ./tests --max-warnings 0

```

## Phase: changed-line-coverage

```
changed-line-coverage: passed (124 changed files checked, 113 skipped)
  Skipped (not in coverage surface): specrunner/changes/archive-from-issue/bite-evidence-result.md, specrunner/changes/archive-from-issue/conformance-result-001.md, specrunner/changes/archive-from-issue/cross-boundary-invariants-result-001.md, specrunner/changes/archive-from-issue/cross-boundary-invariants-result-002.md, specrunner/changes/archive-from-issue/design.md, specrunner/changes/archive-from-issue/events.jsonl, specrunner/changes/archive-from-issue/regression-gate-result-001.md, specrunner/changes/archive-from-issue/regression-gate-result-002.md, specrunner/changes/archive-from-issue/request-review-attestation.json, specrunner/changes/archive-from-issue/request-review-result-001.md, specrunner/changes/archive-from-issue/request.md, specrunner/changes/archive-from-issue/review-feedback-001.md, specrunner/changes/archive-from-issue/rules.md, specrunner/changes/archive-from-issue/scale-tolerance-result-001.md, specrunner/changes/archive-from-issue/scale-tolerance-result-002.md, specrunner/changes/archive-from-issue/spec-review-result-001.md, specrunner/changes/archive-from-issue/spec.md, specrunner/changes/archive-from-issue/state.json, specrunner/changes/archive-from-issue/tasks.md, specrunner/changes/archive-from-issue/test-cases.md, specrunner/changes/archive-from-issue/usage.json, specrunner/changes/archive-from-issue/verification-result.md, src/adapter/github/__tests__/github-client-closing-prs.test.ts, src/cli/__tests__/archive-from-issue.test.ts, src/cli/__tests__/attach.test.ts, src/cli/__tests__/from-issue.test.ts, src/core/archive/__tests__/merge-then-archive.test.ts, src/core/attach/__tests__/checkpoint-policy.test.ts, src/core/issue-target/__tests__/archive.test.ts, src/core/job/__tests__/start-from-issue.test.ts, src/core/step/__tests__/verdict-channel-unification.test.ts, tests/adapter/managed-agent/agent-runner.test.ts, tests/cli-stdout-snapshot.test.ts, tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts, tests/core/pipeline/pipeline.guard-halt.test.ts, tests/core/pipeline/pipeline.test.ts, tests/core/provider-readiness-gate.test.ts, tests/core/step/step-interface.test.ts, tests/core/steps/spec-review.test.ts, tests/custom-reviewers-e2e.test.ts, tests/error-codes.test.ts, tests/helpers/pipeline-mock-client.ts, tests/local-no-jobs-dir-writes.test.ts, tests/pipeline-sole-committer-e2e.test.ts, tests/pipeline.test.ts, tests/reviewer-activation-e2e.test.ts, tests/spec-review-step.test.ts, tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts, tests/unit/adapter/agent-runner-port.test.ts, tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts, tests/unit/adapter/managed-agent/agent-runner-verbose-log.test.ts, tests/unit/adapter/managed-agent/agent-runner.test.ts, tests/unit/contract/golden-cases.test.ts, tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts, tests/unit/core/archive/achieved-assurance-revision-binding-integration.test.ts, tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts, tests/unit/core/archive/merge-then-archive-floor.test.ts, tests/unit/core/archive/merge-then-archive.test.ts, tests/unit/core/command/runner-fidelity-gate.test.ts, tests/unit/core/notify/issue-notifier.test.ts, tests/unit/core/pipeline/pipeline-roles.test.ts, tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts, tests/unit/core/pipeline/pipeline.cli-step-output.test.ts, tests/unit/core/pipeline/pipeline.conformance-routing.test.ts, tests/unit/core/pipeline/pipeline.crash-state.test.ts, tests/unit/core/pipeline/pipeline.episode-reset.test.ts, tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts, tests/unit/core/pipeline/pipeline.notification.test.ts, tests/unit/core/pipeline/pipeline.reverification.test.ts, tests/unit/core/pipeline/pipeline.storeFactory.test.ts, tests/unit/core/pipeline/pipeline.transitions.test.ts, tests/unit/core/pr-create/runner.test.ts, tests/unit/core/runtime/bootstrap-egress-ledger-local.test.ts, tests/unit/core/runtime/bootstrap-egress-ledger-managed.test.ts, tests/unit/core/runtime/factory.test.ts, tests/unit/core/runtime/local-duplicate-guard.test.ts, tests/unit/core/runtime/local-power-assertion.test.ts, tests/unit/core/runtime/local-read-revision-content.test.ts, tests/unit/core/runtime/local.test.ts, tests/unit/core/runtime/managed.test.ts, tests/unit/core/runtime/read-file-at-commit.test.ts, tests/unit/core/runtime/runner-reload-after-setup.test.ts, tests/unit/core/runtime/runner-reload-egress-e2e.test.ts, tests/unit/core/runtime/verify-finding-refs.test.ts, tests/unit/core/step/executor-cli-entry-oid.test.ts, tests/unit/core/step/verification-phase-outcome-executor.test.ts, tests/unit/inbox/occupancy-propagation.test.ts, tests/unit/inbox/orchestrator.test.ts, tests/unit/inbox/run-inbox-inbox-origin.test.ts, tests/unit/no-worktree-mode.test.ts, tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts, tests/unit/pipeline/transition-when.test.ts, tests/unit/step/commit-and-push.test.ts, tests/unit/step/commit-push-write-scope.test.ts, tests/unit/step/content-format-detection.test.ts, tests/unit/step/executor-commit-mutex.test.ts, tests/unit/step/executor-drift-detection.test.ts, tests/unit/step/executor-input-validation.test.ts, tests/unit/step/executor-no-op.test.ts, tests/unit/step/executor-output-gate.test.ts, tests/unit/step/executor-resume-context.test.ts, tests/unit/step/executor-verbose-log.test.ts, tests/unit/step/executor-verdict.test.ts, tests/unit/step/executor.commit.test.ts, tests/unit/step/executor.store-cache.test.ts, tests/unit/step/executor.test.ts, tests/unit/step/pipeline-sole-committer-synthesis.test.ts, tests/unit/step/pr-create-attestation.test.ts, tests/unit/step/pr-create.test.ts, tests/unit/step/review-exit-contract.test.ts, tests/unit/step/test-coverage-violation-detail.test.ts, tests/unit/step/write-scope-bypass-closure-integration.test.ts, tests/unit/step/write-scope-bypass-closure.test.ts
  Type-only (no runtime code, absent from lcov): src/kernel/github-client.ts
```

## Phase: lockfile-sync

lockfile-sync: package.json の変更なし — スキップ
