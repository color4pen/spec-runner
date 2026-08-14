# Tasks: Evidence Base for bite-evidence

## T-01: Add the Evidence Base runtime port method (synthesized-tree test execution)

- [ ] Add `runTestsOnSynthesizedTree` to the `RuntimeStrategy` port
      (`src/core/port/runtime-strategy.ts`), returning the existing `IsolatedTestResult` DU.
      Signature intent: `(baseRev: string, overlayFiles: string[], overlayFromOid: string, cwd: string, config: SpecRunnerConfig) => Promise<IsolatedTestResult>`.
      Keep it optional on `RuntimeStrategy` (test-fake convenience) and add it as a **required**
      member of `RealRuntimeStrategy` (compile-time enforcement), mirroring `runTestsAtCommit`.
- [ ] Document the contract in the port JSDoc: never throws; `unavailable` on spawn error,
      non-existent `baseRev`, unresolvable overlay content, missing `node_modules`, or unset/
      unsupported `scopedTestCommand`; cleans up worktree + symlink in a finally block.
- [ ] Implement in `LocalRuntime` (`src/core/runtime/local.ts`): `git worktree add --detach <tmp>
      <baseRev>`; for each overlay path, resolve content via `git show <overlayFromOid>:<path>`
      and write it into the detached worktree (create parent dirs); reuse the existing
      `scopedTestCommand` precedence, `node_modules` symlink (fail-closed if `<cwd>/node_modules`
      absent), per-file scoped run, and finally-block cleanup from `runTestsAtCommit`. An overlay
      path whose content cannot be resolved at `overlayFromOid` → `unavailable` (fail-closed).
- [ ] Implement the `ManagedRuntime` stub (`src/core/runtime/managed.ts`): return
      `{ kind: "unavailable", reason: "managed runtime has no local worktree for runTestsOnSynthesizedTree" }`.

**Acceptance Criteria**:
- `RealRuntimeStrategy` fails to compile if a concrete runtime omits `runTestsOnSynthesizedTree`.
- A new runtime test (throwaway git repo) shows: overlaying candidate test content onto a base
  tree that lacks the implementation runs **red**; the isolated worktree and `node_modules`
  symlink are removed after the run; a non-existent `baseRev` returns `unavailable` (never throws);
  the source `node_modules` is not deleted.
- `ManagedRuntime.runTestsOnSynthesizedTree` returns `unavailable`.
- `typecheck` passes.

## T-02: Evidence Base reference resolver; remove contamination detector

- [ ] In `src/core/step/bite-evidence/oids.ts` add a pure helper (e.g. `resolveEvidenceBaseRev(state): string | null`)
      that returns `\`${state.synthesizedCommits[0]}^\`` (first parent of the first synthesized/
      bootstrap commit) or `null` when `synthesizedCommits` is absent/empty. Document that
      `synthesizedCommits[0]` is the bootstrap commit and its first parent is the immutable job base.
- [ ] Keep `resolveBaseCandidateOids` (still resolves the latest `test-materialize` commit OID,
      used for materialized-test-file *set* identification per design D3). Its `candidateOid`
      return may remain but is no longer consulted for the green judgment.
- [ ] Delete `detectBaseImplementationContamination` and its ponytail marker
      (`oids.ts:45-72`). Remove its import from `gate.ts` and `achieved-assurance.ts`.

**Acceptance Criteria**:
- `resolveEvidenceBaseRev` is a pure function (no I/O); returns the same ref for a first-run state
  and a resume/re-run state that share `synthesizedCommits[0]`; returns `null` for an empty ledger.
- `detectBaseImplementationContamination` no longer exists and has no remaining importers.
- `resolveBaseCandidateOids` still returns the latest `test-materialize` OID; `oid-capture.test.ts`
  is unchanged and green.
- `typecheck` passes.

## T-03: Rewrite the gate to evaluate on the Evidence Base with a HEAD candidate

- [ ] In `src/core/step/bite-evidence/gate.ts`, add `runTestsOnSynthesizedTree` and `captureHeadSha`
      to the `GateDeps.runtimeStrategy` `Pick`.
- [ ] Preserve the deferral order (design D6): non-forward type → deferred; tamper mismatch →
      failed; absent materialize OID (for file-set identification) → deferred; absent Evidence Base
      ref (`resolveEvidenceBaseRev` null) → deferred; runtime capability missing
      (`runTestsOnSynthesizedTree` / `runTestsAtCommit` / `captureHeadSha` / `listCommitChangedFiles`)
      → deferred; empty materialized-test selection → deferred. **All of these short-circuit before
      capturing HEAD or running any test.**
- [ ] Resolve the green candidate as `captureHeadSha(cwd)`; `null` → `strategy-deferred`.
- [ ] Identify materialized test files via `listCommitChangedFiles(latestTestMaterializeOid)` +
      `selectMaterializedTestFiles` (unchanged).
- [ ] Red: `runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, overlayFromOid = headOid, cwd, config)`.
      Green: `runTestsAtCommit(headOid, testFiles, cwd, config)`. Build the per-file
      `BiteEvidenceRecord`s (base-red AND candidate-green ⇒ verified) exactly as today; record
      `candidateOid = headOid`. Remove gate step 3.5 (`gate.ts:119-129`). Keep the never-throw
      wrapper and the `digestArtifacts` `testHash` best-effort block.

**Acceptance Criteria**:
- Re-run shape (implementer commit predating the latest test-materialize commit) with Evidence-Base
  red + HEAD green ⇒ verdict `passed` (was `strategy-deferred`).
- A hollow test (green on the Evidence Base) ⇒ verdict `failed`.
- The green run and record `candidateOid` use the HEAD OID, so an operator commit adopted after the
  implementer commit is included in the candidate.
- Non-forward type / tamper mismatch / absent OID / empty selection / unavailable runtime behaviors
  are unchanged.
- The gate never throws.

## T-04: Rebuild the archive-floor base-red on the Evidence Base; remove P2.5

- [ ] In `src/core/archive/achieved-assurance.ts` remove the P2.5 contamination precondition
      (`achieved-assurance.ts:236-246`) and its import.
- [ ] Add `runTestsOnSynthesizedTree` to the `AssuranceProvenanceRuntime` `Pick` and the P3
      capability check.
- [ ] Resolve the Evidence Base ref via `resolveEvidenceBaseRev(state)`; when `null`, leave
      `biteEvidence`/`testDerivation` absent with a diagnostic (fail-closed).
- [ ] Replace the base-red execution (`achieved-assurance.ts:441-463`) with
      `runTestsOnSynthesizedTree(evidenceBaseRev, materializedTestFiles, overlayFromOid = finalHeadOid, cwd, config)`;
      keep the complete-coverage / all-red requirement. Leave the blob-freeze (b), scenario-freeze
      (c), type gate (d), and HEAD-green (f, on `finalHeadOid`) unchanged. Keep resolving the
      test-materialize OID for file-set identification (a) and freeze anchor (b).

**Acceptance Criteria**:
- A re-run-shape job under a `biteEvidence: required` floor can achieve `biteEvidence` when the
  tests are red on the Evidence Base and green at `finalHeadOid` (no `baseline unbuildable`).
- Absent Evidence Base ref, unavailable runtime (`scopedTestCommand` unset / managed), hollow base,
  and HEAD-green-unavailable cases all remain fail-closed (dimension absent) — #848 anti-regression preserved.
- `deriveAchievedAssurance` never throws.
- `typecheck` passes.

## T-05: Update and add tests per the design D7 enumeration

- [ ] Gate tests (`src/core/step/bite-evidence/__tests__/gate.test.ts`,
      `gate-empty-selection.test.ts`): migrate the fake runtime so base-red runs through
      `runTestsOnSynthesizedTree` and green through `runTestsAtCommit(HEAD)`; add `captureHeadSha`
      to the fake and `synthesizedCommits` to states. Flip the re-run-shape test (TC-007
      strip-test-authority) from `strategy-deferred` to `passed`. Keep the hollow-base-green test
      as `failed`. Leave the short-circuit tests (non-forward, tamper, absent OID, empty selection,
      `checkTamperStatus`) unchanged.
- [ ] Add gate test **acceptance 3**: state with an operator-adopted commit reachable at HEAD after
      the implementer commit ⇒ candidate/green uses the HEAD OID, not `implementer.commitOid`.
- [ ] Add oids unit **acceptance 2**: `resolveEvidenceBaseRev` returns the same ref for a first-run
      state and a resume/re-run state sharing `synthesizedCommits[0]`.
- [ ] Archive-floor tests (`src/core/archive/__tests__/achieved-assurance.test.ts`,
      `tests/unit/core/archive/achieved-assurance-test-file-selection.test.ts`,
      `achieved-assurance-revision-binding-unit.test.ts`, `achieved-assurance-revision-binding-integration.test.ts`,
      `achieved-assurance-completeness-unit.test.ts`, `achieved-assurance-completeness-integration.test.ts`,
      `merge-then-archive-floor-provenance.test.ts`): migrate base-red fakes to
      `runTestsOnSynthesizedTree`; add `synthesizedCommits[0]` to states that assert `biteEvidence`
      achieved; replace the "contaminated baseline (re-run shape)" test with an Evidence-Base
      buildable assertion. Preserve #848 / hollow / unavailable anti-regressions (HEAD-green stays
      on `runTestsAtCommit(finalHeadOid)`).
- [ ] Real-git e2e (`src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts`): add the bootstrap
      commit as `synthesizedCommits[0]` (jobBase = its parent); drive gate + floor base-red on the
      Evidence Base; add integration proving (a) a re-run shape earns assurance (**acceptance 1**)
      and (b) first-run vs resume resolve to the same Evidence Base tree (**acceptance 2**).
- [ ] Add a runtime test for `runTestsOnSynthesizedTree` (new file or in `bite-evidence-isolated-exec.test.ts`),
      per T-01 acceptance.
- [ ] Do NOT touch the verified-unrelated files or the preserved-method pinning tests listed in
      design D7.

**Acceptance Criteria**:
- Each acceptance criterion of the request has a fixing test: re-run red-not-contaminated (1),
  first-run vs resume same tree (2), adopt-commit in candidate (3).
- Only the files enumerated in design D7 are modified; every other test file is unchanged and green.

## T-06: Full green

- [ ] Run `bun run typecheck` and `bun run test`; fix any fallout confined to the design D7 surface.

**Acceptance Criteria**:
- `typecheck && test` is green.
