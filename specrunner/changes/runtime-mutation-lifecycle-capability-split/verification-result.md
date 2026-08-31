# Verification Result — runtime-mutation-lifecycle-capability-split — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.7s | 0 |
| 2 | typecheck | failed | 15.9s | 2 |
| 3 | test | skipped | — | — |
| 4 | lint | skipped | — | — |
| 5 | changed-line-coverage | skipped | — | — |
| 6 | lockfile-sync | skipped | — | — |

## Phase: build

```
[34mCLI[39m Building entry: bin/specrunner.ts
[34mCLI[39m Using tsconfig: tsconfig.json
[34mCLI[39m tsup v8.5.1
[34mCLI[39m Using tsup config: tsup.config.ts
[34mCLI[39m Target: node20
[34mCLI[39m Cleaning output folder
[34mESM[39m Build start
[32mESM[39m [1mdist/specrunner.js [22m[32m1.58 MB[39m
[32mESM[39m ⚡️ Build success in 227ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(225,92): error TS2339: Property 'mock' does not exist on type '(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams | undefined) => Promise<...>'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(248,63): error TS2339: Property 'mock' does not exist on type '(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams | undefined) => Promise<...>'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(363,63): error TS2339: Property 'mock' does not exist on type '(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams | undefined) => Promise<...>'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1050,63): error TS2339: Property 'mock' does not exist on type '(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams | undefined) => Promise<...>'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1223,63): error TS2339: Property 'mock' does not exist on type '(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams | undefined) => Promise<...>'.

$ tsc --noEmit

```

## Phase: test

_(skipped — previous command failed)_

## Phase: lint

_(skipped — previous command failed)_

## Phase: changed-line-coverage

_(skipped — previous command failed)_

## Phase: lockfile-sync

_(skipped — previous command failed)_
