# Design: pipeline-owned evidence authorship enforcement

## Context

The archive floor (ADR-20260717) re-derives achieved assurance from *recorded anchors* —
`test-case-gen` / `spec-review` / `test-materialize` / `implementer` commit OIDs, verdicts,
and freeze bases. Those anchors all have their root in the **journal**
(`specrunner/changes/<slug>/{events.jsonl,state.json}`). ADR-20260718 ratifies the boundary
this change implements: *an agent SHALL NOT, across any normal/abnormal exit, crash, or
resume/attach path, cause forged pipeline-owned evidence to be accepted as a legitimate record.*

The current code does not hold that invariant (confirmed by reading the source):

- **journal is agent-writable.** `stateRoot = worktreePath` and the journal lives under the
  agent's cwd (`job-location-resolver.ts`, `paths.ts`). The agent can Edit/Write/Bash it.
- **per-node commit co-commits the journal with agent code.** Sequential `commitAndPush`
  stages with `git add -A` (`commit-push.ts:48`), so a tampered journal rides the agent's
  code commit. The round path already excludes the journal via `pipelineManagedPaths`
  (`round-git-scope.ts:54-56`, `partitionRoundChanges`), but the sequential path does not.
- **no authenticity check exists.** The main-checkout guard inspects the *main* checkout +
  `.specrunner/**`, never the branch-borne journal. Resume folds on-disk state blindly
  (`resolve-job.ts` → `JobStateStore.list`; `loadSplitLayout` only rejects mid-journal
  *corruption*, `job-state-projection.ts:162-175`). Attach only checks *self-consistency*
  (`verify-checkpoint.ts`: fold / counter-reversal / profile-digest / identity), never
  authenticity.

The single-writer facts this design leans on:

- **`CommitOrchestrator` is the sole caller of `store.persist` for sequential steps**
  (`commit-orchestrator.ts`), and **`JobJournal.persist` is the single low-level write
  chokepoint** through which *every* pipeline journal write funnels (`job-journal.ts`).
  The pipeline therefore *knows the bytes it authored* and can digest them.
- Node lifecycle (`executor.ts`): agent runs → guards → output-contract gate (`:404-420`) →
  per-node commit `finalizeStepArtifacts` (`:436-459`) → `captureHeadSha` for `commitOid`
  (`:461-466`) → `deriveStepCompletion`; state is persisted later in `orchestrator.apply`.
- **origin is agent-unreachable for writes.** Transport-auth (push credentials) is held by
  the pipeline (`LocalRuntime.wrappedSpawnFn`); the agent has no push path. A value pushed to
  an origin ref by the pipeline cannot be altered by the agent and survives a local crash.
- Runtime primitives already exist: `listCommitChangedFiles(oid)`, `diffPathsBetweenCommits`,
  `readFileAtCommit`, `digestArtifacts` (`runtime-strategy.ts`; `local.ts`). `checkpoint-ref.ts`
  reads `git show <ref>:<path>` from a remote ref without checkout. `commitFinalState`
  publishes the checkpoint at `awaiting-resume`/`awaiting-archive` (`commit-push.ts:105-146`).
- `StepHalt` factories + `CommitOrchestrator.commitHalt` provide a fail-closed escalation path
  (`step-halt.ts`, `commit-orchestrator.ts`).

This change closes the invariant by **detection + restoration on all three named paths**
(per-node commit, resume load, attach), so that no pre-check crash can launder forged bytes.

## Goals / Non-Goals

**Goals**:

- **G1 — authorship separation (R1):** sequential per-node commit excludes the pipeline-managed
  journal paths, so agent code commits never carry the journal.
- **G2 — pipeline-authored anchor (R2):** the pipeline maintains a content digest of the journal
  bytes it authored, held in-process during a run and published to a **durable, agent-unreachable,
  crash-surviving** origin ref.
- **G3 — authenticity verification on all three paths (R3):** per-node (committed tree + on-disk),
  resume load (on-disk vs durable anchor), attach (checkpoint tree vs durable anchor).
- **G4 — restore-then-halt (R4):** on any mismatch, restore trusted bytes *before* halting;
  never persist / commit / push / attach the tampered bytes.
- **G5 — no false positives (R5):** legitimate pipeline writes (persist / checkpoint) never halt
  the continue / resume / attach happy paths.
- **G6 — fail-closed:** any undeterminable verification is treated as tamper (halt).

**Non-Goals** (teeth intentionally left to other requests, with reasons):

- **OS-sandbox journal exclusion + #783 fail-open fix** — the second (preventive) layer of
  ADR-20260718 D2. It spans the claude-code adapter and #783 and is an independent seam. This
  change closes the invariant on the *detection* side; sandbox exclusion is a follow-up
  defense-in-depth request. (ADR-20260718 explicitly keeps the two layers independent.)
- **#464 general machine-state commit denylist** (`.specrunner/**` and other machine-state).
  This change is limited to the **evidence journal**.
- **B (per-step epistemic-contract audit) / C (per-scenario dogfood enablement) / R5 provenance
  carry / R6 fast-path** — out of scope by the request.
- **Round (parallel reviewer) per-member authorship attribution.** The three enforced paths are
  exactly the ones the request names (per-node commit, resume, attach). Round members share a
  worktree (member attribution is impossible; round changes are already scope-excluded), and any
  forged evidence that survives to a durable checkpoint is still caught by the resume/attach
  gates. Per-member round verification is out of scope. (See Risks.)
- **Managed runtime** has no local worktree and no agent-writable journal on the same surface
  (journal is written by the local pipeline to the sidecar; the cloud agent has no filesystem
  path to it). The local-runtime gates below are structurally skipped for managed (guarded by
  capability), preserving managed behavior.

## Decisions

### D1 — The evidence anchor is the pipeline-authored journal bytes, tracked from the pipeline's own writes

The **anchor** is the exact journal content the pipeline authored: the `events.jsonl` byte
stream and the `state.json` bytes, plus their sha256 digests. It is maintained by the single
write chokepoint (`JobJournal.persist`) from the pipeline's **in-memory** appends — never
re-derived by reading disk back after a write. Re-reading disk would fold a prior agent tamper
into the anchor (false negative); tracking the authored append stream keeps the anchor immune to
on-disk tampering and byte-exact with the happy-path file.

- **Rationale:** `JobJournal.persist` already computes and appends the exact records
  (`historyEntryToRecord` / `stepRunToRecord` via `appendEventRecord`) and overwrites `state.json`
  wholesale. Capturing those bytes at write time is authoritative and cheap. Because
  `events.jsonl` is append-based, a *fresh* full re-serialization (all-history-then-all-steps)
  would NOT match the interleaved on-disk order across multiple persists — so the anchor must
  mirror the actual append stream, not re-serialize.
- **Alternatives considered:**
  - *Store the digest inside `state.json`* — rejected (ADR-20260718): the agent can rewrite
    `state.json` and the digest together.
  - *Re-read the on-disk journal after each persist to compute the anchor* — rejected: bakes any
    in-place tamper into the anchor (false negative).
  - *Keep the anchor only in `CommitOrchestrator`* — rejected: `pipeline.ts` persists directly via
    `deps.storeFactory` at terminal transitions and transition-history appends, bypassing the
    orchestrator; only the `JobJournal.persist` chokepoint sees every write.

### D2 — Anchor lives in a process-scoped registry keyed by the journal location; absence preserves current behavior

Because `JobStateStore` (and its `JobJournal`) is constructed in many call-sites, the authored-byte
state is held in a **process-scoped registry** keyed by the resolved journal directory
(`stateRoot`+`slug`, or `changeDir`). `JobJournal.persist` records its authored bytes into the
registry (additive). Verification gates read the registry. When the registry has no entry for a
journal (fresh process — e.g. the first write of a run, or after a crash on resume), in-process
verification simply has no baseline for that write and defers to the **durable** anchor (D4).

- **Rationale:** keeps `JobStateStore` construction and all existing tests unchanged (backward-compat,
  R5/T8); centralizes anchor logic at the one chokepoint; matches the request's split of
  "in-process during a run" vs "durable across a crash".
- **Alternatives considered:** thread an anchor object through `PipelineDeps` and every persist
  call — rejected as a wide, regression-prone signature change; a module-scoped registry consulted
  by the chokepoint is narrower.

### D3 — Sequential per-node commit excludes the pipeline-managed journal paths (authorship separation)

The sequential `commitAndPush` (`commit-push.ts`) stops using bare `git add -A` and instead stages
everything **except** `pipelineManagedPaths(slug)` (`events.jsonl` / `state.json` / `usage.json`) —
reusing the exact exclusion the round path already uses (`round-git-scope.ts`). The agent code
commit thus never carries the journal. The pipeline then commits the journal itself in a separate
**pipeline-managed journal commit** (stages only `pipelineManagedPaths`) and pushes it, so origin's
feature branch continues to carry the pipeline-authored journal per node.

- **Rationale:** the round path already proves this pattern; extending it to the sequential path is
  the ratified decision (extend the existing exclusion, not invent a new mechanism). Separating the
  two commits is what makes the committed-tree check (D5) meaningful.
- **Alternatives considered:** leave `git add -A` and rely only on the post-hoc check — rejected:
  authorship never separates, and a self-commit/plumbing path could still fuse tampered journal into
  the code commit. Amend the agent commit to strip the journal — rejected: rewriting the agent's
  commit is fragile and loses the clean two-author boundary.

### D4 — Durable anchor is a pipeline-managed origin ref carrying the authored digest, computed from the in-process anchor

The pipeline publishes the authored journal digest to an origin ref
(e.g. `refs/specrunner/evidence/<branch>`) that the agent cannot write (no push credentials) and
that survives a local crash. The ref **value is derived from the in-process anchor (D1), not from a
re-read of on-disk bytes**, so it is an *independent* authenticity witness — this is what upgrades
attach from self-consistency to authenticity. The ref is updated on every pipeline journal push
(per-node journal commit and checkpoint), keeping it byte-exact with origin's feature-branch journal
so resume/attach can use plain digest equality.

- **Rationale:** origin is the only agent-unreachable, crash-surviving surface. A *separate* digest
  ref (vs the journal tree itself) is essential: comparing the checkpoint journal against a digest
  embedded in the same tree would be circular (self-consistency); comparing against an independent,
  pipeline-authored ref is authenticity. Updating the ref on every pipeline journal push (a
  refinement over the request's "at checkpoint push") keeps exact-match valid as per-node progress
  advances the journal; the request's intent (durable / agent-unreachable / crash-surviving) is
  preserved and strengthened. See Open Questions for the ref object form and cadence confirmation.
- **Alternatives considered:**
  - *Worktree-local / in-process only* — rejected (ADR-20260718): the agent can reach a worktree
    file and the in-process value dies on crash.
  - *Digest inside `state.json`* — rejected: agent-writable and circular.
  - *No separate ref; compare on-disk vs origin feature-branch journal only* — viable for resume
    (origin is agent-unreachable) but **circular for attach** (checkpoint journal is the origin
    journal). The independent digest ref is required for attach authenticity.

### D5 — Per-node verification runs between the agent commit and success persist; fail-closed

For sequential steps (`roundOwnsGitEffects === false`) on the local runtime, after the agent code
commit (D3) and before recording success, the pipeline verifies:

1. **committed-tree:** the agent commit (`commitOid`) changes **no** `pipelineManagedPaths`
   (`listCommitChangedFiles(commitOid) ∩ journalPaths === ∅`). Catches git-plumbing/self-commit
   tree swaps that fuse a tampered journal into the code commit (T3).
2. **on-disk:** the worktree journal digest equals the in-process anchor as of the last pipeline
   write before the agent ran (`begin`'s persist). Catches Edit/Write/Bash in-place tamper (T1/T2)
   and coordinated `events.jsonl`+`state.json` tamper (T5).

Verifying *before* the success persist means we never append the step's records on top of tampered
bytes and never persist success over a tamper. Any mismatch, or any inability to evaluate
(missing primitive, git error), is treated as tamper (fail-closed).

- **Rationale:** placing the check between `produce` and `apply` uses the already-captured
  `commitOid` and the `begin` baseline, and avoids the persist-then-revert wart. Fail-closed is the
  correct posture for a P0 security boundary.
- **Alternatives considered:** verify after success persist and roll back — rejected: persists forged
  success first and complicates the halt flow. Verify only committed-tree — rejected: misses in-place
  `events.jsonl` edits that the code commit legitimately excludes.

### D6 — Resume-load verification against the durable anchor; restore from origin then halt

Resume, before folding on-disk state, fetches the durable anchor + origin feature-branch journal and
verifies the on-disk worktree journal digest equals the durable anchor (D4). On mismatch it restores
the worktree journal from the origin (durable, agent-unreachable) journal and halts (escalation) —
so a pre-check crash cannot launder a tamper into the resumed run. Clean resume proceeds unchanged.

- **Rationale:** the in-process anchor is gone after a crash; the durable origin ref/journal is the
  crash-surviving trust source (ADR-20260718 D4). Restoring before halt prevents the next
  resume/attach from picking up the tampered bytes (ADR-20260718 D5).
- **Alternatives considered:** trust on-disk (status quo) — rejected: the pre-check crash launder.
  Restore from the in-process anchor — impossible after a crash (does not survive).

### D7 — Attach authenticity predicate added to `verify-checkpoint`; reject on mismatch

`verifyCheckpoint` gains an authenticity predicate layered onto its existing self-consistency checks:
the checkpoint tree journal (already read by `readCheckpointFromRef`) is digested and compared to the
durable anchor ref for the same branch. Mismatch → `checkpointNotAttachableError` (authenticity);
per the existing attach contract, **no local state is created** on failure. Authentic checkpoints
attach exactly as today.

- **Rationale:** attach's current checks are self-consistency; the independent digest ref (D4) is what
  makes the added predicate authenticity. Refusing to materialize a tampered checkpoint is the
  attach-path form of "restore trusted bytes before proceeding" (nothing tampered is ever adopted).
- **Alternatives considered:** attempt to rewrite the checkpoint tree — rejected: attach must not
  mutate the remote; refusing (fail-closed) is correct and matches the existing "never create local
  state on failure" contract.

### D8 — Checkpoint publish restores trusted bytes before pushing, and publishes the digest ref

`commitFinalState` (checkpoint / finalize) restores the on-disk journal from the in-process anchor
before its `git add`/commit/push, so the origin feature-branch journal is guaranteed authentic, and
then publishes the durable digest ref (D4). This guarantees origin never receives tampered journal
bytes even on a crash-driven `awaiting-resume` publish.

- **Rationale:** `commitFinalState` currently `git add -A` (`commit-push.ts:115`) and would otherwise
  carry a tampered on-disk journal to origin, poisoning the restore source for D6/D7. Restore-before-push
  keeps the durable journal and the digest ref mutually consistent by construction.
- **Alternatives considered:** leave `commitFinalState` best-effort as-is — rejected: it is the crash
  publish seam and must not launder tamper to origin.

### D9 — Violations halt via a dedicated fail-closed StepHalt + typed error code

A new `EVIDENCE_TAMPER_DETECTED` error code and a `makeEvidenceTamperHalt` factory
(`step-halt.ts`) produce an `awaiting-resume` escalation (operator inspects and re-runs), mirroring
`makeDriftHalt`. Resume/attach violations surface via their existing typed errors
(`journalCorruptedError`-style for resume; `checkpointNotAttachableError` "authenticity" reason for
attach). Restoration always precedes the halt (D5/D6/D7/D8).

- **Rationale:** reuse the established halt/escalation machinery; a distinct code makes the boundary
  observable and testable.
- **Alternatives considered:** reuse `MAIN_CHECKOUT_WRITE_DETECTED` — rejected: conflates a different
  boundary and muddies telemetry.

## Risks / Trade-offs

- **[Risk] Byte-exactness → false positives (R5/T6).** If the anchor's byte representation diverges
  from the on-disk happy-path file, legitimate runs would halt. → **Mitigation:** the anchor tracks
  the *actual* append stream from `JobJournal`'s own writes (D1), not a re-serialization, and reuses
  `historyEntryToRecord`/`stepRunToRecord`/`atomicWriteJson` so bytes match by construction. T6
  pins the happy paths.
- **[Risk] Hard crash between the pipeline journal commit and its push** leaves on-disk one node ahead
  of the durable anchor; resume then sees a mismatch. → **Mitigation:** per-node pushes already
  fail-closed (`pushOnly` throws → halt), so an authentic run does not advance on-disk past a
  successful push. When a hard crash does open this window, resume conservatively restores to the
  durable anchor and halts (fail-closed): the affected node re-runs — a spurious halt, never accepted
  forged evidence and no silent data loss. Documented as accepted P0 posture.
- **[Risk] Managed runtime / no-worktree regressions (T8).** → **Mitigation:** all per-node / resume /
  attach gates are guarded by runtime capability (local worktree + primitives present). Managed and
  `--no-worktree` structurally skip them; managed keeps its current behavior.
- **[Risk] Round-member forgery not caught per-member.** → **Mitigation:** in-scope boundary is the
  three named paths; round changes are scope-excluded, and the durable resume/attach gates catch any
  forged evidence that survives to a checkpoint. Called out in Non-Goals.
- **[Trade-off] Extra per-node journal commit + ref push (network).** Small constant overhead per
  node; acceptable for a P0 authenticity boundary.

## Open Questions

- **Durable ref object form and cadence.** Recommended: `refs/specrunner/evidence/<branch>` whose
  object encodes the authored combined digest; updated on every pipeline journal push (per-node +
  checkpoint) for exact-match resume/attach. The request phrased the durable push as "at checkpoint";
  D4 strengthens this to every pipeline journal push to keep exact-match valid across per-node
  progress. Confirm the ref namespace and whether the object is a blob/tag/commit at implementation.
- **Round-path journal commit sweep.** The pipeline-managed journal commit runs on the sequential
  finalize path; confirm whether the coordinator round needs its own post-round journal commit or can
  rely on the next sequential step's journal commit + checkpoint to sweep round-authored journal
  changes (implementer to verify no origin-durability gap for a run that ends inside a round).

## Migration Plan

Additive and backward-compatible: no state schema version bump. The durable ref namespace is new;
jobs created before this change simply have no ref, and the resume/attach gates fall back to the
in-process anchor / existing self-consistency (fail-open only for the *absence* of a legacy anchor,
never for a present-but-mismatched one). No rollback data migration required — reverting removes the
gates and the ref without affecting the journal format.
