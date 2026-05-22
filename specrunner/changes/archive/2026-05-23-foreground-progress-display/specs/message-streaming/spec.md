# Delta Spec: foreground-progress-display

## Requirements

### Requirement: CLI Heartbeat Progress Display

`ProgressDisplay` SHALL emit periodic heartbeat lines during step execution to eliminate silent intervals. The heartbeat is driven by a CLI-side `setInterval` timer that is **independent of adapter progress events** (floor guarantee).

The heartbeat SHALL display the current step name and elapsed seconds. When `step:progress` events have been received, the heartbeat additionally displays the action count and the most recent tool name.

#### Scenario: Heartbeat outputs step + elapsed during long step

- **GIVEN** `heartbeatIntervalSec` is configured to a positive value
- **WHEN** a step is running and the heartbeat interval elapses
- **THEN** stdout contains `[<step>] <elapsed>s`

#### Scenario: Heartbeat includes enrichment when progress events received

- **GIVEN** `step:progress` events have been received during the current step
- **WHEN** the heartbeat interval elapses
- **THEN** stdout contains `[<step>] <elapsed>s | <N> actions, last: <tool> <target>`

#### Scenario: Heartbeat works without any adapter progress events (floor)

- **GIVEN** the adapter does not emit any `step:progress` events (e.g. managed runtime)
- **WHEN** the heartbeat interval elapses
- **THEN** stdout contains `[<step>] <elapsed>s` (no enrichment)
- **AND** the heartbeat is not suppressed

### Requirement: TTY-Aware Heartbeat Rendering

The heartbeat render mode SHALL vary by terminal context:

- **TTY and non-verbose**: overwrite the last line using `\r` (single-line update)
- **Non-TTY or verbose**: append a new line with `\n`

#### Scenario: TTY non-verbose renders single overwrite line

- **GIVEN** `process.stdout.isTTY` is true and `verbose` is false
- **WHEN** the heartbeat fires
- **THEN** the output uses `\r` to overwrite the current line

#### Scenario: Non-TTY renders append lines

- **GIVEN** `process.stdout.isTTY` is false
- **WHEN** the heartbeat fires
- **THEN** the output appends a new line with `\n`

#### Scenario: Verbose mode renders append lines

- **GIVEN** `verbose` is true (regardless of TTY)
- **WHEN** the heartbeat fires
- **THEN** the output appends a new line with `\n`

### Requirement: Heartbeat Timer Lifecycle

The heartbeat timer SHALL start on `step:start` and stop on `step:complete`, `step:error`, `pipeline:complete`, and `pipeline:fail`. `ProgressDisplay` SHALL expose a `dispose()` method that stops the timer.

#### Scenario: Timer starts on step:start

- **WHEN** a `step:start` event is emitted
- **THEN** the heartbeat timer is started

#### Scenario: Timer stops on step:complete

- **WHEN** a `step:complete` event is emitted
- **THEN** the heartbeat timer is stopped and cleared

#### Scenario: Timer stops on step:error

- **WHEN** a `step:error` event is emitted
- **THEN** the heartbeat timer is stopped and cleared

#### Scenario: Timer stops on pipeline:complete (safety net)

- **WHEN** a `pipeline:complete` event is emitted
- **THEN** the heartbeat timer is stopped and cleared

#### Scenario: Timer stops on pipeline:fail (safety net)

- **WHEN** a `pipeline:fail` event is emitted
- **THEN** the heartbeat timer is stopped and cleared

#### Scenario: dispose() clears timer

- **WHEN** `dispose()` is called on `ProgressDisplay`
- **THEN** the heartbeat timer is stopped and cleared
- **AND** calling `dispose()` multiple times does not throw

#### Scenario: No timer leak on consecutive steps

- **GIVEN** step A is running with an active heartbeat timer
- **WHEN** `step:start` for step B is emitted (without a prior `step:complete` for A)
- **THEN** step A's timer is cleared before step B's timer starts

### Requirement: Heartbeat Interval Configuration

The heartbeat interval SHALL be configurable via `config.progress.heartbeatIntervalSec`, the `SPECRUNNER_HEARTBEAT_INTERVAL` environment variable, or a built-in default. The resolution order is: config → env → default.

The default interval is 30 seconds for TTY and 60 seconds for non-TTY.

Setting the interval to `0` or `null` disables the heartbeat.

#### Scenario: Config value overrides default

- **GIVEN** `config.progress.heartbeatIntervalSec` is `45`
- **WHEN** the heartbeat interval is resolved
- **THEN** the interval is 45 seconds

#### Scenario: Env var overrides default when config absent

- **GIVEN** `config.progress.heartbeatIntervalSec` is not set
- **AND** `SPECRUNNER_HEARTBEAT_INTERVAL=90`
- **WHEN** the heartbeat interval is resolved
- **THEN** the interval is 90 seconds

#### Scenario: Heartbeat disabled by config

- **GIVEN** `config.progress.heartbeatIntervalSec` is `0`
- **WHEN** the heartbeat interval is resolved
- **THEN** the heartbeat is disabled (no timer started)

#### Scenario: Heartbeat disabled by env

- **GIVEN** `SPECRUNNER_HEARTBEAT_INTERVAL=off`
- **WHEN** the heartbeat interval is resolved
- **THEN** the heartbeat is disabled

#### Scenario: Default TTY interval

- **GIVEN** no config or env override
- **AND** `process.stdout.isTTY` is true
- **WHEN** the heartbeat interval is resolved
- **THEN** the interval is 30 seconds

#### Scenario: Default non-TTY interval

- **GIVEN** no config or env override
- **AND** `process.stdout.isTTY` is false
- **WHEN** the heartbeat interval is resolved
- **THEN** the interval is 60 seconds

### Requirement: Config Validation for Progress Section

`validateConfig()` SHALL validate `progress.heartbeatIntervalSec` when present. Valid values are non-negative integers or `null`. Invalid values SHALL throw `CONFIG_INVALID`.

#### Scenario: Valid heartbeat interval

- **GIVEN** `config.progress.heartbeatIntervalSec` is `30`
- **WHEN** `validateConfig()` is called
- **THEN** validation passes

#### Scenario: Null heartbeat interval is valid

- **GIVEN** `config.progress.heartbeatIntervalSec` is `null`
- **WHEN** `validateConfig()` is called
- **THEN** validation passes

#### Scenario: Negative heartbeat interval is invalid

- **GIVEN** `config.progress.heartbeatIntervalSec` is `-1`
- **WHEN** `validateConfig()` is called
- **THEN** `CONFIG_INVALID` is thrown

### Requirement: DomainEvent Union Includes step:progress

`DomainEvent` type union SHALL include `"step:progress"`. `EventPayloadMap` SHALL define the payload as `{ step: string; tool: string; target?: string }`.

`step:progress` is a first-class domain event — it does not require the `as never` type cast used by non-standard events like `commit:push`.

#### Scenario: step:progress is in DomainEvent union

- **WHEN** inspecting `src/core/event/types.ts`
- **THEN** `"step:progress"` is a member of the `DomainEvent` union type
- **AND** `EventPayloadMap["step:progress"]` is `{ step: string; tool: string; target?: string }`
