## ADDED Requirements

### Requirement: Lifecycle transition map

The lifecycle module SHALL define a declarative transition map covering all JobStatus values.

#### Scenario: declarative transition rules
- WHEN `lifecycle.ts` is loaded
- THEN `VALID_TRANSITIONS` is a `ReadonlyMap<JobStatus, ReadonlySet<JobStatus>>` covering all 7 `JobStatus` values
- AND `running` allows transitions to `awaiting-resume`, `awaiting-merge`, `failed`, `terminated`
- AND `awaiting-resume` allows transitions to `running`, `canceled`
- AND `awaiting-merge` allows transitions to `archived`
- AND `failed` allows transitions to `running`, `canceled`
- AND `terminated` allows transitions to `running`, `canceled`
- AND `archived` allows no transitions (terminal)
- AND `canceled` allows no transitions (terminal)

### Requirement: Terminal and active status constants

The lifecycle module SHALL export terminal and active status constant sets.

#### Scenario: TERMINAL_STATUSES
- WHEN `TERMINAL_STATUSES` is referenced
- THEN it contains exactly `archived` and `canceled`

#### Scenario: ACTIVE_STATUSES
- WHEN `ACTIVE_STATUSES` is referenced
- THEN it contains exactly `running` and `awaiting-resume`

### Requirement: transitionJob pure function

The lifecycle module SHALL provide a pure function for validated status transitions.

#### Scenario: valid transition
- WHEN `transitionJob(state, to, ctx)` is called with a valid transition
- THEN it returns `{ state: <updated>, noop: false }`
- AND `state.status` equals `to`
- AND `state.history` has a new entry with `step: ctx.trigger` and `message` containing `ctx.reason`
- AND `state.updatedAt` is updated
- AND I/O is not performed (pure function)

#### Scenario: noop transition (same status)
- WHEN `transitionJob(state, state.status, ctx)` is called
- THEN it returns `{ state: <unchanged>, noop: true }`

#### Scenario: invalid transition
- WHEN `transitionJob(state, to, ctx)` is called with a transition not in `VALID_TRANSITIONS`
- THEN it throws an Error with message containing `from`, `to`, and `trigger`

#### Scenario: patch merge
- WHEN `ctx.patch` is provided
- THEN the patch fields are merged into the returned state
- AND `version`, `jobId`, `createdAt`, `status`, `history` cannot be overridden via patch (type-level constraint)

### Requirement: Guard functions

The lifecycle module SHALL provide guard functions for transition and terminal status checks.

#### Scenario: canTransition
- WHEN `canTransition(from, to)` is called
- THEN it returns `true` if the transition is in `VALID_TRANSITIONS` or `from === to`
- AND it returns `false` otherwise

#### Scenario: isTerminal
- WHEN `isTerminal(status)` is called
- THEN it returns `true` for `archived` and `canceled`
- AND it returns `false` for all other statuses

## MODIFIED Requirements

### Requirement: Finish idempotency check

The finish command SHALL use TERMINAL_STATUSES from lifecycle.ts instead of a dedicated idempotency module.

#### Scenario: already finished job
- WHEN `specrunner finish` is called on a job with terminal status
- THEN the command outputs "Already finished" and exits with code 0
- AND the check uses `TERMINAL_STATUSES.has(state.status)` from `lifecycle.ts`
- AND `idempotency.ts` does not exist

### Requirement: ps active filter source

The ps command SHALL import ACTIVE_STATUSES from lifecycle.ts instead of defining it locally.

#### Scenario: ps active filter
- WHEN `specrunner ps --active` is called
- THEN it filters jobs using `ACTIVE_STATUSES` imported from `lifecycle.ts`
- AND no local `ACTIVE_STATUSES` definition exists in `ps.ts`
