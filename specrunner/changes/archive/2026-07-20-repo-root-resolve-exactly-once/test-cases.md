# Test Cases: Repo root resolved exactly once per invocation

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
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

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 27
- **Manual**: 0
- **Priority**: must: 19, should: 7, could: 1

---

## Scenario-derived test cases

### TC-001: Converted handler receives dispatch-resolved root without re-resolving

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Command handlers consume the dispatch-resolved repo root and do not re-resolve > Scenario: a converted handler receives the resolved root without re-resolving

---

### TC-002: DI-fallback files never re-resolve on production dispatch path

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Command handlers consume the dispatch-resolved repo root and do not re-resolve > Scenario: DI-fallback files never re-resolve on the production path

---

### TC-003: Adding resolveRepoRoot to a converted handler trips the exactly-once invariant

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The handler layer is machine-fixed to not resolve repo root > Scenario: adding a re-resolution to a converted handler trips the invariant

---

### TC-004: Adding a direct git rev-parse to a handler trips the exactly-once invariant

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The handler layer is machine-fixed to not resolve repo root > Scenario: a direct git root resolution in a handler trips the invariant

---

### TC-005: Exactly-once invariant scan is not vacuous

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The handler layer is machine-fixed to not resolve repo root > Scenario: the invariant scan is not vacuous

---

### TC-006: Converted command from a subdirectory produces the same result as from the repo root

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Converted commands behave identically from a subdirectory and from the repository root > Scenario: a converted command from a subdirectory equals the root invocation

---

### TC-007: Reverting a conversion makes subdirectory invocation differ from root invocation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Converted commands behave identically from a subdirectory and from the repository root > Scenario: reverting a conversion breaks the equivalence

---

### TC-008: Repo-required command outside a repository stops with the unified error

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Repo-required commands stop with the unified error outside a repository > Scenario: a repo-required command outside a repository

---

### TC-009: Converted-site CWD allowlist entries are removed and CWD invariant stays green

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The CWD allowlist shrinks by the converted sites > Scenario: converted-site entries are removed

---

### TC-010: B-13 is absent from the CWD-context ADR

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The CWD ratchet identifier is unique > Scenario: B-13 is absent from the CWD-context ADR

---

## Non-Scenario test cases

### TC-011: Repo-required handler files contain no resolveRepoRoot or git rev-parse after conversion

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** the converted repo-required handler source files (`src/cli/init.ts`, `src/cli/inbox.ts`, `src/cli/prune.ts`, `src/cli/cancel.ts`, `src/cli/attach.ts`)
**WHEN** a grep for `resolveRepoRoot`, `resolveRepoRootOrFail`, and `rev-parse --show-toplevel` is run over each file (excluding comment lines)
**THEN** no matches are found in any of the five files

---

### TC-012: Repo-optional handler files contain no resolveRepoRoot after conversion

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** the converted repo-optional handler source files (`src/cli/job-show.ts`, `src/cli/config-effective.ts`, `src/cli/bootstrap.ts`)
**WHEN** a grep for `resolveRepoRoot` is run over each file (excluding comment lines)
**THEN** no matches are found in any of the three files

---

### TC-013: ps.ts retains the resolveRepoRoot DI fallback at the designated line

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03, design.md > D4

**GIVEN** `src/cli/ps.ts` after the change
**WHEN** a grep for `resolveRepoRoot` is run over the file (excluding comment lines)
**THEN** exactly one match remains corresponding to the `opts.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd()` DI-fallback expression; no additional `resolveRepoRoot` calls appear

---

### TC-014: RESOLVE_REPO_ROOT_ALLOWED_FILES exported from arch-allowlist.ts with correct four members

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `tests/unit/architecture/arch-allowlist.ts`
**WHEN** the `RESOLVE_REPO_ROOT_ALLOWED_FILES` named export is inspected
**THEN** it is a distinct export from `ARCH_ALLOWLIST` and contains exactly four entries: `src/cli/command-context.ts`, `src/cli/doctor.ts`, `src/cli/load-config-with-overlay.ts`, `src/cli/ps.ts`
**AND** no other file names appear in the set

---

### TC-015: Regression guard — synthetic resolveRepoRoot in inbox.ts is flagged; in ps.ts is suppressed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** the exactly-once confinement invariant in `tests/unit/architecture/core-invariants.test.ts`
**WHEN** a `resolveRepoRoot` call is synthetically injected into `src/cli/inbox.ts` (a converted handler not in the allowlist)
**THEN** the confinement assertion fails with `inbox.ts` listed as a violation
**AND** when the same synthetic call is placed in `src/cli/ps.ts` (in the allowlist), the confinement assertion passes without violation

---

### TC-016: CWD allowlist strictly decreases — exactly four entries removed, none added

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` after the change
**WHEN** the set of `CWD` entries is enumerated
**THEN** the entries `CWD-init-git-spawn`, `CWD-job-show-root-resolve`, `CWD-inbox-debt`, and `CWD-config-effective-di-default` are absent
**AND** `CWD-ps-root-resolve` and `CWD-job-show-print-default` are still present
**AND** no new `CWD` entries have been added (total count strictly less than before)

---

### TC-017: CWD invariant liveness stays greater than zero after burn-down

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** the CWD invariant (`T-05`) in `tests/unit/architecture/core-invariants.test.ts` with the reduced allowlist
**WHEN** the liveness assertion within the invariant runs
**THEN** the `process.cwd()` match count in `src/` is greater than zero (the remaining allowed sites `CWD-ps-root-resolve` and `CWD-job-show-print-default` keep the scan live)

---

### TC-018: B-13 appears only in StepExecutor context across the entire repository

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** the repository after the ADR identifier fix
**WHEN** a repo-wide grep for `B-13` is run
**THEN** every match appears exclusively in the StepExecutor single-writer context (`architecture/model.md`, `architecture/domain-model.md`, `src/core/step/`, `tests/unit/architecture/core-invariants.test.ts` describe for StepExecutor)
**AND** no match appears in a CWD ratchet context or in `specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md`

---

### TC-019: init command — git-binary-unavailable path collapses to unified repo-required error

**Category**: integration
**Priority**: should
**Source**: design.md > D2, tasks.md > T-02

**GIVEN** the converted `init` command dispatched via the production dispatch harness
**AND** the repo-root resolver returns `null` (simulating git unavailable or outside a repo)
**WHEN** `init` is invoked
**THEN** the CLI exits non-zero with the unified repo-required error (exit code 2)
**AND** no bespoke "please install git" message is emitted
**AND** no `.gitignore` / `specrunner/` scaffold is created

---

### TC-020: cancel argument-exclusivity check fires before repoRoot is accessed

**Category**: unit
**Priority**: should
**Source**: design.md > D2, tasks.md > T-02

**GIVEN** `runCancel` called directly with conflicting arguments (e.g., both `--job-id` and `--all` supplied) and a placeholder `repoRoot` value
**WHEN** `runCancel` executes
**THEN** the argument-exclusivity validation error fires before any use of `repoRoot`
**AND** no repo-state read or write occurs

---

### TC-021: job show degrades gracefully when dispatched outside a repository

**Category**: integration
**Priority**: should
**Source**: design.md > D3, tasks.md > T-03

**GIVEN** `runJobShow` called with `repoRoot` set to the `invokerCwd` value (outside a git repository, dispatch-resolved root is null, registry passes `ctx.invokerCwd`)
**WHEN** the command executes
**THEN** it exits cleanly (empty listing or not-found message) without throwing an unhandled exception
**AND** no state is written

---

### TC-022: config effective degrades gracefully when dispatched outside a repository

**Category**: integration
**Priority**: should
**Source**: design.md > D3, tasks.md > T-03

**GIVEN** `runConfigEffective` called with `repoRoot: null`
**WHEN** the command executes
**THEN** it returns the effective configuration derived from defaults (no project-level config) without throwing
**AND** no `resolveRepoRoot` call is made internally

---

### TC-023: job ls production dispatch never triggers ps.ts internal resolveRepoRoot fallback

**Category**: integration
**Priority**: should
**Source**: design.md > D4, tasks.md > T-03

**GIVEN** the `job ls` registry handler passing `repoRoot: ctx.repoRoot ?? ctx.invokerCwd` into `runPs`
**WHEN** `job ls` is invoked via the production dispatch path (inside or outside a repo)
**THEN** `opts.repoRoot` is always a non-null string when `runPs` begins executing
**AND** the `opts.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd()` guard short-circuits at `opts.repoRoot`; the `resolveRepoRoot` branch is never reached

---

### TC-024: requiresRepo declared for exactly the five repo-required commands

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/cli/command-registry.ts` after the change
**WHEN** the `requiresRepo` field is inspected across all command definitions
**THEN** exactly `init`, `inbox run`, `job prune`, `job cancel`, and `job attach` carry `requiresRepo: true`
**AND** `job ls`, `job show`, `job resume`, and `config effective` do not have `requiresRepo` set

---

### TC-025: typecheck passes after conversion

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** the converted codebase with updated handler signatures and injection seams
**WHEN** `typecheck` is run
**THEN** zero type errors are reported across all converted and unchanged files

---

### TC-026: Full test suite is green after conversion

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** the converted codebase with injection-seam updates applied to the affected test files (`tests/init-git-guard.test.ts`, `tests/init.test.ts`, `tests/unit/cli/cancel.test.ts`, `tests/unit/cli/prune-combined.test.ts`, `tests/attach/attach-cli.test.ts`, `tests/unit/cli/job-show.test.ts`, `tests/unit/cli/config-effective.test.ts`)
**WHEN** the full test suite runs
**THEN** all tests pass
**AND** the only test file changes are injection-seam updates and the init-gate relocation; all other existing tests pass without modification

---

### TC-027: attach command — invoker CWD (not repoRoot) is passed to detectSpecrunnerWorktree

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-02

**GIVEN** `runAttach` called with distinct `repoRoot` and `cwd` (invoker CWD) values
**WHEN** `detectSpecrunnerWorktree` is invoked internally
**THEN** it receives the `cwd` (invoker CWD) argument, not `repoRoot`
**AND** the config load, transport auth, and runtime use `repoRoot` correctly

---

## Result

```yaml
result: completed
total: 27
automated: 27
manual: 0
must: 19
should: 7
could: 1
blocked_reasons: []
```
