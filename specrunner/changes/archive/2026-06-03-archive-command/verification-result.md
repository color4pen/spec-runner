# Verification Result — archive-command — iter 1

## Verdict: passed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.2s | 0 |
| 2 | typecheck | passed | 2.3s | 0 |
| 3 | test | passed | 7.6s | 0 |
| 4 | lint | passed | 1.0s | 0 |

## Phase: build

```
CLI Building entry: bin/specrunner.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: ~/Documents/GitHub/spec-runner/.git/specrunner-worktrees/archive-command-43f79fcc/tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/specrunner.js 558.11 KB
ESM ⚡️ Build success in 37ms

$ tsup

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

 RUN  v4.1.5 ~/Documents/GitHub/spec-runner/.git/specrunner-worktrees/archive-command-43f79fcc

No jobs found.
JOB_ID	SLUG	STEP	STATUS	BRANCH	AGE
job-run-	slug-job-run-1	init	running (stale?)	feat/test	153d

 Test Files  271 passed (271)
      Tests  3088 passed (3088)
   Start at  18:56:10
   Duration  7.41s (transform 3.88s, setup 0ms, import 10.02s, tests 13.69s, environment 16ms)


$ vitest run
Warning: /tmp/claude-501/cred-test-A5wpsH/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /tmp/claude-501/cred-test-f8YFP5/specrunner/credentials.json has loose permissions (recommend 0600).
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
Retrying check 4: mergeStateStatus was UNKNOWN (attempt 1/3)...
Retrying check 4: mergeStateStatus was UNKNOWN (attempt 2/3)...
Retrying check 4: mergeStateStatus was UNKNOWN (attempt 1/3)...
Retrying check 4: mergeStateStatus was UNKNOWN (attempt 2/3)...
Post-push polling: mergeStateStatus=BEHIND, retrying (1/5)...
Post-push polling: mergeStateStatus=BEHIND, retrying (2/5)...
Post-push polling: mergeStateStatus=UNKNOWN, retrying (1/5)...
Post-push polling: mergeStateStatus=UNKNOWN, retrying (2/5)...
Post-push polling: mergeStateStatus=UNKNOWN, retrying (3/5)...
Post-push polling: mergeStateStatus=UNKNOWN, retrying (4/5)...
Post-push polling: mergeStateStatus=BEHIND, retrying (1/5)...
Post-push polling: mergeStateStatus=BEHIND, retrying (2/5)...
[specrunner] warn: steps.code-review.byRequestType.unknown-custom-type is not a known request type. Known types: bug-fix, spec-change, new-feature, refactoring, chore.
Warning: A vi.mock("node:child_process") call in "~/Documents/GitHub/spec-runner/.git/specrunner-worktrees/archive-command-43f79fcc/tests/git-remote.test.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works

```

## Phase: lint

```
$ eslint ./src --max-warnings 0

```
