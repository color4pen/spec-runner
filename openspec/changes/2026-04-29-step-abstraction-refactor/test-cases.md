# Test Cases: step-abstraction-refactor

## Summary

- **Total**: 55 cases
- **Automated** (unit/integration/e2e): 48
- **Manual**: 7
- **Priority**: must: 33, should: 17, could: 5

---

## Test Cases

### TC-001: Legacy pre-PR24 single StepResult normalizes to StepRun array on load

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: Pre-PR #24 single-result format is normalized on load

**GIVEN** a state file where `state.steps["propose"]` is a single object (not an array) with fields `{ sessionId: "s1", verdict: "approved", completedAt: "2026-01-01T00:00:00Z" }`
**WHEN** `JobStateStore.load()` is invoked
**THEN** the in-memory state has `state.steps["propose"]` equal to an array of length 1
**AND** the single element has `attempt: 1`, `sessionId: "s1"`, `outcome.verdict: "approved"`, and non-null `startedAt` / `endedAt`

---

### TC-002: Legacy post-PR24 StepResult array normalizes to StepRun array on load

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: Post-PR #24 array format is normalized on load

**GIVEN** a state file where `state.steps["spec-review"]` is an array of two `StepResult` objects with `session: { id: "s1" }` and `session: { id: "s2" }`, each having `completedAt` timestamps
**WHEN** `JobStateStore.load()` is invoked
**THEN** `state.steps["spec-review"]` is an array of length 2
**AND** the first element has `attempt: 1` and `sessionId: "s1"`
**AND** the second element has `attempt: 2` and `sessionId: "s2"`
**AND** each element's `endedAt` is set to its corresponding `completedAt`
**AND** each element's `startedAt` is set to `state.updatedAt` as a best-effort fallback

---

### TC-003: Fixture round-trip — pre-PR24 legacy JSON load → normalize → save diff is 0

**Category**: integration
**Priority**: must
**Source**: design.md — D8 Behavior invariance, State file backward compat; tasks.md — 7.1

**GIVEN** the fixed fixture file `tests/fixtures/legacy-job-state-pre-pr24.json` containing a pre-PR24 schema
**WHEN** `JobStateStore.load()` reads the fixture, then `JobStateStore.persist()` saves it to a temp path
**THEN** the saved JSON structure matches the expected `StepRun[]` shape exactly (diff = 0 against the expected canonical JSON)
**AND** no legacy fields (`iteration`, `session` object, `completedAt` at step level) appear in the saved file

---

### TC-004: Fixture round-trip — post-PR24 legacy JSON load → normalize → save diff is 0

**Category**: integration
**Priority**: must
**Source**: design.md — D8 Behavior invariance; tasks.md — 7.1

**GIVEN** the fixed fixture file `tests/fixtures/legacy-job-state-post-pr24.json` containing a post-PR24 StepResult[] schema
**WHEN** `JobStateStore.load()` reads the fixture, then `JobStateStore.persist()` saves it
**THEN** the saved JSON uses the `StepRun[]` shape with all required fields present
**AND** `endedAt` is derived from `StepResult.completedAt`
**AND** no legacy field names appear in the output

---

### TC-005: appendStepRun appends to existing array, auto-incrementing attempt

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: Multiple attempts append rather than overwrite; tasks.md — 2.8

**GIVEN** a job state where `state.steps["spec-review"]` already contains one `StepRun` with `attempt: 1`
**WHEN** `JobStateStore.appendStepRun(state, "spec-review", newRun)` is called
**THEN** `state.steps["spec-review"]` has length 2
**AND** the new element is the last element (chronological order)
**AND** the new element's `attempt` is 2

---

### TC-006: appendStepRun persists atomically

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: appendStepRun is atomic with respect to readers

**WHEN** `JobStateStore.appendStepRun` is called
**THEN** the on-disk file is written via write-and-rename (atomic replace)
**AND** the file path is either fully updated or unchanged — no partial write is observable

---

### TC-007: StepRun captures startedAt and endedAt timestamps

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: StepRun captures lifecycle timestamps

**WHEN** a step completes successfully and `appendStepRun` is called
**THEN** the persisted `StepRun` has both `startedAt` and `endedAt` as ISO 8601 strings
**AND** `endedAt >= startedAt`

---

### TC-008: Subsequent persist after legacy load writes new format only

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: Subsequent persist writes new format only

**GIVEN** a legacy state was loaded and normalized by `JobStateStore.load()`
**WHEN** `JobStateStore.persist()` is called
**THEN** the on-disk JSON contains `StepRun[]` shaped elements
**AND** the fields `iteration`, `session` (object form), and top-level `completedAt` are NOT present in the output

---

### TC-009: Step implementation is stateless across invocations

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: Step implementation is stateless

**GIVEN** a `Step` instance (e.g., `ProposeStep`, `SpecReviewStep`, or `SpecFixerStep`)
**WHEN** `buildMessage`, `resultFilePath`, and `parseResult` are called twice with identical inputs
**THEN** both calls produce identical outputs
**AND** the `Step` instance holds no state that accumulates between calls

---

### TC-010: Step exposes agent definition without consulting global registry

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: Step exposes its agent definition

**WHEN** `StepExecutor` needs the agent definition for a step
**THEN** it reads `step.agent` directly from the `Step` object
**AND** no import from or call to any global registry exists in the `StepExecutor` code path

---

### TC-011: register_branch handler owned exclusively by ProposeStep

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: register_branch handler is owned by ProposeStep

**WHEN** the propose step needs to invoke `register_branch`
**THEN** `ProposeStep.toolHandlers.get("register_branch")` returns the handler function
**AND** `SpecReviewStep.toolHandlers` does not contain `"register_branch"`
**AND** `SpecFixerStep.toolHandlers` does not contain `"register_branch"`

---

### TC-012: register_branch input_schema is unchanged after refactor

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: input_schema for register_branch is unchanged; tasks.md — 7.4

**WHEN** `ProposeStep.agent` exposes the `register_branch` Custom Tool definition
**THEN** the `input_schema` JSON is byte-for-byte identical to the pre-refactor definition
**AND** the tool name string `"register_branch"` is unchanged

---

### TC-013: StepExecutor lifecycle events fire in correct order on success

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: Lifecycle events fire in order

**GIVEN** a step that completes successfully
**WHEN** `StepExecutor.execute(step, state)` runs to completion
**THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
**AND** `step:error` is NOT emitted

---

### TC-014: StepExecutor error path emits step:error and decorates exception

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: Error path emits step:error and decorates exception

**WHEN** an exception is raised during `StepExecutor.execute`
**THEN** `step:error` is emitted with the error payload
**AND** the thrown exception has an `err.state` field attached
**AND** `failJobState` + `appendHistory` semantics are preserved (state written with error info)

---

### TC-015: Pipeline transition table drives spec-review → spec-fixer cycle correctly

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: Standard pipeline transitions are expressed as table rows

**GIVEN** a `Pipeline` constructed with the standard transition table
**WHEN** `Pipeline.run` is invoked and `spec-review` returns `needs-fix` once then `approved`
**THEN** the steps execute in order: propose → spec-review (needs-fix) → spec-fixer → spec-review (approved) → end
**AND** the transition table is the sole routing mechanism (no inline if-chains)

---

### TC-016: Pipeline terminates with SPEC_REVIEW_RETRIES_EXHAUSTED at maxIterations

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: spec-review ↔ spec-fixer cycle terminates at maxIterations

**GIVEN** `maxIterations = 3` and `spec-review` returns `needs-fix` for 3 consecutive iterations
**WHEN** the loop guard fires on the 3rd iteration
**THEN** `Pipeline.run` raises an error with code `SPEC_REVIEW_RETRIES_EXHAUSTED`
**AND** `state.error` is set to `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }`
**AND** `state.steps["spec-review"]` last element's verdict is rewritten to `escalation`

---

### TC-017: Pipeline emits pipeline:start and pipeline:complete on successful run

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: Successful run emits start and complete

**GIVEN** a pipeline that ends in `spec-review --approved→ end`
**WHEN** `Pipeline.run` completes
**THEN** `pipeline:start` is emitted exactly once at the start
**AND** `pipeline:complete` is emitted exactly once at the end
**AND** `pipeline:fail` is NOT emitted

---

### TC-018: Pipeline emits pipeline:fail on escalation or loop-guard exhaustion

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: Escalation emits pipeline:fail

**WHEN** `Pipeline.run` terminates due to escalation verdict or maxIterations exhaustion
**THEN** `pipeline:fail` is emitted with the failure reason in the payload
**AND** `pipeline:complete` is NOT emitted

---

### TC-019: EventBus subscribe and emit with typed payload

**Category**: unit
**Priority**: must
**Source**: design.md — D6 EventBus minimal class; tasks.md — 5.6

**GIVEN** an `EventBus` instance with no subscribers
**WHEN** a handler is registered via `eventBus.on("step:start", handler)` and then `eventBus.emit("step:start", payload)` is called
**THEN** the handler is invoked exactly once with the correct payload
**AND** the emit is synchronous (handler completes before emit returns)

---

### TC-020: EventBus multiple subscribers all receive the same event

**Category**: unit
**Priority**: must
**Source**: design.md — D6 EventBus minimal class

**GIVEN** two handlers registered for the same `DomainEvent`
**WHEN** `eventBus.emit` is called with that event
**THEN** both handlers are called exactly once with the same payload
**AND** the order of invocation follows registration order

---

### TC-021: EventBus emit with no subscribers does not throw

**Category**: unit
**Priority**: must
**Source**: design.md — D6 EventBus minimal class

**GIVEN** an `EventBus` with no subscribers registered for `"step:complete"`
**WHEN** `eventBus.emit("step:complete", payload)` is called
**THEN** no error is thrown
**AND** the call completes normally

---

### TC-022: Error code SESSION_TIMEOUT is preserved under same trigger conditions

**Category**: unit
**Priority**: must
**Source**: design.md — D8 error code preservation; proposal.md — Behavior Invariance (CRITICAL); tasks.md — 7.3

**GIVEN** a session that exceeds the timeout limit during polling
**WHEN** the error is surfaced through the CLI pipeline
**THEN** the error code string is exactly `"SESSION_TIMEOUT"`
**AND** the error object shape matches the pre-refactor format verbatim

---

### TC-023: Error code SESSION_TERMINATED is preserved under same trigger conditions

**Category**: unit
**Priority**: must
**Source**: proposal.md — Behavior Invariance; tasks.md — 7.3

**GIVEN** a session that is terminated unexpectedly during execution
**WHEN** the error surfaces through the CLI
**THEN** the error code string is exactly `"SESSION_TERMINATED"`

---

### TC-024: Error code BRANCH_NOT_REGISTERED is preserved under same trigger conditions

**Category**: unit
**Priority**: must
**Source**: proposal.md — Behavior Invariance; tasks.md — 7.3

**GIVEN** the propose step completes and the branch is not registered (register_branch not called)
**WHEN** the error surfaces through the CLI
**THEN** the error code string is exactly `"BRANCH_NOT_REGISTERED"`

---

### TC-025: Error code CONFIG_INCOMPLETE is preserved under same trigger conditions

**Category**: unit
**Priority**: must
**Source**: proposal.md — Behavior Invariance; tasks.md — 7.3

**GIVEN** required config fields are missing at CLI startup
**WHEN** the error surfaces through the CLI
**THEN** the error code string is exactly `"CONFIG_INCOMPLETE"`

---

### TC-026: All 5 named error codes collectively preserved

**Category**: integration
**Priority**: must
**Source**: job-state-store/spec.md — Scenario: Error codes preserved across schema migration; tasks.md — 7.3

**GIVEN** each of the five trigger conditions: session timeout, branch not registered, spec-review retries exhausted, config incomplete, session terminated
**WHEN** each is triggered in a controlled test environment
**THEN** the emitted error code is exactly one of: `SESSION_TIMEOUT`, `SESSION_TERMINATED`, `BRANCH_NOT_REGISTERED`, `SPEC_REVIEW_RETRIES_EXHAUSTED`, `CONFIG_INCOMPLETE`
**AND** none of these codes has changed from its pre-refactor string value

---

### TC-027: CLI stdout [iter N/M] format — approved verdict matches bit-for-bit

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: Iteration progress format — approved; tasks.md — 7.2

**WHEN** `Pipeline.run` completes an iteration and the step returns `approved`
**THEN** stdout contains exactly `[iter 1/<max>] <loopName> verdict: approved → done`
**AND** no additional whitespace or character differs from the specified format

---

### TC-028: CLI stdout [iter N/M] format — needs-fix continuation matches bit-for-bit

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: Iteration progress format — needs-fix continuation; tasks.md — 7.2

**GIVEN** `maxIterations = 2`
**WHEN** iter=1 step returns `needs-fix` and iter < maxIterations
**THEN** stdout contains exactly `[iter 1/2] <loopName> verdict: needs-fix → spawning fixer`

---

### TC-029: CLI stdout [iter N/M] format — retries exhausted matches bit-for-bit

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: Iteration progress format — exhausted; tasks.md — 7.2

**GIVEN** `maxIterations = 2`
**WHEN** iter=2 step returns `needs-fix` and the loop guard fires
**THEN** stdout contains exactly `[iter 2/2] retries exhausted, escalating`

---

### TC-030: All 161 previously-passing tests remain green

**Category**: integration
**Priority**: must
**Source**: proposal.md — Behavior Invariance (CRITICAL); design.md — D8; tasks.md — 7.5

**GIVEN** the test suite state before this refactor with 161 passing tests
**WHEN** `bun test` is run after the refactor
**THEN** all 161 previously-passing tests still pass
**AND** the `tests/cli.test.ts` failure count is not worsened (still 1 fail + 1 error from pre-existing vitest incompatibility)

---

### TC-031: Unknown transition verdict triggers escalation

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario: Unknown transition triggers escalation

**GIVEN** a step produces a verdict that has no matching row in the `Transition[]` table
**WHEN** `Pipeline.run` evaluates routing for that verdict
**THEN** the run terminates as `escalate`
**AND** `pipeline:fail` is emitted with a diagnostic payload identifying the unmatched transition

---

### TC-032: File layout — new directories exist, old plural steps/ does not

**Category**: manual
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario: File layout; tasks.md — 8.2

**GIVEN** the refactor is applied
**WHEN** the `src/` directory tree is inspected
**THEN** `src/core/step/propose.ts`, `src/core/step/spec-review.ts`, `src/core/step/spec-fixer.ts` exist
**AND** `src/core/pipeline/pipeline.ts` exists
**AND** `src/core/steps/` directory does NOT exist

---

### TC-033: Module boundary — grep finds 0 SDK imports in src/core/

**Category**: integration
**Priority**: must
**Source**: module-boundary/spec.md — Scenario: grep finds no SDK imports in core; tasks.md — 3.10, 7.7

**WHEN** `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/` is executed
**THEN** the command returns 0 matching lines
**AND** exit code is 1 (grep convention for no matches)

---

### TC-034: Module boundary — grep finds 0 adapter imports in src/core/ and src/store/

**Category**: integration
**Priority**: must
**Source**: module-boundary/spec.md — Scenario: core does not import from adapter

**WHEN** `grep -rE "from .*adapter/" src/core/ src/store/` is executed
**THEN** the command returns 0 matching lines

---

### TC-035: Module boundary — grep finds 0 core pipeline/step/agent/event imports in src/adapter/

**Category**: integration
**Priority**: must
**Source**: module-boundary/spec.md — Dependency Direction Rules; pipeline-context.md — module boundary tests

**WHEN** `grep -rE "from .*(core/(pipeline|step|agent|event))" src/adapter/` is executed
**THEN** the command returns 0 matching lines

---

### TC-036: registry.ts no longer exists and is not imported

**Category**: manual
**Priority**: should
**Source**: module-boundary/spec.md — Scenario: registry.ts no longer exists; tasks.md — 3.8

**GIVEN** the refactor is applied
**WHEN** the source tree is inspected
**THEN** the file `src/core/tools/registry.ts` does NOT exist
**AND** `grep -r "tools/registry" src/` returns 0 matching lines

---

### TC-037: Required module directories all exist with at least one TypeScript file

**Category**: manual
**Priority**: should
**Source**: module-boundary/spec.md — Scenario: Required module directories exist

**GIVEN** the refactor is applied
**WHEN** the directory tree under `src/` is inspected
**THEN** each of the following directories exists and contains at least one `.ts` file: `src/core/pipeline/`, `src/core/step/`, `src/core/agent/`, `src/core/event/`, `src/core/port/`, `src/adapter/anthropic/`, `src/adapter/github/`, `src/store/`, `src/cli/`

---

### TC-038: Three existing step files are reduced to ~1/3 LOC

**Category**: manual
**Priority**: should
**Source**: step-execution-architecture/spec.md — Scenario: Three existing steps reduce to declarative form; tasks.md — 3.7

**GIVEN** the pre-refactor LOC counts: propose.ts ~386, spec-review.ts ~310, spec-fixer.ts ~185
**WHEN** the migrated step files are inspected
**THEN** each migrated step file is approximately 1/3 of its prior LOC
**AND** the 45–55 LOC duplicate block (session create / try-catch / failJobState / appendHistory / err.state attach) is absent from each step file

---

### TC-039: Composition root wires concrete implementations without core referencing adapter

**Category**: integration
**Priority**: should
**Source**: module-boundary/spec.md — Scenario: composition root wires concrete implementations; tasks.md — 6.1

**GIVEN** the CLI entry point (`src/cli/`)
**WHEN** the code is inspected
**THEN** `src/cli/` constructs concrete `SessionClient`, `JobStateStore`, `EventBus`, `Pipeline`, and `StepExecutor` instances and injects them
**AND** no `src/core/` source file imports a concrete adapter class by name

---

### TC-040: StepExecutor constructor injection allows mock substitution in unit tests

**Category**: unit
**Priority**: should
**Source**: design.md — D3 StepExecutor class with EventBus injection

**GIVEN** a unit test that constructs a `StepExecutor` with mock `SessionClient`, `JobStateStore`, and `EventBus`
**WHEN** `execute(step, state)` is called with a controlled mock `SessionClient`
**THEN** the mock `SessionClient` receives the expected calls
**AND** no real HTTP calls to the Anthropic API are made

---

### TC-041: Pipeline correctly handles propose --approved→ spec-review first transition

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario: Standard pipeline transitions are expressed as table rows

**GIVEN** the standard transition table
**WHEN** the `propose` step returns `approved`
**THEN** `Pipeline.run` transitions to the `spec-review` step next
**AND** not to any other step

---

### TC-042: Pipeline spec-review --escalation→ escalate terminates without spawning fixer

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario: Standard pipeline transitions

**WHEN** `spec-review` returns `escalation`
**THEN** `Pipeline.run` terminates as `escalate` without invoking `spec-fixer`
**AND** `pipeline:fail` is emitted

---

### TC-043: EventBus handlers for different events are isolated

**Category**: unit
**Priority**: should
**Source**: design.md — D6 EventBus minimal class

**GIVEN** handler A is registered for `"step:start"` and handler B for `"step:complete"`
**WHEN** `eventBus.emit("step:start", payload)` is called
**THEN** handler A is invoked
**AND** handler B is NOT invoked

---

### TC-044: Payload type safety — emit and on are typed to DomainEvent union

**Category**: unit
**Priority**: should
**Source**: design.md — D6 EventBus minimal class — `type Payload<E extends DomainEvent>` mapped type

**GIVEN** a `DomainEvent` type union and `Payload<E>` mapped type
**WHEN** `eventBus.on` and `eventBus.emit` are called with a valid DomainEvent key
**THEN** TypeScript compile-time type inference resolves the payload type correctly
**AND** passing a wrong payload type produces a compile error

---

### TC-045: JobStateStore is the sole persistence authority — no direct file I/O outside it

**Category**: integration
**Priority**: should
**Source**: job-state-store/spec.md — Requirement: JobStateStore is the Sole Persistence Authority

**WHEN** all source files under `src/` are scanned for direct `fs` writes to the job state path
**THEN** no source file outside `src/store/job-state-store.ts` calls write/rename operations on the job state file
**AND** all persistence goes through `JobStateStore.persist()` or `appendStepRun()`

---

### TC-046: TypeScript build passes with no errors after refactor

**Category**: manual
**Priority**: should
**Source**: tasks.md — 7.6

**GIVEN** the complete refactored source tree
**WHEN** `tsc -p tsconfig.json` is executed
**THEN** the build completes with 0 errors
**AND** 0 type errors are reported

---

### TC-047: StepExecutor lifecycle — verdict:parsed is emitted before appendStepRun

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md — StepExecutor lifecycle steps 7 and 8

**GIVEN** a subscribing observer tracking event emission order
**WHEN** `StepExecutor.execute` runs successfully
**THEN** `verdict:parsed` is emitted before `JobStateStore.appendStepRun` is called
**AND** `step:complete` is emitted after `appendStepRun` returns

---

### TC-048: SDK imports are concentrated exclusively in src/adapter/anthropic/

**Category**: integration
**Priority**: should
**Source**: module-boundary/spec.md — Scenario: SDK imports concentrated in adapter/anthropic

**WHEN** the entire `src/` tree (excluding `node_modules` and test files exercising SDK directly) is scanned for `@anthropic-ai/sdk` imports
**THEN** all matches reside under `src/adapter/anthropic/`
**AND** no other directory contains such imports

---

### TC-049: Pipeline history entry shape is preserved — { ts, step, status, message }

**Category**: unit
**Priority**: should
**Source**: pipeline-loop-primitive/spec.md — Requirement: state.history Loop Entry Append (REMOVED, migrated behavior)

**WHEN** a step completes and `Pipeline.run` appends a history entry
**THEN** the appended entry has the shape `{ ts: ISO8601, step: string, status: "started" | "ok" | "warning" | "error", message: string }`
**AND** this shape is identical to the pre-refactor `state.history` append behavior

---

### TC-050: Pipeline iteration start stdout line is emitted

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Iteration start format: `[iter <N>] <loopName> starting`

**WHEN** `Pipeline.run` starts iteration N
**THEN** stdout contains exactly `[iter <N>] <loopName> starting`

---

### TC-051: EventBus subscriber unregistration does not cause errors on subsequent emit

**Category**: unit
**Priority**: could
**Source**: design.md — D6 EventBus minimal class (implied robustness)

**GIVEN** a handler is registered and then removed (if unregister is supported)
**WHEN** `eventBus.emit` is called for that event
**THEN** no error is thrown
**AND** the removed handler is NOT invoked

---

### TC-052: StepExecutor produces correct StepRun attempt number for second execution

**Category**: unit
**Priority**: could
**Source**: job-state-store/spec.md — Scenario: Multiple attempts append rather than overwrite; design.md — D3

**GIVEN** a job state where `spec-review` has already been run once (`attempt: 1`)
**WHEN** `StepExecutor.execute` runs `spec-review` a second time and `appendStepRun` is called
**THEN** the new `StepRun` has `attempt: 2`
**AND** the total array length for `spec-review` is 2

---

### TC-053: runLoopUntil / loop.ts no longer exists after cleanup

**Category**: manual
**Priority**: could
**Source**: tasks.md — 8.1a; pipeline-loop-primitive/spec.md — Requirement: runLoopUntil Generic Loop Primitive (REMOVED)

**GIVEN** the refactor is applied and cleanup is complete
**WHEN** the source tree is inspected
**THEN** `src/core/loop.ts` does NOT exist
**AND** no source file imports from it

---

### TC-054: src/state/store.ts is deprecated / delegated — no longer performs direct file I/O

**Category**: manual
**Priority**: could
**Source**: tasks.md — 8.3; design.md — D1 Backward compat strategy

**GIVEN** the refactor is applied
**WHEN** `src/state/store.ts` is inspected
**THEN** its exported functions delegate to `JobStateStore` methods internally
**AND** no direct `fs.write` calls exist in that file

---

### TC-055: EventBus with all 7 DomainEvent types can be subscribed and emitted

**Category**: unit
**Priority**: could
**Source**: design.md — D6; tasks.md — 5.1

**GIVEN** the 7 `DomainEvent` strings: `pipeline:start`, `pipeline:complete`, `pipeline:fail`, `step:start`, `step:complete`, `step:error`, `verdict:parsed`
**WHEN** a handler is registered and triggered for each event type
**THEN** all 7 handlers are invoked without error
**AND** the typed `Payload<E>` maps correctly for each event
