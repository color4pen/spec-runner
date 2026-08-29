# Tasks: Remove the bite-evidence feature

Execution note: T-01 through T-09 will not typecheck individually — the deletion spans several modules
and the compiler only goes green once T-01…T-09 are complete. Run `bun run typecheck` after T-09, and
run the full `typecheck` + `lint` + `test` triad in T-13. Do not "fix" intermediate compile errors by
reintroducing removed symbols.

## T-01: Collapse the implementer transition and drop the gate from the descriptor

- [x] In `src/core/pipeline/types.ts`, delete the two guarded `IMPLEMENTER / "success"` rows (the
      `isTestGenExempt` one and the `verificationFailedLast` one) and retarget the remaining
      `IMPLEMENTER / "success"` row to `STEP_NAMES.VERIFICATION`, so exactly one unguarded row remains.
- [x] Delete the four `STEP_NAMES.BITE_EVIDENCE` transition rows (`passed`, `strategy-deferred`,
      `failed`, `error`) and the section comment above them.
- [x] Leave `{ step: STEP_NAMES.IMPLEMENTER, on: "error", to: "escalate" }` unchanged.
- [x] Do NOT delete the `isTestGenExempt` or `verificationFailedLast` predicate functions —
      `isTestGenExempt` still guards `design success → spec-review`, and `verificationFailedLast` is read
      by `src/core/step/step-context-builder.ts` and `src/core/step/implementer.ts`. Verify both remain
      referenced with a grep before finishing.
- [x] In `src/core/pipeline/registry.ts`, remove the `[STEP_NAMES.BITE_EVIDENCE, BiteEvidenceStep]` entry
      from `STANDARD_DESCRIPTOR.steps`, the `[STEP_NAMES.BITE_EVIDENCE]` entry from `roles`, and the
      `BiteEvidenceStep` import.
- [x] Leave `FAST_DESCRIPTOR` and `DESIGN_ONLY_DESCRIPTOR` untouched (they never contained the step).
- [x] In `src/kernel/step-names.ts`, remove `BITE_EVIDENCE` from `STEP_NAMES` and `"bite-evidence"` from
      `CLI_STEP_NAMES`.

**Acceptance Criteria**:
- `STANDARD_DESCRIPTOR` step order places `verification` immediately after `implementer`, with no
  `bite-evidence` entry in `steps` or `roles`.
- Exactly one transition row has source `implementer` and outcome `success`, it has no `when` guard, and
  its destination is `verification`.
- No transition row references `bite-evidence` as source or destination.
- `STEP_NAMES.BITE_EVIDENCE` and the `CLI_STEP_NAMES` membership no longer exist.
- `isTestGenExempt` and `verificationFailedLast` still exist and are still referenced by their non-transition
  consumers.
- Satisfies spec requirements "The implementer step shall route directly to verification" and
  "bite-evidence shall not be a registered pipeline step".

## T-02: Delete the bite-evidence step module and its artifact surface

- [x] Delete the directory `src/core/step/bite-evidence/` in full, including `step.ts`, `gate.ts`,
      `oids.ts`, `tamper.ts`, `test-file-selection.ts` and the entire `__tests__/` subdirectory.
- [x] Confirm before deleting that `matchesGlob` is only *re-exported* by `test-file-selection.ts` and
      actually lives in `src/util/glob-match.ts`; leave `src/util/glob-match.ts` in place and, if any
      consumer imported `matchesGlob` through the bite-evidence module, repoint it at
      `src/util/glob-match.ts`.
- [x] Remove `biteEvidenceResultPath` from `src/util/paths.ts`.
- [x] Remove the `biteEvidenceResultPath` entry from `pipelineManagedPaths` in
      `src/core/pipeline/round-git-scope.ts`.
- [x] Remove the `bite-evidence-result.md` references from the operator-facing message text in
      `src/core/step/commit-push.ts`, `src/adapter/claude-code/agent-runner.ts` and
      `src/core/port/agent-runner.ts`, keeping the surrounding messages grammatical (drop the artifact from
      the list rather than leaving a dangling separator).

**Acceptance Criteria**:
- `src/core/step/bite-evidence/` does not exist.
- No module imports from `src/core/step/bite-evidence/*`.
- `biteEvidenceResultPath` is not defined or referenced anywhere.
- `pipelineManagedPaths` contains no entry for `bite-evidence-result.md`.
- No source file contains the literal `bite-evidence-result.md`.
- `src/util/glob-match.ts` still exists and its other consumers still resolve.
- Satisfies spec requirement "The pipeline shall not manage a bite-evidence result artifact".

## T-03: Remove the authorizedCanonWriters plumbing

- [x] Grep for `authorizedCanonWriters` and `authorizedCanonWriterSteps` and confirm the only remaining
      consumers were inside the module deleted in T-02. If any other consumer exists, stop and keep the
      field, noting it in the PR description.
- [x] Remove `authorizedCanonWriters` from `src/core/types.ts`.
- [x] Remove `authorizedCanonWriters` from `ParsedStepResult`'s surrounding type in
      `src/core/port/step-types.ts`.
- [x] Remove both injection sites of `authorizedCanonWriters` in `src/core/pipeline/run.ts`.
- [x] Remove `authorizedCanonWriterSteps` from `src/core/resume/canon-provenance.ts`, keeping every other
      export of that module intact.
- [x] Update the circular-import explanation comment at the top of `canon-provenance.ts` so it no longer
      cites bite-evidence as the reason for the module's shape; describe the remaining reason instead, or
      remove the note if bite-evidence was the only reason.

**Acceptance Criteria**:
- `authorizedCanonWriters` and `authorizedCanonWriterSteps` appear nowhere in `src/`.
- All other exports of `src/core/resume/canon-provenance.ts` are unchanged and still consumed.
- The `canon-provenance.ts` header comment contains no stale bite-evidence reference.

## T-04: Remove biteEvidence from the profile and floor lattice

- [x] In `src/state/profile.ts`, change the standard profile body's assurance to
      `{ testDerivation: "frozen", specReview: "required" }` (remove the `biteEvidence` key). The
      `policyDigest` is computed from the body, so it changes automatically — do not hardcode a digest.
- [x] Remove the `biteEvidence` member from the `AssuranceFloor` type.
- [x] Remove the `BITE_EVIDENCE_RANK` constant.
- [x] Remove the `biteEvidence` comparison branch from `satisfiesFloor`, leaving the `testDerivation` and
      `specReview` branches and the fail-closed default behavior exactly as they are.
- [x] In `src/config/schema/types.ts`, remove `biteEvidence` from `MinimumAssuranceConfig`.
- [x] In `src/config/schema/validation.ts`, remove the `biteEvidence` field from the `minimumAssurance`
      zod object.
- [x] Do NOT remove `BiteEvidenceLevel` or the named `biteEvidence` member of `ProfileAssurance` in
      `src/state/schema/types.ts` — they are retained as legacy-read-only (see T-09).
- [x] Confirm `src/core/attach/verify-checkpoint.ts` compares the stored `policyDigest` against a digest
      recomputed from the *stored* profile body (not from the standard profile constant), so legacy
      checkpoints still verify. Do not change it; just verify and note it in the PR description.

**Acceptance Criteria**:
- The standard profile declares exactly `testDerivation` and `specReview`.
- `AssuranceFloor`, `BITE_EVIDENCE_RANK` and the `satisfiesFloor` biteEvidence branch are gone.
- `MinimumAssuranceConfig` and its zod schema have no `biteEvidence` field.
- `BiteEvidenceLevel` and `ProfileAssurance.biteEvidence` still exist.
- `satisfiesFloor` remains fail-closed for `testDerivation` and `specReview`.
- Satisfies part of spec requirement "The archive floor shall evaluate only testDerivation and specReview".

## T-05: Narrow archive achieved-assurance derivation to two dimensions

- [x] In `src/core/archive/achieved-assurance.ts`, remove the entire biteEvidence derivation: the
      Evidence Base resolution, the forward-type check, the test-file selection, both test executions and
      the assembly of the biteEvidence result.
- [x] Remove the imports of `resolveEvidenceBaseRev`, `FORWARD_TYPES` and `selectMaterializedTestFiles`.
- [x] Narrow `AssuranceProvenanceRuntime` to `Pick<RuntimeStrategy, "readFileAtCommit">`.
- [x] Remove the `config` field from the derivation input type and from the function body; it existed only
      to scope the removed test runs.
- [x] Leave the `specReview` (spec.md blob-hash binding) and `testDerivation` (test-cases.md scenario
      freeze) derivations byte-for-byte equivalent in behavior, including their fail-closed paths.
- [x] In `src/core/archive/merge-then-archive.ts`, stop passing `config` to `deriveAchievedAssurance`.
      Remove `MergeThenArchiveInput.config` only if no other code in the archive path reads it; if another
      reader exists, keep the field and only drop the argument at the derivation call.
- [x] In `src/cli/archive.ts`, drop the now-unused wiring: the `config` argument if the field was removed,
      and narrow or simplify the `assuranceRuntime` construction to what `readFileAtCommit` requires.
- [x] Keep the floor gate structure in `merge-then-archive.ts` (the `protectedPaths` destructure and the
      `satisfiesFloor` call) intact.

**Acceptance Criteria**:
- `deriveAchievedAssurance` returns results for `testDerivation` and `specReview` only.
- `AssuranceProvenanceRuntime` is `Pick<RuntimeStrategy, "readFileAtCommit">`.
- Archive derivation invokes no test-execution runtime method.
- `achieved-assurance.ts` imports nothing from `src/core/step/bite-evidence/`.
- Archiving with a floor requiring `specReview` still blocks when `specReview` cannot be established.
- Satisfies spec requirement "The archive floor shall evaluate only testDerivation and specReview".

## T-06: Reject archive.minimumAssurance.biteEvidence as a semantic config error

- [x] In `src/config/schema/validation.ts`, add a post-schema check function
      `checkRemovedAssuranceDimension(raw)` modeled on the existing `checkStagingExclusionNamespace`.
- [x] The check MUST fire on *presence* of the key `archive.minimumAssurance.biteEvidence` in the raw
      object — using a key-presence test, not a truthiness test — so that `"required"`, `"optional"` and
      `null` all fail.
- [x] Throw an error created in the established style
      (`Object.assign(new Error("CONFIG_INVALID: ..."), { code: "CONFIG_INVALID" })`) whose message names
      the full key path, states that the bite-evidence assurance dimension was removed, and instructs the
      operator to delete the key.
- [x] Register the check in `runSemanticChecks` alongside the existing checks.
- [x] Verify that a config omitting the key still validates, and that `testDerivation` / `specReview`
      under `minimumAssurance` are unaffected.

**Acceptance Criteria**:
- Validating a config with `archive.minimumAssurance.biteEvidence` set to `"required"`, `"optional"` or
  `null` throws an error with `code === "CONFIG_INVALID"` whose message contains
  `archive.minimumAssurance.biteEvidence`.
- Validating a config whose `minimumAssurance` declares only `testDerivation` and `specReview` succeeds.
- The new check is invoked from `runSemanticChecks`.
- Satisfies spec requirement "Declaring the removed assurance dimension shall be a configuration error".

## T-07: Delete the scoped-test config keys and bite-evidence-only runtime primitives

- [x] Remove `scopedTestCommand` and `scopedTestPatterns` from `VerificationConfig` in
      `src/config/schema/types.ts` and from the verification zod block in
      `src/config/schema/validation.ts`. Do NOT add a semantic check for them — leftover keys are
      intentionally ignored (design D7).
- [x] In `src/core/port/runtime-strategy.ts`, remove the optional declarations of
      `listChangedFilesBetweenCommits`, `runTestsAtCommit` and `runTestsOnSynthesizedTree` from
      `RuntimeStrategy`, and their required counterparts from `RealRuntimeStrategy`.
- [x] Remove the `IsolatedTestResult` type once confirmed it has no remaining referent.
- [x] Remove the three implementations from `src/core/runtime/local.ts`, including the temp detached
      worktree creation, the `node_modules` symlinking and any helper used only by them.
- [x] Remove the three unavailable stubs from `src/core/runtime/managed.ts`.
- [x] Explicitly KEEP `listCommitChangedFiles` (used by `post-fix-context.ts`,
      `prior-round-context.ts`, `custom-reviewer-round-context.ts`), `readFileAtCommit`,
      `readRevisionContent`, `lastCommitTouchingPath` and `listWorktreeChanges`. Do not confuse
      `listCommitChangedFiles` with the removed `listChangedFilesBetweenCommits`.

**Acceptance Criteria**:
- `scopedTestCommand` and `scopedTestPatterns` are absent from the config types and schema, and a config
  still containing them validates successfully with no effect.
- `listChangedFilesBetweenCommits`, `runTestsAtCommit`, `runTestsOnSynthesizedTree` and
  `IsolatedTestResult` appear nowhere in `src/`.
- `listCommitChangedFiles`, `readFileAtCommit`, `readRevisionContent`, `lastCommitTouchingPath` and
  `listWorktreeChanges` are still declared and still implemented in both runtimes.
- No temp-worktree helper remains that is referenced only by the removed methods.
- Satisfies spec requirement "bite-evidence-only configuration and runtime surface shall be removed".

## T-08: Add the legacy resume alias for bite-evidence

- [x] In `src/core/resume/resolve-step.ts`, add `"bite-evidence": STEP_NAMES.VERIFICATION` to
      `LEGACY_STEP_ALIASES`, alongside the existing `build-fixer` and `test-materialize` entries.
- [x] Confirm the alias map is applied in all three branches of `resolveResumeStep` (explicit `from`,
      `resumePoint.step`, `stateStep`) so a single entry covers every path; do not add branch-specific
      handling.
- [x] Confirm `src/core/attach/checkpoint-policy.ts` and `src/core/command/resume.ts` route through
      `resolveResumeStep` and therefore inherit the alias.
- [x] Remove `bite-evidence` from any `--from` usage/help text in the command registry that advertises it
      as a resume target (the alias keeps working; it is simply no longer advertised).

**Acceptance Criteria**:
- `LEGACY_STEP_ALIASES` maps `"bite-evidence"` to `verification`.
- Resuming with `--from bite-evidence`, with a persisted `resumePoint.step === "bite-evidence"`, and with
  a halted `state.step === "bite-evidence"` each resolve to `verification` without error.
- Attaching to a checkpoint recorded at `bite-evidence` resolves to `verification`.
- No CLI help text lists `bite-evidence` as a resume target.
- Satisfies spec requirement "Legacy bite-evidence resume targets shall resolve to verification".

## T-09: Remove the biteEvidence write path, keep the read path

- [x] Remove the `biteEvidence` field from `ParsedStepResult` in `src/core/port/step-types.ts`.
- [x] Remove the `biteEvidence` field and its mapping from `src/core/step/step-completion.ts`.
- [x] Remove the reflection of `biteEvidence` into job state in `src/core/step/commit-orchestrator.ts`.
- [x] KEEP `JobState.biteEvidence`, `BiteEvidenceRecord` (including its optional `baseRef`,
      `candidateOid`, `testHash` members) and `BiteEvidenceLevel` in `src/state/schema/types.ts`; add a
      short comment marking them legacy-read-only with no producer.
- [x] KEEP the `biteEvidence` array validation in `src/state/schema/operations.ts` and add the same
      legacy-read-only comment.
- [x] KEEP `"strategy-deferred"` in the `Verdict` union — historical journal entries carry it — and
      comment it as legacy-only.
- [x] KEEP any reopen-time preservation of `state.biteEvidence`.
- [x] Verify that the journal fold and attestation builder are step-name agnostic and require no change
      to handle historical `bite-evidence` step attempts.

**Acceptance Criteria**:
- No code path can write a `biteEvidence` record: `ParsedStepResult`, `StepCompletion` and the
  commit-orchestrator reflection no longer carry the field.
- A `state.json` containing a non-empty `biteEvidence` array validates and round-trips unchanged.
- An `events.jsonl` containing `bite-evidence` step attempts, including a `strategy-deferred` verdict,
  folds successfully and appears in the generated attestation.
- Satisfies spec requirement "Legacy bite-evidence state and journal data shall remain readable".
- Run `bun run typecheck` at the end of this task; it must pass now that T-01…T-09 are complete.

## T-10: Update documentation and the prompt pipeline map

- [x] In `README.md`, remove the `bite-evidence` entry from the pipeline step list and renumber the list
      contiguously. While editing, also correct the already-stale entries: `test-materialize` and
      `build-fixer` are no longer separate steps (both were absorbed into `implementer`).
- [x] In `docs/configuration.md`, delete the `verification.scopedTestPatterns` section (including the
      closing sentence that cross-references `archive.minimumAssurance.biteEvidence`).
- [x] In `docs/configuration.md`, add a short "Removed keys" note stating that
      `archive.minimumAssurance.biteEvidence` is now rejected with a `CONFIG_INVALID` error and must be
      deleted, and that `verification.scopedTestCommand` / `verification.scopedTestPatterns` are ignored
      if left in place.
- [x] In `src/prompts/pipeline-map.ts`, remove the `bite-evidence` row so the map matches
      `STANDARD_DESCRIPTOR`.
- [x] In `specrunner/project.md`, remove the `bite-evidence` mention.
- [x] Do NOT modify any ADR under the ADR directory.

**Acceptance Criteria**:
- The README pipeline list omits `bite-evidence`, is contiguously numbered, and no longer lists
  `test-materialize` or `build-fixer` as separate steps.
- `docs/configuration.md` documents no scoped-test keys and contains the removed-keys note.
- `src/prompts/pipeline-map.ts` agrees with `STANDARD_DESCRIPTOR`'s step list.
- `specrunner/project.md` contains no `bite-evidence` mention.
- No ADR file is modified.
- Satisfies spec requirement "Current-state documentation shall match the pipeline".

## T-11: Minimal architecture-doc correction and arch-allowlist cleanup

- [x] In `architecture/domain-model.md`, edit ONLY the clause that this change makes factually false
      (the statement describing bite-evidence as an active gate in the current pipeline). Leave every
      other mention alone.
- [x] Do NOT modify `architecture/dynamic-model.md` (its statement about the retained legacy record
      ledger remains true) or `architecture/divergence-status.md` (a historical log).
- [x] In `tests/unit/architecture/arch-allowlist.ts`, remove the allowlist entry whose `file` is
      `src/core/step/bite-evidence/step.ts` (tracking id `CWD-bite-evidence-step-di-default`).
- [x] Note in the PR description that `architecture/`, `tests/unit/architecture/`,
      `tests/unit/contract/`, `src/core/pipeline/` and `src/core/step/` are CODEOWNERS-protected and
      require owner review.

**Acceptance Criteria**:
- `architecture/domain-model.md` contains no statement asserting bite-evidence is an active pipeline gate.
- `architecture/dynamic-model.md`, `architecture/divergence-status.md` and all ADRs are unmodified.
- The arch-allowlist has no entry referencing a non-existent file, and the allowlist test passes.

## T-12: Triage the existing test suite

- [x] **Delete** suites whose subject no longer exists: everything under
      `src/core/step/bite-evidence/__tests__/`;
      `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts`;
      the runtime suites `bite-evidence-e2e-gate`, `bite-evidence-isolated-exec`,
      `bite-evidence-scoped-exec`, `evidence-base-e2e`, `synthesized-tree-exec` and
      `list-changed-files-between-commits` under `src/core/runtime/__tests__/`;
      `src/config/__tests__/verification-scoped-command.test.ts` and
      `src/config/__tests__/verification-scoped-patterns.test.ts`;
      `tests/unit/pipeline/pipeline-sole-committer-bite-evidence.test.ts`;
      `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` (imports
      `authorizedCanonWriterSteps` from `canon-provenance.ts` which T-03 removes).
- [x] **Retarget** suites that assert still-live surrounding behavior: the pipeline transition-table
      suites (expect `implementer success → verification` unconditionally, no bite-evidence rows);
      `tests/unit/state/satisfies-floor.test.ts` (two dimensions);
      `tests/unit/config/schema-minimum-assurance.test.ts` and
      `tests/unit/cli/archive-minimum-assurance.test.ts` (the key now errors);
      the `tests/unit/core/archive/achieved-assurance-*.test.ts` suites (two dimensions, no test
      execution, narrowed runtime fake);
      `tests/unit/core/archive/merge-then-archive-floor*.test.ts` (updated wiring);
      `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` (the TC-034 assertion that the pipeline
      map places bite-evidence between implementer and verification must become an
      implementer→verification assertion).
- [x] **Keep unchanged** the legacy-compat suites `src/state/__tests__/bite-evidence-schema.test.ts` and
      `tests/unit/state/bite-evidence-record-schema.test.ts` — they prove constraint 2 and must still pass.
- [x] Delete any fixture files referenced only by the deleted suites.
- [x] Do not delete a suite merely because it greps for `bite`; check whether it asserts a still-live
      invariant first.

**Acceptance Criteria**:
- The full suite passes with no skipped or `.only` tests.
- Both legacy-compat suites still exist and pass unmodified.
- No test file imports from `src/core/step/bite-evidence/`.
- No orphaned fixture remains that was referenced only by a deleted suite.

## T-13: Add regression coverage and run the final verification sweep

- [x] Add a test asserting the transition collapse: `implementer` + `success` resolves to `verification`
      for a normal type, a test-gen-exempt type, and after a prior verification failure.
- [x] Add a test asserting `bite-evidence` is absent from `STANDARD_DESCRIPTOR.steps` and `roles`, and
      that `verification` immediately follows `implementer`.
- [x] Add a test asserting the legacy resume alias resolves to `verification` from all three paths
      (`--from`, `resumePoint.step`, `state.step`).
- [x] Add a test asserting `archive.minimumAssurance.biteEvidence` produces a `CONFIG_INVALID` error for
      `"required"`, `"optional"` and `null`, and that omitting the key validates.
- [x] Add a test asserting `deriveAchievedAssurance` succeeds with a runtime fake exposing only
      `readFileAtCommit` and returns results for exactly `testDerivation` and `specReview`.
- [x] Add a test asserting a config retaining `verification.scopedTestCommand` /
      `verification.scopedTestPatterns` still validates successfully.
- [x] Rename or remove leftover bite-specific vocabulary at any remaining site — `materializedTestFiles`
      and similar local names — so no identifier outside the retained legacy types carries the removed
      model's terminology.
- [x] Run a grep sweep for `bite`, `scopedTest`, `materializedTestFiles`, `strategy-deferred`,
      `Evidence Base` and `evidenceBase`; every surviving hit must be an intentional legacy-read-only
      reference (state types, operations validation, `Verdict` union, the resume alias, the retained
      legacy-compat suites) or an untouched historical document.
- [x] Run `bun run typecheck`, `bun run lint` and `bun run test`.

**Acceptance Criteria**:
- `bun run typecheck` passes with no errors.
- `bun run lint` passes with zero warnings.
- `bun run test` passes with no failures and no skipped tests.
- Every new regression test above exists and passes.
- The grep sweep produces no unintentional survivors; each remaining hit is justifiable as legacy-read
  compatibility or historical documentation.
- All spec requirements have at least one corresponding passing test.

## T-17: PR #1098 レビュー対応（operator-apply）

- [x] `docs/configuration.md` の Removed keys 節の時制を修正（`removed in a prior release` →
      `have been removed` — 削除するのは本 PR 自身であり、リリース時点に依存しない表現へ）。
- [x] legacy journal 互換の回帰テストを追加（TC-ATT-08）: `bite-evidence` step-attempt
      （`strategy-deferred` / `failed` verdict）を含む合成 journal を fold →
      `buildAttestation` → `gates` に元 verdict のまま時系列順で現れることを assert
      （design D13、ADR-20260829 D9 の契約の pin）。

**Acceptance Criteria**:
- `tests/unit/core/attestation/build-attestation.test.ts` の TC-ATT-08 が pass する。
- typecheck / lint / 既存テストに回帰がない。
