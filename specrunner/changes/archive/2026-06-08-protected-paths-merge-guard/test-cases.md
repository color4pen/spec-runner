# Test Cases: protected-paths-merge-guard

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 26
- **Manual**: 1
- **Priority**: must: 19, should: 8, could: 0

---

### TC-001: All changed files fit under the cap

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: List pull request changed files via REST API > Scenario: All changed files fit under the cap

---

### TC-002: Changed files span multiple pages

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: List pull request changed files via REST API > Scenario: Changed files span multiple pages

---

### TC-003: Changed file list reaches the API cap

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: List pull request changed files via REST API > Scenario: Changed file list reaches the API cap

---

### TC-004: Single-segment wildcard matches one segment

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Glob matching of file paths > Scenario: Single-segment wildcard matches one segment

---

### TC-005: Single-segment wildcard does not cross a slash

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Glob matching of file paths > Scenario: Single-segment wildcard does not cross a slash

---

### TC-006: Double-star matches across segments

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Glob matching of file paths > Scenario: Double-star matches across segments

---

### TC-007: Leading double-star matches any directory depth

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Glob matching of file paths > Scenario: Leading double-star matches any directory depth

---

### TC-008: Literal pattern matches exact path only

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Glob matching of file paths > Scenario: Literal pattern matches exact path only

---

### TC-009: No patterns configured yields not blocked

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Evaluate protected-path decision > Scenario: No patterns configured yields not blocked

---

### TC-010: Matching file blocks with the matched list

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Evaluate protected-path decision > Scenario: Matching file blocks with the matched list

---

### TC-011: No matching file does not block

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Evaluate protected-path decision > Scenario: No matching file does not block

---

### TC-012: Truncated list with configured patterns fails closed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Evaluate protected-path decision > Scenario: Truncated list with configured patterns fails closed

---

### TC-013: Protected-path PR is not auto-merged

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Merge guard blocks auto-merge of protected-path PRs > Scenario: Protected-path PR is not auto-merged

---

### TC-014: Non-matching PR is merged as before

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Merge guard blocks auto-merge of protected-path PRs > Scenario: Non-matching PR is merged as before

---

### TC-015: Already-merged PR bypasses the guard

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Merge guard blocks auto-merge of protected-path PRs > Scenario: Already-merged PR bypasses the guard

---

### TC-016: Truncated file list stops auto-merge

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Fail-closed when changed file list is truncated > Scenario: Truncated file list stops auto-merge

---

### TC-017: Match escalation lists matched files and manual merge steps

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Escalation output content > Scenario: Match escalation lists matched files and manual merge steps

---

### TC-018: Truncation escalation explains the cap and manual merge steps

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Escalation output content > Scenario: Truncation escalation explains the cap and manual merge steps

---

### TC-019: Absent protected paths preserve legacy behavior

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Protected paths are configured, not hardcoded > Scenario: Absent protected paths preserve legacy behavior

---

### TC-020: Invalid protected paths config is rejected

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Protected paths are configured, not hardcoded > Scenario: Invalid protected paths config is rejected

---

### TC-021: Non-200 response from listPullRequestFiles throws githubApiError

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** the GitHub REST API returns a non-200 status for `GET /repos/{owner}/{repo}/pulls/{pull_number}/files`
**WHEN** `listPullRequestFiles` is called
**THEN** it throws `githubApiError`, consistent with `getCheckStatus` and `listPullRequests`

---

### TC-022: Config load failure leaves protectedPaths undefined and guard is skipped

**Category**: integration
**Priority**: should
**Source**: design.md > D7 / tasks.md > T-07

**GIVEN** `loadConfig()` fails (e.g. malformed JSON) in the `--with-merge` block
**WHEN** `job archive --with-merge <slug>` runs
**THEN** `protectedPaths` is undefined, no `listPullRequestFiles` call is made, and the existing archive flow runs

---

### TC-023: listPullRequestFiles throwing during guard produces an escalation

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `protectedPaths` is non-empty and `listPullRequestFiles` throws a runtime error
**WHEN** `runMergeThenArchive` executes the guard
**THEN** it returns `{ exitCode: 1, escalation }` without calling `mergePullRequest` or `runArchiveOrchestrator`

---

### TC-024: Valid archive.protectedPaths array passes config validation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `archive.protectedPaths` is a non-empty array of non-empty strings (e.g. `[".github/workflows/**"]`)
**WHEN** `validateConfig` is called
**THEN** validation passes without throwing

---

### TC-025: Single-char wildcard ? matches exactly one non-slash character

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** the pattern `src/fo?.ts`
**WHEN** matched against `src/foo.ts` and `src/fo/o.ts`
**THEN** `globMatch` returns `true` for `src/foo.ts` and `false` for `src/fo/o.ts`

---

### TC-026: Multiple patterns — any single match blocks auto-merge

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-04

**GIVEN** `patterns: [".github/workflows/**", "package.json"]` and `changedFiles: ["package.json", "src/foo.ts"]` and `truncated: false`
**WHEN** `evaluateProtectedPaths` is called
**THEN** it returns `{ blocked: true, reason: "match", matched: ["package.json"] }`

---

### TC-027: bun run typecheck && bun run test pass with full implementation

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-10

**GIVEN** all tasks T-01 through T-09 are implemented, including test-double updates in T-08
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** both commands exit 0 with no errors or failures

---

## Result

```yaml
result: completed
total: 27
automated: 26
manual: 1
must: 19
should: 8
could: 0
blocked_reasons: []
```
