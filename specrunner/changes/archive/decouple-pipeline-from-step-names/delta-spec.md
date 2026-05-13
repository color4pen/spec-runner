# Delta Spec: decouple-pipeline-from-step-names

Target spec: `step-execution-architecture`

---

## New Requirements

### R-phase-flag

`AgentStep` MUST declare an optional `phase?: "spec" | "impl"` field.
Steps that belong to the spec pipeline phase (design, spec-review, spec-fixer) MUST set `phase: "spec"`.
All other AgentSteps MAY omit `phase`; consumers MUST treat absent as `"impl"`.

### R-needsProjectContext-flag

`AgentStep` MUST declare an optional `needsProjectContext?: boolean` field.
`StepExecutor` MUST read `project.md` and inject `projectContext` into `AgentRunContext`
if and only if `step.needsProjectContext === true`.
No hard-coded set of step names MAY exist in `StepExecutor` for this purpose.

### R-no-step-names-in-pipeline-framework

The pipeline framework (`Pipeline`, `StepExecutor`) MUST NOT contain string comparisons
against step names to select runtime behavior.
Step-specific behavior MUST be declared on the step definition via flags
(`completionVerdict`, `requiresCommit`, `setsBranch`, `phase`, `needsProjectContext`).

### R-no-step-names-in-adapter-dispatch

The `AgentRunner` adapter MUST NOT use step names in its top-level dispatch method.
SSE vs. polling selection MUST be encapsulated in a private method of the adapter.

### R-generic-result-not-found-error

`errors.ts` MUST provide a single generic `resultFileNotFoundError(stepName, resultPath, branch)`
factory that derives the error code from `stepName`.
Step-specific result-not-found factories MUST NOT exist.

---

## Modified Requirements (existing)

### R-completion-verdict (update)

Existing requirement: `completionVerdict` on `AgentStep` controls the outcome when no result file is present.

Addition: `Pipeline.getStepOutcome()` MUST NOT contain a step-name fallback after the
`completionVerdict` check. If `completionVerdict` is absent, the default verdict is `"approved"`.
