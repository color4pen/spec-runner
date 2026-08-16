# Cross-Boundary Invariants Review — rules-delivery (iteration 2)

## Summary

Iteration 2 review. Prior round (iteration 1) had 3 findings (F1 HIGH, F2 MEDIUM, F3 LOW). All three have been addressed by the code-fixer per operator adjudication. One new finding is identified in this round.

---

## Prior Round Findings — Resolution Status

### F1 (HIGH) → RESOLVED

`step-context-builder.ts` module comment updated at lines 5–9:

> "Contains NO control-flow early returns, no state mutations.  
> All paths lead to a fully constructed AgentRunContext, EXCEPT when a rule  
> file declares an unknown `delivery` value — in that case splitRulesByDelivery  
> throws and the caller (executor.ts) catches it as a step-level error.  
> Callers rely on executor's outer try/catch to handle this exception."

`executor.ts` call-site comment at lines 312–313:

> "// Build agent run context — pure assembly, no control flow.  
> // NOTE: may throw when a rule file has an unknown delivery value (D6, rules-delivery)."

`spec-review-prior-round-context.test.ts` TC-024 describe/it text is already qualified ("prepareRoundContext が reject しても" / "does not throw when prepareRoundContext rejects") — the text is conditional on the specific scenario, not an unconditional claim. No update needed per operator adjudication.

### F2 (MEDIUM) → RESOLVED

Both adapter tests implemented:

- `src/adapter/managed-agent/__tests__/prompt-rules-injection.test.ts` — TC-017: verifies `promptRules` appears after resume context and before `git push origin ${BRANCH}` in the polling path's initialMessage.
- `src/adapter/codex/__tests__/prompt-rules-injection.test.ts` — TC-018: verifies `promptRules` appears after resume context and before `buildMainTurnCompletionInstruction()` output.

### F3 (LOW) → RESOLVED (operator adjudication: keep duplication, add cross-reference)

Cross-reference comments present in both files:

- `src/core/step/rules-delivery.ts` line 17–18: "NOTE: the same frontmatter convention is also implemented in src/core/reviewers/definition.ts. If the `---` delimiter convention changes, update both files."
- `src/core/reviewers/definition.ts` line 68–69: "NOTE: the same frontmatter convention is also implemented in src/core/step/rules-delivery.ts. If the `---` delimiter convention changes, update both files."

---

## New Findings

### [MEDIUM] managed adapter SSE path (`runDesignStyle`) ignores `promptRules`

**File**: `src/adapter/managed-agent/agent-runner.ts`

**Invariant**:  
The port contract (`AgentRunPolicy.promptRules`) documents: "When undefined, no injection occurs" / "adapter が自身の completion directive の直前に挿入する". The design mandate (request D4, design D4) says each adapter places `promptRules` in its execution path. The contract implies that when `promptRules` is set in `ctx.policy`, every adapter execution path must inject it.

**What the gap is**:  
`ManagedAgentRunner.run()` dispatches to two execution paths:

1. `runPollingStyle` — used for all steps except design. ✅ `promptRules` injected (lines 629–632).
2. `runDesignStyle` (SSE path) — used exclusively for the "design" step. ❌ `promptRules` NOT injected.

In `runDesignStyle`, the initial message is built as:

```typescript
const effectiveRequestContentWithResume = ctx.session.resumePrompt
  ? `${effectiveRequestContent}\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`
  : effectiveRequestContent;

const sseResult = await this.sessionClient.streamEvents(sessionId, {
  requestContent: effectiveRequestContentWithResume,  // promptRules absent
  ...
```

The `promptRules` section is never appended to `effectiveRequestContentWithResume`.

**Failure mode**:  
If `specrunner/rules/design/*.md` contains a file with `delivery: prompt`, `buildStepContext` correctly populates `ctx.policy.promptRules`, but the managed adapter's SSE path silently drops it. The agent runs without the rule content in the prompt. No error is raised.

**Current exploit status**:  
Currently unexploited. No design-step rules exist with `delivery: prompt` (the only `delivery: prompt` file added in this change is `specrunner/rules/implementer/02-test-command.md`, which runs via the polling path). However, the port contract invariant is violated and the gap is permanent until fixed.

**TC-017 coverage**:  
The new TC-017 test only exercises the polling path (step role = "implementer"). The SSE path (`step.agent.role === STEP_NAMES.DESIGN`) is not covered.

**Resolution**: fixable — append `promptRules` to `effectiveRequestContentWithResume` in `runDesignStyle` before passing to `streamEvents`, analogous to the polling path injection.

---

## Observations

### Prior round observation (backward compat) — unchanged

No new rule files have frontmatter in `specrunner/rules/` except `02-test-command.md`. Backward compatibility remains intact.

### executor `produce()` throw propagation — confirmed sound

When `buildStepContext` throws via `splitRulesByDelivery` in the `execute()` path, the executor's outer catch re-throws with a `step:error` event emission. In `produceResult()` (parallel reviewer path), the throw is normalized to `{ kind: "halt" }`. Both paths handle the exception; no state corruption observed. This was noted in the prior round as sound and the code-fixer's updated comments correctly describe this behavior.

---

## Evidence

| Item | Checked |
|---|---|
| `src/core/step/step-context-builder.ts` — module comment lines 1–16 | ✅ Updated |
| `src/core/step/executor.ts` — call-site comment lines 312–313 | ✅ Updated |
| `src/core/step/__tests__/spec-review-prior-round-context.test.ts` TC-024 text | ✅ Qualified (conditional on prepareRoundContext scenario) |
| `src/adapter/managed-agent/__tests__/prompt-rules-injection.test.ts` | ✅ Present (TC-017) |
| `src/adapter/codex/__tests__/prompt-rules-injection.test.ts` | ✅ Present (TC-018) |
| `src/core/step/rules-delivery.ts` — cross-ref comment line 17–18 | ✅ Present |
| `src/core/reviewers/definition.ts` — cross-ref comment line 68–69 | ✅ Present |
| `src/adapter/managed-agent/agent-runner.ts` — `runDesignStyle` SSE path | ❌ `promptRules` not injected |
| `src/adapter/managed-agent/agent-runner.ts` — `runPollingStyle` | ✅ `promptRules` injected (lines 629–632) |
| `src/core/port/agent-runner.ts` — `AgentRunPolicy.promptRules` doc | ✅ Present with correct invariant description |
| `specrunner/rules/design/` — existence of `delivery: prompt` rules | ✅ No such files exist (finding is latent) |
