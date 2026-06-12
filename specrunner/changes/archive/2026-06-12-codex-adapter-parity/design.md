# Design: codex-adapter-parity

## Context

`src/adapter/codex/agent-runner.ts` (`CodexAgentRunner`) satisfies the `AgentRunner`
port and is reached in production via `DispatchingAgentRunner` whenever a step resolves
to an `openai`-provider model. It already implements: `run()`, session resume
(`resumeThread` → fresh-thread fallback), typed-outcome via `outputSchema`, the
typed-outcome follow-up retry loop, `postWorkPrompts`, and per-turn usage accumulation.

It is missing every *operational* feature the local Claude adapter has:

| Feature | claude-code | codex |
|---|---|---|
| Transient-error auto-retry (main turn) | `agent-runner.ts:414-435` | absent |
| Transient-error auto-retry (follow-up turns) | `runFollowUpQueryWithRetry` (#646) | absent |
| `transientRetryAttempts` recorded | yes | never set (undefined) |
| JSONL verbose log on `ctx.session.logPath` | `SessionLogWriter` | absent |
| `step:progress` events via `ctx.emit` | `emitToolProgress` per stream message | absent |
| `ctx.policy.outputVerification` repair loop | `agent-runner.ts:572-621` | absent |

`grep` confirms `retryWithBackoff`, `isTransientAgentError`, `ctx.emit`, and `logPath`
have **zero** references inside `src/adapter/codex/`.

Port contract requires no change: `ctx.session.logPath`, `ctx.emit`,
`ctx.policy.outputVerification`, and `AgentRunResult.transientRetryAttempts` are all
already defined on the port and consumed only by the claude-code adapter today.

Two shared mechanisms the claude-code adapter owns are provider-neutral but physically
located under `src/adapter/claude-code/`:

- `transient-error.ts` — `isTransientAgentError`, a fail-closed whitelist of
  connection / socket / network-timeout / 5xx tokens. None of the tokens are
  Claude-specific.
- `session-log-writer.ts` — `SessionLogWriter`, a masked JSONL writer keyed only off
  the port's `ModelUsage`. Nothing in it is Claude-specific.

`retryWithBackoff` already lives in the provider-neutral `src/util/retry.ts`.
`src/adapter/shared/` already hosts provider-neutral adapter logic (`follow-up.ts`,
`prompt-builder.ts`) and is the established home for code shared between sibling adapters.

The Codex SDK (`@openai/codex-sdk`) exposes two execution primitives on a thread:

- `run(input, opts)` → resolves a completed `Turn { items, finalResponse, usage }` only
  after the turn finishes. No mid-turn signal. (Used today.)
- `runStreamed(input, opts)` → `{ events: AsyncGenerator<ThreadEvent> }`. `ThreadEvent`
  includes `item.started` / `item.updated` / `item.completed` (per `ThreadItem`:
  `command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `agent_message`, …),
  `turn.completed` (carries `usage`), `turn.failed` (carries `error.message`), and a fatal
  `error` event. `run()` is itself a thin convenience wrapper over `runStreamed()`.

## Goals / Non-Goals

**Goals**:
- Apply transient-error auto-retry to the codex **main work turn** and **all follow-up
  turns** (typed-outcome retry loop, `postWorkPrompts`, output-verification repair), using
  the same convergence rules as claude-code: `resolveTransientRetryConfig` →
  `maxRetries` / `baseDelayMs`, `step:retry` emission, `transientRetryAttempts` recording.
- Classify Codex transient errors through a single provider-neutral classifier.
- Write a JSONL verbose log when `ctx.session.logPath` is set; write nothing when unset.
- Emit `step:progress` events as the agent uses tools.
- Run the `ctx.policy.outputVerification` repair loop.
- Refresh the stale jsdoc that claims these features are claude-code-only.

**Non-Goals** (carried verbatim from request scope):
- Provider-neutral wording of prompt completion contracts (separate request:
  `prompts-completion-contract-neutral`).
- OpenAI pricing / usage display (separate request: `usage-pricing-provider-neutral`).
- `optionalDependencies` for provider SDKs (separate request).
- Any change to the `AgentRunner` port or the state schema.
- Transient retry for the **managed** adapter (out of scope; managed has its own polling).

## Decisions

### D1: Drive every turn through `runStreamed()` (single execution path)

Replace `thread.run(...)` with `thread.runStreamed(...)` everywhere in
`CodexAgentRunner` (main turn, typed-outcome retry, `postWorkPrompts`, output-verification
repair). A single private helper `executeTurn(thread, prompt, opts)` consumes the event
stream and reconstructs the `Turn` the rest of the method already expects:

- Iterate `events`. For each event:
  - `item.started` for a tool-ish item → emit `step:progress` (D4).
  - every event → write one JSONL line to the `SessionLogWriter` when active (D3).
  - `item.completed` → push `event.item` into the reconstructed `items[]`; if it is an
    `agent_message`, remember `.text` as the running `finalResponse`.
  - `turn.completed` → capture `usage` (mapped to the existing `CodexUsage` shape).
  - `turn.failed` or fatal `error` → `throw` an `Error` carrying `error.message` (this is
    the codex analogue of claude-code's "error result → throw" in `maybeThrowTransientResult`,
    so the transient classifier and the resume fallback handle it uniformly).
- Return `{ items, finalResponse, usage }`.

**Rationale — why `runStreamed` not `run`:** `step:progress` (req #4) and an incremental
verbose log (req #3) both require visibility *during* the turn. `run()` resolves only at
the end, so progress and logging could only be emitted as a post-completion burst — which
defeats the live heartbeat purpose `step:progress` exists for and produces nothing when a
long turn times out mid-flight. `runStreamed` is the SDK-native primitive (`run` wraps it),
so reconstructing the `Turn` from events costs nothing semantically and yields genuine
parity with claude-code's per-message streaming loop. A single streamed path avoids
maintaining two divergent execution/logging code paths.

**Alternatives considered:**
- *Keep `run()`, emit `step:progress` and write the log from `turn.items` after the turn
  resolves.* Lowest churn (existing test mocks stay on `run`), but progress is a
  post-completion burst (no live granularity) and a timed-out/crashed turn logs nothing.
  Rejected: it satisfies the requirement only as a checkbox, not as observability.
- *Dual path: prefer `runStreamed`, fall back to `run`.* Avoids migrating existing test
  mocks but introduces two execution paths with two logging granularities — a maintenance
  smell and ambiguous "which path is authoritative" semantics. Rejected in favour of one
  clean path.

**Cost (accepted):** the existing `tests/adapter/codex/agent-runner.test.ts` mocks
`thread.run`. Migrating those mocks to `thread.runStreamed` is mechanical (opts —
`{ signal, outputSchema }` — are passed identically; only the return shape changes from
`Turn` to `{ events }`) and is centralised through one test helper. T-08 owns this.

### D2: Transient retry topology mirrors claude-code exactly

Resolve `{ maxRetries, baseDelayMs } = resolveTransientRetryConfig(ctx.config)` once.
Track a mutable `transientRetryAttempts` counter and a `resumeFallbackDone` flag.

- **Main work turn** — wrap the existing resume→fresh-thread fallback inside a
  `runMainWorkTurn()` unit (same structure as claude-code `agent-runner.ts:324-351`). When
  `maxRetries === 0`, call it directly (no wrapper, no events). When `maxRetries > 0`, wrap
  it in `retryWithBackoff({ maxAttempts: maxRetries + 1, baseDelayMs, isTransientError:
  (err) => !abortController.signal.aborted && isTransientAgentError(err), sleepFn,
  onRetry: (attempt) => { transientRetryAttempts++; ctx.emit("step:retry",
  { step, attempt, maxRetries, delayMs: baseDelayMs * 2^(attempt-1) }); } })`.
- **Follow-up turns** — a single `runFollowUpTurnWithRetry(thread, prompt, opts)` helper
  wraps `executeTurn` in `retryWithBackoff` with the same options and the same
  incrementing `onRetry`. All three follow-up sites (typed-outcome retry loop,
  `postWorkPrompts`, output-verification repair) call it instead of `executeTurn` directly.
- **`transientRetryAttempts`** is incremented (never assigned) in both `onRetry`s and is
  included on the result only when `maxRetries > 0` (`...(maxRetries > 0 ?
  { transientRetryAttempts } : {})`), matching claude-code's presence/absence semantics.

**Rationale:** This reproduces the #646 structure (main + follow-up both wrapped) so the
same transient gap cannot reopen in codex. Reusing `retryWithBackoff` and the resolved
config keeps one convergence rule across adapters. A sleep injection seam
(`_sleepFn` constructor dep, defaulting to `setTimeout`) is added for deterministic tests,
mirroring `ClaudeCodeRunnerDeps._sleepFn`.

**Alternatives considered:** one mega-retry wrapping the whole `run()` body — would restart
the main turn on a follow-up failure, changing cost/semantics. Rejected (same reasoning as
the #646 design).

### D3: Reuse `SessionLogWriter` by extracting it to `src/adapter/shared/`

Move `SessionLogWriter` to `src/adapter/shared/session-log-writer.ts`. Leave
`src/adapter/claude-code/session-log-writer.ts` as a re-export shim
(`export { SessionLogWriter } from "../shared/session-log-writer.js";`). `CodexAgentRunner`
imports it from `shared/`. When `ctx.session.logPath` is set, open one writer for the run,
write each streamed `ThreadEvent` (D1) as a line, and call `writeSummary({ sessionId,
model, modelUsage })` before `close()` on every exit path (success, error, timeout).

**Rationale:** `SessionLogWriter` is provider-neutral (masked JSONL keyed off the port's
`ModelUsage`). A sibling adapter importing from `claude-code/` would couple two adapters
directionally; `shared/` is the correct, already-used home. The re-export shim means
claude-code's adapter code and its existing `session-log-writer.test.ts` import path keep
working with zero edits.

**Alternatives considered:** (a) codex imports directly from `claude-code/` — rejected,
cross-adapter coupling; (b) a codex-local copy — rejected, duplication / drift.

### D4: Emit `step:progress` on tool-item start

A pure helper `extractCodexProgress(item: ThreadItem): { tool, target? } | null` maps a
started item to a progress payload, mirroring claude-code's `extractTarget`:

- `command_execution` → `{ tool: "Bash", target: <command, truncated to ~40 chars> }`
- `file_change` → `{ tool: "Edit", target: <first changed path> }`
- `mcp_tool_call` → `{ tool: <tool name>, target: <server> }`
- `web_search` → `{ tool: "WebSearch", target: <query> }`
- anything else (reasoning, agent_message, todo_list, error) → `null` (no emit)

On `item.started`, if the mapping is non-null, `ctx.emit("step:progress",
{ step: step.name, tool, ...(target ? { target } : {}) })`. The payload shape matches the
existing `core/event/types.ts` `"step:progress": { step; tool; target? }` contract.

**Rationale:** keeps the `step:progress` payload identical to claude-code so
`cli/progress.ts` consumes both without change. Tool detection only on `item.started`
mirrors claude-code emitting on tool_use *start* (live, before the tool finishes).

### D5: Reuse the classifier by extracting `isTransientAgentError` to `src/adapter/shared/`

Move `isTransientAgentError` (and its token tables) to
`src/adapter/shared/transient-error.ts`. Leave
`src/adapter/claude-code/transient-error.ts` as a re-export shim. `CodexAgentRunner`
imports the classifier from `shared/`.

Codex reuses the **same** whitelist unchanged. The tokens
(`econnrefused`, `fetch failed`, `etimedout`, `socket hang up`, `overloaded`, 5xx-in-
status-context, …) are generic network/transport/HTTP patterns the OpenAI/Codex stack
produces too. No Codex-specific tokens are invented speculatively: the module is
fail-closed by design, and fabricating unverified Codex error strings would weaken that
guarantee. The shared module keeps a documented seam (an exported token array) so a
genuinely-observed Codex-specific transient token can be added later with evidence.

**Rationale (answers req #2 — "共通 util か adapter 別か"):** the classifier content is
provider-neutral, so a single shared classifier is correct and avoids duplication/drift; a
codex-local copy would fork the whitelist. Adapter isolation forbids codex importing from
claude-code, so the shared extraction (not a direct cross-import) is the clean form. The
re-export shim keeps claude-code's `transient-error.test.ts` and adapter imports green.

### D6: Output-verification repair loop ports 1:1 from claude-code

After `postWorkPrompts`, when `ctx.policy.outputVerification` is set **and** a session was
established (`threadId` present), loop up to `outputVerification.maxAttempts`:
`detect()` (best-effort; on throw, break) → keep `policy === "follow-up"` violations →
if none, break → `buildPrompt(violations, attempt)` → run a repair turn on the **active
thread** via `runFollowUpTurnWithRetry` (no `outputSchema`) → accumulate usage →
`followUpAttempts++`. The repair turn itself is wrapped in try/catch (best-effort: a
failed repair turn preserves the work-turn result, mirroring `agent-runner.ts:591-618`).

**Rationale:** identical contract and budget (`OUTPUT_FOLLOWUP_MAX_ATTEMPTS`) to
claude-code, so behaviour is consistent regardless of which runtime executed the step.

### D7: Refresh stale jsdoc (no behaviour change)

- `src/config/schema.ts` — `TransientRetryConfig` (~line 300) and
  `SpecRunnerConfig.transientRetry` (~line 401): "Applied to the local ClaudeCodeRunner
  only" → "Applied to local runtime runners (ClaudeCodeRunner and CodexAgentRunner);
  ignored by the managed runtime."
- `src/core/port/agent-runner.ts` (~line 186) — `modelUsage`: "Only populated by
  ClaudeCodeRunner" → "Populated by local runtime runners (ClaudeCodeRunner,
  CodexAgentRunner); ManagedAgentRunner leaves it undefined."

**Rationale:** the comments become false once codex consumes these mechanisms; req #6.

## Risks / Trade-offs

- [Risk] Migrating the existing codex test mocks from `run` to `runStreamed` (D1) could
  regress the already-green typed-outcome / follow-up / session-continuity tests.
  → Mitigation: centralise stream-mock construction in one helper
  (`makeStreamedTurn(...)`), translate assertions mechanically (`thread.run` →
  `thread.runStreamed`; opts unchanged), and gate on the full suite staying green (T-09).

- [Risk] Codex transient classification reuses the claude-code whitelist, which may not
  cover every Codex-specific transient wording (fail-closed → some recoverable errors halt
  instead of retrying). → Mitigation: accepted as the safe default; the shared token seam
  (D5) lets evidence-backed tokens be added without code restructuring.

- [Risk] Follow-up turn retries add latency (up to `maxRetries ×` backoff before halting).
  → Mitigation: same bounded trade-off already accepted for claude-code; ceiling is
  `baseDelayMs × 2^(maxRetries-1)` at default settings.

- [Risk] Moving `SessionLogWriter` / `transient-error` could break their import sites.
  → Mitigation: re-export shims preserve every existing import path; no claude-code
  adapter or test file is edited.

## Open Questions

None blocking. The shared-extraction + re-export shim pattern and the retry topology are
fully determined by the existing claude-code architecture; the only judgment call (D1
streaming vs post-turn) is resolved above with its alternatives recorded for review.
