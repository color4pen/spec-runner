# Verification Result — pipeline-sole-committer — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 1.3s | 0 |
| 2 | typecheck | failed | 4.6s | 2 |
| 3 | test | skipped | — | — |
| 4 | lint | skipped | — | — |
| 5 | changed-line-coverage | skipped | — | — |

## Phase: build

```
CLI Building entry: bin/specrunner.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/specrunner.js 1.27 MB
ESM ⚡️ Build success in 71ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
tests/pipeline-sole-committer-e2e.test.ts(371,13): error TS2740: Type '{ produceResult: Mock<() => Promise<StepExecutionResult>>; execute: never; }' is missing the following properties from type 'StepExecutor': spawnFn, sleepFn, commitPushInfra, permissionScope, and 8 more.
tests/pipeline-sole-committer-e2e.test.ts(461,9): error TS2740: Type '{ captureHeadSha: () => Promise<string>; listWorktreeChanges: Mock<Procedure>; listChangedFiles: Mock<Procedure>; digestArtifacts: undefined; finalizeStepArtifacts: Mock<...>; validateStepInputs: Mock<...>; validateStepOutputs: Mock<...>; }' is missing the following properties from type 'RuntimeStrategy': bootstrapJob, persistJobState, query, createAgentRunner, and 7 more.
tests/pipeline-sole-committer-e2e.test.ts(525,13): error TS2740: Type '{ produceResult: Mock<() => Promise<StepExecutionResult>>; execute: never; }' is missing the following properties from type 'StepExecutor': spawnFn, sleepFn, commitPushInfra, permissionScope, and 8 more.
tests/pipeline-sole-committer-e2e.test.ts(599,9): error TS2740: Type '{ captureHeadSha: () => Promise<string>; listWorktreeChanges: Mock<Procedure>; listChangedFiles: Mock<Procedure>; digestArtifacts: undefined; finalizeStepArtifacts: Mock<...>; validateStepInputs: Mock<...>; validateStepOutputs: Mock<...>; }' is missing the following properties from type 'RuntimeStrategy': bootstrapJob, persistJobState, query, createAgentRunner, and 7 more.
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts(94,9): error TS2353: Object literal may only specify known properties, and 'system' does not exist in type 'ReviewerSnapshot'.
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts(126,5): error TS2322: Type '(_state: JobState, deps: StepContext) => { path: string; artifact: "result"; }[]' is not assignable to type '((state: JobState, deps: StepContext) => IoRef[]) | ((state: JobState, deps: StepContext) => IoRef[]) | undefined'.
  Type '(_state: JobState, deps: StepContext) => { path: string; artifact: "result"; }[]' is not assignable to type '(state: JobState, deps: StepContext) => IoRef[]'.
    Type '{ path: string; artifact: "result"; }[]' is not assignable to type 'IoRef[]'.
      Type '{ path: string; artifact: "result"; }' is not assignable to type 'IoRef'.
        Types of property 'artifact' are incompatible.
          Type '"result"' is not assignable to type '"file" | "gitState" | undefined'.
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts(475,40): error TS2367: This comparison appears to be unintentional because the types '"abc123stable"' and '"def456selfcommit"' have no overlap.
tests/unit/step/pipeline-sole-committer-synthesis.test.ts(225,5): error TS2322: Type '(_state: JobState, deps: StepContext) => { path: string; artifact: "result"; }[]' is not assignable to type '(state: JobState, deps: StepContext) => IoRef[]'.
  Type '{ path: string; artifact: "result"; }[]' is not assignable to type 'IoRef[]'.
    Type '{ path: string; artifact: "result"; }' is not assignable to type 'IoRef'.
      Types of property 'artifact' are incompatible.
        Type '"result"' is not assignable to type '"file" | "gitState" | undefined'.
tests/unit/step/pipeline-sole-committer-synthesis.test.ts(266,7): error TS2353: Object literal may only specify known properties, and 'createStore' does not exist in type 'StoreFactory'.
tests/unit/step/pipeline-sole-committer-synthesis.test.ts(485,7): error TS2322: Type '(_state: JobState, deps: StepContext) => { path: string; artifact: "result"; }[]' is not assignable to type '(state: JobState, deps: StepContext) => IoRef[]'.
  Type '{ path: string; artifact: "result"; }[]' is not assignable to type 'IoRef[]'.
    Type '{ path: string; artifact: "result"; }' is not assignable to type 'IoRef'.
      Types of property 'artifact' are incompatible.
        Type '"result"' is not assignable to type '"file" | "gitState" | undefined'.
tests/unit/step/pipeline-sole-committer-synthesis.test.ts(729,7): error TS2322: Type '(_state: JobState, deps: StepContext) => { path: string; artifact: "result"; }[]' is not assignable to type '(state: JobState, deps: StepContext) => IoRef[]'.
  Type '{ path: string; artifact: "result"; }[]' is not assignable to type 'IoRef[]'.
    Type '{ path: string; artifact: "result"; }' is not assignable to type 'IoRef'.
      Types of property 'artifact' are incompatible.
        Type '"result"' is not assignable to type '"file" | "gitState" | undefined'.

$ tsc --noEmit

```

## Phase: test

_(skipped — previous command failed)_

## Phase: lint

_(skipped — previous command failed)_

## Phase: changed-line-coverage

_(skipped — previous command failed)_
