# Design: split-reopen-from-resume

## Context

### Current state

`ReopenCommand` (`src/core/command/reopen.ts`) extends `CommandRunner` — the
abstract base class for pipeline execution.  Its `prepare()` method performs
the full operator validation sequence (worktree guard → job resolution →
status gate → PR gate → step resolution → operator event → state transition)
and then returns a `PrepareResult` that `CommandRunner.execute()` uses to set
up a workspace, build deps, and start the pipeline.

The state transition is `awaiting-archive → running` via `REOPEN_TRANSITIONS`
with the `{ allowReopen: true }` opt-in (D2 of the original ADR,
`2026-07-22-job-reopen-awaiting-archive.md`).

`ResumeCommand` is the established pipeline execution entry point.  It holds
all pre-flight safety inputs (`--prompt`, `--adopt-commits`, `--apply-canon`,
`--wontfix`) and the worktree inspection logic (dirty-canon gate, adopt-commits
gate, worktree reconciliation).  `ReopenCommand` has none of these — its
`prepare()` returns `resumePrompt: undefined` and skips all ingress safety
checks.

The net effect: when a user does `job reopen <slug> --from <step> --reason
"…"`, the pipeline launches immediately from the given step with no ability to
pass a prompt, adopt commits, or apply canon changes.  All post-review human
edits must reach the pipeline through informal means.

### Verified code assertions (from request-review)

| Location | Assertion |
|---|---|
| `src/core/command/reopen.ts:69` | `ReopenCommand extends CommandRunner` |
| `src/core/command/reopen.ts:39-52` | `ReopenOptions` has no prompt/adoptCommits/applyCanon/wontfix |
| `src/core/command/reopen.ts:328` | `prepare()` returns `resumePrompt: undefined` |
| `src/core/command/resume.ts:41-57` | `ResumeOptions` has prompt/adoptCommits/applyCanon/wontfix |
| `src/state/lifecycle.ts:54-56` | `REOPEN_TRANSITIONS` maps `awaiting-archive → { running }` |
| `.github/workflows/specrunner-dispatch.yml:241` | `action=reopen` calls only `job reopen`, no subsequent `job resume` |
| `tests/unit/architecture/core-invariants.test.ts:1187-1266` | B-17 pins `{ allowReopen: true }` to `reopen.ts` |

### Constraints from related ADRs

- **`2026-07-22-job-reopen-awaiting-archive.md`** (original reopen ADR):
  establishes the `REOPEN_TRANSITIONS` table, the `{ allowReopen: true }` opt-in,
  and B-17.  This design amends its D1 / D2.
- **`2026-07-21-approval-revision-binding.md`**: commitOid-based approval
  invalidation is unchanged — reopen still does not rewrite `reviewerStatuses`
  or conformance records.
- **#1083 (archive 1-phase)**: `archived` is now a single-step terminal state;
  the `awaiting-archive` reopen window is confirmed as pre-archive only.

---

## Goals / Non-Goals

**Goals**:

1. `job reopen` performs only the lifecycle transition
   (`awaiting-archive → awaiting-resume`) and exits without starting the
   pipeline.
2. `job resume` becomes the sole pipeline execution entry point for all
   `awaiting-archive` jobs, providing `--from`, `--prompt`, `--adopt-commits`,
   `--apply-canon`, `--wontfix`, and all existing ingress safety gates.
3. `ReopenCommand` is decoupled from `CommandRunner` so no pipeline execution
   can occur — not even as a latent code path.
4. The Actions `action=reopen` workflow composes `reopen` + `resume`
   explicitly in sequence.
5. `OperatorEventRecord.fromStep` becomes optional to maintain backward
   compatibility with existing journal records while allowing new events to
   omit it.
6. All tests remain green; B-17 architecture invariant is preserved and
   its description updated.

**Non-Goals**:

- Merged PR reopen (out of scope per request).
- New fixup step or reviewer step additions.
- Prompt findings structuralization.
- Resume's existing retry policy changes.
- Any change to `canTransition` semantics (the general FSM guard is unchanged).

---

## Decisions

### D1: Decouple ReopenCommand from CommandRunner — standalone class

**Decision**: `ReopenCommand` is rewritten as a standalone class (no
`extends CommandRunner`).  It exposes a single `async execute(): Promise<number>`
method that performs: worktree guard → job resolution → status gate → PR gate
→ append operator event → transition `awaiting-archive → awaiting-resume` →
persist → log success → return `0`.  No workspace setup, no keepAlive, no
pipeline.

The constructor signature changes from
`(runtime, events, slug, options)` to `(slug, options)` — `RuntimeStrategy`
and `EventBus` are no longer dependencies.

**Rationale**: `CommandRunner` is a pipeline execution Template Method.
Keeping `ReopenCommand` as a subclass, even with an overridden `execute()`,
leaves the code structurally ambiguous — future developers may assume `prepare()`
is always followed by pipeline execution.  Removing the inheritance makes the
boundary mechanical: there is no code path in `ReopenCommand` that can trigger
a pipeline.

**Alternatives considered**:

- *Keep inheritance, override execute() to return early before setupWorkspace*:
  Rejected.  `CommandRunner.execute()` has non-trivial preamble (provider
  readiness gate, foreground notice, exit guard registration) that would still
  run.  The override is fragile — a future change to the preamble could
  accidentally re-enable side effects.  Also leaves dead code in `prepare()`.

- *Keep inheritance, have prepare() throw immediately*:
  Rejected.  Abuses the Template Method pattern; all of `prepare()`'s workspace
  / step / request / config resolution logic would be dead code; tests would
  be testing a stub.

### D2: REOPEN_TRANSITIONS target changes from `running` to `awaiting-resume`

**Decision**: In `src/state/lifecycle.ts`, change
`REOPEN_TRANSITIONS["awaiting-archive"]` from `{ running }` to
`{ awaiting-resume }`.  The `{ allowReopen: true }` opt-in on `transitionJob`
is retained — B-17 still applies.  `VALID_TRANSITIONS` and `canTransition` are
unchanged.

After reopen, the job is in `awaiting-resume`.  `ResumeCommand.prepare()`
already accepts `awaiting-resume → running` via the existing
`VALID_TRANSITIONS["awaiting-resume"] = { running, canceled }` row.  No
changes to `resume`'s transition logic are needed.

**Transition patch for the new edge**:
`{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: null }`
(Same run-control fields as before, except `pid` is `null` rather than
`process.pid` because no pipeline process starts.)

**Rationale**: `awaiting-resume` is the correct intermediate state for a job
that is ready to be resumed but is not yet running.  Transitioning to
`awaiting-resume` (not `running`) makes the FSM state reflect actual reality:
no process is executing.  Using the existing status avoids adding a new status
to the schema.

**Alternatives considered**:

- *Add `awaiting-archive → awaiting-resume` to `VALID_TRANSITIONS`* (remove
  the `allowReopen` opt-in): Rejected.  The transition must still require the
  PR gate and operator event recording; removing the opt-in would allow any
  caller to bypass those checks.

- *Keep target as `running`, skip pipeline in execute()*: Rejected.  A job in
  `running` state with no process violates the invariant that `running` means
  the pipeline is actively executing; the `beforeExit` guard would immediately
  re-transition it to `awaiting-resume` anyway, creating noise in the journal.

### D3: Remove `--from` from `reopen` immediately (no deprecation period)

**Decision**: `--from` is removed from `ReopenOptions`, from the command
registry flags, and from `REOPEN_USAGE`.  The CLI parser no longer accepts
`--from` for `job reopen`; passing it produces an "unknown option" error.
Operators must pass `--from` to `job resume` instead.

The operator event record no longer records `fromStep` (see D4).  The Actions
workflow (`action=reopen`) is updated in the same PR to pass `--from` to the
subsequent `job resume` call.

**Rationale**: `--from` specified the pipeline re-entry step, which was
meaningful only because `reopen` also launched the pipeline.  With the pipeline
launch removed, `--from` has no semantic meaning.  The only known caller is the
Actions workflow, which is being updated atomically.  A deprecation period adds
dead code for a single-release cycle with no external consumer benefit.

**Alternatives considered**:

- *Deprecate with a warning, treat value as no-op*: Rejected.  Silently ignoring
  a previously-required flag is confusing; it does not direct operators to the
  correct new location (`resume --from`).

- *Emit a deprecation warning and auto-forward `--from` to the subsequent `resume`
  call*: Rejected.  Implicit option forwarding between subcommands is fragile;
  the operator may not have a suitable target step at reopen time, and the
  forwarding mechanism would require `reopen` to know about `resume`'s interface.

### D4: OperatorEventRecord.fromStep becomes optional

**Decision**: In `src/store/event-journal.ts`, change `fromStep: string` to
`fromStep?: string` in `OperatorEventRecord`.  Existing `events.jsonl` records
that include `fromStep` continue to be valid.  New reopen events omit `fromStep`.

**Rationale**: `fromStep` recorded the pipeline re-entry step that was
previously specified via `--from`.  Since `--from` is removed from `reopen`,
there is no step to record.  Making the field optional is the minimal
backward-compatible schema change — the `fold()` reader already handles missing
fields by treating them as absent.

**Alternatives considered**:

- *Add `fromStep: string | null`*: Rejected.  Field absence is semantically
  cleaner than explicit `null` for an append-only journal record.

- *Remove the field from the interface entirely*: Rejected.  Would silently
  drop the field when existing records are read and re-serialized; existing
  `fold()` code would lose audit information from pre-change events.

### D5: Actions workflow composes reopen + resume sequentially

**Decision**: The `action=reopen` branch in
`.github/workflows/specrunner-dispatch.yml` executes two commands in sequence:

```
job reopen "$SLUG" --reason "$REASON"
job resume "$SLUG" --from "$FROM" [--prompt "$PROMPT" ...]
```

No intermediate push or commit is needed between the two commands: `reopen`
writes only `state.json` (a branch-borne file in the working worktree);
`resume` reads `state.json` from the same path.  The existing `FROM` workflow
input variable passes directly to `resume`.

The `action=reopen` path retains `FROM` as a required input (the guard
`[ -z "$FROM" ] || [ -z "$REASON" ]` is preserved), because the subsequent
`resume` step requires a start step.

**Rationale**: Two explicit CLI commands make the lifecycle/execution split
visible in the workflow YAML without introducing new workflow actions or jobs.
The composition is trivially correct: `reopen` exits 0 on success, and `resume`
fails fast if `reopen` failed (non-zero exit propagates).

**Alternatives considered**:

- *Add a new `action=reopen-and-resume` combined action*: Rejected.  Duplicates
  the branch/slug resolution logic already in the `action=reopen` path.

### D6: B-17 conformance description updated; invariant mechanism unchanged

**Decision**: `architecture/conformance.md` B-17 row text is updated to
reference `awaiting-archive → awaiting-resume` (not `running`).  The
enforcement mechanism — grep for the `allowReopen: true` literal, allow only
`src/core/command/reopen.ts` — is unchanged.  `core-invariants.test.ts` B-17
tests pass as-is because `reopen.ts` still contains the `{ allowReopen: true }`
literal (it is still passed to `transitionJob`, just with a different target
status).

**Rationale**: B-17 pins the call site, not the target status.  No structural
change to the invariant or its test is required; only the prose description
needs updating for accuracy.

---

## Risks / Trade-offs

**[Risk] `reopen-command.test.ts` calls `prepare()` (protected) via type cast**
→ Mitigation: After D1, `ReopenCommand` has no `prepare()` method.  All tests
in that file must be restructured to call `execute()` directly.  The helpers
`makeRuntime()`, `makeEventBus()`, and `callPrepare()` are removed.  This is a
mechanical rewrite tracked in T-06.

**[Risk] TC-020 expects `pid` to be `process.pid` (defined) in the patch**
→ Mitigation: TC-020 is updated in T-06 to assert `patch["pid"]` is `null`.

**[Risk] TC-021 asserts `fromStep: "spec-review"` in the operator event**
→ Mitigation: TC-021 is updated in T-06 to assert `fromStep` is absent
(`undefined` or not in the record).

**[Risk] TC-016 in `lifecycle-reopen.test.ts` expects `status: "running"`**
→ Mitigation: TC-016 is updated in T-01 to target `"awaiting-resume"` and
assert `result.state.status === "awaiting-resume"`.

**[Risk] B-17 liveness check fails if `{ allowReopen: true }` literal is removed**
→ Mitigation: D2 retains the `{ allowReopen: true }` call to `transitionJob`
in `reopen.ts` (targeting `"awaiting-resume"`).  The literal is preserved.

**[Risk] Actions `action=reopen` partially executes if `reopen` succeeds but
`resume` fails**
→ Mitigation: Acceptable — the job is left in `awaiting-resume` (a valid
recoverable state).  The operator can rerun the workflow or invoke `resume`
manually.  The Actions log clearly shows which step failed.

---

## Open Questions

None.  All design decisions are resolved above.  The `adr-gen` step will
produce an amendment to `2026-07-22-job-reopen-awaiting-archive.md` capturing
D1–D6.
