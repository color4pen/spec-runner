## Delta: gh-cli-to-rest-api

### Requirement: PR creation uses REST API instead of gh CLI

The `runPrCreate()` function SHALL use the injected `GitHubClient` port for PR operations instead of spawning `gh` CLI subprocesses.

#### Scenario: PR listing via REST API
- **WHEN** `runPrCreate()` checks for existing PRs
- **THEN** it calls `GitHubClient.listPullRequests()` instead of `gh pr list`

#### Scenario: PR creation via REST API
- **WHEN** `runPrCreate()` creates a new PR
- **THEN** it calls `GitHubClient.createPullRequest()` instead of `gh pr create`
- **AND** no temporary file is created for the PR body (body is passed directly in the API request)

### Requirement: PrCreateInput accepts GitHubClient

The `PrCreateInput` interface SHALL accept `githubClient`, `owner`, and `repo` fields.

#### Scenario: Input contract
- **WHEN** `runPrCreate()` is called
- **THEN** the `githubClient`, `owner`, and `repo` fields are required
- **AND** the `githubToken` field is no longer accepted
