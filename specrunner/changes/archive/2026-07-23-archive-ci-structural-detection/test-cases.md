# Test Cases: structural CI-presence detection for `job archive --with-merge`

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 21
- **Manual**: 2
- **Priority**: must: 7, should: 11, could: 5

---

### TC-001: CI-present repo waits fail-closed and escalates on timeout

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CI presence for the merge gate is determined structurally from the archive commit's tree > Scenario: repo with a push/pull_request workflow waits fail-closed and escalates on timeout

---

### TC-002: Repo with no workflow definition proceeds to merge after grace

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CI presence for the merge gate is determined structurally from the archive commit's tree > Scenario: repo with no workflow definition proceeds to merge after grace

---

### TC-003: Schedule-only workflows are treated as CI-less and proceed to merge

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CI presence for the merge gate is determined structurally from the archive commit's tree > Scenario: repo whose only workflows lack push/pull_request triggers is treated as CI-less

---

### TC-004: Unreadable archive commit resolves to the waiting side (fail-closed)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CI presence for the merge gate is determined structurally from the archive commit's tree > Scenario: unreadable archive commit resolves to the waiting side

---

### TC-005: CI presence evaluation uses local git only — no GitHub API calls added

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: trigger detection adds no dependency and touches no GitHub API > Scenario: detection uses local git only

---

### TC-006: No new package dependency is introduced

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: trigger detection adds no dependency and touches no GitHub API > Scenario: no new package dependency is introduced

---

### TC-007: detectWorkflowCiPresence returns trigger-match for a push-trigger workflow

**Category**: unit
**Priority**: should
**Source**: design.md > D3, tasks.md > T-01

**GIVEN** a fake `spawn` that returns a single `.yml` blob entry for `git ls-tree` and a workflow body containing `push:` for `git cat-file`
**WHEN** `detectWorkflowCiPresence({ spawn, cwd, ref })` is called
**THEN** it returns `{ present: true, reason: "trigger-match" }`

---

### TC-008: detectWorkflowCiPresence returns trigger-match for a pull_request-trigger workflow

**Category**: unit
**Priority**: should
**Source**: design.md > D3, tasks.md > T-01

**GIVEN** a fake `spawn` that returns a single `.yaml` blob entry for `git ls-tree` and a workflow body containing `pull_request:` for `git cat-file`
**WHEN** `detectWorkflowCiPresence({ spawn, cwd, ref })` is called
**THEN** it returns `{ present: true, reason: "trigger-match" }`

---

### TC-009: detectWorkflowCiPresence returns no-workflows when ls-tree yields no blobs

**Category**: unit
**Priority**: should
**Source**: design.md > D3, tasks.md > T-01

**GIVEN** a fake `spawn` that returns exit 0 with empty stdout for `git ls-tree`
**WHEN** `detectWorkflowCiPresence({ spawn, cwd, ref })` is called
**THEN** it returns `{ present: false, reason: "no-workflows" }` and `git cat-file` is never invoked

---

### TC-010: detectWorkflowCiPresence returns no-trigger for a schedule-only workflow

**Category**: unit
**Priority**: should
**Source**: design.md > D3, tasks.md > T-01

**GIVEN** a fake `spawn` that returns a single `.yml` blob entry for `git ls-tree` and a workflow body containing only `schedule:` (no `push` or `pull_request`) for `git cat-file`
**WHEN** `detectWorkflowCiPresence({ spawn, cwd, ref })` is called
**THEN** it returns `{ present: false, reason: "no-trigger" }`

---

### TC-011: detectWorkflowCiPresence returns inspection-failed when git ls-tree exits non-zero

**Category**: unit
**Priority**: should
**Source**: design.md > D3, D5, tasks.md > T-01

**GIVEN** a fake `spawn` that returns exit 128 for `git ls-tree` (simulating a bad ref)
**WHEN** `detectWorkflowCiPresence({ spawn, cwd, ref })` is called
**THEN** it returns `{ present: true, reason: "inspection-failed" }` (fail-closed) and `git cat-file` is never invoked

---

### TC-012: detectWorkflowCiPresence returns inspection-failed when git cat-file exits non-zero

**Category**: unit
**Priority**: should
**Source**: design.md > D3, D5, tasks.md > T-01

**GIVEN** a fake `spawn` that returns a valid blob entry for `git ls-tree` but exits non-zero for `git cat-file`
**WHEN** `detectWorkflowCiPresence({ spawn, cwd, ref })` is called
**THEN** it returns `{ present: true, reason: "inspection-failed" }` (fail-closed)

---

### TC-013: pull_request_target is classified as a CI trigger (prefix match)

**Category**: unit
**Priority**: should
**Source**: design.md > D2, tasks.md > T-01

**GIVEN** a fake `spawn` returns a workflow body containing `pull_request_target:` for `git cat-file`
**WHEN** `detectWorkflowCiPresence` evaluates the body
**THEN** it returns `{ present: true, reason: "trigger-match" }` because `pull_request_target` starts with `pull_request`

---

### TC-014: pull_request_review is classified as a CI trigger (prefix match)

**Category**: unit
**Priority**: could
**Source**: design.md > D2, tasks.md > T-01

**GIVEN** a fake `spawn` returns a workflow body containing `pull_request_review:` for `git cat-file`
**WHEN** `detectWorkflowCiPresence` evaluates the body
**THEN** it returns `{ present: true, reason: "trigger-match" }` because `pull_request_review` starts with `pull_request`

---

### TC-015: archiveSha undefined is treated as CI-present; git ls-tree not invoked

**Category**: integration
**Priority**: must
**Source**: design.md > D5, tasks.md > T-02, T-04

**GIVEN** `runArchiveOrchestrator` returns `headSha: undefined` (archive commit SHA unavailable)
**And** the check rollup stays `"none"` past the grace window
**And** `mergeWaitTimeoutMs` is finite
**WHEN** `runMergeThenArchive` runs its check-wait loop
**THEN** `git ls-tree` spawn is never invoked (detection is skipped)
**And** the repo is treated as CI-present (fail-closed)
**And** the run escalates with `exitCode: 1` once `mergeWaitTimeoutMs` is exceeded without merging

---

### TC-016: CI presence detection is computed at most once per job (cached)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CI presence for the merge gate is determined structurally from the archive commit's tree, tasks.md > T-04

**GIVEN** a PR whose archive-commit tree contains a `push`-trigger workflow
**And** the check rollup returns `"none"` across multiple poll iterations past the grace window
**And** `mergeWaitTimeoutMs` is finite (allowing several poll iterations before timeout)
**WHEN** `runMergeThenArchive` runs its check-wait loop through all poll iterations until escalation
**THEN** the `git ls-tree` spawn is invoked exactly once across all poll iterations (detection result is cached and reused)

---

### TC-017: BLOCKED branch-protection escalation path is not affected by CI detection

**Category**: integration
**Priority**: should
**Source**: design.md > D4, tasks.md > T-02

**GIVEN** a PR whose rollup state is `"none"` past the grace window but `isBlocked` is true (branch protection is pending)
**WHEN** the `"none"` branch evaluates the BLOCKED guard
**THEN** the BLOCKED escalation fires before CI detection is consulted
**And** `git ls-tree` is not invoked
**And** the behavior is identical to pre-change

---

### TC-018: CI-present timeout escalation message identifies the scenario

**Category**: integration
**Priority**: should
**Source**: design.md > D4, tasks.md > T-03

**GIVEN** a PR with a `push`-trigger workflow whose rollup stays `"none"` until `mergeWaitTimeoutMs` expires
**WHEN** `runMergeThenArchive` returns its escalation result
**THEN** the escalation `exitCode` is `1`
**And** the escalation text states that a `push` / `pull_request` workflow is present but no checks appeared within the timeout
**And** the escalation text states that the PR was **not** merged (fail-closed)
**And** the escalation text includes the `specrunner job archive --with-merge <slug>` resume command

---

### TC-019: No merge, post-merge cleanup, or markJobArchived on CI-present timeout path

**Category**: integration
**Priority**: should
**Source**: design.md > D4, tasks.md > T-03

**GIVEN** a PR with a CI-present workflow whose rollup stays `"none"` until the overall timeout
**WHEN** `runMergeThenArchive` returns the CI-present escalation
**THEN** `mergePullRequest` is not called
**And** post-merge cleanup steps are not executed
**And** `markJobArchived` is not called

---

### TC-020: Pre-existing TBG-05 regression (no-workflows → merge after grace) remains green

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-04

**GIVEN** the default fake `spawn` used by pre-existing merge-then-archive tests returns empty `git ls-tree` output (resolving to `no-workflows` / CI-less)
**WHEN** the existing test suite is executed without behavioral changes to its expectations
**THEN** all pre-existing merge-then-archive tests pass
**And** the TBG-05 `"none"` → merge after grace regression continues to hold

---

### TC-021: Non-.yml/.yaml files under .github/workflows/ are ignored

**Category**: unit
**Priority**: could
**Source**: design.md > D3, tasks.md > T-01

**GIVEN** a fake `spawn` returns `git ls-tree` output with one `.json` entry and one `.yml` entry under `.github/workflows/`
**And** the `.yml` body contains only `schedule:` (no push/pull_request)
**WHEN** `detectWorkflowCiPresence` is called
**THEN** the `.json` entry is not read with `git cat-file`
**And** the result is `{ present: false, reason: "no-trigger" }` (only the `.yml` file is evaluated)

---

### TC-022: Tree entries (subdirectories) in git ls-tree output are skipped

**Category**: unit
**Priority**: could
**Source**: design.md > D3, tasks.md > T-01

**GIVEN** a fake `spawn` returns `git ls-tree` output containing a `tree` mode entry (subdirectory) and no `blob` entries
**WHEN** `detectWorkflowCiPresence` is called
**THEN** the tree entry is skipped and `git cat-file` is not called
**And** the result is `{ present: false, reason: "no-workflows" }`

---

### TC-023: mergeWaitTimeoutMs null + CI-present → wait continues indefinitely

**Category**: integration
**Priority**: could
**Source**: design.md > D4, Risks/Trade-offs section

**GIVEN** a PR with a `push`-trigger workflow whose rollup stays `"none"` past the grace window
**And** `mergeWaitTimeoutMs` is `null` (unlimited wait)
**WHEN** the CI-present wait branch evaluates the deadline
**THEN** no escalation is returned (the effective timeout check is skipped)
**And** the loop continues sleeping and polling without merging

---

## Result

```yaml
result: completed
total: 23
automated: 21
manual: 2
must: 7
should: 11
could: 5
blocked_reasons: []
```
