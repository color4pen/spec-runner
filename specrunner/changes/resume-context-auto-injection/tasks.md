# Tasks: Resume Context Auto Injection

## T-01: Add deterministic resume context builder

- [x] Create a pure helper module under `src/core/resume/`, for example
  `resume-context.ts`.
- [x] Add an exported function that accepts the current `JobState`, current
  agent step name, the deterministic `resumeContext` snapshot, and optional
  human resume prompt.
- [x] Return `undefined` when there is no automatic context and no human prompt.
- [x] Return the human prompt unchanged when automatic context does not qualify
  but a human prompt exists.
- [x] Generate automatic context only when
  `resumeContext.resumePoint.step` equals the current step name.
- [x] Compute prior attempts from `state.steps?.[stepName] ?? []`, select the
  last prior run, and render both previous and current attempt numbers.
- [x] Render previous verdict, `resumeContext.resumePoint.reason`,
  `resumeContext.resumePoint.iterationsExhausted`, optional
  `resumeContext.resumePoint.exhaustionPhase`,
  and previous `findingsPath` when available.
- [x] Include fixed wording that says existing worktree artifacts may be from a
  previous attempt and do not mean the current attempt is complete; the agent
  must work or judge again for this attempt.
- [x] Structure the builder internally as an ordered list of deterministic
  section builders so future state-backed sections, such as decision ledger
  data, can be appended without adapter changes.

**Acceptance Criteria**:

- The builder has no filesystem, git, network, clock, or LLM dependency.
- The same inputs produce byte-identical output.
- The builder can compose automatic context plus human prompt with automatic
  context first.

## T-02: Wire builder into StepExecutor one-shot prompt handling

- [x] Import the resume context builder in `src/core/step/executor.ts`.
- [x] Use the builder when constructing `ctx.session.resumePrompt` for agent
  steps.
- [x] Pass the current state, `step.name`, `deps.resumeContext`, and
  `deps.resumePrompt` into the builder.
- [x] Keep the existing one-shot consumption behavior by clearing
  `deps.resumePrompt` after the first agent step consumes the composed prompt.
- [x] Preserve or introduce the pipeline snapshot handoff from `resume.ts` or
  `runner.ts` so `StepExecutor` can still qualify automatic context after the
  live `state.resumePoint` is cleared.
- [x] Do not change adapter prompt wrapping or `/resume` parsing unless a
  failing test proves an implementation-local typing adjustment is required.

**Acceptance Criteria**:

- Plain resume with qualifying state sends automatic context through
  `ctx.session.resumePrompt`.
- Human prompt still reaches the first agent step.
- Subsequent agent steps do not receive the already-consumed resume prompt.

## T-03: Add unit tests for context generation

- [x] Add focused tests for the new builder module.
- [x] Cover no `resumeContext` returning only the human prompt or
  `undefined`.
- [x] Cover matching `resumeContext.resumePoint.step` with one prior run.
- [x] Cover multiple prior attempts selecting the latest attempt as the previous
  run and calculating the upcoming attempt number.
- [x] Cover deterministic output by calling the builder twice with identical
  inputs.
- [x] Cover optional metadata such as missing verdict, missing findings path, and
  present `exhaustionPhase`.

**Acceptance Criteria**:

- Tests assert stable labels for attempt count, previous verdict, stop reason,
  and resume semantics.
- Tests do not snapshot irrelevant whitespace beyond the stable prompt contract.

## T-04: Update StepExecutor resume prompt tests

- [x] Extend `tests/unit/core/step/executor.test.ts` or add a neighboring test
  file that captures `AgentRunContext`.
- [x] Add a test for escalation-style plain resume: state has a captured
  `deps.resumeContext`, prior `steps[step]`, no `deps.resumePrompt`, and
  captured prompt contains the automatic context.
- [x] Add a test for resume with human prose: captured prompt contains automatic
  context and the human prose, with human prose after the automatic section.
- [x] Add or preserve a test proving initial non-resume execution with no human
  prompt leaves `ctx.session.resumePrompt` undefined.
- [x] Preserve existing one-shot behavior tests, adjusting exact equality only
  where the state now qualifies for automatic context.

**Acceptance Criteria**:

- The requested acceptance criteria for plain resume, human-prompt resume, and
  first-run non-injection are fixed at executor level.
- Existing adapter contract tests remain valid because the adapter-facing field
  is still `ctx.session.resumePrompt`.

## T-05: Verify the change

- [x] Run the focused unit tests for the new builder and executor prompt
  behavior.
- [x] Run `bun run typecheck`.
- [x] Run `bun run test`.
- [x] If the repository uses a combined verification script that covers both
  typecheck and tests, run it in addition to or instead of duplicate commands.

**Acceptance Criteria**:

- `typecheck && test` is green.
- No source files outside the implementation and test scope are changed.
- The adapter injection path remains unchanged.
