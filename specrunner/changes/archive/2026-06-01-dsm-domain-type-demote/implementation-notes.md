# Implementation Notes: dsm-domain-type-demote

## T-01 Scan Results

### adapter → domain import sites

| File | Import | Allowlist tracking |
|------|--------|--------------------|
| `src/adapter/claude-code/agent-runner.ts` | `../../core/event/types.js` (DomainEvent) | DSM-adapter-domain-cc-event |
| `src/adapter/claude-code/agent-runner.ts` | `../../core/types.js` (StepContext) | DSM-adapter-domain-cc-types |
| `src/adapter/claude-code/agent-runner.ts` | `../../core/lifecycle/diagnostic.js` (logPipelineDiag) | DSM-adapter-domain-cc-lifecycle |
| `src/adapter/codex/agent-runner.ts` | `../../core/types.js` (StepContext) | DSM-adapter-domain-codex-types |
| `src/adapter/managed-agent/sse-stream.ts` | `../../core/tools/types.js` (CustomToolContext, CustomToolHandler) | DSM-adapter-domain-sse-tools |
| `src/adapter/managed-agent/anthropic-client.ts` | `../../core/agent/definition.js` (AgentDefinition, ToolSpec) — type import | DSM-adapter-domain-ac-agent |
| `src/adapter/managed-agent/anthropic-client.ts` | `../../core/agent/definition.js` (AGENT_TOOLSET_TYPE) — value import | DSM-adapter-domain-ac-agent |
| `src/adapter/managed-agent/agent-runner.ts` | `../../core/step/types.js` (AgentStep) | DSM-adapter-domain-ma-step-types |
| `src/adapter/managed-agent/agent-runner.ts` | `../../core/types.js` (StepContext) | DSM-adapter-domain-ma-types |
| `src/adapter/managed-agent/agent-runner.ts` | `../../core/step/executor-helpers.js` (throwWrappedError, attachStateAndRethrow) | DSM-adapter-domain-ma-exec-helpers |
| `src/adapter/managed-agent/agent-runner.ts` | `../../core/step/step-names.js` (STEP_NAMES) | DSM-adapter-domain-ma-step-names |
| `src/adapter/managed-agent/session-client.ts` | `../../core/tools/types.js` (CustomToolHandler) | DSM-adapter-domain-sc-tools |
| `src/adapter/managed-agent/error-helpers.ts` | `../../core/step/executor-helpers.js` (throwWrappedError) | DSM-adapter-domain-eh-exec-helpers |

Total adapter→domain: 13 import lines (covering 12 allowlist entries, ac-agent covers 2 lines with 1 entry)

### ports → domain import sites

| File | Import | Allowlist tracking |
|------|--------|--------------------|
| `src/core/port/anthropic-client.ts` | `../agent/definition.js` (AgentDefinition) | DSM-ports-domain-ac-agent |
| `src/core/port/agent-runner.ts` | `../step/types.js` (AgentStep) | DSM-ports-domain-ar-step |
| `src/core/port/agent-runner.ts` | `../event/types.js` (DomainEvent) | DSM-ports-domain-ar-event |
| `src/core/port/session-client.ts` | `../tools/types.js` (CustomToolHandler) | DSM-ports-domain-sc-tools |

Total ports→domain: 4 import lines, 4 allowlist entries.

### Allowlist cross-check

Allowlist has 12 `DSM-adapter-domain-*` + 4 `DSM-ports-domain-*` = 16 entries.
Scan covers all 16. ✓

## Fix strategy

Each domain type is lowered to `src/kernel/` and the original domain file becomes a re-export barrel.

| Domain type | New kernel file |
|-------------|----------------|
| `core/agent/definition` | `kernel/agent-definition.ts` |
| `core/event/types` | `kernel/event-types.ts` |
| `core/tools/types` | `kernel/tool-types.ts` |
| `core/step/types` | `kernel/step-types.ts` |
| `core/types` (StepContext) | `kernel/step-context.ts` |
| `core/port/github-client` (GitHubClient) | `kernel/github-client.ts` |
| `core/lifecycle/diagnostic` | `kernel/diagnostic.ts` |
| `core/step/executor-helpers` (throwWrappedError/attachStateAndRethrow) | `kernel/error-helpers.ts` |
| `core/port/report-result` (ReportToolSpec) | added to `kernel/report-result.ts` |
| `core/step/step-names` | already at `kernel/step-names.ts` (re-export barrel exists) |
