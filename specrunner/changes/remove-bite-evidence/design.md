# Design: Remove the bite-evidence feature

## Context

`bite-evidence` is a pipeline gate step that sits between `implementer` and `verification` in the
STANDARD pipeline. For forward-strategy request types (`bug-fix`, `new-feature`) it selects the test
files changed between the Evidence Base (`synthesizedCommits[0]^`) and branch HEAD, runs each file
against a synthesized base tree (expecting **red**) and against HEAD (expecting **green**), and halts
the pipeline when any selected file fails that base-red → candidate-green contract.

**Why it is being removed.** Before PR #999 the `test-materialize` step produced a bounded, purposeful
set of newly materialized test files, and every one of them was expected to be base-red. After
`test-materialize` was absorbed into `implementer`, the gate lost that bounded input: its target set
became "every EB↔HEAD-changed file matching the test-file patterns", which now includes refactored,
renamed, incidentally touched and pre-existing test files. The gate kept the old assumption that every
selected file must be base-red, so any pre-existing green test that the implementer merely touched
produces a `failed` verdict and a false-positive halt. The gate no longer measures what it claims to
measure, and the cost of repairing it (target-set narrowing, per-file provenance, rename tracking)
exceeds the value it currently delivers.

**Current code surface** (inventory established by reading the repository):

- *Pipeline shape* — `src/core/pipeline/registry.ts`: `STANDARD_DESCRIPTOR.steps` entry
  `[STEP_NAMES.BITE_EVIDENCE, BiteEvidenceStep]` plus a `roles` entry
  (`{ role: "gate", phase: "impl" }`) and the module import.
  `src/core/pipeline/types.ts`: three `IMPLEMENTER / "success"` transition rows (two guarded by
  `isTestGenExempt` and `verificationFailedLast`, one falling through to `BITE_EVIDENCE`) plus four
  `BITE_EVIDENCE` rows (`passed`/`strategy-deferred` → verification, `failed`/`error` → escalate).
  `FAST_DESCRIPTOR` and `DESIGN_ONLY_DESCRIPTOR` never contained the step.
- *Step implementation* — `src/core/step/bite-evidence/` with five production modules
  (`step.ts`, `gate.ts`, `oids.ts`, `tamper.ts`, `test-file-selection.ts`) and seven test files under
  `__tests__/`.
- *Step naming* — `src/kernel/step-names.ts`: `STEP_NAMES.BITE_EVIDENCE` and membership in
  `CLI_STEP_NAMES`.
- *Assurance lattice* — `src/state/profile.ts`: `STANDARD_PROFILE.assurance.biteEvidence = "required"`,
  `AssuranceFloor.biteEvidence`, `BITE_EVIDENCE_RANK`, and the `satisfiesFloor` comparison branch.
- *Archive floor* — `src/core/archive/achieved-assurance.ts` imports `resolveEvidenceBaseRev`,
  `FORWARD_TYPES` and `selectMaterializedTestFiles` from the bite-evidence modules and re-executes the
  red/green measurement at final HEAD; `AssuranceProvenanceRuntime` is a `Pick` over four runtime
  methods; `merge-then-archive.ts` and `src/cli/archive.ts` wire the runtime and a `config` argument
  that exists only to scope those test runs.
- *Configuration* — `verification.scopedTestCommand`, `verification.scopedTestPatterns` and
  `archive.minimumAssurance.biteEvidence` in `src/config/schema/validation.ts` and
  `src/config/schema/types.ts`.
- *Runtime primitives* — `listChangedFilesBetweenCommits`, `runTestsAtCommit`,
  `runTestsOnSynthesizedTree` on the `RuntimeStrategy` port (and required on `RealRuntimeStrategy`),
  with roughly 310 lines of temp-worktree implementation in `src/core/runtime/local.ts` and
  unavailable stubs in `src/core/runtime/managed.ts`; the `IsolatedTestResult` type exists only for them.
- *Artifact plumbing* — `biteEvidenceResultPath` in `src/util/paths.ts`, its entry in
  `pipelineManagedPaths` (`src/core/pipeline/round-git-scope.ts`), and `bite-evidence-result.md`
  mentioned in operator-facing message text in `commit-push.ts`, `agent-runner.ts` (adapter and port).
- *Tamper-gate plumbing* — `authorizedCanonWriters` on `src/core/types.ts` and
  `src/core/port/step-types.ts`, two injection sites in `src/core/pipeline/run.ts`, and
  `authorizedCanonWriterSteps` in `src/core/resume/canon-provenance.ts`. These exist solely to feed the
  bite-evidence tamper check.
- *State write path* — `ParsedStepResult.biteEvidence`, `StepCompletion.biteEvidence` and its mapping,
  and the reflection into `state.biteEvidence` in `src/core/step/commit-orchestrator.ts`.
- *Documentation* — `README.md` pipeline list, `docs/configuration.md` scoped-test section,
  `src/prompts/pipeline-map.ts`, `specrunner/project.md`, and one now-false clause in
  `architecture/domain-model.md`.

**Constraints.**

1. Jobs already on disk must remain recoverable: `--from bite-evidence`, a saved
   `resumePoint.step === "bite-evidence"`, and a halted `state.step === "bite-evidence"` must all still
   resolve to a runnable step.
2. Persisted `biteEvidence` records and past journal entries must stay readable so state folds and PR
   attestations of old jobs still work.
3. The other two assurance dimensions (`testDerivation`, `specReview`) are unaffected and must keep
   their exact current archive-floor semantics.
4. `architecture/` and several other paths are CODEOWNERS-protected and out of the pipeline's normal
   write loop; edits there must be minimal and limited to statements that this change makes factually
   false.
5. `listCommitChangedFiles` is used by post-fix/prior-round/custom-reviewer context builders and must
   not be confused with the bite-evidence-only `listChangedFilesBetweenCommits`.

## Goals / Non-Goals

**Goals**:

- Remove `bite-evidence` from the STANDARD pipeline so `implementer` routes directly to `verification`
  for all outcomes that previously reached the gate.
- Delete the bite-evidence production code: step module, registry entry, step name, result artifact
  path, and pipeline-managed-path entry.
- Remove `biteEvidence` from `STANDARD_PROFILE.assurance` and from the assurance floor lattice.
- Remove the archive floor's biteEvidence achieved-provenance derivation and its re-execution of tests,
  keeping `testDerivation` and `specReview` derivation byte-for-byte equivalent.
- Remove `verification.scopedTestCommand` / `verification.scopedTestPatterns` and the three runtime
  primitives that only bite-evidence used.
- Turn `archive.minimumAssurance.biteEvidence` into an explicit configuration error rather than a
  silently ignored key.
- Keep legacy jobs recoverable and legacy state/journal data readable.
- Purge current-state descriptions of the step from README, configuration docs, prompt pipeline map and
  project docs; leave historical ADRs untouched.
- Clean up now-dead tests, fixtures and bite-specific naming.

**Non-Goals**:

- Designing a replacement red→green or mutation-based evidence mechanism.
- Improving test-coverage precision (TC ↔ assertion mapping).
- Changing the `testDerivation` scenario-freeze contract or the `specReview` binding contract.
- Touching runtime primitives that have consumers outside bite-evidence (notably
  `listCommitChangedFiles`, `readFileAtCommit`, `readRevisionContent`, `lastCommitTouchingPath`,
  `listWorktreeChanges`).
- Migrating or rewriting existing `state.json` / `events.jsonl` files.

## Decisions

### D1 — Collapse the implementer transition rows into one unconditional edge

The three `IMPLEMENTER / "success"` rows become a single unguarded
`implementer success → verification` row; the four `BITE_EVIDENCE` rows are deleted along with the
`implementer error → escalate` row being left as-is. The guard predicates `isTestGenExempt` and
`verificationFailedLast` are **not** deleted: `isTestGenExempt` still guards
`design success → spec-review`, and `verificationFailedLast` is read by `step-context-builder.ts` and
`implementer.ts`.

- **Rationale**: with the gate gone all three rows have the same destination, so keeping them would
  leave three semantically identical first-match-wins rows whose guards can never change the outcome —
  dead branching that future readers must re-derive. Deleting the *rows* while keeping the *functions*
  separates "this edge no longer needs a guard" from "this predicate is unused", and only the former is
  true.
- **Alternatives considered**: (a) keep the guarded rows and just retarget them — rejected, it
  preserves misleading structure and three code paths for one behavior; (b) delete the guard functions
  too — rejected, they have live non-transition consumers and removal would break typecheck;
  (c) keep `bite-evidence` as a no-op pass-through step — rejected, it leaves a visible step in the
  pipeline map and in operator-facing progress output that does nothing.

### D2 — Delete the entire `src/core/step/bite-evidence/` module and its artifact surface

The directory (five production modules plus its `__tests__/`), `STEP_NAMES.BITE_EVIDENCE`, the
`CLI_STEP_NAMES` membership, `biteEvidenceResultPath`, the `pipelineManagedPaths` entry and the
`bite-evidence-result.md` mentions in message text are all removed together.

- **Rationale**: the module is a closed subgraph — every export is consumed either inside the directory
  or by call sites this change also removes. The one exception is `matchesGlob`, which
  `test-file-selection.ts` merely re-exports from `src/util/glob-match.ts`; that utility stays where it
  is and other consumers are unaffected. Removing the step name in the same task keeps the type system
  as the checker: any missed reference becomes a compile error rather than a runtime surprise.
- **Alternatives considered**: (a) delete the step but keep `test-file-selection.ts` for future reuse —
  rejected, it would be an unreferenced module whose only other consumer (`achieved-assurance.ts`) is
  also being narrowed; YAGNI, and git history preserves it; (b) keep `STEP_NAMES.BITE_EVIDENCE` as a
  legacy constant — rejected, the legacy resume path (D8) uses a plain string key and does not need the
  constant, and keeping it would let new code accidentally reference a non-existent step.

Dropping `bite-evidence-result.md` from `pipelineManagedPaths` is safe: that list scopes which paths
the pipeline may write per round, and no step will write the file any more.

### D3 — Remove the `authorizedCanonWriters` plumbing

`authorizedCanonWriters` (on `core/types.ts` and `port/step-types.ts`), its two injection sites in
`src/core/pipeline/run.ts`, and `authorizedCanonWriterSteps` in `canon-provenance.ts` are deleted, after
a re-grep confirms no consumer survives. The remaining exports of `canon-provenance.ts` stay, and the
module's circular-import note is updated to drop the bite-evidence reference.

- **Rationale**: this data flows to exactly one consumer — the bite-evidence tamper check — so leaving
  it in place would leave a computed-and-threaded value that nothing reads, which is worse than dead
  code because it looks load-bearing.
- **Alternatives considered**: keeping it for a future tamper mechanism — rejected, no such mechanism is
  in scope and the concept would drift out of sync with the canon-provenance rules it derives from.

### D4 — Drop `biteEvidence` from the profile and floor lattice, keep the legacy state type

`STANDARD_PROFILE.assurance` becomes `{ testDerivation: "frozen", specReview: "required" }`.
`AssuranceFloor.biteEvidence`, `BITE_EVIDENCE_RANK`, the `satisfiesFloor` comparison branch and
`MinimumAssuranceConfig.biteEvidence` (type + zod field) are deleted. `ProfileAssurance` keeps its index
signature and `BiteEvidenceLevel` remains as a legacy-read-only type so old persisted profiles still
parse.

- **Rationale**: the floor is a *declared guarantee* lattice; a dimension nothing can achieve any more
  must not be declarable, or fail-closed evaluation would permanently reject. Keeping the read-side type
  is what preserves constraint 2. Legacy checkpoints remain attachable because `verify-checkpoint.ts`
  recomputes `policyDigest` from the *stored* profile body, never from `STANDARD_PROFILE`, so the
  digest change does not invalidate anything already written.
- **Alternatives considered**: (a) keep `biteEvidence: "optional"` in the standard profile — rejected,
  it declares a dimension with no producer and no evaluator, which is exactly the kind of stale
  guarantee this change exists to remove; (b) also delete `BiteEvidenceLevel` / `ProfileAssurance`
  named field — rejected, it would break parsing of already-persisted state.

### D5 — Narrow archive achieved-provenance to `specReview` + `testDerivation`

`deriveAchievedAssurance` loses its biteEvidence derivation (the EB resolution, forward-type check,
file selection and the two test executions). `AssuranceProvenanceRuntime` narrows from a four-method
`Pick` to `Pick<RuntimeStrategy, "readFileAtCommit">`, and the `config` input — which existed only to
scope those test runs — is dropped from the derivation input and from the `merge-then-archive.ts` and
`src/cli/archive.ts` wiring. Fail-closed behavior for the two remaining dimensions is unchanged.

- **Rationale**: the archive floor's job is to re-verify at final HEAD that the guarantees the profile
  declares actually hold. With the dimension gone there is nothing to re-verify, and the test execution
  it performed is precisely the false-positive-prone measurement being retired. Narrowing the `Pick`
  makes the reduced dependency explicit at the type level so the runtime methods can be deleted in D7
  without a second pass.
- **Alternatives considered**: (a) keep the derivation but ignore its result — rejected, it retains the
  slowest and most fragile part of archiving for no signal; (b) keep the wide `Pick` to minimize diff —
  rejected, it would block D7 and misrepresent the module's dependencies.

`MergeThenArchiveInput.config` is removed only if no other field of it is used by the archive path; if
another consumer exists it stays and only the derivation call drops the argument.

### D6 — Make `archive.minimumAssurance.biteEvidence` an explicit semantic error

A new post-schema check `checkRemovedAssuranceDimension(raw)` is registered in `runSemanticChecks`,
throwing `CONFIG_INVALID` when the key is present at all — including when set to `null` — with a message
that states the dimension was removed and tells the operator to delete the key.

- **Rationale**: the structural layer uses zod/v4-mini `object()`, which **strips** unknown keys, and
  `validateConfig` returns the raw object; simply deleting the schema field would therefore silently
  ignore a config that still declares a guarantee the tool can no longer provide — the exact
  false-assurance failure mode this change is meant to eliminate. The semantic-check layer already runs
  against the raw object for precisely this class of rule (see `checkStagingExclusionNamespace`), so this
  follows an established pattern rather than inventing one. Keying on *presence* rather than value
  catches `biteEvidence: "optional"` too, which would otherwise read as "intentionally relaxed".
- **Alternatives considered**: (a) a zod `never()` field — rejected, error messages would be generic and
  the check would not fire on `null` consistently; (b) warn and continue — rejected, a stale declared
  guarantee that no longer holds must fail closed; (c) silently strip — rejected, it is the current
  failure mode.

### D7 — Delete the scoped-test config keys and the three runtime primitives

`verification.scopedTestCommand`, `verification.scopedTestPatterns`, the port declarations of
`listChangedFilesBetweenCommits` / `runTestsAtCommit` / `runTestsOnSynthesizedTree` (both the optional
`RuntimeStrategy` members and the required `RealRuntimeStrategy` ones), their LocalRuntime
implementations, the ManagedRuntime stubs, and the `IsolatedTestResult` type are removed. Leftover
`verification.scopedTest*` keys in user configs are **ignored**, not rejected.

- **Rationale**: these primitives exist only to serve bite-evidence's isolated per-file execution; with
  the gate and the archive derivation gone they have no caller, and the LocalRuntime implementations
  carry real complexity (temp detached worktrees, `node_modules` symlinking) that is pure liability
  unused. The asymmetry with D6 is deliberate and is the line this design draws: keys that **declare a
  guarantee** must fail closed when the guarantee disappears, because ignoring them silently weakens a
  stated contract; keys that merely **scope execution** are inert once nothing executes, so rejecting
  them would break working configs for no safety gain.
- **Alternatives considered**: (a) reject `scopedTest*` too — rejected per the reasoning above, it is a
  gratuitous breaking change; (b) keep the runtime primitives as "possibly useful later" — rejected, an
  untested and uncalled ~310-line worktree manipulation path will rot; git history is the archive.

### D8 — One legacy alias entry covers every resume path

`"bite-evidence": STEP_NAMES.VERIFICATION` is added to `LEGACY_STEP_ALIASES` in
`src/core/resume/resolve-step.ts`. The resume usage text that advertises `bite-evidence` as a `--from`
target is removed from the command registry.

- **Rationale**: `resolveResumeStep` applies the alias map in all three of its branches (`--from`,
  `resumePoint.step`, `stateStep`), and `attach`'s `checkpoint-policy.ts` routes through the same
  function, so a single entry satisfies all of constraint 1 with no branch-specific handling.
  `verification` is the correct target because it is the step that formerly followed the gate on every
  non-escalating outcome — a job halted at the gate resumes exactly where it would have gone.
  This mirrors the existing `build-fixer` / `test-materialize` entries, so the mechanism is proven.
- **Alternatives considered**: (a) special-case each call site — rejected, three copies of one rule;
  (b) alias to `implementer` — rejected, it would redundantly re-run implementation work that already
  succeeded before the gate ran; (c) reject the legacy value with a helpful error — rejected, it
  violates constraint 1 and strands in-flight jobs.

### D9 — Keep the read path for legacy evidence, delete the write path

`JobState.biteEvidence`, `BiteEvidenceRecord`, the array validation in `state/schema/operations.ts`, the
`"strategy-deferred"` member of the `Verdict` union, and reopen-time preservation of the field all stay,
documented as legacy-read-only. `ParsedStepResult.biteEvidence`, `StepCompletion.biteEvidence` (field and
mapping) and the reflection in `commit-orchestrator.ts` are deleted so nothing can newly produce records.

- **Rationale**: this is the minimal split that satisfies constraint 2 while making the invariant
  "records are historical" enforceable by the type system — with no producer, any future `biteEvidence`
  data can only have come from an older run. The journal fold and `buildAttestation` are step-name
  agnostic, so old `bite-evidence` step-attempt entries continue to fold and render without special
  handling. `"strategy-deferred"` must remain in `Verdict` because old journal entries carry it.
- **Alternatives considered**: (a) delete the state field entirely — rejected, existing `state.json`
  files would fail validation on resume; (b) keep the write path unused — rejected, it leaves a way to
  reintroduce data that nothing evaluates.

### D10 — Documentation edits limited to current-state descriptions

`README.md`'s pipeline list is renumbered without the gate (and its already-stale `test-materialize` /
`build-fixer` entries corrected while the list is being edited), `docs/configuration.md` loses the
scoped-test section and gains a short "removed keys" note explaining the `minimumAssurance.biteEvidence`
error and the ignored `scopedTest*` keys, `src/prompts/pipeline-map.ts` loses its row, and
`specrunner/project.md` loses its mention. In `architecture/`, only the single clause in
`domain-model.md` that this change makes factually false is edited; `dynamic-model.md` and
`divergence-status.md` are left alone, as are all ADRs.

- **Rationale**: `PIPELINE_MAP` is the single source of truth that agent prompts render from, so it must
  match the descriptor or every agent prompt describes a step that cannot run. Conversely `architecture/`
  is CODEOWNERS-protected and outside the pipeline's write loop (constraint 4), and its other mentions
  remain *true* — the legacy record ledger really is still retained, and divergence-status is a
  historical log. Editing only the false clause respects the ownership boundary while keeping the docs
  honest. ADRs are immutable historical decisions and are never rewritten.
- **Alternatives considered**: (a) sweep every occurrence of the word across all docs — rejected, it
  would rewrite history and cross an ownership boundary; (b) touch no architecture docs at all —
  rejected, it would leave a statement that is now demonstrably false.

### D11 — Four-way test triage

Existing tests are sorted into: **delete** (suites whose subject no longer exists — the
`bite-evidence/__tests__` files, the pipeline bite-evidence suites, the runtime isolated/scoped/
synthesized-tree/changed-files suites, the scoped config suites, the sole-committer bite suite);
**retarget** (suites that assert surrounding behavior and must be updated to the new expectation —
transition-table suites, floor/`satisfiesFloor` suites, minimum-assurance schema and CLI suites,
achieved-assurance suites reduced to two dimensions, the prompt skeleton drift guard's pipeline-map
assertion); **keep** (legacy-compat suites asserting that old records still parse); and **add** (new
regression coverage for the routing collapse, the legacy resume alias, and the new config error).

- **Rationale**: deleting a suite is only correct when its subject is gone; a suite that merely *mentions*
  the step while asserting a still-live invariant must be retargeted, or the change silently drops
  coverage. Naming the four buckets explicitly prevents the implementer from defaulting to "delete
  anything that greps for `bite`", which would take the legacy-compat guarantees with it.
- **Alternatives considered**: blanket deletion of every matching file — rejected for exactly that reason.

### D12 — Rename away bite-specific vocabulary that outlives the deletion

Identifiers whose names only make sense under the bite model — `materializedTestFiles` and any local
variables carrying it — are renamed or removed at their remaining sites; `selectMaterializedTestFiles`,
`DEFAULT_SCOPED_TEST_PATTERNS`, `FORWARD_TYPES` and `resolveEvidenceBaseRev` disappear with their module.
A final grep sweep for `bite`, `scopedTest` and `materializedTestFiles` confirms only intentional legacy
references remain.

- **Rationale**: leftover vocabulary from a removed model is how a deleted concept gets reintroduced;
  the grep sweep is the cheap, mechanical check that the removal is actually complete.
- **Alternatives considered**: relying on typecheck alone — rejected, it cannot catch stale names in
  strings, comments and docs.

### D13 — Legacy-journal attestation compatibility regression test (operator-apply, PR review)

**Decision**: Add a dedicated regression test (`TC-ATT-08`) that folds a synthetic journal
containing a legacy `bite-evidence` step-attempt (including the legacy-only
`strategy-deferred` verdict) and asserts that `buildAttestation` surfaces the historical
gate in `gates` with its original verdict and chronological position.

**Rationale**: D9 retains the legacy read path, and this PR's own attestation demonstrated
it works today — but no automated test pinned the contract, so a future change to
`fold` / `buildAttestation` (e.g. filtering gates to known step names, or narrowing the
`Verdict` union without the legacy member) could silently break historical attestations.
The test encodes the D9 guarantee as a `must` regression.

**Scope**: pure-function test on `buildAttestation` (journal → gates); no runtime or
state-schema surface involved. Added retroactively from PR #1098 review (P2).

## Risks / Trade-offs

- [Loss of hollow-test detection] Nothing will detect a test that passes against the pre-change tree →
  Mitigation: the gate was already producing false positives on its post-#999 input, so the signal being
  lost is unreliable rather than correct; `testDerivation` (scenario freeze) and `specReview` floors are
  retained, and a replacement mechanism is explicitly deferred to a future change (Open Questions).
- [In-flight jobs stranded] A job halted at `bite-evidence` could become unresumable →
  Mitigation: D8's alias covers `--from`, `resumePoint.step`, `state.step` and attach through one shared
  resolver; a regression test asserts all three paths.
- [Legacy state rejected] Removing types could make old `state.json` unparseable →
  Mitigation: D9 keeps the record type, the array validation and the `"strategy-deferred"` verdict, with
  a retained legacy-compat suite proving it.
- [policyDigest churn] `STANDARD_PROFILE`'s digest changes →
  Mitigation: `verify-checkpoint` recomputes from the stored body, so existing checkpoints self-verify;
  no state migration is required.
- [Breaking existing configs] Configs declaring `minimumAssurance.biteEvidence` now hard-fail →
  Mitigation: deliberate (D6); the error message names the key and the fix, and the Migration Plan and
  `docs/configuration.md` document it.
- [CODEOWNERS-protected paths] `architecture/`, `src/core/pipeline/`, `src/core/step/`,
  `tests/unit/architecture/` and `tests/unit/contract/` require owner review →
  Mitigation: edits to those paths are minimal and confined to statements/entries this change makes
  false; the PR should call them out explicitly for review.
- [Managed-path shrink] Removing `bite-evidence-result.md` from `pipelineManagedPaths` narrows what the
  pipeline may write per round → Mitigation: no step writes it after this change; a stale file in an old
  worktree is inert.
- [Large deletion volume] The change removes many files at once, raising the chance of a missed
  reference → Mitigation: `typecheck` + `lint` + full `test` plus the D12 grep sweep are required
  acceptance criteria on the final task.
- [Silently ignored `scopedTest*` keys] An operator may not notice their config is inert →
  Mitigation: documented in `docs/configuration.md`'s removed-keys note; deliberate per D7's
  declare-vs-scope distinction.

## Open Questions

- Should `verification.scopedTest*` eventually become a hard error too, or stay permanently ignored?
  D7 chooses ignore for now; a later deprecation pass could revisit it.
- How long should `"strategy-deferred"` remain in the `Verdict` union? It is legacy-only after this
  change and could be dropped once a journal-compatibility horizon is defined.
- Should `ProfileAssurance.biteEvidence` / `BiteEvidenceLevel` eventually be dropped, and if so what
  signals that no readable state carries the field any more?
- Is a replacement necessity-evidence mechanism wanted at all, or is `testDerivation` freeze plus review
  considered sufficient going forward?

## Migration Plan

1. **Configuration** — operators MUST delete `archive.minimumAssurance.biteEvidence` from
   `.specrunner.json` (or equivalent) before upgrading; otherwise config validation fails with
   `CONFIG_INVALID` naming the key. `verification.scopedTestCommand` and
   `verification.scopedTestPatterns` may be removed at leisure; they are ignored if left.
2. **In-flight jobs** — a job halted at or resumed from `bite-evidence` continues at `verification`
   automatically; no manual state editing is needed.
3. **Persisted state** — no migration. Existing `biteEvidence` records and journal entries remain
   readable; no new records are produced.
4. **Rollback** — the change is a pure revert: restoring the commit restores the step, the profile
   dimension, the config keys and the runtime primitives. Because no persisted data format changes,
   state written while the change is deployed remains valid after a revert (it simply lacks
   `biteEvidence` records, which the pre-change code already treats as optional).
