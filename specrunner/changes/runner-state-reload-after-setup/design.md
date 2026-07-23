# Design: setupWorkspace 後の in-memory state を store から reload し、field 手動 mirror を廃止する

## Context

External repo v0.4.2 job `ef93ae2a` halted on the first push with `EGRESS_UNKNOWN_COMMIT`.
The blocked commits were the pipeline's own bootstrap materialization commit and the
request-review synthesized commit.

**Root cause — state double-tracking:**

`setupWorkspace()` (via `WorkspaceMaterializer`) writes three fields to the slug store
after it seeds the store with `bootstrapState`:

1. `worktreePath` — via `updateJobState`
2. `synthesizedCommits` — via `updateJobState(appendSynthesizedCommit)` with the bootstrap OID
3. `branch` — via `updateJobState`

`runner.ts` mirrors **only** `worktreePath` and `branch` from the returned `workspace`
object into the in-memory `jobState` (lines 169–181). `synthesizedCommits` has no mirror.
The pipeline therefore runs with an empty ledger. When `verifyEgressLedger` computes the
push range and finds the bootstrap commit absent from the ledger, it emits
`EGRESS_UNKNOWN_COMMIT` and halts.

The subsequent halt-path `persistJobState()` call overwrites the store with the empty-ledger
in-memory state, producing `synthesizedCommits: null` in the persisted state — consistent
with the observed symptom.

**Why field-by-field mirror is a dead end:** adding `synthesizedCommits` to the mirror is
the same class of fix that will be wrong again the moment any new field is written to the
store by `setupWorkspace()`. The mirror seam itself is the design defect.

**Scope of current code affected:**
- `src/core/command/runner.ts:169–181` — manual mirror block (deleted by this change)
- `src/core/port/runtime-strategy.ts` — interface addition
- `src/core/runtime/local.ts` — `reloadJobState` implementation (local)
- `src/core/runtime/managed.ts` — `reloadJobState` stub (passthrough; managed is out of scope)

## Goals / Non-Goals

**Goals**:
- Replace the manual mirror in `runner.ts` with a single `reloadJobState()` call that
  loads the full state from the slug store after `setupWorkspace()` completes
- Ensure the in-memory state passed to the pipeline includes `synthesizedCommits` (and
  any other fields written by `setupWorkspace()`) without explicit mirroring
- Preserve pre-setupWorkspace in-memory fields (`reviewers`, `noWorktree`, `issueNumber`)
  through reload — structural guarantee, no merge logic needed
- Seal the defect with integration tests that use real git + real store (no manual seed)
- Fail-closed when reload fails

**Non-Goals**:
- Managed runtime same-type fix (different store topology; separate request)
- Changing egress semantics (fail-closed egress is correct; the fix is on the ledger side)
- Rescuing the halted `ef93ae2a` job (operator recovery via branch re-push + resume)

## Decisions

### D1: `reloadJobState` method on RuntimeStrategy / RealRuntimeStrategy

A new method `reloadJobState(jobId, slug, workspace): Promise<JobState>` is added:

- **Optional on `RuntimeStrategy`** — test fakes typed as `RuntimeStrategy` (e.g., in
  `runner.test.ts`) do not need to implement it. The runner calls it via optional-chaining
  (`?.`) with a fail-closed fallback: if the method is missing, the runner proceeds with
  the existing in-memory state unchanged (test-only path).
- **Required on `RealRuntimeStrategy`** — both `LocalRuntime` and `ManagedRuntime` must
  implement it (compile-time enforcement).

*Rationale: keeping `RuntimeStrategy` as an optional-method interface is the established
pattern in this codebase for methods that test fakes may omit (see `assertProviderReadiness`,
`snapshotMainCheckoutGuard`). Requiring it on `RealRuntimeStrategy` prevents production
runtimes from silently omitting the reload.*

*Alternative considered: add `reloadJobState` as required on `RuntimeStrategy` directly.
Rejected because this would break all existing `RuntimeStrategy`-typed test fakes that
return a mock runtime without this method.*

### D2: LocalRuntime.reloadJobState — load from slug store

```
stateRoot = workspace.worktreePath ?? this.cwd
new JobStateStore(jobId, this.cwd, { slug, stateRoot }).load()
```

The stateRoot derivation mirrors the existing `slugStoreOpts()` helper:
- Worktree mode: `workspace.worktreePath` (the created worktree directory)
- No-worktree mode: `this.cwd` (the repository root, same as the workspace cwd)

`NormalizedJobState` (returned by `load()`) is cast to `JobState`. At this point in the
lifecycle (immediately after `setupWorkspace`, before any step runs), `steps` is either
absent or an empty Record — the cast is safe.

*Rationale: the slug store is the authoritative source of truth after `setupWorkspace()`
completes. A direct `JobStateStore.load()` in the implementation is correct and does not
require introducing a new abstraction layer.*

### D3: ManagedRuntime.reloadJobState — fail-closed throw (load 実装は条件付きで許容)

`reloadJobState(jobId, slug, workspace)` は元の `jobState` を引数に受け取らないため、
「passthrough / identity」は実装不可能である(spec-review F-01)。ManagedRuntime の実装は
T-03 と同一の選択とする:

- **一次案(fail-closed)**: `throw new Error("reloadJobState not implemented for managed runtime")`。
  managed runtime の store 構成(`.specrunner/local/<slug>/`)での reload 安全性は独立検証が必要で、
  別 request に委ねる。検証されるまで managed の run は setup 時点で明示的に停止する
  (state 不明のまま pipeline を走らせない — 本 request の fail-closed 方針と一貫)。
- **代替(実装者が安全性を確認できた場合のみ)**: `this.managedLocalStore(jobId, slug)` からの load。
  managed の seed が updateJobState 群より先に行われること(local と同じ順序保証)を確認できた
  場合に限り採用してよく、選択理由をコードコメントに記す。

*Rationale: 両案とも「真実は store」の一本化と両立する。identity passthrough は in-memory の
古い state を正として温存するため、本 request が消そうとしている二重真実そのものであり不可。*

### D4: runner.ts — replace mirror block with reload + fail-closed

After `setupWorkspace()` succeeds:

1. Call `this.runtime.reloadJobState?.(jobId, slug, workspace)`.
2. If the method exists and the reload succeeds, replace `jobState` with the reloaded
   value for all downstream usage (pipeline invocation, cleanup handler, etc.).
3. If the method does not exist (test fakes), continue with the existing `jobState`
   unchanged (no behavior change for test fakes).
4. If the method exists but throws, treat as a fatal workspace failure: log the error,
   persist a `failed` state, and return 1 — same error path as the workspace setup
   failure handler.

Delete lines 169–181 (the `worktreePath` and `branch` manual mirror block) entirely.

*Rationale: mirror deletion without reload would leave the same bug. Fail-closed on
reload failure is consistent with the post-#893 design principle: do not start a pipeline
when state is unknown.*

### D5: In-memory field preservation — structural guarantee

`reviewers`, `noWorktree`, and `issueNumber` are set on `jobState` in `prepare()` before
`workspaceOpts.bootstrapState = jobState` is assigned. `setupWorkspace()` seeds the slug
store with this `bootstrapState` as its **first** I/O operation, before any subsequent
`updateJobState()` calls. Therefore, the store always contains those fields from the
bootstrap seed onward.

`reloadJobState()` loads the store snapshot after all `updateJobState()` calls complete,
so it returns a state that includes:
- All pre-seed fields (reviewers, noWorktree, issueNumber, ...)
- All post-seed fields (worktreePath, synthesizedCommits, branch)

No merge logic is required. This is a structural property of the existing
`setupWorkspace()` implementation.

## Risks / Trade-offs

**[Risk] NormalizedJobState → JobState cast**
`JobStateStore.load()` returns `NormalizedJobState`, which has `steps` as a required
`Record<string, StepRun[]>`. `JobState` has `steps` as optional. At the reload point
there are no step runs yet, so `steps` is `{}`. The cast `loaded as JobState` is safe
in practice.
*Mitigation:* add a code comment at the cast site explaining the invariant. No runtime
check needed (cost > benefit for a structural no-op).

**[Risk] Extra disk read per run**
`reloadJobState()` adds one `JobStateStore.load()` call to the run path. This is a single
JSON file read against a local file (the worktree slug store), negligible compared to
pipeline step runtime (typically minutes).
*Mitigation:* none needed.

**[Risk] Test fakes unaware of reload**
Existing `CommandRunner` unit tests (e.g., `runner.test.ts`) use `RuntimeStrategy`-typed
fakes that do not implement `reloadJobState`. With the optional-method pattern (D1), the
runner falls back to the unchanged in-memory state — the same behavior as today. No test
breakage.
*Mitigation:* optional-chaining call pattern (see D4). New tests that specifically test the
reload path use fakes that DO implement `reloadJobState`.

## Open Questions

None. All design decisions have been evaluated by the architect (see request.md).
