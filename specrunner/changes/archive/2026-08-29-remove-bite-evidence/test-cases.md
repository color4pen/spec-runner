# Test Cases: Remove the bite-evidence feature

## Summary

- **Total**: 45 cases
- **Automated** (unit/integration): 37
- **Manual**: 7
- **Priority**: must: 27, should: 16, could: 2

---

### TC-001: Normal implementation success routes to verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The implementer step shall route directly to verification > Scenario: normal implementation success

---

### TC-002: Test-gen exempt type routes to verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The implementer step shall route directly to verification > Scenario: test-gen exempt type

---

### TC-003: Re-entry after verification failure routes to verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The implementer step shall route directly to verification > Scenario: re-entry after a verification failure

---

### TC-004: Implementer error still escalates

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The implementer step shall route directly to verification > Scenario: implementer error still escalates

---

### TC-005: STANDARD descriptor no longer contains bite-evidence step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence shall not be a registered pipeline step > Scenario: descriptor no longer contains the step

---

### TC-006: Prompt pipeline map matches the descriptor

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence shall not be a registered pipeline step > Scenario: prompt pipeline map matches the descriptor

---

### TC-007: Explicit --from bite-evidence resolves to verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Legacy bite-evidence resume targets shall resolve to verification > Scenario: explicit --from flag

---

### TC-008: Persisted resumePoint.step of bite-evidence resolves to verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Legacy bite-evidence resume targets shall resolve to verification > Scenario: persisted resume point

---

### TC-009: Halted state.step of bite-evidence resolves to verification

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Legacy bite-evidence resume targets shall resolve to verification > Scenario: halted state step

---

### TC-010: Legacy state.json with biteEvidence record array parses successfully

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Legacy bite-evidence state and journal data shall remain readable > Scenario: legacy state parses

---

### TC-011: Legacy journal with bite-evidence step entries and strategy-deferred verdict folds and renders attestation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Legacy bite-evidence state and journal data shall remain readable > Scenario: legacy journal folds

---

### TC-012: Completed pipeline job writes no new biteEvidence record

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Legacy bite-evidence state and journal data shall remain readable > Scenario: no new records are produced

---

### TC-013: Config with biteEvidence set to "required" fails with CONFIG_INVALID

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Declaring the removed assurance dimension shall be a configuration error > Scenario: key present with a level value

---

### TC-014: Config with biteEvidence set to "optional" fails with CONFIG_INVALID

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Declaring the removed assurance dimension shall be a configuration error > Scenario: key present with a relaxed value

---

### TC-015: Config with only testDerivation and specReview in minimumAssurance validates successfully

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Declaring the removed assurance dimension shall be a configuration error > Scenario: key absent

---

### TC-016: Archive achieved-assurance derivation invokes no test execution

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The archive floor shall evaluate only testDerivation and specReview > Scenario: derivation runs no tests

---

### TC-017: Standard profile declares exactly testDerivation and specReview

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The archive floor shall evaluate only testDerivation and specReview > Scenario: standard profile assurance

---

### TC-018: Archive floor blocks when specReview cannot be established

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The archive floor shall evaluate only testDerivation and specReview > Scenario: fail-closed retained for remaining dimensions

---

### TC-019: Config retaining scopedTestCommand and scopedTestPatterns validates successfully

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence-only configuration and runtime surface shall be removed > Scenario: leftover scoped-test keys are ignored

---

### TC-020: listCommitChangedFiles and readFileAtCommit present; three bite-evidence primitives absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: bite-evidence-only configuration and runtime surface shall be removed > Scenario: retained runtime capability

---

### TC-021: Pipeline-managed paths contain no entry for bite-evidence-result.md

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The pipeline shall not manage a bite-evidence result artifact > Scenario: managed paths exclude the artifact

---

### TC-022: README pipeline list omits bite-evidence and is contiguously numbered

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: Current-state documentation shall match the pipeline > Scenario: README pipeline list

---

### TC-023: Configuration reference documents biteEvidence rejection and ignores scopedTest keys

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: Current-state documentation shall match the pipeline > Scenario: configuration reference documents the removal

---

### TC-024: isTestGenExempt and verificationFailedLast predicates still referenced by non-transition consumers

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** the transition-table collapse has been applied, removing the guarded `IMPLEMENTER / "success"` rows
**WHEN** the source files that use `isTestGenExempt` and `verificationFailedLast` outside of `types.ts` are inspected
**THEN** `isTestGenExempt` is still referenced by `design success → spec-review` in `types.ts`, and `verificationFailedLast` is still referenced by `step-context-builder.ts` and `implementer.ts`

---

### TC-025: src/util/glob-match.ts retained; no consumer still imports through bite-evidence module

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** the `src/core/step/bite-evidence/` directory has been deleted
**WHEN** the codebase is searched for imports from `src/core/step/bite-evidence/test-file-selection` and for imports of `matchesGlob`
**THEN** no import targets the deleted module, `src/util/glob-match.ts` still exists, and any remaining consumer of `matchesGlob` imports it directly from `src/util/glob-match.ts`

---

### TC-026: authorizedCanonWriters and authorizedCanonWriterSteps absent from src/

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** the authorizedCanonWriters plumbing has been removed from `core/types.ts`, `port/step-types.ts`, `pipeline/run.ts`, and `canon-provenance.ts`
**WHEN** a grep for the identifiers `authorizedCanonWriters` and `authorizedCanonWriterSteps` is run over `src/`
**THEN** no match is found in any production source file

---

### TC-027: canon-provenance.ts header comment contains no stale bite-evidence reference

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-03

**GIVEN** the circular-import explanation comment in `src/core/resume/canon-provenance.ts` has been updated
**WHEN** the comment at the top of the file is read
**THEN** it does not mention bite-evidence as a reason for the module's structure, and it accurately describes the remaining reason (or the note is removed if bite-evidence was the only reason)

---

### TC-028: BiteEvidenceLevel and ProfileAssurance.biteEvidence retained as legacy-read-only

**Category**: unit
**Priority**: must
**Source**: design.md > D4 — Drop biteEvidence from the profile and floor lattice, keep the legacy state type

**GIVEN** the biteEvidence dimension has been removed from the active profile and floor lattice
**WHEN** the type definitions in `src/state/schema/types.ts` are inspected
**THEN** `BiteEvidenceLevel` and the named `biteEvidence` member of `ProfileAssurance` still exist and are annotated as legacy-read-only with no producer

---

### TC-029: verify-checkpoint.ts computes policyDigest from stored profile body, not STANDARD_PROFILE

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `STANDARD_PROFILE.assurance` has changed by removing the biteEvidence key
**WHEN** `src/core/attach/verify-checkpoint.ts` computes `policyDigest` for an existing checkpoint
**THEN** it recomputes the digest from the stored profile body rather than from the current `STANDARD_PROFILE` constant, so previously written checkpoints still self-verify

---

### TC-030: AssuranceProvenanceRuntime narrowed to Pick<RuntimeStrategy, "readFileAtCommit">

**Category**: unit
**Priority**: should
**Source**: design.md > D5 — Narrow archive achieved-provenance to specReview + testDerivation

**GIVEN** the biteEvidence derivation has been removed from `src/core/archive/achieved-assurance.ts`
**WHEN** the `AssuranceProvenanceRuntime` type is inspected
**THEN** it is exactly `Pick<RuntimeStrategy, "readFileAtCommit">` and carries no test-execution method declarations

---

### TC-031: config field removed from deriveAchievedAssurance input

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `deriveAchievedAssurance` no longer executes test runs that required a scoped config
**WHEN** the function signature and call sites in `merge-then-archive.ts` and `src/cli/archive.ts` are inspected
**THEN** the `config` argument is absent from the derivation input type and is not passed at either call site (assuming no other archive-path consumer reads it)

---

### TC-032: Config with archive.minimumAssurance.biteEvidence set to null raises CONFIG_INVALID

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** a configuration where `archive.minimumAssurance.biteEvidence` is explicitly set to `null`
**WHEN** the configuration is validated
**THEN** validation fails with an error whose `code` is `CONFIG_INVALID` and whose message contains `archive.minimumAssurance.biteEvidence`

---

### TC-033: IsolatedTestResult type absent from src/

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** the three bite-evidence-only runtime primitives have been deleted
**WHEN** a search for the identifier `IsolatedTestResult` is performed across `src/`
**THEN** no match is found — the type has been removed along with its sole consumers

---

### TC-034: listCommitChangedFiles still declared and implemented in both runtimes

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** the removal of `listChangedFilesBetweenCommits`, `runTestsAtCommit`, and `runTestsOnSynthesizedTree`
**WHEN** the `RuntimeStrategy` port and both `LocalRuntime` and `ManagedRuntime` implementations are inspected
**THEN** `listCommitChangedFiles`, `readFileAtCommit`, `readRevisionContent`, `lastCommitTouchingPath`, and `listWorktreeChanges` are still declared and implemented, and `listChangedFilesBetweenCommits` is absent

---

### TC-035: No orphaned temp-worktree helper remains from the deleted runtime primitives

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** the three bite-evidence-only runtime method implementations have been deleted from `local.ts`
**WHEN** the helper functions that were used only by those three methods are identified
**THEN** no such helper function remains in `src/core/runtime/local.ts` — they were removed together with their sole callers

---

### TC-036: Checkpoint attachment for bite-evidence resolves to verification

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** a saved checkpoint whose recorded step is `bite-evidence`
**WHEN** `src/core/attach/checkpoint-policy.ts` resolves the attach target via `resolveResumeStep`
**THEN** the resolved step is `verification` and no error is raised

---

### TC-037: CLI help/usage text does not list bite-evidence as a resume target

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** the `--from` usage text in the command registry has been updated
**WHEN** the help text or usage string for the resume command is rendered
**THEN** `bite-evidence` does not appear as an advertised `--from` target

---

### TC-038: "strategy-deferred" remains in the Verdict union

**Category**: unit
**Priority**: must
**Source**: design.md > D9 — Keep the read path for legacy evidence, delete the write path

**GIVEN** the biteEvidence write path has been removed
**WHEN** the `Verdict` union type in the state schema is inspected
**THEN** `"strategy-deferred"` is still a member of the union, annotated as legacy-only, so old journal entries that carry it can be parsed

---

### TC-039: Reopen-time code preserves existing state.biteEvidence field

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** a job state that contains a non-empty `biteEvidence` array and whose job is reopened
**WHEN** the reopen operation completes and the new state is written
**THEN** the `biteEvidence` array is preserved unchanged in the resulting state, confirming the read-preservation path remains intact

---

### TC-040: ADR files are unmodified by this change

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-10

**GIVEN** the documentation update has been applied
**WHEN** the git diff for all files under the ADR directory is inspected
**THEN** no ADR file appears in the diff — historical decision records remain untouched

---

### TC-041: arch-allowlist entry referencing bite-evidence/step.ts is removed

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-11

**GIVEN** `src/core/step/bite-evidence/step.ts` no longer exists
**WHEN** `tests/unit/architecture/arch-allowlist.ts` is inspected
**THEN** the entry with tracking id `CWD-bite-evidence-step-di-default` (file `src/core/step/bite-evidence/step.ts`) is absent, and the allowlist test passes

---

### TC-042: Legacy-compat suites preserved and pass

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** the bite-evidence feature deletion is complete
**WHEN** the suites `src/state/__tests__/bite-evidence-schema.test.ts` and `tests/unit/state/bite-evidence-record-schema.test.ts` are run
**THEN** both suites still exist, are unmodified, and pass — proving that old persisted state with biteEvidence data remains readable

---

### TC-043: No orphaned test fixtures remain from deleted suites

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-12

**GIVEN** the suites whose subjects no longer exist have been deleted
**WHEN** all fixture files in the test fixture directories are checked for references
**THEN** every remaining fixture is referenced by at least one surviving test suite — no fixture exists only for a deleted suite

---

### TC-044: Grep sweep for stale vocabulary produces no unintentional survivors

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-13

**GIVEN** the full deletion and renaming has been applied
**WHEN** a grep is run across the codebase for `bite`, `scopedTest`, `materializedTestFiles`, `strategy-deferred`, `Evidence Base`, `evidenceBase`, `listChangedFilesBetweenCommits`, `runTestsAtCommit`, and `runTestsOnSynthesizedTree`
**THEN** every surviving hit is either an intentional legacy-read-only reference (state types, Verdict union, operations validation, resume alias, legacy-compat suites), an untouched historical document (ADRs, architecture history), or a comment explicitly marking legacy-only status

---

### TC-045: Typecheck, lint, and test suite all pass

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-13

`bun run typecheck`, `bun run lint`, `bun run test`

---

## Result

```yaml
result: completed
total: 45
automated: 38
manual: 7
must: 27
should: 16
could: 2
blocked_reasons: []
```
