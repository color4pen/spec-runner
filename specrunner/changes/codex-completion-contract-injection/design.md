# Design: codex-completion-contract-injection

## Context

`CodexAgentRunner` (`src/adapter/codex/agent-runner.ts`) captures a step's completion report
by injecting an `outputSchema` into `thread.runStreamed()` on the main work turn and then
extracting JSON from `finalResponse` via the three-strategy `tryExtractToolResult` pipeline
(#670). When extraction fails, a follow-up retry loop re-prompts the model.

A mixed-model run (2026-06-12) exposed two structural gaps that are model-dependent:

1. **The main work turn carries no instruction about *how* to deliver the completion report.**
   The shared prompt layer (`src/prompts/`) was made provider-neutral in #661: it states the
   *intent* ("report the completion result") but delegates the *means* ("return schema-conforming
   JSON as the final response") to the adapter. The codex adapter conveys the means only through
   `outputSchema` injection — there is **no natural-language instruction to return JSON on any turn
   except the follow-up retry**. On models where `outputSchema` is ineffective or unfollowed, the
   first turn has nothing telling the model to emit JSON. `buildAdditionalInstructions(ctx)`
   (`src/adapter/shared/prompt-builder.ts`) contains no mention of completion reporting or JSON.

2. **Recovery-failure diagnostics are written to stderr only.** `tryExtractToolResult` already
   returns `failureReason` + `rawFragment` (#670), but both call sites surface them via
   `stderrWrite` (`agent-runner.ts:511-513`, `538-540`). Inbox (crontab) jobs do not capture
   stderr, so the 6/6 recovery failures in the 2026-06-12 run left no analyzable trace of *why*
   each turn failed.

The durable, always-on record in this codebase is the branch-borne event journal
(`specrunner/changes/<slug>/events.jsonl`). Each step execution appends a `step-attempt` record
whose `outcome` already carries `toolResult`, `followUpAttempts`, and `transientRetryAttempts`
(`src/store/event-journal.ts`). `SessionLogWriter` JSONL, by contrast, is only created when
`ctx.session.logPath` is set, which `executor.ts:234` does **only at `-vv` debug level**, and it
writes outside the branch — so it cannot serve inbox jobs.

## Goals / Non-Goals

**Goals**:

- Inject a completion-report *means* instruction (return schema-conforming JSON as the final
  response) into the main work turn prompt, gated on `ctx.policy.reportTool` being set.
- Single-source the means wording so the main-turn injection and the follow-up retry prompt share
  one definition.
- Persist recovery-failure diagnostics (`failureReason` + `rawFragment`) into the branch-borne
  `step-attempt` outcome so inbox jobs retain them, in addition to the existing stderr output.
- Preserve the existing `outputSchema` main-turn path and all three recovery strategies, retry,
  and fail-closed behavior with no regression.

**Non-Goals**:

- claude-code adapter — its MCP-tool method conveys the contract from the main turn already; the
  problem does not exist there.
- Shared prompt surface (`src/prompts/`) — the means stays in the adapter; #661's neutrality is
  preserved.
- Per-model wording variation.
- Changing `tryExtractToolResult`'s strategies, `outputSchema` shape, or the retry budget.

## Decisions

### D1: Single-source the completion-report means clause and inject it into the main turn

Introduce one shared constant for the means clause and two thin builders that consume it, in a
codex-local module (the means — "return JSON as the final response" — is codex-specific; the
claude-code path uses real tool calls):

- `COMPLETION_REPORT_MEANS` — the single source, equal to the clause already embedded in the
  retry prompt: `"コードフェンスや説明文を付けず、スキーマに一致する JSON オブジェクトのみを返してください。"`
- `buildMainTurnCompletionInstruction()` — wraps the means with completion intent for the work
  turn (e.g. "このステップの作業が完了したら、最終応答として、" + `COMPLETION_REPORT_MEANS`).
- `buildCompletionRetryPrompt(attempt, maxAttempts)` — reproduces the existing retry text
  (`前の応答から JSON を取得できませんでした。` + `COMPLETION_REPORT_MEANS` + ` (attempt N/M)`),
  replacing the inline literal at `agent-runner.ts:522-524` verbatim.

In `run()`, when `reportTool` is set, append `buildMainTurnCompletionInstruction()` to `fullPrompt`
(`agent-runner.ts:285-287`). `fullPrompt` is used only by the main work turn (`runMainWorkTurn`),
so the injection is scoped correctly; `postWorkPrompts`, output-verification, and retry turns are
untouched. When `reportTool` is absent, `fullPrompt` is unchanged.

**Rationale**: Recency — placing the means at the end of the main-turn prompt makes it salient.
Single-sourcing guarantees the main-turn and retry wording cannot drift. Keeping the clause
byte-identical to the current retry literal avoids changing the retry behavior.

**Alternatives considered**: (a) Put the means back in the shared prompt layer — rejected, violates
#661. (b) Inline the instruction directly in `run()` without a shared constant — rejected, would
re-duplicate the wording the request asks to unify.

### D2: Persist recovery-failure diagnostics via the branch-borne step-attempt outcome

Add an optional `completionReportDiagnostics` array to the agent-result → state → journal chain,
mirroring exactly how `transientRetryAttempts` was threaded:

```
CompletionReportDiagnostic = {
  phase: "main" | "retry";
  attempt?: number;        // 1-indexed, present for retry phase
  failureReason: string;   // "json-parse-error" | "validation-failed" | "no-json-found"
  rawFragment: string;     // ≤200 chars + "…", as produced by tryExtractToolResult
}
```

`CodexAgentRunner.run()` accumulates one entry per failed extraction (main turn + each retry) into
a local array and attaches it to the success-path result only when non-empty (absent on the happy
path → backward-compatible, clean records). The chain:

1. `AgentRunResult.completionReportDiagnostics?` — port (`src/core/port/agent-runner.ts`).
2. `StepOutcome.completionReportDiagnostics?` — state (`src/state/schema.ts`).
3. `pushStepResult` partial + outcome spread — `src/state/helpers.ts`.
4. `StepAttemptRecord.outcome` field + `stepRunToRecord` spread + `fold()` spread —
   `src/store/event-journal.ts`.
5. `finalizeStep` agentResult param + `pushStepResult` call + the `runResult` pass-through at
   `executor.ts:461-468` — `src/core/step/executor.ts`.

Existing `stderrWrite` diagnostic lines are retained (no regression). The `SessionLogWriter` JSONL
is left as-is; the events route is the normative durable record because it is the only sink present
for inbox jobs.

**Rationale**: `events.jsonl` is branch-borne and written on every run regardless of verbosity, so
it is the only surface that survives an inbox job. The field is additive and optional at every hop,
exactly like `followUpAttempts` / `transientRetryAttempts`, so legacy records and the managed /
claude-code adapters are unaffected.

**Alternatives considered**: (a) `SessionLogWriter` JSONL only — rejected, it is absent unless
`-vv` and is written outside the branch, so inbox jobs gain nothing (this resolves the request's
"or events" ambiguity, which request-review flagged). (b) Write a bespoke diagnostics file into the
change folder from the adapter — rejected, couples the adapter to the change-folder path layout and
bypasses the established journal mechanism.

### D3: Retain the existing outputSchema main-turn path

The main work turn keeps passing `outputSchema` when `reportTool` is set
(`agent-runner.ts:457`, `474`). The D1 instruction is purely additive natural language; it does not
replace or alter `outputSchema`. The three extraction strategies, the follow-up retry loop, and the
fail-closed escalation (toolResult `null` → `completionReason "success"` → pipeline escalation) are
unchanged.

**Rationale**: Requirement 3 — the gpt-5.5 normal path must not regress. Adding guidance text
alongside the schema is low-risk and helpful for models that ignore the schema.

## Risks / Trade-offs

**[Risk] The extra main-turn instruction shifts a currently-passing model's output** → Mitigation:
the text only restates what `outputSchema` already asks for (JSON, no fences/prose); the recovery
pipeline and fail-closed path remain as a backstop. A no-regression test pins the existing
extraction/retry/fail-closed scenarios.

**[Risk] Additive `completionReportDiagnostics` field is mishandled by an old fold/record path** →
Mitigation: every hop uses the optional-spread pattern proven by `transientRetryAttempts`; the
field is omitted entirely on success, so existing records and tests are byte-compatible.

**[Risk] `rawFragment` leaks sensitive content into the committed journal** → Mitigation: the
fragment is a completion-report (step verdict / prose), capped at 200 chars by
`tryExtractToolResult`; this matches the existing #670 stderr exposure and the journal already
records `toolResult` payloads.

## Open Questions

None.
