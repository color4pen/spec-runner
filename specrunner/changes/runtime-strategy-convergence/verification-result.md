# Verification Result — runtime-strategy-convergence — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.6s | 0 |
| 2 | typecheck | failed | 15.8s | 2 |
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
[32mESM[39m ⚡️ Build success in 224ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
tests/unit/core/pipeline/registry-invariants.test.ts(58,58): error TS2345: Argument of type '{ canDeriveChangedFiles: () => false; }' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type '{ canDeriveChangedFiles: () => false; }' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/registry-invariants.test.ts(124,55): error TS2345: Argument of type '{ canDeriveChangedFiles: () => false; }' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type '{ canDeriveChangedFiles: () => false; }' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(65,54): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(76,43): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(93,43): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(113,43): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(129,43): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(147,54): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(158,66): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(163,69): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(185,56): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(194,56): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(206,62): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(215,51): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(225,62): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(230,62): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(244,66): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(250,69): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.
tests/unit/core/pipeline/runtime-capability-gate.test.ts(256,57): error TS2345: Argument of type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' is not assignable to parameter of type 'ChangedFilesCapability'.
  Property 'listChangedFiles' is missing in type 'Pick<ChangedFilesCapability, "canDeriveChangedFiles">' but required in type 'ChangedFilesCapability'.

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
