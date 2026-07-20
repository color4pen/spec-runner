# Test Cases: CLI repo-root resolution unified at entry

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

- **Total**: 22 cases
- **Automated** (unit/integration): 22
- **Manual**: 0
- **Priority**: must: 20, should: 1, could: 1

---

## Dispatch-time resolution (T-01)

### TC-001: Single resolution passed to handler

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Repo root is resolved once at dispatch and injected as context > Scenario: single resolution passed to handler

### TC-002: Resolution outside a repository yields null without throwing

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Repo root is resolved once at dispatch and injected as context > Scenario: resolution outside a repository yields null without throwing

### TC-012: buildCommandContext returns correct repoRoot and invokerCwd

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Introduce CommandContext + dispatch-time single repo-root resolution

**GIVEN** an injected resolver that synchronously returns a fixed root path `/repo`
**WHEN** `buildCommandContext('/repo/src', injectedResolver)` is called
**THEN** the returned `CommandContext` has `repoRoot === '/repo'` and `invokerCwd === '/repo/src'`

### TC-013: requiresRepo: false command proceeds outside a repository

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Introduce CommandContext + dispatch-time single repo-root resolution

**GIVEN** a command registered with `requiresRepo: false` (the default) and an injected resolver that returns `null` (not inside a git repo)
**WHEN** dispatch builds the context and routes to the handler
**THEN** the handler is invoked without error and the process exits 0

---

## Repo-required guard (T-02 / D2)

### TC-003: Request new outside a repository exits non-zero

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Repo-required commands stop with a unified error outside a repository > Scenario: request new outside a repository

### TC-014: repoRequiredError carries NOT_GIT_REPO exit code and prescriptive hint

**Category**: unit
**Priority**: should
**Source**: design.md > D2 — requiresRepo declaration + one unified out-of-repo error

**GIVEN** `repoRequiredError('request new')` is called
**WHEN** the resulting error is inspected
**THEN** the exit code is 2 (NOT_GIT_REPO) and the message includes a prescription to run `git init` or `cd` into a repository

---

## Doctor subdir equivalence (T-04)

### TC-004: Doctor from a subdirectory equals doctor from the root

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor internal-state checks are equivalent from any directory in the repo > Scenario: doctor from a subdirectory equals doctor from the root

### TC-005: Reverting root resolution breaks the doctor equivalence

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor internal-state checks are equivalent from any directory in the repo > Scenario: reverting root resolution breaks the equivalence

---

## Job stats subdir equivalence (T-03)

### TC-006: Job stats from a subdirectory equals job stats from the root

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job stats returns the same run set from any directory in the repo > Scenario: job stats from a subdirectory equals job stats from the root

### TC-016: Mutation check — reverting job stats to process.cwd() reports 0 runs from subdir

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03: Convert job stats to repo-root base

**GIVEN** `command-registry.ts:683` is reverted to pass `process.cwd()` instead of `ctx.repoRoot`, and there are archived runs under `specrunner/changes/archive/` in the fixture repo root
**WHEN** `job stats --json` is driven through dispatch from a subdirectory
**THEN** the reported run set is empty (0 runs), confirming TC-006 would catch this regression

---

## Request new subdir write-path (T-02)

### TC-007: Request new from a subdirectory targets the root drafts

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: request new writes to the repository-root drafts directory > Scenario: request new from a subdirectory targets the root drafts

### TC-015: Mutation check — reverting request new to process.cwd() nests output under subdir

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02: Convert request new to repo-root base

**GIVEN** `command-registry.ts:334` is reverted to pass `process.cwd()` (the invoker subdirectory) instead of `ctx.repoRoot`
**WHEN** `request new my-slug` is driven through dispatch from a subdirectory
**THEN** `<subdir>/specrunner/drafts/my-slug/request.md` is created (nested), confirming TC-007 would catch this regression

---

## User-supplied relative-path regression (T-06)

### TC-008: Request validate resolves a relative path against invoker cwd

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: user-supplied relative paths resolve against the invoker cwd > Scenario: request validate resolves a relative path against invoker cwd

---

## Doctor outside a repository (T-04 / T-06)

### TC-009: Doctor outside a repository completes and reports repo checks as fail

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor runs outside a repository and reports repo checks as fail > Scenario: doctor outside a repository

### TC-017: Doctor runDoctor reuses dispatched repoRoot without a duplicate resolution call

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04: doctor — carry repo root in DoctorContext; checks use root; repo-optional

**GIVEN** `runDoctor` is called with an explicit `repoRoot` value (e.g. `/repo`) and a spy on `resolveRepoRoot`
**WHEN** the config-error path at the former `doctor.ts:114` executes
**THEN** `resolveRepoRoot` is NOT called a second time; the pre-resolved value is reused

---

## process.cwd() allowlist ratchet (T-05)

### TC-010: A new un-allowlisted process.cwd() in src/ trips the CWD invariant

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: process.cwd() occurrences in src/ are allowlist-gated > Scenario: a new un-allowlisted process.cwd() trips the invariant

### TC-018: CWD allowlist liveness — raw match count in src/ is greater than zero

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Tooth — process.cwd() allowlist ratchet over src/

**GIVEN** the CWD invariant block runs grep over `src/` (excluding comments and test files)
**WHEN** the raw match count is computed
**THEN** the count is > 0, confirming the scan is live and not vacuously passing

### TC-019: An allowlisted process.cwd() occurrence is not flagged as a violation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Tooth — process.cwd() allowlist ratchet over src/

**GIVEN** a synthetic `process.cwd()` occurrence whose (file, content) pair matches an existing CWD allowlist entry
**WHEN** the invariant filter runs
**THEN** the match is suppressed and the invariant test passes (no violation reported)

### TC-020: Converted sites have no process.cwd() remaining in the allowlist seed

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: Tooth — process.cwd() allowlist ratchet over src/

**GIVEN** the CWD allowlist seed is complete
**WHEN** the seed entries are inspected for the three converted sites (`command-registry.ts:334`, `command-registry.ts:683`, `doctor.ts:114`)
**THEN** none of those three sites appear in the allowlist, confirming the code changes removed `process.cwd()` from each

---

## Worktree semantics preservation (D5)

### TC-011: Command inside a job worktree receives the enclosing worktree root

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree semantics are preserved > Scenario: command inside a job worktree uses the enclosing worktree root

---

## Full verification (T-07)

### TC-021: TypeScript type-check passes with the updated handler signature

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: Full verification

**GIVEN** `CommandDef.handler` is updated to `(parsed: ParsedArgs, ctx: CommandContext) => Promise<void>`
**WHEN** `tsc --noEmit` runs over the project
**THEN** there are no type errors; existing handlers that ignore the `ctx` parameter compile unchanged (fewer-parameter functions are assignable)

### TC-022: Existing test suites remain green after all changes

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: Full verification

**GIVEN** all changes in this request are applied (T-01 through T-06)
**WHEN** the full test suite runs
**THEN** all previously green tests pass; the only expectation changes permitted are those whose cwd-vs-repo-root semantics this change intentionally alters (doctor / job stats / request new subdir behavior)

---

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 20
should: 1
could: 1
blocked_reasons: []
```
