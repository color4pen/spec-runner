# Test Cases: decouple-pipeline-from-step-names

Generated from: request.md, design.md, tasks.md

---

## TC-01 — DesignStep flags

**Category**: Step Definition Flags  
**Priority**: must  
**Source**: T2a, design Change 2 & 3

**GIVEN** the `DesignStep` object literal in `src/core/step/design.ts`  
**WHEN** the definition is read at runtime  
**THEN** `DesignStep.phase === "spec"` and `DesignStep.needsProjectContext === true`

---

## TC-02 — SpecReviewStep flags

**Category**: Step Definition Flags  
**Priority**: must  
**Source**: T2b

**GIVEN** the `SpecReviewStep` object literal in `src/core/step/spec-review.ts`  
**WHEN** the definition is read at runtime  
**THEN** `SpecReviewStep.phase === "spec"` and `SpecReviewStep.needsProjectContext === true`

---

## TC-03 — SpecFixerStep flags

**Category**: Step Definition Flags  
**Priority**: must  
**Source**: T2c

**GIVEN** the `SpecFixerStep` object literal in `src/core/step/spec-fixer.ts`  
**WHEN** the definition is read at runtime  
**THEN** `SpecFixerStep.phase === "spec"` and `SpecFixerStep.needsProjectContext` is `undefined` (not set)

---

## TC-04 — ImplementerStep flags

**Category**: Step Definition Flags  
**Priority**: must  
**Source**: T3a

**GIVEN** the `ImplementerStep` object literal in `src/core/step/implementer.ts`  
**WHEN** the definition is read at runtime  
**THEN** `ImplementerStep.needsProjectContext === true` and `ImplementerStep.phase` is `undefined`

---

## TC-05 — CodeReviewStep flags

**Category**: Step Definition Flags  
**Priority**: must  
**Source**: T3b

**GIVEN** the `CodeReviewStep` object literal in `src/core/step/code-review.ts`  
**WHEN** the definition is read at runtime  
**THEN** `CodeReviewStep.needsProjectContext === true` and `CodeReviewStep.phase` is `undefined`

---

## TC-06 — Steps without needsProjectContext

**Category**: Step Definition Flags  
**Priority**: should  
**Source**: T3, design Change 3

**GIVEN** step definitions `SpecFixerStep`, `BuildFixerStep`, `CodeFixerStep`, `TestCaseGenStep`  
**WHEN** each definition is read at runtime  
**THEN** none of them has `needsProjectContext === true` (property absent or `false`)

---

## TC-07 — getStepOutcome returns "success" for DesignStep via completionVerdict

**Category**: pipeline.ts getStepOutcome  
**Priority**: must  
**Source**: T4, design Change 1

**GIVEN** a pipeline with `DesignStep` registered (which carries `completionVerdict: "success"`)  
**WHEN** `getStepOutcome("design")` is called  
**THEN** it returns `"success"` (derived from `step.completionVerdict`, not from a step-name comparison)

---

## TC-08 — getStepOutcome returns "approved" for steps without completionVerdict

**Category**: pipeline.ts getStepOutcome  
**Priority**: must  
**Source**: T4

**GIVEN** a step that does not declare `completionVerdict`  
**WHEN** `getStepOutcome(stepName)` is called for that step  
**THEN** it returns `"approved"`

---

## TC-09 — getStepOutcome returns completionVerdict for arbitrary AgentStep

**Category**: pipeline.ts getStepOutcome  
**Priority**: should  
**Source**: T4, design Change 1

**GIVEN** an AgentStep registered in the pipeline with `completionVerdict: "success"`  
**WHEN** `getStepOutcome(step.name)` is called  
**THEN** it returns `"success"` regardless of the step name

---

## TC-10 — No step-name string comparison in pipeline.ts getStepOutcome

**Category**: pipeline.ts — Static Analysis  
**Priority**: must  
**Source**: T4, acceptance checklist

**GIVEN** the source file `src/core/pipeline/pipeline.ts`  
**WHEN** `getStepOutcome()` is inspected statically (grep / AST)  
**THEN** no `=== STEP_NAMES.DESIGN` or `=== "design"` comparison exists inside the method

---

## TC-11 — needsProjectContext true injects project context

**Category**: executor.ts Project Context Injection  
**Priority**: must  
**Source**: T5, design Change 3

**GIVEN** a step with `needsProjectContext: true`  
**AND** `project.md` exists in the working directory  
**WHEN** `StepExecutor` runs the step  
**THEN** `AgentRunContext.projectContext` is populated with the contents of `project.md`

---

## TC-12 — needsProjectContext absent/false skips project context

**Category**: executor.ts Project Context Injection  
**Priority**: must  
**Source**: T5

**GIVEN** a step where `needsProjectContext` is `undefined` or `false`  
**WHEN** `StepExecutor` runs the step  
**THEN** `AgentRunContext.projectContext` is not set (undefined/empty)

---

## TC-13 — PROJECT_CONTEXT_STEPS does not exist in executor.ts

**Category**: executor.ts — Static Analysis  
**Priority**: must  
**Source**: T5, acceptance checklist

**GIVEN** the source file `src/core/step/executor.ts`  
**WHEN** the file is inspected statically  
**THEN** no `PROJECT_CONTEXT_STEPS` identifier is present

---

## TC-14 — isSpecPhase returns true for spec-phase steps

**Category**: resolve-step.ts Phase Resolution  
**Priority**: must  
**Source**: T6, design Change 2

**GIVEN** the `isSpecPhase` function in `resolve-step.ts`  
**WHEN** called with `"design"`, `"spec-review"`, or `"spec-fixer"`  
**THEN** each returns `true`

---

## TC-15 — isSpecPhase returns false for impl-phase steps

**Category**: resolve-step.ts Phase Resolution  
**Priority**: must  
**Source**: T6, design Change 2

**GIVEN** the `isSpecPhase` function in `resolve-step.ts`  
**WHEN** called with `"implementer"`, `"code-review"`, `"build-fixer"`, `"code-fixer"`, or `"test-case-gen"`  
**THEN** each returns `false`

---

## TC-16 — isSpecPhase returns false for unknown step names

**Category**: resolve-step.ts Phase Resolution  
**Priority**: should  
**Source**: T6, design Change 2 — CliSteps / unregistered steps

**GIVEN** the `isSpecPhase` function in `resolve-step.ts`  
**WHEN** called with a step name not present in `STEP_PHASE_MAP` (e.g., `"verification"`, `"pr-create"`, or arbitrary string)  
**THEN** it returns `false` (map miss defaults to `"impl"`)

---

## TC-17 — SPEC_PHASE_STEPS Set removed from resolve-step.ts

**Category**: resolve-step.ts — Static Analysis  
**Priority**: must  
**Source**: T6, acceptance checklist

**GIVEN** the source file `src/core/resume/resolve-step.ts`  
**WHEN** the file is inspected statically  
**THEN** neither `SPEC_PHASE_STEPS` nor `CODE_PHASE_STEPS` identifiers are present

---

## TC-18 — Design-role step uses SSE strategy

**Category**: agent-runner.ts SSE/Polling Strategy  
**Priority**: must  
**Source**: T7, design Change 4

**GIVEN** an `AgentRunContext` where `step.agent.role === STEP_NAMES.DESIGN`  
**WHEN** `ManagedAgentRunner.run(ctx)` is called  
**THEN** `useSseStrategy()` returns `true` and execution is delegated to `runDesignStyle()`

---

## TC-19 — Non-design-role step uses polling strategy

**Category**: agent-runner.ts SSE/Polling Strategy  
**Priority**: must  
**Source**: T7, design Change 4

**GIVEN** an `AgentRunContext` where `step.agent.role` is any value other than `STEP_NAMES.DESIGN`  
**WHEN** `ManagedAgentRunner.run(ctx)` is called  
**THEN** `useSseStrategy()` returns `false` and execution is delegated to `runPollingStyle()`

---

## TC-20 — useSseStrategy is a private method; run() has no direct role comparison

**Category**: agent-runner.ts — Static Analysis  
**Priority**: must  
**Source**: T7, acceptance checklist

**GIVEN** the source file `src/adapter/managed-agent/agent-runner.ts`  
**WHEN** the `run()` method body is inspected statically  
**THEN** it contains no `=== STEP_NAMES.DESIGN` or `=== "design"` comparison  
**AND** a `private useSseStrategy(` method declaration exists in the class

---

## TC-21 — resultFileNotFoundError code derivation for spec-review

**Category**: errors.ts resultFileNotFoundError  
**Priority**: must  
**Source**: T8a, design Change 5

**GIVEN** the `resultFileNotFoundError` function in `src/errors.ts`  
**WHEN** called with `stepName = "spec-review"`, any `resultPath`, any `branch`  
**THEN** the returned `SpecRunnerError.code` equals `"SPEC_REVIEW_RESULT_NOT_FOUND"`

---

## TC-22 — resultFileNotFoundError code derivation for code-review

**Category**: errors.ts resultFileNotFoundError  
**Priority**: must  
**Source**: T8a, design Change 5

**GIVEN** the `resultFileNotFoundError` function in `src/errors.ts`  
**WHEN** called with `stepName = "code-review"`, any `resultPath`, any `branch`  
**THEN** the returned `SpecRunnerError.code` equals `"CODE_REVIEW_RESULT_NOT_FOUND"`

---

## TC-23 — resultFileNotFoundError code derivation for arbitrary step

**Category**: errors.ts resultFileNotFoundError  
**Priority**: should  
**Source**: T8a, design Change 5

**GIVEN** the `resultFileNotFoundError` function  
**WHEN** called with `stepName = "build-fixer"`, any `resultPath`, any `branch`  
**THEN** the returned `SpecRunnerError.code` equals `"BUILD_FIXER_RESULT_NOT_FOUND"`

---

## TC-24 — resultFileNotFoundError message contains resultPath and branch

**Category**: errors.ts resultFileNotFoundError  
**Priority**: must  
**Source**: T8a, design Change 5

**GIVEN** the `resultFileNotFoundError` function  
**WHEN** called with `stepName = "code-review"`, `resultPath = "path/to/result.md"`, `branch = "change/my-branch"`  
**THEN** the returned error's `hint` (or guidance field) contains `"path/to/result.md"` and `"change/my-branch"`  
**AND** the `message` contains `"'change/my-branch'"`

---

## TC-25 — Step-specific error factories removed

**Category**: errors.ts — Static Analysis  
**Priority**: must  
**Source**: T8a, acceptance checklist

**GIVEN** the source file `src/errors.ts`  
**WHEN** the file is inspected statically  
**THEN** `specReviewResultNotFoundError` is not exported  
**AND** `codeReviewResultNotFoundError` is not exported

---

## TC-26 — ERROR_CODES entries preserved

**Category**: errors.ts — Static Analysis  
**Priority**: must  
**Source**: T8a — backward compatibility

**GIVEN** the `ERROR_CODES` object in `src/errors.ts`  
**WHEN** the file is inspected statically  
**THEN** both `SPEC_REVIEW_RESULT_NOT_FOUND` and `CODE_REVIEW_RESULT_NOT_FOUND` keys are still present

---

## TC-27 — agent-runner uses resultFileNotFoundError; no step.name conditional

**Category**: agent-runner.ts — Static Analysis  
**Priority**: must  
**Source**: T8b, acceptance checklist

**GIVEN** the source file `src/adapter/managed-agent/agent-runner.ts`  
**WHEN** the result-file-not-found path is inspected  
**THEN** it calls `resultFileNotFoundError(step.name, resultFilePath, effectiveBranch)`  
**AND** no `step.name === STEP_NAMES.CODE_REVIEW` conditional exists

---

## TC-28 — TypeScript compilation passes

**Category**: Build Verification  
**Priority**: must  
**Source**: T9, acceptance checklist

**GIVEN** all changes applied across T1–T8  
**WHEN** `bun run typecheck` is executed  
**THEN** it exits with code 0 and produces zero type errors

---

## TC-29 — Unit tests pass

**Category**: Build Verification  
**Priority**: must  
**Source**: T9, acceptance checklist

**GIVEN** all changes applied across T1–T8  
**WHEN** `bun run test` is executed  
**THEN** all tests pass (zero failures)

---

## TC-30 — Behavioral equivalence: pipeline run produces same outcomes

**Category**: Behavioral Regression  
**Priority**: must  
**Source**: request.md acceptance criteria "振る舞いが変わらない"

**GIVEN** a complete pipeline run using the same configuration and step sequence as before the change  
**WHEN** each step executes (design → spec-review → spec-fixer → ... → code-review)  
**THEN** step outcome verdicts, project context injection, phase resolution for resume, and SSE/polling routing all produce the same results as the pre-change baseline

---

## TC-31 — Phase map covers all AgentStep singletons

**Category**: resolve-step.ts Phase Resolution  
**Priority**: should  
**Source**: T6, design Change 2 — completeness

**GIVEN** the `STEP_PHASE_MAP` constructed in `resolve-step.ts`  
**WHEN** the list of imported AgentStep singletons is compared against all step files in `src/core/step/`  
**THEN** every AgentStep that participates in the pipeline is present in the map  
**AND** no AgentStep is silently treated as `"impl"` due to a missing import

---

## TC-32 — STEP_NAMES import in executor.ts removed if unused

**Category**: executor.ts — Static Analysis  
**Priority**: could  
**Source**: T5 — "remove import if no longer referenced"

**GIVEN** `src/core/step/executor.ts` after removing `PROJECT_CONTEXT_STEPS`  
**WHEN** all usages of `STEP_NAMES` in the file are checked  
**THEN** if `STEP_NAMES` is referenced only by `PROJECT_CONTEXT_STEPS`, the import line is also removed  
**AND** `bun run typecheck` still passes
