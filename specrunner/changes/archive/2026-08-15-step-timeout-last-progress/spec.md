# Spec: STEP_TIMEOUT halt records carry last-tool observation

## Requirements

### Requirement: Last-tool tracker records the most recent tool and its completion

A per-session tracker SHALL retain the last observed tool start (tool name, optional target, and the
observation time) and MUST record whether that tool's matching completion was later observed. When no
tool has been observed, the tracker MUST report an explicit "no tool observed" state rather than an empty
or fabricated tool.

#### Scenario: tool observed and still in-flight at timeout

**Given** a tracker on which `onToolStart("Bash", "bun test", id)` was called and no matching
`onToolEnd` has been observed
**When** the timeout hint is rendered
**Then** the hint contains the tool name `Bash`, the target `bun test`, the elapsed time since the start
in ms, and text indicating the tool is in-flight (no completion observed)

#### Scenario: tool observed and completed before timeout

**Given** a tracker on which `onToolStart("Bash", "bun test", id)` then `onToolEnd(id)` were called for
the same id
**When** the timeout hint is rendered
**Then** the hint contains the tool name and target and text indicating the tool completed (not in-flight)

#### Scenario: no tool observed in the session

**Given** a tracker on which `onToolStart` was never called
**When** the timeout hint is rendered
**Then** the hint contains a "no tool observed" marker distinguishing an idle/API stall from a tool hang

#### Scenario: a non-matching completion does not clear in-flight state

**Given** a tracker on which `onToolStart(toolA, targetA, idA)` was called
**When** `onToolEnd(idB)` is observed for a different id `idB`
**Then** the rendered hint still indicates `toolA` is in-flight

### Requirement: claude-code timeout error carries the last-tool observation

When the claude-code runner produces a `STEP_TIMEOUT` result after observing a `tool_use` start, the
returned error's record (its `message` or `hint`) MUST contain the last tool's name, its target, and the
elapsed time since the tool started, so an operator reading events.jsonl can identify the running tool
without inspecting the process.

#### Scenario: tool_use observed then the stream goes silent

**Given** the claude-code runner is streaming and observes a `tool_use` content block for `Bash` with a
command target, after which no further events arrive
**When** the inactivity watchdog fires and the runner returns a `STEP_TIMEOUT` result
**Then** the result's error record contains the tool name `Bash`, the command target, the elapsed time in
ms, and indicates the tool was in-flight

#### Scenario: tool_result observed before the silence

**Given** the claude-code runner observes a `tool_use` start and then the matching `tool_result` for the
same tool_use id, after which no further events arrive
**When** the inactivity watchdog fires and the runner returns a `STEP_TIMEOUT` result
**Then** the result's error record indicates the last tool completed (not in-flight)

#### Scenario: no tool_use observed before timeout

**Given** the claude-code runner streams and never observes a `tool_use` start before going silent
**When** the inactivity watchdog fires and the runner returns a `STEP_TIMEOUT` result
**Then** the result's error record contains a "no tool observed" marker

### Requirement: codex timeout error carries the last-tool observation

When the codex runner produces a `STEP_TIMEOUT` result after observing an `item.started` tool item, the
returned error's record (its `message` or `hint`) MUST contain the last tool's name, its target, and the
elapsed time since the item started, and MUST distinguish an in-flight item from one whose
`item.completed` was observed. A session with no tool item MUST yield a "no tool observed" marker.

#### Scenario: item.started observed then the stream goes silent

**Given** the codex runner observes an `item.started` `command_execution` item with a command target,
after which no further events arrive
**When** the inactivity watchdog fires and the runner returns a `STEP_TIMEOUT` result
**Then** the result's error record contains the tool name, the command target, the elapsed time in ms,
and indicates the item was in-flight

#### Scenario: item.completed observed before the silence

**Given** the codex runner observes an `item.started` tool item and then the matching `item.completed`
for the same item id, after which no further events arrive
**When** the inactivity watchdog fires and the runner returns a `STEP_TIMEOUT` result
**Then** the result's error record indicates the last item completed (not in-flight)

#### Scenario: no tool item observed before timeout

**Given** the codex runner observes only non-tool items (e.g. agent_message) before going silent
**When** the inactivity watchdog fires and the runner returns a `STEP_TIMEOUT` result
**Then** the result's error record contains a "no tool observed" marker

### Requirement: the observation reaches the persisted step-attempt record

The last-tool observation carried on the `STEP_TIMEOUT` error SHALL be persisted into the events.jsonl
step-attempt error record via `ErrorInfo.hint`, so it is readable after the halt without re-running the
job.

#### Scenario: hint survives into the step-attempt error

**Given** a `STEP_TIMEOUT` runner error whose `hint` holds the last-tool observation
**When** the timeout halt is recorded and the step-attempt is written to events.jsonl
**Then** the step-attempt's `error.hint` equals the observation text produced by the runner

### Requirement: existing timeout behavior is unchanged

Adding the observation MUST NOT change the inactivity watchdog threshold, its `bump`/`clear`/`fired`
contract, the awaiting-resume halt transition for `STEP_TIMEOUT`, the `formatInactivityTimeoutMessage`
output, or the `step:progress` terminal display.

#### Scenario: timeout still transitions to awaiting-resume

**Given** a step whose runner returns `completionReason: "timeout"` with a `STEP_TIMEOUT` error
**When** the executor handles the result
**Then** it produces an awaiting-resume halt with interruption reason `timeout`, exactly as before

#### Scenario: inactivity message text is unchanged

**Given** the inactivity watchdog fired with a measured elapsed of NNN ms for step `<name>`
**When** the runner builds the timeout error message
**Then** the message equals `Step '<name>' inactivity timeout: no agent event for NNNms`, unchanged, with
the observation carried only in the `hint`
