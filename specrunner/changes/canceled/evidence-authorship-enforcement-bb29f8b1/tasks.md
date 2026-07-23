# Tasks: pipeline-owned evidence authorship enforcement

<!--
Path map (all under the worktree; do NOT edit files outside src/ and tests/):
- NEW  src/store/evidence-anchor.ts            — anchor type, digest fns, process-scoped registry
- NEW  src/git/evidence-anchor-ref.ts          — durable origin ref push/read (src/git layer rules)
- NEW  src/core/step/evidence-authorship.ts    — per-node verification + restore predicates
- EDIT src/store/job-journal.ts                — record authored bytes into the anchor registry
- EDIT src/core/step/commit-push.ts            — journal exclusion + pipeline journal commit + ref publish
- EDIT src/core/step/commit-orchestrator.ts    — drive per-node verification/restore/halt after apply seam
- EDIT src/core/step/executor.ts               — insert verify phase between produce and apply
- EDIT src/core/step/step-halt.ts              — makeEvidenceTamperHalt factory
- EDIT src/errors.ts                           — EVIDENCE_TAMPER_DETECTED code + error factory
- EDIT src/core/port/runtime-strategy.ts       — capability/primitives seam if needed for verify/restore
- EDIT src/core/runtime/local.ts               — local impl of any new port method (restore/ref)
- EDIT src/core/resume/resolve-job.ts (+ resume command seam) — resume-load authenticity gate
- EDIT src/core/attach/verify-checkpoint.ts (+ orchestrator/checkpoint-ref) — attach authenticity predicate
Reuse: round-git-scope.ts:pipelineManagedPaths, runtime primitives (listCommitChangedFiles,
diffPathsBetweenCommits, readFileAtCommit, digestArtifacts), checkpoint-ref.ts git-show pattern.
Scenario-before-code: write T-09 scenarios/fixtures conceptually before locking interfaces; land
code tests after interfaces in T-01..T-08 are stable.
-->

## T-01: Evidence anchor core (type, digests, process-scoped registry)

- [ ] Add `src/store/evidence-anchor.ts` defining an `EvidenceAnchor` value: authored `events.jsonl`
      bytes, authored `state.json` bytes, and their sha256 digests (`sha256:<hex>`), plus a combined
      digest.
- [ ] Provide pure digest helpers over raw bytes/strings (sha256), matching the `digestArtifacts`
      `sha256:<hex>` convention so cross-checks are comparable.
- [ ] Provide a process-scoped registry keyed by the resolved journal location
      (`stateRoot`+`slug`, or `changeDir`): `record(key, {eventsBytes, stateBytes})`, `get(key)`,
      and a test-only `reset()`.
- [ ] Registry `record` is called with the exact bytes the pipeline authored (from the append stream
      + state overwrite), never a re-read of on-disk bytes.

**Acceptance Criteria**:
- `EvidenceAnchor` digests are byte-exact for identical input and differ for any single-byte change.
- Registry returns the last-recorded anchor for a key; unknown key returns undefined.
- Module is pure aside from the in-memory registry; no filesystem or git access.

## T-02: Record authored bytes at the JobJournal write chokepoint

- [ ] In `src/store/job-journal.ts`, after each successful write in `persist`, record the authored
      journal bytes into the T-01 registry keyed by this journal's resolved location.
- [ ] The recorded `events.jsonl` bytes mirror the actual append stream (accumulate authored records
      in lockstep with `appendEventRecord`), not a fresh full re-serialization — so happy-path bytes
      equal on-disk bytes.
- [ ] The recorded `state.json` bytes equal exactly what `atomicWriteJson` wrote.
- [ ] Recording is additive and must not change `persist`'s return type, throw behavior, or the
      fresh/fast/fold branches.

**Acceptance Criteria**:
- After a sequence of pipeline persists, `registry.get(key)` equals the on-disk journal bytes when no
      external tamper occurred (byte-for-byte).
- Existing `job-journal` / `job-state-store` tests pass unmodified.

## T-03: Durable evidence anchor ref (origin) — push and read

- [ ] Add `src/git/evidence-anchor-ref.ts` (src/git layer: import only from `src/util/spawn`,
      `src/util/paths`, `src/errors`). Provide `pushEvidenceAnchor(spawnFn, cwd, branch, digest)` and
      `readEvidenceAnchor(spawnFn, cwd, ref)` for a pipeline-managed ref
      (`refs/specrunner/evidence/<branch>`) whose object encodes the authored combined digest.
- [ ] `pushEvidenceAnchor` uses the pipeline's transport-authenticated spawn; the value comes from the
      in-process anchor (T-01), never from a re-read of on-disk bytes.
- [ ] `readEvidenceAnchor` returns the stored digest or a typed "absent" result (never throws for a
      missing ref).

**Acceptance Criteria**:
- Round-trip: pushing a digest then reading it back yields the same digest (integration test with a
      temp git remote, or a faked spawn asserting the exact git args).
- A missing ref yields "absent", not an error.
- No imports from `src/core` or `src/adapter` (layer rule enforced by existing conformance).

## T-04: Authorship separation in the sequential per-node commit (R1 / T7)

- [ ] In `src/core/step/commit-push.ts`, change sequential `commitAndPush` to stage everything except
      `pipelineManagedPaths(slug)` (reuse `round-git-scope.ts`), instead of bare `git add -A`. Preserve
      all existing halt/no-op/HEAD-advance/push-retry semantics.
- [ ] Add a pipeline-managed journal commit helper that stages only `pipelineManagedPaths(slug)`,
      commits (distinct message label, e.g. `journal: <slug>`), and pushes (one retry, fail → halt).
- [ ] Wire the pipeline-managed journal commit into the sequential finalize path so origin's feature
      branch carries the pipeline-authored journal per node, after per-node verification (T-06) passes.

**Acceptance Criteria (T7)**:
- The agent code commit's tree contains no `events.jsonl` / `state.json` / `usage.json` change.
- A separate pipeline-managed commit carries the journal to origin.
- `commit-push` existing tests pass unmodified except where they asserted `git add -A` inclusion of
      the journal (update those to the new exclusion expectation).

## T-05: EVIDENCE_TAMPER_DETECTED error + StepHalt factory (R4 / D9)

- [ ] In `src/errors.ts`, add `ERROR_CODES.EVIDENCE_TAMPER_DETECTED` and an
      `evidenceTamperError(detail)` factory with a hint that names the detected path(s) and the
      `specrunner job resume <slug>` recovery.
- [ ] In `src/core/step/step-halt.ts`, add `makeEvidenceTamperHalt(...)` producing an
      `awaiting-resume` halt (mirroring `makeDriftHalt`): resumePoint at the detecting step,
      interruption `reason: "failure"`, `errorCode: EVIDENCE_TAMPER_DETECTED`, and a `{step}-...`
      history entry.

**Acceptance Criteria**:
- The halt is `awaiting-resume` and applies through `CommitOrchestrator.commitHalt` without new
      code paths in that method.
- Error message/hint name the tampered journal path(s).

## T-06: Per-node authenticity verification + restore + halt (R3 / R4; T1/T2/T3/T5)

- [ ] Add `src/core/step/evidence-authorship.ts` with a pure-ish predicate that, given the agent
      `commitOid`, the journal paths, the in-process anchor, and the runtime primitives, returns
      `ok` or a `violation` with reason:
      (a) committed-tree: `listCommitChangedFiles(commitOid) ∩ journalPaths` must be empty;
      (b) on-disk: `digestArtifacts(journalPaths)` must equal the anchor digests.
- [ ] Fail-closed: a missing primitive, git `unavailable`, or absent anchor-with-present-on-disk that
      cannot be evaluated is a violation.
- [ ] Add a restore helper that writes the in-process anchor bytes back to the worktree journal.
- [ ] In `src/core/step/executor.ts`, insert a verification phase for sequential steps
      (`roundOwnsGitEffects === false`) on the local runtime **between `produce` and `apply`**, using
      the `begin`-baseline anchor and the captured `commitOid`. On violation: restore, then return/raise
      an `EVIDENCE_TAMPER_DETECTED` StepHalt via the orchestrator (no success persist).
- [ ] Guard the whole phase by runtime capability (local worktree + required primitives present);
      managed / no-worktree skip structurally.

**Acceptance Criteria**:
- **T1**: Edit/Write tamper during a step → detected → restored → halt; removing the restore+halt lets
      the tampered journal reach commit/next step (破壊確認 negative test).
- **T2**: Bash tamper → detected → restored → halt.
- **T3**: journal placed into the agent commit tree via `git add`/plumbing → committed-tree check
      detects it → halt.
- **T5**: coordinated `events.jsonl`+`state.json` tamper → both diverge from anchor → detected → halt.
- Verification runs before the success persist (no success recorded over a tamper).

## T-07: Checkpoint publish restores trusted bytes and publishes the durable ref (D8)

- [ ] In `commitFinalState` (`commit-push.ts` / `local.ts` seam), restore the on-disk journal from the
      in-process anchor before `git add`/commit, so the origin feature-branch journal is authentic even
      on a crash-driven `awaiting-resume` publish.
- [ ] After the checkpoint push, publish the durable digest ref (T-03) with the current in-process
      anchor digest. Keep push best-effort semantics for the branch push; ensure ref publish does not
      regress the "never throws" contract of `commitFinalState`.
- [ ] Also publish/refresh the durable ref on the per-node journal push (T-04) so the ref stays
      byte-exact with origin as per-node progress advances (see design Open Questions).

**Acceptance Criteria**:
- Given a tampered on-disk journal at checkpoint, the pushed origin journal equals the in-process
      anchor (restore-before-push verified).
- The durable ref digest equals the digest of the origin feature-branch journal after publish.
- `commitFinalState` still does not throw on push failure.

## T-08: Resume-load and attach authenticity gates (R3 / R4; T4)

- [ ] Resume load: at the resume seam (`src/core/command/resume.ts` using
      `src/core/resume/resolve-job.ts`), before folding/using on-disk state, fetch the durable ref +
      origin feature-branch journal and verify the on-disk worktree journal digest equals the durable
      anchor. On mismatch: restore the worktree journal from the origin (agent-unreachable) source, then
      halt with an authenticity error. Clean journal resumes unchanged. Guard by local-runtime
      capability.
- [ ] Attach: in `src/core/attach/verify-checkpoint.ts`, add an authenticity predicate — digest the
      checkpoint tree journal (`stateJson` + `eventsJsonl` already provided by `readCheckpointFromRef`)
      and compare to the durable anchor for the branch (read via T-03 through the attach orchestrator).
      Mismatch → `checkpointNotAttachableError("authenticity", ...)`; create no local state. Thread the
      durable-anchor digest into `verifyCheckpoint` inputs (keep the function's no-I/O property — the
      orchestrator reads the ref and passes it in).

**Acceptance Criteria (T4 + attach)**:
- **T4**: journal tampered then process killed before per-node verification → on resume, resume-load
      verification detects the mismatch against the durable anchor → restores from origin → halts (does
      not fold tampered bytes). Negative: without the resume gate, the tampered journal is folded.
- Attach with a tampered checkpoint journal is rejected (authenticity) and creates no local state;
      an authentic checkpoint attaches as before.

## T-09: False-positive fixation and backward-compat (R5; T6/T8)

- [ ] **T6**: fix a full happy-path run (continue), a clean resume, and a clean attach — assert no
      authenticity halt fires for pipeline-authored journal writes (persist / transition history /
      checkpoint).
- [ ] Assert managed runtime and `--no-worktree` local runs structurally skip the gates and are
      behavior-unchanged.
- [ ] **T8**: run the existing behavior-preservation suites for pipeline / commit-push / resume /
      attach / verify-checkpoint / archive; keep them green, updating only assertions that must express
      the added authenticity behavior (documented in each diff).
- [ ] Ensure `bun run typecheck && bun run test` is green.

**Acceptance Criteria**:
- Continue / resume / attach happy paths complete with zero authenticity halts.
- Managed / no-worktree behavior identical to pre-change.
- `typecheck` and `test` both pass; changed existing tests are only the authenticity-expectation
      additions.

## T-10: Conformance / layering and observability

- [ ] `src/git/evidence-anchor-ref.ts` imports only `src/util` + `src/errors` (no `src/core`,
      no `src/adapter`); `src/store/evidence-anchor.ts` stays free of git/core imports — verify against
      the existing DSM/conformance rules.
- [ ] Emit an observable signal on detection (event and/or history entry with the
      `EVIDENCE_TAMPER_DETECTED` code) so per-node, resume, and attach detections are visible in the
      journal/logs.
- [ ] Confirm no new fatal-on-managed path and no change to `usageJsonPath` handling beyond the
      exclusion already present in `pipelineManagedPaths`.

**Acceptance Criteria**:
- Conformance step passes (layer rules intact).
- Each of the three enforced paths produces an observable detection record on violation.
