## Requirements

### Requirement: Remove gh CLI binary dependency from finish command

The finish command SHALL NOT require the `gh` CLI binary.

#### Scenario: Binary check excludes gh
- **WHEN** Phase 0 check 6 (binary check) runs
- **THEN** only `git` is checked; `gh` is not in the required binary list

#### Scenario: PR operations use REST API
- **WHEN** Phase 0 (pr view), Phase 2 (post-push poll), or Phase 3 (merge) executes PR operations
- **THEN** the operations use the injected `GitHubClient` port (REST API) instead of spawning `gh` subprocess

#### Scenario: --pr reverse lookup uses REST API
- **WHEN** `specrunner finish --pr <num>` resolves the target
- **THEN** `GitHubClient.getPullRequest()` is used to fetch `headRefName` instead of `gh pr view --json headRefName`

#### Scenario: merge without --admin flag
- **WHEN** Phase 3 merges a PR via REST API
- **THEN** the merge uses `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with `{ merge_method: "squash" }`. Admin bypass is implicit via token permissions (no explicit `--admin` parameter).

#### Scenario: merge failure on blocked PR
- **WHEN** the REST API merge returns 405 (PR not mergeable due to required status checks)
- **THEN** the finish command escalates with a message indicating admin permissions may be required

### Requirement: FinishInput accepts GitHubClient

The `FinishInput` interface SHALL accept `githubClient`, `owner`, and `repo` instead of relying on `githubToken` for gh CLI subprocess injection.

#### Scenario: GitHubClient injection
- **WHEN** `runFinishOrchestrator()` is called
- **THEN** the `githubClient`, `owner`, and `repo` fields are used for all PR operations
- **AND** the `githubToken` field is no longer required
