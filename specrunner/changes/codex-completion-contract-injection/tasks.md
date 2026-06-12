# Tasks: codex-completion-contract-injection

## T-01: Single-source the completion-report means clause and inject it into the main turn

Create a codex-local module that owns the completion-report prompt wording, and inject the main-turn
instruction in `CodexAgentRunner.run()` when `reportTool` is set.

- [ ] Add `src/adapter/codex/completion-report-prompt.ts` (or co-locate exports in
  `src/adapter/codex/agent-runner.ts`) exporting:
  - `COMPLETION_REPORT_MEANS` — the single-source means clause, set byte-for-byte to the clause
    currently embedded in the retry literal: `コードフェンスや説明文を付けず、スキーマに一致する JSON オブジェクトのみを返してください。`
  - `buildMainTurnCompletionInstruction(): string` — returns the work-turn instruction wrapping the
    means with completion intent (e.g. `このステップの作業が完了したら、最終応答として、` + `COMPLETION_REPORT_MEANS`)
  - `buildCompletionRetryPrompt(attempt: number, maxAttempts: number): string` — returns
    `前の応答から JSON を取得できませんでした。${COMPLETION_REPORT_MEANS} (attempt ${attempt}/${maxAttempts})`
- [ ] In `agent-runner.ts` (`fullPrompt` construction at ~lines 285-287): when `reportTool` is
  truthy, append `buildMainTurnCompletionInstruction()` to `fullPrompt` (e.g.
  `\n\n` + instruction). When `reportTool` is falsy, leave `fullPrompt` unchanged. Note: `reportTool`
  is resolved at ~line 302 — order the injection after it, or inline the `ctx.policy?.reportTool`
  check at the `fullPrompt` site.
- [ ] Replace the inline retry literal in the `toolReportRetry` loop (~lines 522-524) with a call to
  `buildCompletionRetryPrompt(attempt, retryPolicy.maxAttempts)`; confirm the produced text is
  identical to the current literal (including the `(attempt N/M)` suffix).
- [ ] Export the symbols needed by tests (the builders and/or `COMPLETION_REPORT_MEANS`).

**Acceptance Criteria**:
- The main-turn prompt passed to `runStreamed` contains `COMPLETION_REPORT_MEANS` when `reportTool`
  is set.
- The main-turn prompt does not contain `COMPLETION_REPORT_MEANS` when `reportTool` is unset.
- `buildCompletionRetryPrompt(1, 2)` returns the exact text previously produced inline.
- The injection applies only to the main work turn (`postWorkPrompts` / output-verification / retry
  prompts are unchanged).

## T-02: Collect recovery diagnostics in CodexAgentRunner and surface them on AgentRunResult

Accumulate one diagnostic entry per failed extraction and attach them to the success-path result.

- [ ] Define a `CompletionReportDiagnostic` type:
  `{ phase: "main" | "retry"; attempt?: number; failureReason: string; rawFragment: string }`
  (export it for reuse from the executor/tests; co-locate with the port type — see T-03).
- [ ] In `agent-runner.ts`, declare a local `completionReportDiagnostics: CompletionReportDiagnostic[] = []`
  near `capturedToolResult` (~line 506).
- [ ] At the main-turn parse-failure branch (~lines 510-514): in addition to the existing
  `stderrWrite`, push `{ phase: "main", failureReason, rawFragment }` (guard against null fields).
- [ ] At the retry parse-failure branch (~lines 537-541): in addition to the existing `stderrWrite`,
  push `{ phase: "retry", attempt, failureReason, rawFragment }`.
- [ ] In the success-path result object (`baseResult`, ~lines 663-671), include
  `...(completionReportDiagnostics.length > 0 ? { completionReportDiagnostics } : {})` so the field
  is absent on the happy path.
- [ ] Leave the existing `stderrWrite` lines in place (no regression).

**Acceptance Criteria**:
- When all turns fail, the returned `AgentRunResult.completionReportDiagnostics` is a non-empty array
  with each entry carrying `failureReason` and `rawFragment`.
- When recovery succeeds, `completionReportDiagnostics` is absent from the result.
- Existing stderr diagnostic lines are still emitted.

## T-03: Thread completionReportDiagnostics through the port, state, and event journal

Add the optional field at every hop, mirroring the `transientRetryAttempts` precedent (additive,
optional spread everywhere).

- [ ] `src/core/port/agent-runner.ts`: add `completionReportDiagnostics?: CompletionReportDiagnostic[]`
  to `AgentRunResult`, and export the `CompletionReportDiagnostic` interface (single source of the
  type used by the adapter, executor, and journal).
- [ ] `src/state/schema.ts`: add `completionReportDiagnostics?: CompletionReportDiagnostic[]` to
  `StepOutcome` with a doc comment noting it is adapter-populated and absent on success.
- [ ] `src/state/helpers.ts`: add `completionReportDiagnostics?` to the `pushStepResult` partial
  param and spread it into `outcome` using the optional-spread pattern (~lines 108-116).
- [ ] `src/store/event-journal.ts`:
  - Add `completionReportDiagnostics?` to `StepAttemptRecord.outcome` (~lines 35-47).
  - Spread it in `stepRunToRecord` (~lines 292-300).
  - Spread it in the `fold()` outcome reconstruction (~lines 222-230).
- [ ] `src/core/step/executor.ts`:
  - Pass `completionReportDiagnostics: runResult.completionReportDiagnostics` into the
    `finalizeStep` agentResult at ~lines 461-468.
  - Add `completionReportDiagnostics?` to the `finalizeStep` `agentResult` param type (~lines
    600-607).
  - Pass it into the `pushStepResult` call (~lines 705-715).

**Acceptance Criteria**:
- `bun run typecheck` passes with the new field present at all hops.
- The field is omitted (key absent) whenever the adapter did not set it (backward compat).

## T-04: Tests — main-turn injection, single-source, durable diagnostics, no regression

Add tests using the existing codex mock-thread harness (capture the prompt argument to
`runStreamed`).

- [ ] Main-turn injection (reportTool set): capture the first `runStreamed` prompt argument; assert
  it contains `COMPLETION_REPORT_MEANS`.
- [ ] Main-turn injection (reportTool unset): assert the captured main-turn prompt does NOT contain
  `COMPLETION_REPORT_MEANS`.
- [ ] Single-source: assert `buildMainTurnCompletionInstruction()` and
  `buildCompletionRetryPrompt(1, 2)` both contain `COMPLETION_REPORT_MEANS`; assert
  `buildCompletionRetryPrompt(1, 2)` equals the exact retry text expected by the prior behavior.
- [ ] Diagnostics on result: run with a mock thread where main + all retries return unrecoverable
  prose; assert the returned `AgentRunResult.completionReportDiagnostics` is non-empty and each entry
  has `failureReason` and `rawFragment`.
- [ ] Diagnostics absent on success: run with a mock thread that returns recoverable JSON on the main
  turn; assert `completionReportDiagnostics` is absent from the result.
- [ ] Journal propagation (state/event-journal level, mirroring
  `src/state/__tests__/transient-retry-state.test.ts`): `pushStepResult` with
  `completionReportDiagnostics` records it in `outcome`; absent input → key absent;
  `stepRunToRecord` serializes it; `fold()` restores it from a journal line.
- [ ] No regression: confirm the existing
  `src/adapter/codex/__tests__/agent-runner-completion-report.test.ts` scenarios (raw / fenced /
  bracket extraction, follow-up retry, all-turns-fail fail-closed) still pass, and that the main turn
  still receives `outputSchema` when `reportTool` is set (assert via captured `runStreamed` opts).

**Acceptance Criteria**:
- All new tests pass.
- All pre-existing codex completion-report and state/journal tests pass unchanged.

## T-05: Verify `typecheck && test` green

- [ ] Run `bun run typecheck` — zero errors.
- [ ] Run `bun run test` — all tests pass, no regressions.

**Acceptance Criteria**:
- `bun run typecheck` exits 0.
- `bun run test` exits 0.
