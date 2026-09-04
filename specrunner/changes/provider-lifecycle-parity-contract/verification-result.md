# Verification Result — provider-lifecycle-parity-contract — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.6s | 0 |
| 2 | typecheck | failed | 16.8s | 2 |
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
[32mESM[39m ⚡️ Build success in 231ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(314,7): error TS2322: Type 'Dirent<string>[]' is not assignable to type 'Dirent<NonSharedBuffer>[]'.
  Type 'Dirent<string>' is not assignable to type 'Dirent<NonSharedBuffer>'.
    Type 'string' is not assignable to type 'NonSharedBuffer'.
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(324,51): error TS2345: Argument of type 'NonSharedBuffer' is not assignable to parameter of type 'string'.
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(334,28): error TS2345: Argument of type 'NonSharedBuffer' is not assignable to parameter of type 'string'.
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(334,105): error TS2345: Argument of type 'NonSharedBuffer' is not assignable to parameter of type 'PropertyKey'.
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(501,9): error TS2322: Type 'Dirent<string>[]' is not assignable to type 'Dirent<NonSharedBuffer>[]'.
  Type 'Dirent<string>' is not assignable to type 'Dirent<NonSharedBuffer>'.
    Type 'string' is not assignable to type 'NonSharedBuffer'.
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(507,35): error TS2345: Argument of type 'NonSharedBuffer' is not assignable to parameter of type 'string'.
tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts(510,31): error TS2339: Property 'endsWith' does not exist on type 'NonSharedBuffer'.
tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts(379,49): error TS2352: Conversion of type 'AgentRunResult' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Index signature for type 'string' is missing in type 'AgentRunResult'.

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
