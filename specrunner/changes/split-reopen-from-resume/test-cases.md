# Test Cases: split-reopen-from-resume

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 26
- **Manual**: 2
- **Priority**: must: 25, should: 5, could: 0

---

## Lifecycle Transition: reopen transitions to awaiting-resume

### TC-001: Successful reopen on OPEN-PR awaiting-archive job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL transition awaiting-archive to awaiting-resume without pipeline execution > Scenario: successful reopen on OPEN-PR awaiting-archive job

---

### TC-002: Reopen does not start the pipeline even when a start step is implied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL transition awaiting-archive to awaiting-resume without pipeline execution > Scenario: reopen does not start the pipeline even when a start step is implied

---

## Lifecycle Transition: reopen rejection guards

### TC-003: Reopen rejected for archived job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL be refused for non-awaiting-archive or non-OPEN-PR jobs > Scenario: reopen rejected for archived job

---

### TC-004: Reopen rejected for canceled job

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL be refused for non-awaiting-archive or non-OPEN-PR jobs > Scenario: reopen rejected for canceled job

---

### TC-005: Reopen rejected for merged PR

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL be refused for non-awaiting-archive or non-OPEN-PR jobs > Scenario: reopen rejected for merged PR

---

### TC-006: Reopen rejected for closed (non-merged) PR

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL be refused for non-awaiting-archive or non-OPEN-PR jobs > Scenario: reopen rejected for closed (non-merged) PR

---

### TC-007: Reopen fails closed when PR state is unavailable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL be refused for non-awaiting-archive or non-OPEN-PR jobs > Scenario: reopen fails closed when PR state is unavailable

---

## Evidence Preservation

### TC-008: Evidence fields are preserved after reopen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL preserve all prior evidence > Scenario: evidence fields are preserved after reopen

---

### TC-009: Run-control fields are reset by reopen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL preserve all prior evidence > Scenario: run-control fields are reset by reopen

---

## Operator Event Durability

### TC-010: Operator event is durably recorded before state transition

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen operator event SHALL be persisted before the state transition > Scenario: operator event is durably recorded

---

### TC-011: Operator event does not include fromStep

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen operator event SHALL be persisted before the state transition > Scenario: operator event does not include fromStep

---

## CLI Argument Contracts

### TC-012: --from is rejected on reopen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen SHALL NOT accept `--from` > Scenario: --from is rejected on reopen

---

## Resume as Sole Execution Entry Point

### TC-013: Resume executes the pipeline after reopen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume SHALL be the execution entry point after reopen > Scenario: resume executes the pipeline after reopen

---

### TC-014: Resume --adopt-commits applies after reopen with uncommitted changes

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: resume SHALL be the execution entry point after reopen > Scenario: resume --adopt-commits applies after reopen with uncommitted changes

---

### TC-015: Resume directly on awaiting-archive is still refused

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: resume SHALL be the execution entry point after reopen > Scenario: resume directly on awaiting-archive is still refused

---

## FSM / REOPEN_TRANSITIONS Invariants

### TC-016: B-17 architecture invariant preserved after change

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen transition SHALL use the REOPEN_TRANSITIONS opt-in > Scenario: B-17 invariant preserved

---

### TC-017: General guard still forbids awaiting-archive to awaiting-resume without opt-in

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen transition SHALL use the REOPEN_TRANSITIONS opt-in > Scenario: general guard still forbids awaiting-archive → awaiting-resume

---

### TC-018: General guard still forbids awaiting-archive to running

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reopen transition SHALL use the REOPEN_TRANSITIONS opt-in > Scenario: general guard still forbids awaiting-archive → running

---

## Actions Workflow Composition

### TC-019: Actions reopen dispatches two CLI commands in sequence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Actions workflow SHALL compose reopen and resume explicitly > Scenario: Actions reopen dispatches two CLI commands

---

## Architecture: ReopenCommand Decoupling (D1)

### TC-020: ReopenCommand has no CommandRunner inheritance

**Category**: unit
**Priority**: must
**Source**: design.md D1

**GIVEN** the updated `src/core/command/reopen.ts` after D1 is applied
**WHEN** the class declaration of `ReopenCommand` is inspected
**THEN** `ReopenCommand` does not extend `CommandRunner`
**AND** no `prepare()` method exists on `ReopenCommand`
**AND** no imports of `CommandRunner` or `PrepareResult` remain in `reopen.ts`

---

### TC-021: ReopenCommand constructor takes only slug and options

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** the new `ReopenCommand` class with standalone constructor
**WHEN** a `ReopenCommand` is instantiated with `(slug, options)`
**THEN** the constructor accepts exactly `slug: string` and `options: ReopenOptions`
**AND** no `runtime` (RuntimeStrategy) or `events` (EventBus) parameters are accepted

---

## OperatorEventRecord Schema Change (D4)

### TC-022: OperatorEventRecord.fromStep is an optional field

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** the updated `OperatorEventRecord` interface in `src/store/event-journal.ts`
**WHEN** an `OperatorEventRecord` is constructed without a `fromStep` value
**THEN** TypeScript accepts the record as valid with no type error
**AND** the serialized JSON line does not include a `fromStep` key

---

### TC-023: Existing events.jsonl records with fromStep deserialize correctly

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** a pre-existing `events.jsonl` record that includes `fromStep: "spec-review"`
**WHEN** the record is read via `fold()`
**THEN** the `fromStep` field is accessible and equals `"spec-review"`
**AND** no parse error or data loss occurs

---

## Documentation: Guide and Conformance (T-05)

### TC-024: Guide escalation section describes two-step reopen → resume flow

**Category**: manual
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** the updated `src/core/command/guide.ts` escalation topic
**WHEN** `specrunner guide escalation` is executed
**THEN** the output contains a step showing `job reopen <slug> --reason` as a lifecycle-only step
**AND** the output contains a subsequent step showing `job resume <slug> --from <step>` as the execution step
**AND** the output does NOT list `--from` as an option for `job reopen`

---

### TC-025: REOPEN_USAGE no longer mentions --from

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** the updated `src/cli/command-registry.ts` `REOPEN_USAGE` constant
**WHEN** the usage text is inspected
**THEN** `--from` does not appear anywhere in `REOPEN_USAGE`
**AND** a note directing operators to use `resume --from` is present in the usage text

---

## Worktree Guard

### TC-029: Reopen inside specrunner worktree returns exit code 2

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `detectSpecrunnerWorktree` returns `{ isSpecrunnerWorktree: true }` for the current working directory
**WHEN** `ReopenCommand.execute()` is called
**THEN** the command returns exit code `2`
**AND** no state transition is attempted
**AND** no `appendOperatorEvent` call is made

---

## Missing PR Number Guard

### TC-030: Reopen rejected when job has no associated PR number

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** a job with `status: "awaiting-archive"` whose `state.pullRequest` is absent or has no `number`
**WHEN** `ReopenCommand.execute()` is called
**THEN** the command returns exit code `1`
**AND** no state transition is persisted
**AND** an error is logged indicating the missing PR

---

## Architecture: conformance.md B-17 row (T-05)

### TC-028: conformance.md B-17 row accurately states guarded transition

**Category**: manual
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** the updated `architecture/conformance.md`
**WHEN** the B-17 row is inspected
**THEN** the description includes a parenthetical noting the guarded transition is `awaiting-archive → awaiting-resume`
**AND** the enforcement mechanism (grep for `allowReopen: true`) is unchanged

---

## Gate: Typecheck and Test Suite Green

### TC-026: typecheck passes with zero errors

**Category**: gate
**Priority**: must
**Source**: tasks.md T-07

Verification phase: `bun run typecheck` — must exit `0` with zero type errors across all modified files.

---

### TC-027: Full test suite passes with zero failures

**Category**: gate
**Priority**: must
**Source**: tasks.md T-07

Verification phase: `bun run test` — must exit `0`. Specifically confirms:
- `lifecycle-reopen.test.ts` TC-016 passes with `status: "awaiting-resume"`
- `core-invariants.test.ts` B-17 liveness check passes (`reopen.ts` still contains `{ allowReopen: true }`)
- `reopen-command.test.ts` TC-001 returns `0` and transitions to `"awaiting-resume"`
- `reopen-command.test.ts` TC-003 (ResumeCommand rejects `awaiting-archive`) still passes

---

## Result

```yaml
result: completed
total: 30
automated: 26
manual: 2
must: 25
should: 5
could: 0
blocked_reasons: []
```
