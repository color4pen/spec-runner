# Verification Result — pr-status-tests — iter 1

## Verdict: passed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 1.1s | 0 |
| 2 | typecheck | passed | 2.6s | 0 |
| 3 | test | passed | 11.3s | 0 |
| 4 | lint | passed | 2.8s | 0 |

## Phase: build

```
CLI Building entry: bin/specrunner.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: ~/Documents/GitHub/spec-runner/.git/specrunner-worktrees/pr-status-tests-3eb024e1/tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/specrunner.js 627.86 KB
ESM ⚡️ Build success in 47ms

$ tsup

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

 RUN  v4.1.5 ~/Documents/GitHub/spec-runner/.git/specrunner-worktrees/pr-status-tests-3eb024e1

No jobs found.
JOB_ID	SLUG	STEP	STATUS	BRANCH	AGE
job-run-	slug-job-run-1	init	running (stale?)	feat/test	158d

 Test Files  294 passed (294)
      Tests  3457 passed (3457)
   Start at  17:50:51
   Duration  11.02s (transform 2.87s, setup 0ms, import 8.34s, tests 12.34s, environment 14ms)


$ vitest run
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
Warning: /var/folders/s0/vp_nbg893qnchk0fxlkvb4sm0000gn/T/cred-test-QxlVB5/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /var/folders/s0/vp_nbg893qnchk0fxlkvb4sm0000gn/T/cred-test-50HSSt/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: A vi.mock("node:child_process") call in "~/Documents/GitHub/spec-runner/.git/specrunner-worktrees/pr-status-tests-3eb024e1/tests/git-remote.test.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works

```

## Phase: lint

```
$ eslint ./src ./tests --max-warnings 0

```
