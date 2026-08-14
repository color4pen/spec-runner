# Test Cases: Evidence Base for bite-evidence

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration): 22
- **Manual**: 0
- **Priority**: must: 10, should: 9, could: 3

---

### TC-001: Re-run shape earns assurance instead of deferring

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Re-run shape earns assurance instead of deferring

---

### TC-002: Job base is identical on first run and on resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the Evidence Base > Scenario: Job base is identical on first run and on resume

---

### TC-003: Adopted operator commit is included in the candidate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The green candidate SHALL be the effective branch state reaching adopted operator commits > Scenario: Adopted operator commit is included in the candidate

---

### TC-004: Archive floor derives base-red on the Evidence Base for a re-run shape

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The chronology-based contamination machinery SHALL be removed > Scenario: Archive floor derives base-red on the Evidence Base for a re-run shape

---

### TC-005: Non-forward type still defers

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Non-forward type still defers

---

### TC-006: Tamper mismatch still fails

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Tamper mismatch still fails

---

### TC-007: Unavailable runtime still defers

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The gate SHALL preserve its deferral, tamper, type, and never-throw contracts > Scenario: Unavailable runtime still defers

---

### TC-008: runTestsOnSynthesizedTree returns red when implementation is absent from base tree

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** a throwaway git repository where the base tree lacks an implementation file
**AND** the candidate (HEAD) commit contains both the implementation and a test that imports it
**AND** the materialized test file is overlaid from the candidate OID onto the base tree via `runTestsOnSynthesizedTree`
**WHEN** `runTestsOnSynthesizedTree(baseRev, [testFile], candidateOid, cwd, config)` is invoked
**THEN** the result has `kind: "red"` (test fails because the implementation is absent at the base tree)
**AND** the isolated worktree directory is removed after completion
**AND** the source project's `node_modules` directory is not deleted

---

### TC-009: runTestsOnSynthesizedTree cleans up worktree and symlink regardless of test outcome

**Category**: integration
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** a throwaway git repository with a valid base revision and resolvable overlay content
**WHEN** `runTestsOnSynthesizedTree` completes (whether result is red, green, or unavailable)
**THEN** the detached worktree directory created during the run is removed
**AND** no stale `node_modules` symlink remains inside the worktree path

---

### TC-010: runTestsOnSynthesizedTree returns unavailable for a non-existent baseRev

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** a `LocalRuntime` instance operating on a valid repository
**WHEN** `runTestsOnSynthesizedTree` is called with a `baseRev` that does not exist in the repository
**THEN** the result is `{ kind: "unavailable", reason: <non-empty string> }`
**AND** the function does not throw

---

### TC-011: ManagedRuntime.runTestsOnSynthesizedTree returns unavailable

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01, design.md D2

**GIVEN** a `ManagedRuntime` instance
**WHEN** `runTestsOnSynthesizedTree` is called with any arguments
**THEN** the result is `{ kind: "unavailable", reason: <non-empty string> }`

---

### TC-012: resolveEvidenceBaseRev returns null for empty or absent synthesizedCommits ledger

**Category**: unit
**Priority**: must
**Source**: design.md D1, tasks.md T-02

**GIVEN** a job state where `synthesizedCommits` is an empty array or the field is absent
**WHEN** `resolveEvidenceBaseRev(state)` is called
**THEN** the function returns `null`

---

### TC-013: resolveEvidenceBaseRev returns the same revision for first-run and resume/re-run states sharing synthesizedCommits[0]

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 (acceptance 2), design.md D1

**GIVEN** a first-run state with `synthesizedCommits = [bootstrapOid]`
**AND** a resume/re-run state with `synthesizedCommits = [bootstrapOid, laterOid1, laterOid2, operatorOid]` (same first entry)
**WHEN** `resolveEvidenceBaseRev` is called on each state independently
**THEN** both calls return the same revision string (`"${bootstrapOid}^"`)

---

### TC-014: detectBaseImplementationContamination is removed with no remaining importers

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02, design.md D5

**GIVEN** the codebase after all changes in this request are applied
**WHEN** the source tree under `src/` is examined for references to `detectBaseImplementationContamination`
**THEN** no such export, import, or call site exists anywhere in the codebase

---

### TC-015: resolveBaseCandidateOids still returns the latest test-materialize OID (oid-capture.test.ts unchanged and green)

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02, design.md D3

**GIVEN** a job state with multiple `test-materialize` run records, the most recent having a distinct `commitOid`
**WHEN** `resolveBaseCandidateOids(state)` is called
**THEN** the returned `baseOid` equals the `commitOid` of the most recent `test-materialize` run (behavior unchanged from before this change)
**AND** `oid-capture.test.ts` is unmodified and passes

---

### TC-016: Gate never throws — unexpected runtime error resolves to strategy-deferred

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03, design.md D6

**GIVEN** a gate invocation for a forward-type job with a valid job state
**AND** `runTestsOnSynthesizedTree` throws an unexpected error (simulated via fake)
**WHEN** the bite-evidence gate evaluates the verdict
**THEN** the verdict is `strategy-deferred`
**AND** no exception propagates out of the gate

---

### TC-017: scopedTestCommand unset causes gate to return strategy-deferred

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03, design.md D6

**GIVEN** a project configuration where `scopedTestCommand` is not set
**AND** the runtime therefore returns `unavailable` for scoped test execution
**WHEN** the bite-evidence gate runs for a forward-type job
**THEN** the verdict is `strategy-deferred`

---

### TC-018: Archive floor returns fail-closed when Evidence Base ref is absent (empty synthesizedCommits)

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04, design.md D1 / D5

**GIVEN** an archive floor evaluation for a job state with an empty `synthesizedCommits` ledger
**AND** the floor policy requires `biteEvidence`
**WHEN** `deriveAchievedAssurance` is called
**THEN** the `biteEvidence` dimension is absent (fail-closed, diagnostic recorded)
**AND** `deriveAchievedAssurance` does not throw

---

### TC-019: RealRuntimeStrategy fails to compile when runTestsOnSynthesizedTree is omitted

**Category**: unit
**Priority**: could
**Source**: tasks.md T-01

**GIVEN** a concrete class that claims to implement `RealRuntimeStrategy`
**WHEN** `runTestsOnSynthesizedTree` is missing from the implementation
**THEN** TypeScript compilation fails with a type error (compile-time enforcement mirrors `runTestsAtCommit`)

---

### TC-020: Archive floor with hollow base (Evidence Base returns green) stays fail-closed

**Category**: unit
**Priority**: could
**Source**: tasks.md T-04, design.md D5 (#848 anti-regression)

**GIVEN** an archive floor evaluation where `runTestsOnSynthesizedTree` returns `{ kind: "green" }` (tests already pass at the Evidence Base — hollow)
**WHEN** `deriveAchievedAssurance` is called
**THEN** the `biteEvidence` dimension is absent (fail-closed; hollow base detected)

---

### TC-021: Archive floor HEAD-green unavailable remains fail-closed

**Category**: unit
**Priority**: could
**Source**: tasks.md T-04, design.md D5

**GIVEN** an archive floor evaluation where base-red on the Evidence Base returns `{ kind: "red" }` (correctly)
**AND** `runTestsAtCommit(finalHeadOid, ...)` returns `{ kind: "unavailable" }`
**WHEN** `deriveAchievedAssurance` is called
**THEN** the `biteEvidence` dimension is absent (fail-closed)

---

### TC-022: typecheck and full test suite are green after all changes

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** all implementation changes from T-01 through T-05 are applied to the codebase
**WHEN** `bun run typecheck` and `bun run test` are executed
**THEN** both commands exit with code 0

---

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 10
should: 9
could: 3
blocked_reasons: []
```
