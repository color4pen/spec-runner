# Tasks: codex-resume-prompt-injection

## T-01: Add `buildResumeSection` to shared prompt-builder

File: `src/adapter/shared/prompt-builder.ts`

- [x] Export a new function `buildResumeSection(ctx: AgentRunContext): string` that returns `\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>` when `ctx.session.resumePrompt` is a non-empty string, and `""` otherwise.

**Acceptance Criteria**:
- `buildResumeSection` is exported from `prompt-builder.ts`.
- Returns `""` when `ctx.session.resumePrompt` is `undefined`.
- Returns `""` when `ctx.session.resumePrompt` is `""`.
- Returns a string containing `<resume-context>` and the prompt text when `resumePrompt` is set.

---

## T-02: Inject `resumeSection` into codex `fullPrompt`

File: `src/adapter/codex/agent-runner.ts`

- [x] Import `buildResumeSection` from `../shared/prompt-builder.js`.
- [x] Before the `baseFullPrompt` assignment, compute `const resumeSection = buildResumeSection(ctx);`.
- [x] Change `baseFullPrompt` construction to:
  ```
  additionalInstructions
    ? `${baseMessage}${resumeSection}\n\n${additionalInstructions}`
    : `${baseMessage}${resumeSection}`;
  ```
  This mirrors the claude-code adapter's ordering (D2).
- [x] The existing `fullPrompt` line that appends `buildMainTurnCompletionInstruction()` requires no change.

**Acceptance Criteria**:
- When `ctx.session.resumePrompt` is set, `fullPrompt` contains `<resume-context>` and the prompt text.
- When `ctx.session.resumePrompt` is unset, `fullPrompt` is identical to what it was before this change.

---

## T-03: Add tests for resumePrompt injection in codex adapter

File: `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`

Follow the fixture/mock pattern established in `completion-contract-injection.test.ts`:
- `makeCapturingMockThread` / `makeMockCodexInstance` / `makeCtx` helpers (copy or import pattern, not the existing module export).

- [x] **Test A — resumePrompt set**: Build `AgentRunContext` with `session: { resumePrompt: "Human judgment: accept HIGH finding" }`. Run `runner.run(ctx)`. Assert `calls[0].prompt` contains `<resume-context>` and `"Human judgment: accept HIGH finding"`.
- [x] **Test B — resumePrompt unset**: Build `AgentRunContext` with `session: {}` and no `reportTool`. Run `runner.run(ctx)`. Assert `calls[0].prompt` is exactly the pre-change prompt construction for the same inputs, for example:
  ```
  `${baseMessage}\n\n${additionalInstructions}`
  ```
  and also assert the prompt does NOT contain `<resume-context>`.
- [x] Both tests use a step where `resultFilePath` returns `null` (finalResponse path) to avoid needing temp-file setup.

**Acceptance Criteria**:
- Test A passes: prompt contains the resume judgment wrapped in `<resume-context>` tags.
- Test B passes: prompt is byte-for-byte identical to the pre-change prompt when `resumePrompt` is absent, and still does not contain `<resume-context>`.
- `bun run typecheck && bun run test` green.
