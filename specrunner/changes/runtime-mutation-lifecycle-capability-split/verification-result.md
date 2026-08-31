# Verification Result — runtime-mutation-lifecycle-capability-split — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.6s | 0 |
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
[32mESM[39m ⚡️ Build success in 246ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
tests/unit/core/step/capability-consumers.test.ts(187,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(200,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(233,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(267,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(298,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(323,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(347,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; reviewerName: string; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/capability-consumers.test.ts(361,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type '{ state: JobState; reviewerName: string; iteration: number; cwd: string; commitInspection: CommitInspectionCapability | undefined; }'.
tests/unit/core/step/finding-recency.test.ts(282,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(326,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(347,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(390,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(429,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(473,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(504,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.
tests/unit/core/step/finding-recency.test.ts(531,7): error TS2353: Object literal may only specify known properties, and 'runtimeStrategy' does not exist in type 'RecordFindingRecencyParams'.

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
