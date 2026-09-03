# Verification Result — cli-handler-exit-boundary — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.5s | 0 |
| 2 | typecheck | failed | 10.9s | 2 |
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
[32mESM[39m ⚡️ Build success in 180ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
src/cli/__tests__/architecture-ratchet.test.ts(694,19): error TS2352: Conversion of type 'ExportNamedDeclarationWithoutSourceWithMultiple | ExportNamedDeclarationWithoutSourceWithSingle | ExportNamedDeclarationWithSource' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'ExportNamedDeclarationWithSource' is not comparable to type 'Record<string, unknown>'.
    Index signature for type 'string' is missing in type 'ExportNamedDeclarationWithSource'.
src/cli/__tests__/architecture-ratchet.test.ts(700,22): error TS2352: Conversion of type 'ExportNamedDeclarationWithoutSourceWithMultiple | ExportNamedDeclarationWithoutSourceWithSingle | ExportNamedDeclarationWithSource' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'ExportNamedDeclarationWithSource' is not comparable to type 'Record<string, unknown>'.
    Index signature for type 'string' is missing in type 'ExportNamedDeclarationWithSource'.
tests/unit/cli/command-spec-api.test.ts(248,7): error TS2322: Type '() => Promise<void>' is not assignable to type 'CommandHandler'.
  Type 'Promise<void>' is not assignable to type 'Promise<number>'.
    Type 'void' is not assignable to type 'number'.
tests/unit/cli/command-spec-api.test.ts(253,11): error TS2322: Type '() => Promise<void>' is not assignable to type 'CommandHandler'.
  Type 'Promise<void>' is not assignable to type 'Promise<number>'.
    Type 'void' is not assignable to type 'number'.
tests/unit/cli/command-spec-api.test.ts(278,7): error TS2322: Type '() => Promise<void>' is not assignable to type 'CommandHandler'.
  Type 'Promise<void>' is not assignable to type 'Promise<number>'.
    Type 'void' is not assignable to type 'number'.
tests/unit/cli/command-spec-api.test.ts(284,11): error TS2322: Type '() => Promise<void>' is not assignable to type 'CommandHandler'.
  Type 'Promise<void>' is not assignable to type 'Promise<number>'.
    Type 'void' is not assignable to type 'number'.

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
