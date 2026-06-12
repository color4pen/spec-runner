# Spec: codex-completion-report-fallback

## Requirements

### Requirement: Robust JSON extraction from finalResponse

`tryExtractToolResult` SHALL attempt three extraction strategies in order—raw parse, code-fence extraction, bracket extraction—and return the first strategy that produces a `parseInput`-valid result.

#### Scenario: code-fenced JSON is recovered

**Given** a `finalResponse` of ` ```json\n{"verdict":"approved","findingsPath":null}\n``` `
**When** `tryExtractToolResult` is called with a matching `reportTool`
**Then** `toolResult` is non-null and contains `verdict: "approved"`

#### Scenario: text-prefixed JSON is recovered

**Given** a `finalResponse` of `"Here is my report:\n{"verdict":"approved","findingsPath":null}"`
**When** `tryExtractToolResult` is called with a matching `reportTool`
**Then** `toolResult` is non-null and contains `verdict: "approved"`

#### Scenario: raw JSON (existing path) is unaffected

**Given** a `finalResponse` of `'{"verdict":"approved","findingsPath":null}'`
**When** `tryExtractToolResult` is called with a matching `reportTool`
**Then** `toolResult` is non-null (raw parse strategy succeeds, no regression)

#### Scenario: unrecoverable finalResponse returns null

**Given** a `finalResponse` of `"Task complete, no JSON here."`
**When** `tryExtractToolResult` is called
**Then** `toolResult` is null and `failureReason` is a non-empty string

### Requirement: Validation contract is not relaxed

`tryExtractToolResult` MUST validate every extracted JSON object through `reportTool.parseInput()` before accepting it as a result. Syntactically valid but schema-invalid JSON SHALL be rejected.

#### Scenario: schema-invalid JSON is rejected

**Given** a `finalResponse` of `'{"unexpected":"field"}'` where the schema requires `verdict`
**When** `tryExtractToolResult` is called
**Then** `toolResult` is null

### Requirement: Schema-free follow-up retry turns

The `toolReportRetry` loop SHALL omit `outputSchema` from follow-up retry turns.

#### Scenario: retry turns do not receive outputSchema

**Given** the main work turn fails to produce a parseable completion report
**When** the follow-up retry loop executes
**Then** `runStreamed` is called without an `outputSchema` option on each retry turn

### Requirement: Parse failure observability

When `tryExtractToolResult` returns `toolResult: null`, the caller SHALL write a diagnostic line to stderr including the attempt number, failure reason, and a truncated `finalResponse` fragment (≤200 characters).

#### Scenario: parse failure is logged

**Given** a `finalResponse` that cannot be parsed as a valid completion report
**When** the main turn or a retry turn fails to extract a toolResult
**Then** a line is written to stderr containing the failure reason and a fragment of `finalResponse`

#### Scenario: fragment is truncated at 200 characters

**Given** a `finalResponse` longer than 200 characters
**When** the diagnostic is emitted
**Then** the logged fragment is at most 200 characters

### Requirement: Fail-closed behavior preserved

When all turns (main + all retry attempts) fail to produce a completion report, `AgentRunResult.toolResult` MUST be null, which causes the pipeline to escalate via fail-closed verdict.

#### Scenario: all turns fail → toolResult null

**Given** all `finalResponse` values across the main turn and all retry turns are unrecoverable
**When** `CodexAgentRunner.run()` returns
**Then** `result.toolResult` is null
