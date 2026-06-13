# Design: Resume Context Auto Injection

## Context

Resume currently has a one-shot human prompt path:
`resume.ts` returns `resumePrompt`, `runner.ts` copies it into `PipelineDeps`,
`StepExecutor` forwards it as `ctx.session.resumePrompt`, and adapters wrap that
text in `<resume-context>`. That plumbing should remain the only adapter-facing
mechanism.

The missing piece is executor-side context generation. After escalation, the
resumed session and worktree can both contain evidence from the previous
attempt, so an agent may mistake old artifacts and old completion claims for
current completion. The data needed to disambiguate this is already in state:
`resumePoint` records the resumed step and stop reason, while `steps[step]`
records prior attempts and outcomes.

## Goals / Non-Goals

**Goals**:

- Make plain resume, with no `--prompt` or `/resume` prose, carry enough
  deterministic context for the resumed agent step.
- Include the resumed step attempt count, previous attempt verdict, stop reason,
  and explicit resume semantics about pre-existing worktree artifacts.
- Preserve human resume prose as a supplemental section appended after automatic
  context.
- Keep context generation deterministic and state-backed.
- Provide a small extension point for future state-backed sections, such as a
  decision ledger summary.

**Non-Goals**:

- Do not change resume step selection or `resumePoint` semantics.
- Do not change `/resume` comment parsing or accepted syntax.
- Do not change adapter injection behavior or add new adapter contracts.
- Do not inspect the worktree to decide whether previous artifacts exist.
- Do not summarize findings or decisions with an LLM.

## Decisions

### D1. Generate automatic context in `StepExecutor` from a resume snapshot

`StepExecutor` should compose the effective resume prompt immediately before it
builds `AgentRunContext`. It already has the step, state, one-shot human
`deps.resumePrompt`, and a deterministic `deps.resumeContext` snapshot captured
before `state.resumePoint` is cleared. That snapshot keeps the resume metadata
needed for qualification and rendering while `state.steps` still provides the
prior attempts.

Rationale: executor-level composition keeps every runtime on the existing
`resumePrompt` path while allowing `resume.ts` to clear the live `resumePoint`
before the pipeline starts. Passing a snapshot avoids making adapters aware of
resume lifecycle details and preserves one-shot behavior.

Alternatives considered:

- Generate in `resume.ts`: rejected because resume command preparation resolves
  the start step but does not build per-step agent contexts.
- Generate in adapters: rejected because it duplicates logic and violates the
  scoped requirement to keep adapter injection unchanged.

### D2. Add a deterministic snapshot-backed builder module

Introduce a small pure helper, for example
`src/core/resume/resume-context.ts`, that accepts `JobState`, current
`AgentStepName`, a deterministic resume snapshot that contains the original
`resumePoint`, and optional human prompt, then returns the composed prompt or
`undefined`.

The helper should only use explicit stored fields:

- `resumeContext.resumePoint`
- `state.steps?.[stepName]`
- the last prior `StepRun` for that step
- `StepRun.attempt`
- `StepRun.outcome.verdict`
- `StepRun.outcome.findingsPath`, when present, as a path reference rather than
  parsed prose
- `resumeContext.resumePoint.reason`
- `resumeContext.resumePoint.iterationsExhausted`
- `resumeContext.resumePoint.exhaustionPhase`, when present

Rationale: a pure helper is easy to unit test, keeps formatting separate from
executor orchestration, and gives future state-backed sections a single home.

Alternatives considered:

- Inline string construction in `StepExecutor`: rejected because it mixes prompt
  policy with execution lifecycle and makes future extension harder.
- Store generated context back into `state.json`: rejected because the context
  is a deterministic projection and should not become another mutable source of
  truth.

### D3. Qualify automatic injection by the resume snapshot

Automatic context should be generated when
`deps.resumeContext?.resumePoint.step` equals the current agent step name. If
there is no resume snapshot, or the current step does not match it, no
automatic context should be added.

Rationale: this preserves first-run behavior and limits injection to the step
the pipeline is resuming even when the live `state.resumePoint` has already
been cleared. It also keeps the existing one-shot prompt consumption: after
the first agent step consumes the composed prompt, `deps.resumePrompt` is
cleared.

Alternatives considered:

- Inject whenever `deps.resumePrompt` is present: rejected because human prose
  can already flow without automatic context and does not prove the run is a
  resume from a recorded interruption.
- Inject for every later step in the resumed pipeline: rejected because the
  context is about re-running the interrupted step, not all subsequent steps.

### D4. Treat human prose as a supplemental section

The composed prompt should put automatic context first and append human prose
under a clear heading such as `Human supplied resume note`. If no automatic
context qualifies, human prose should pass through unchanged to preserve current
behavior.

Rationale: automatic context carries the invariant semantics that must be stable
across resumes. Human prose remains useful as additional operator intent but
should not be required for plain resume correctness.

Alternatives considered:

- Prepend human prose before automatic context: rejected because varying prose
  would compete with the stable machine-generated resume semantics.
- Drop human prose when automatic context exists: rejected because it would
  regress `--prompt` and `/resume` behavior.

### D5. Format for machine-readability, not prose elegance

The automatic context should be a compact, deterministic Markdown block with
stable labels and no generated natural-language summary beyond fixed template
sentences. Missing optional values should be rendered with explicit placeholders
such as `unknown` only where necessary.

Rationale: stable labels make tests robust and make delivery failures easier to
spot in captured prompts. Fixed wording avoids results that depend on operator
phrasing or LLM summarization.

Alternatives considered:

- Rich prose paragraphs: rejected because they are harder to test and easier to
  accidentally rewrite into ambiguous instructions.
- JSON only: rejected because the prompt is meant for an agent and should include
  explicit semantic instruction, not only data.

## Risks / Trade-offs

[Risk] Automatic context could be injected on an unexpected step if stale
`resumePoint` is present.
Mitigation: require `deps.resumeContext?.resumePoint.step === step.name` before
generating automatic context, and capture that snapshot before the resume
preparation path clears the live `state.resumePoint`.

[Risk] Attempt count semantics can be misunderstood as previous attempts rather
than the upcoming attempt.
Mitigation: label both values explicitly, for example `previousAttempt` and
`currentAttempt`, with `currentAttempt = previousAttempt + 1` when prior runs
exist.

[Risk] Existing tests assert exact human `resumePrompt` equality.
Mitigation: update executor tests to distinguish non-resume human prompt
passthrough from resume-state composition, and assert containment for composed
resume prompts.

[Risk] Findings content may be large or unavailable.
Mitigation: include only deterministic metadata available in `StepRun.outcome`,
such as `findingsPath`, and avoid parsing or summarizing the file in this
change.

## Open Questions

- Should the automatic context mention `findingsPath` only when a previous
  attempt has one, or always render a `previousFindingsPath` label with
  `none`? The recommended implementation is to always render the label for
  stable prompt shape.
- Should the helper name the human section `Human supplied resume note` or
  `Operator supplement`? Either is acceptable if tests lock the chosen label.
