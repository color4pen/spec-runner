# Spec: protected-paths-merge-guard

## Requirements

### Requirement: List pull request changed files via REST API

The `GitHubClient` port SHALL provide `listPullRequestFiles(owner, repo, prNumber)` that returns
the repo-root-relative POSIX paths of every file changed by a pull request, by calling
`GET /repos/{owner}/{repo}/pulls/{pull_number}/files` with pagination (`per_page=100`, following
`Link: rel="next"`). Because the endpoint is capped at 3000 files, the method SHALL return a
`truncated` flag that is `true` when the cap is reached and the file list is therefore incomplete.

#### Scenario: All changed files fit under the cap

**Given** a PR that changed `.github/workflows/ci.yml` and `src/foo.ts`
**When** `listPullRequestFiles(owner, repo, prNumber)` is called
**Then** it returns `{ files: [".github/workflows/ci.yml", "src/foo.ts"], truncated: false }`

#### Scenario: Changed files span multiple pages

**Given** a PR whose changed files require two pages of 100 results each
**When** `listPullRequestFiles` is called
**Then** the adapter follows the `Link: rel="next"` header and returns the union of all pages with `truncated: false`

#### Scenario: Changed file list reaches the API cap

**Given** a PR whose changed file count reaches the GitHub 3000-file cap (a `next` link still
remains after the cap is collected)
**When** `listPullRequestFiles` is called
**Then** it returns `truncated: true` so the caller can fail closed

### Requirement: Glob matching of file paths

The system SHALL provide a pure `globMatch(filePath, pattern)` predicate that reports whether a
repo-root-relative POSIX path matches a glob pattern. `*` MUST match any run of characters within a
single path segment (not crossing `/`), `**` MUST match across segment boundaries (including `/`),
`?` MUST match exactly one non-`/` character, and all other characters MUST match literally. Matching
MUST be a full-path match and case-sensitive. No external glob dependency is added.

#### Scenario: Single-segment wildcard matches one segment

**Given** the pattern `.github/workflows/*`
**When** matched against `.github/workflows/release.yml`
**Then** `globMatch` returns `true`

#### Scenario: Single-segment wildcard does not cross a slash

**Given** the pattern `.github/workflows/*`
**When** matched against `.github/workflows/nested/deploy.yml`
**Then** `globMatch` returns `false`

#### Scenario: Double-star matches across segments

**Given** the pattern `.github/**`
**When** matched against `.github/workflows/release.yml`
**Then** `globMatch` returns `true`

#### Scenario: Leading double-star matches any directory depth

**Given** the pattern `**/*.yml`
**When** matched against `a/b/c.yml`
**Then** `globMatch` returns `true`

#### Scenario: Literal pattern matches exact path only

**Given** the pattern `release-please-config.json`
**When** matched against `release-please-config.json`
**Then** `globMatch` returns `true`, and matching `docs/release-please-config.json` returns `false`

### Requirement: Evaluate protected-path decision

The system SHALL provide a pure `evaluateProtectedPaths({ changedFiles, truncated, patterns })`
that returns whether auto-merge MUST be blocked. When `patterns` is empty the decision MUST be
not-blocked (backward compatibility, evaluated before the truncated check). Otherwise, when
`truncated` is `true` the decision MUST be blocked with reason `truncated` (fail-closed). Otherwise
the decision MUST be blocked with reason `match` and the list of matched files when any changed file
matches any pattern, and not-blocked when none match.

#### Scenario: No patterns configured yields not blocked

**Given** `patterns: []` and any `changedFiles` and `truncated: true`
**When** `evaluateProtectedPaths` is called
**Then** it returns `{ blocked: false, reason: "none", matched: [] }`

#### Scenario: Matching file blocks with the matched list

**Given** `patterns: [".github/workflows/**"]` and `changedFiles: [".github/workflows/ci.yml", "src/foo.ts"]` and `truncated: false`
**When** `evaluateProtectedPaths` is called
**Then** it returns `{ blocked: true, reason: "match", matched: [".github/workflows/ci.yml"] }`

#### Scenario: No matching file does not block

**Given** `patterns: [".github/workflows/**"]` and `changedFiles: ["src/foo.ts", "README.md"]` and `truncated: false`
**When** `evaluateProtectedPaths` is called
**Then** it returns `{ blocked: false, reason: "none", matched: [] }`

#### Scenario: Truncated list with configured patterns fails closed

**Given** `patterns: [".github/workflows/**"]` and `truncated: true`
**When** `evaluateProtectedPaths` is called
**Then** it returns `{ blocked: true, reason: "truncated", matched: [] }`

### Requirement: Merge guard blocks auto-merge of protected-path PRs

`job archive --with-merge` SHALL, after confirming the PR is not already merged and before entering
the check-wait loop, fetch the PR's changed files and evaluate them against the configured protected
paths. When the decision is blocked, the command MUST NOT merge the PR and MUST exit with an
escalation (exit code 1); neither `mergePullRequest` nor the archive orchestrator is invoked. When
the decision is not blocked, the command MUST proceed with the existing wait-then-merge flow
unchanged.

#### Scenario: Protected-path PR is not auto-merged

**Given** `archive.protectedPaths` includes `.github/workflows/**` and the PR changed `.github/workflows/ci.yml`
**When** `job archive --with-merge <slug>` runs
**Then** the command exits with an escalation, and `mergePullRequest` and the archive orchestrator are not called

#### Scenario: Non-matching PR is merged as before

**Given** `archive.protectedPaths` includes `.github/workflows/**` and the PR changed only `src/foo.ts`
**When** `job archive --with-merge <slug>` runs
**Then** the guard does not block and the command proceeds to wait for checks and squash-merge as before

#### Scenario: Already-merged PR bypasses the guard

**Given** the PR is already in `MERGED` state
**When** `job archive --with-merge <slug>` runs
**Then** the guard is skipped and the command runs the archive orchestrator directly

### Requirement: Fail-closed when changed file list is truncated

When the changed file list returned for a protected-path-enabled repo is truncated by the GitHub API
3000-file cap, `job archive --with-merge` MUST NOT auto-merge and MUST exit with an escalation,
because protected paths could otherwise be silently missed.

#### Scenario: Truncated file list stops auto-merge

**Given** `archive.protectedPaths` is non-empty and `listPullRequestFiles` returns `truncated: true`
**When** `job archive --with-merge <slug>` runs
**Then** the command exits with an escalation and does not merge the PR

### Requirement: Escalation output content

When the merge guard blocks, the escalation output SHALL include the matched files (for a
protected-path match) or a truncation notice (for a truncated list), and the steps for a human to
merge the PR by hand.

#### Scenario: Match escalation lists matched files and manual merge steps

**Given** the guard blocked because `.github/workflows/ci.yml` matched a protected path
**When** the escalation is emitted
**Then** its detected-state lists `.github/workflows/ci.yml` and its recommended action describes how to review and manually merge the PR, then archive it

#### Scenario: Truncation escalation explains the cap and manual merge steps

**Given** the guard blocked because the changed file list was truncated
**When** the escalation is emitted
**Then** it states the file list exceeded the GitHub API cap and describes how to review and manually merge the PR by hand

### Requirement: Protected paths are configured, not hardcoded

The protected paths SHALL be read from `.specrunner/config.json` as `archive.protectedPaths`
(an array of glob strings) and MUST NOT be hardcoded. When the key is absent or an empty array,
`job archive --with-merge` MUST behave exactly as before (no guard, no extra API call). Config
validation MUST reject a non-array value and any non-string or empty-string element.

#### Scenario: Absent protected paths preserve legacy behavior

**Given** `.specrunner/config.json` has no `archive.protectedPaths` key (or an empty array)
**When** `job archive --with-merge <slug>` runs
**Then** the guard is skipped (no `listPullRequestFiles` call) and the PR is merged using the existing flow

#### Scenario: Invalid protected paths config is rejected

**Given** `archive.protectedPaths` is set to a non-array, or contains a non-string or empty-string element
**When** the config is validated
**Then** validation throws `CONFIG_INVALID`
