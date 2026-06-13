# Design: codex-resume-prompt-injection

## Context

`ctx.session.resumePrompt` is the mechanism by which a human operator's judgment (written as a `/resume` comment on a GitHub issue) reaches the running agent. `planner.ts` extracts the judgment from the comment and passes it to `runResumeCore`, which sets `resumePrompt` on the session before invoking the adapter.

The claude-code adapter injects `resumePrompt` as a `<resume-context>` XML section between `baseMessage` and `additionalInstructions`. The codex adapter builds `fullPrompt` from `baseMessage` + `additionalInstructions` + (optionally) a completion-report instruction — it never reads `resumePrompt`. The human judgment is silently dropped, causing escalation loops.

## Goals / Non-Goals

**Goals**:
- Inject `ctx.session.resumePrompt` into codex's main turn prompt with the same `<resume-context>` format used by claude-code.
- Resume-less runs produce byte-identical prompts to the current implementation.

**Non-Goals**:
- Changes to inbox / planner (already correct).
- Changes to the claude-code adapter.
- Migrating claude-code to use the shared helper.

## Decisions

### D1: Extract `buildResumeSection` to `src/adapter/shared/prompt-builder.ts`

The shared module already owns `buildAdditionalInstructions`, which both adapters import. Adding `buildResumeSection` there collocates all prompt-assembly helpers, avoids duplicating the `<resume-context>` format string, and leaves the door open for future adapters without touching claude-code.

**Rationale**: Inline duplication risks the two adapters drifting in tag name or whitespace, which would make format parity tests non-obvious. A single export is the least-surprise choice.

**Alternatives considered**:
- Inline in codex only — works but duplicates the `<resume-context>` template string that claude-code already owns.

### D2: Prompt ordering in codex adapter

The codex `fullPrompt` assembly currently:
```
baseMessage + additionalInstructions [+ completionInstruction]
```

After this change:
```
baseMessage + resumeSection + additionalInstructions [+ completionInstruction]
```

`resumeSection` is placed after `baseMessage` and before `additionalInstructions`, mirroring claude-code exactly. When `resumePrompt` is absent, `resumeSection` is the empty string and the result is identical to today.

**Rationale**: Placing resume context directly after the task description keeps it semantically adjacent to the work instructions, consistent with claude-code's established ordering.

### D3: Existing `baseFullPrompt` variable is the correct injection point

The codex adapter introduces `baseFullPrompt` as an intermediate before appending the completion-report instruction. The resume section belongs in `baseFullPrompt` construction (before the completion instruction), so the completion instruction always appears last regardless of whether resumePrompt is set.

## Risks / Trade-offs

- **[Risk]** `buildResumeSection` is exported but unused by claude-code (minor dead surface area). **Mitigation**: The function is small and obviously named; it is used by codex immediately. This is acceptable.

## Open Questions

None.
