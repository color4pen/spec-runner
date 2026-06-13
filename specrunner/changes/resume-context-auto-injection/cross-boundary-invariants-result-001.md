# Cross-Boundary Invariants Review: resume-context-auto-injection

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## Scope Reviewed

- Ran `git diff main...HEAD --stat` and confirmed the change is scoped to the resume command handoff, executor prompt composition, the new deterministic resume-context builder, and related tests/spec artifacts.
- Read `design.md`, `tasks.md`, `spec.md`, and `test-cases.md`.
- Reviewed the boundary around:
  - `ResumeCommand.prepare()` clearing live `state.resumePoint` while preserving a snapshot in `PrepareResult.resumeContext`
  - `CommandRunner.execute()` copying `resumeContext` and `resumePrompt` into `PipelineDeps`
  - `StepExecutor.runAgentStep()` composing and one-shot consuming the effective prompt
  - existing adapter contract that only reads `ctx.session.resumePrompt`
  - interruption sources that populate `resumePoint` before resume

## Findings

No cross-boundary invariant violations found.

## Invariants Checked

1. **Live `resumePoint` clearing remains compatible with prompt generation**

   `ResumeCommand.prepare()` captures the pre-clear `resumePoint` into `resumeContext` only when the resolved `startStep` equals the recorded `resumePoint.step`, then clears live `state.resumePoint` before pipeline execution. This preserves the existing invariant that the running job state no longer carries an active resume point, while giving the executor a separate deterministic snapshot.

2. **`--from` redirection does not receive stale automatic context**

   The snapshot is omitted when `--from` selects a step different from `resumePoint.step`. That preserves the existing resume-position override semantics: a manually redirected resume does not silently inherit context for another step. Human `resumePrompt` still follows the existing path.

3. **Adapter-facing contract is unchanged**

   The new builder feeds the existing `ctx.session.resumePrompt` field. No adapter-facing field, wrapper, or injection mechanism changes, so local/managed adapter assumptions about `<resume-context>` wrapping remain intact.

4. **One-shot consumption remains scoped to agent execution**

   The executor composes and clears resume-related inputs in `runAgentStep()`, not in CLI step execution. This matches the prior invariant that resume prompts are consumed by the first agent step that sees them. The added clearing of `resumeContext` alongside `resumePrompt` prevents an unmatched snapshot from leaking into a later agent step.

5. **Attempt metadata uses existing step result journal semantics**

   The builder reads `state.steps?.[stepName]` and selects the last prior run, matching the existing `pushStepResult()` invariant that step attempts are appended per step. It does not introduce a new attempt counter or mutate state.

6. **Determinism boundary is preserved**

   `buildResumePrompt()` is pure formatting over passed-in state, step name, snapshot, and optional human prose. It does not read the worktree, inspect git, call the network, use the clock, or invoke an LLM.

## Residual Risk

The review did not rerun the full test suite; it inspected the implementation and the recorded verification artifact. The remaining risk is limited to unobserved runtime combinations outside the reviewed resume handoff paths.
