# Spec: codex-completion-contract-injection

## Requirements

### Requirement: The codex adapter SHALL inject a completion-report instruction into the main work turn when a report tool is configured

When `ctx.policy.reportTool` is set, `CodexAgentRunner` MUST append a natural-language instruction
to the main work turn prompt that directs the model to deliver the completion report as a
schema-conforming JSON object as its final response, without code fences or surrounding prose. When
`ctx.policy.reportTool` is not set, the main work turn prompt MUST NOT contain this instruction.
The instruction MUST be applied only to the main work turn — `postWorkPrompts`,
output-verification, and follow-up retry turns are not affected by it.

#### Scenario: reportTool set — instruction present on main turn

**Given** a step whose `ctx.policy.reportTool` is set
**When** `CodexAgentRunner.run()` executes the main work turn
**Then** the prompt passed to `runStreamed` for the main turn contains the completion-report means
clause (instruction to return schema-conforming JSON, no code fences or prose)

#### Scenario: reportTool unset — instruction absent

**Given** a step whose `ctx.policy.reportTool` is undefined
**When** `CodexAgentRunner.run()` executes the main work turn
**Then** the prompt passed to `runStreamed` for the main turn does not contain the completion-report
means clause

### Requirement: The completion-report means wording SHALL be single-sourced across the main turn and the retry prompt

The means clause used by the main-turn instruction and the means clause used by the follow-up retry
prompt MUST derive from a single shared definition, so the two cannot diverge. The follow-up retry
prompt's observable text (including the `(attempt N/M)` suffix and the leading
`前の応答から JSON を取得できませんでした。` sentence) MUST remain unchanged from the current behavior.

#### Scenario: main-turn instruction and retry prompt share the means clause

**Given** the shared means definition
**When** the main-turn instruction and the retry prompt are constructed
**Then** both contain the identical means clause substring sourced from the shared definition

#### Scenario: retry prompt text is preserved

**Given** a follow-up retry at attempt `a` of `m`
**When** the retry prompt is constructed
**Then** its text equals `前の応答から JSON を取得できませんでした。<means clause> (attempt a/m)`

### Requirement: Completion-report recovery failures SHALL be recorded in the branch-borne step-attempt outcome

When the main turn and all follow-up retries fail to yield a valid completion report, the adapter
MUST record, for each failed extraction, the `failureReason` and `rawFragment` produced by
`tryExtractToolResult` into a structured `completionReportDiagnostics` collection carried on the
agent result. This collection MUST be propagated into the `step-attempt` record's `outcome` in
`events.jsonl`, so that inbox-launched jobs (which do not capture stderr and do not set a session
log path) retain the diagnostics. The existing stderr diagnostic output MUST be retained. When a
completion report is successfully recovered, the `completionReportDiagnostics` field MUST be absent
from the outcome (backward-compatible with legacy records).

#### Scenario: all turns fail — diagnostics persisted to the journal

**Given** a step with `reportTool` set whose main turn and every retry return unrecoverable output
**When** `CodexAgentRunner.run()` completes and the executor records the step attempt
**Then** the `step-attempt` outcome in `events.jsonl` contains a `completionReportDiagnostics` array
whose entries each carry a non-empty `failureReason` and `rawFragment`

#### Scenario: recovery succeeds — no diagnostics field

**Given** a step with `reportTool` set whose completion report is recovered on the main turn or a
retry
**When** the step attempt is recorded
**Then** the `step-attempt` outcome does not contain a `completionReportDiagnostics` field

#### Scenario: diagnostics survive without a session log path (inbox job)

**Given** a step with `reportTool` set, `ctx.session.logPath` unset, whose recovery fails on all
turns
**When** the step attempt is recorded
**Then** the `failureReason` and `rawFragment` are still present in the branch-borne `step-attempt`
outcome

### Requirement: The existing outputSchema path and recovery behavior SHALL NOT regress

The main work turn MUST continue to pass `outputSchema` to `runStreamed` when `reportTool` is set.
The three-strategy extraction (raw parse, code-fence, bracket), the follow-up retry loop, and the
fail-closed escalation (a null `toolResult` with `completionReason: "success"`) MUST be unchanged.

#### Scenario: main turn still receives outputSchema

**Given** a step with `reportTool` set
**When** `CodexAgentRunner.run()` runs the main work turn
**Then** the `runStreamed` options for the main turn include `outputSchema`

#### Scenario: existing recovery scenarios stay green

**Given** the existing completion-report extraction, retry, and fail-closed tests
**When** the change is applied
**Then** those tests pass unchanged
