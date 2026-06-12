# Verification Result — conformance-fix-target — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 1.3s | 0 |
| 2 | typecheck | passed | 3.1s | 0 |
| 3 | test | passed | 15.7s | 0 |
| 4 | lint | failed | 3.8s | 1 |

## Phase: build

```
CLI Building entry: bin/specrunner.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/specrunner.js 823.63 KB
ESM ⚡️ Build success in 59ms

$ tsup

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

 RUN  v4.1.5 .

No jobs found.
JOB_ID	SLUG	STEP	STATUS	BRANCH	AGE
job-run-	slug-job-run-1	init	running (stale?)	feat/test	162d

 Test Files  359 passed (359)
      Tests  4562 passed (4562)
   Start at  09:50:44
   Duration  15.38s (transform 3.40s, setup 0ms, import 11.27s, tests 20.06s, environment 19ms)


$ vitest run
Warning: /var/folders/s0/vp_nbg893qnchk0fxlkvb4sm0000gn/T/cred-test-0UjWr1/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /var/folders/s0/vp_nbg893qnchk0fxlkvb4sm0000gn/T/cred-test-hyN7ki/specrunner/credentials.json has loose permissions (recommend 0600).
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
[specrunner] warn: steps.code-review.byRequestType.unknown-custom-type is not a known request type. Known types: bug-fix, spec-change, new-feature, refactoring, chore.
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
Warning: issue-notifier: failed to write comment to issue #42: network error
Warning: A vi.mock("node:child_process") call in "tests/git-remote.test.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works

```

## Phase: lint

Step 'lint' failed

```

src/core/port/report-result.ts
  285:18  error  An interface declaring no members is equivalent to its supertype  @typescript-eslint/no-empty-object-type

✖ 1 problem (1 error, 0 warnings)


$ eslint ./src ./tests --max-warnings 0
error: script "lint" exited with code 1

```
