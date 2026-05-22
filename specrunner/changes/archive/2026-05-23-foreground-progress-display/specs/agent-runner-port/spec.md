# Delta Spec: foreground-progress-display

## Requirements

### Requirement: ClaudeCodeRunner emits step:progress via ctx.emit

`ClaudeCodeRunner` SHALL detect tool_use content blocks in the SDK stream and emit `step:progress` events via `ctx.emit("step:progress", { step, tool, target? })`.

The emit logic SHALL be shared between the main query stream loop and the follow-up query stream loop via a common helper function. This ensures progress reporting is consistent across both execution paths.

The adapter SHALL NOT perform throttling, formatting, or timer management. These responsibilities belong to the CLI layer (`ProgressDisplay`).

#### Scenario: Tool use detected in main stream emits step:progress

- **GIVEN** a `ClaudeCodeRunner.run()` is executing the main query stream loop
- **WHEN** a tool_use content block (e.g. `Edit`, `Bash`) is detected in the stream
- **THEN** `ctx.emit("step:progress", { step: "<stepName>", tool: "<toolName>" })` is called

#### Scenario: Tool use detected in follow-up stream emits step:progress

- **GIVEN** a `ClaudeCodeRunner.run()` is executing the follow-up query stream loop
- **WHEN** a tool_use content block is detected in the stream
- **THEN** `ctx.emit("step:progress", { step: "<stepName>", tool: "<toolName>" })` is called

#### Scenario: Target extracted when available

- **GIVEN** a tool_use content block with identifiable target (e.g. Edit with `file_path`)
- **WHEN** the tool_use is detected
- **THEN** `step:progress` payload includes `target` with the extracted value

#### Scenario: Target omitted when not extractable

- **GIVEN** a tool_use content block without an identifiable target
- **WHEN** the tool_use is detected
- **THEN** `step:progress` payload does not include `target` (field is `undefined`)

#### Scenario: No step:progress emitted for non-tool messages

- **GIVEN** a stream message that is not a tool_use (e.g. `result`, `text_delta`)
- **WHEN** the message is processed
- **THEN** `ctx.emit("step:progress", ...)` is NOT called

#### Scenario: Common helper used by both loops

- **WHEN** inspecting `src/adapter/claude-code/agent-runner.ts`
- **THEN** both the main query loop and the follow-up query loop call the same helper function for tool_use detection and `ctx.emit`

### Requirement: ManagedAgentRunner does not emit step:progress

`ManagedAgentRunner` SHALL NOT emit `step:progress` events. The managed runtime SSE stream does not expose built-in tool names at sufficient granularity. The CLI heartbeat floor (step + elapsed only) provides adequate idle-timeout protection for managed runtime.

#### Scenario: ManagedAgentRunner does not call ctx.emit with step:progress

- **WHEN** `ManagedAgentRunner.run()` executes
- **THEN** `ctx.emit` is never called with `"step:progress"` as the event name

### Requirement: isToolUse type guard in message-types

`src/adapter/claude-code/message-types.ts` SHALL export an `isToolUse` type guard function that detects tool_use content blocks within SDK stream messages. The guard narrows to a shape containing the tool name.

#### Scenario: isToolUse returns true for tool_use content block

- **GIVEN** a stream message containing a `content_block_start` event with `content_block.type === "tool_use"`
- **WHEN** `isToolUse(msg)` is called
- **THEN** the return value is `true`
- **AND** the narrowed type includes `content_block.name` as a string

#### Scenario: isToolUse returns false for non-tool messages

- **GIVEN** a stream message that is a `result`, `text_delta`, or other non-tool type
- **WHEN** `isToolUse(msg)` is called
- **THEN** the return value is `false`
