# Verification Result — gitless-artifact-output — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.5s | 0 |
| 2 | typecheck | failed | 14.9s | 2 |
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
[32mESM[39m [1mdist/specrunner.js [22m[32m1.59 MB[39m
[32mESM[39m ⚡️ Build success in 208ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
src/core/snapshot/collect.ts(94,5): error TS2322: Type 'string[]' is not assignable to type 'Dirent<NonSharedBuffer>[]'.
  Type 'string' is not assignable to type 'Dirent<NonSharedBuffer>'.
src/core/snapshot/collect.ts(102,40): error TS2345: Argument of type 'Dirent<NonSharedBuffer>' is not assignable to parameter of type 'string'.

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
