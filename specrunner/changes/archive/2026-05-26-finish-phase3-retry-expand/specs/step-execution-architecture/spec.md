## Requirements

### Requirement: StepExecutor does not inject supplementary request.md sections

The `StepExecutor` SHALL NOT be responsible for injecting supplementary sections from request.md into agent context. The step execution pipeline SHALL remain stateless with respect to request.md supplementary content sections (スコープ外, 受け入れ基準, architect 評価済みの設計判断).

#### Scenario: StepExecutor does not reference request.md supplementary sections

- **WHEN** `StepExecutor.runAgentStep` builds `AgentRunContext`
- **THEN** the context does NOT contain injected supplementary sections from request.md
- **AND** `StepExecutor` source code does not reference `extractMarkdownSections` or `buildRequestConstraintsBlock`

## Removed

- "Design and code-review steps inject request.md supplementary sections into agent initial message"
