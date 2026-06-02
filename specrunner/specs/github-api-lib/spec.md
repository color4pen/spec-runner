## Purpose

Wrapper utilities around GitHub REST API for branches, file contents, and pull requests.
## Requirements

### Requirement: Branch File Listing
The github-api.ts module SHALL provide a function to list files in a directory on a specific branch.

#### Scenario: List directory contents on branch
- **WHEN** `getDirectoryContents(token, owner, repo, path, ref)` is called with a valid branch reference
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` and returns an array of file/directory entries with name, path, type, and size

#### Scenario: Directory not found on branch
- **WHEN** the specified path does not exist on the branch
- **THEN** the function returns an empty array (does not throw for 404)

#### Scenario: Branch not found
- **WHEN** the specified branch reference does not exist
- **THEN** the function returns an empty array (does not throw for 404)

#### Scenario: Directory entry limit
- **WHEN** a directory contains more than 1000 entries
- **THEN** the GitHub Contents API returns only the first 1000 entries. For change folder usage this limit is not expected to be reached; if needed in the future, the implementation should switch to the Git Trees API

### Requirement: Branch File Content Retrieval
The github-api.ts module SHALL provide a function to retrieve the content of a single file on a specific branch.

#### Scenario: Get file content on branch
- **WHEN** `getFileContent(token, owner, repo, path, ref)` is called with a valid file path and branch reference
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}`, decodes the Base64 `content` field, and returns the decoded string

#### Scenario: File not found on branch
- **WHEN** the specified file does not exist on the branch
- **THEN** the function returns null (does not throw for 404)

#### Scenario: File content encoding
- **WHEN** the GitHub API returns file content
- **THEN** the function decodes the `content` field from Base64 encoding (GitHub's default) and returns the UTF-8 string

### Requirement: PR Listing via REST API

The GitHubClient port SHALL provide a method to list pull requests for a given head branch.

#### Scenario: List PRs by head branch
- **WHEN** `listPullRequests(owner, repo, head, base, state)` is called
- **THEN** the system calls `GET /repos/{owner}/{repo}/pulls?head={owner}:{head}&base={base}&state=all` and returns an array of PR entries with `url`, `number`, `state` (normalized to `"OPEN"` / `"MERGED"` / `"CLOSED"`)

#### Scenario: No PRs exist
- **WHEN** no PRs match the head/base filter
- **THEN** the function returns an empty array

#### Scenario: Merged PR detection
- **WHEN** a PR has `state: "closed"` and `merged_at` is non-null in the REST response
- **THEN** the entry's `state` is normalized to `"MERGED"`

### Requirement: PR Creation via REST API

The GitHubClient port SHALL provide a method to create a pull request.

#### Scenario: Create PR
- **WHEN** `createPullRequest(owner, repo, head, base, title, body)` is called
- **THEN** the system calls `POST /repos/{owner}/{repo}/pulls` with `{ title, body, head, base }` and returns `{ url, number }` from the response

#### Scenario: Create PR auth failure
- **WHEN** the GitHub API returns 401
- **THEN** the function throws `SpecRunnerError(GITHUB_TOKEN_EXPIRED)`

### Requirement: PR View via REST API

The GitHubClient port SHALL provide a method to fetch a single PR's status.

#### Scenario: Get PR details
- **WHEN** `getPullRequest(owner, repo, prNumber)` is called
- **THEN** the system calls `GET /repos/{owner}/{repo}/pulls/{pull_number}` and returns a normalized object with:
  - `state`: `"OPEN"` / `"MERGED"` / `"CLOSED"` (from `state` + `merged` fields)
  - `mergeStateStatus`: uppercase string (from `mergeable_state`)
  - `headRefName`: string (from `head.ref`)
  - `mergeable`: `"MERGEABLE"` / `"CONFLICTING"` / `"UNKNOWN"` (from `mergeable` boolean/null)

#### Scenario: Mergeable not yet computed
- **WHEN** the REST API returns `mergeable: null`
- **THEN** the `mergeable` field is normalized to `"UNKNOWN"`

#### Scenario: PR not found
- **WHEN** the GitHub API returns 404
- **THEN** the function throws `SpecRunnerError(GITHUB_API_ERROR)` with status 404

### Requirement: PR Merge via REST API

The GitHubClient port SHALL provide a method to merge a pull request, with built-in retry for transient failures. Transient merge failures (HTTP 405 with "Base branch was modified" or "unstable state" messages, and HTTP 423 Locked) SHALL be retried with exponential backoff (1s, 2s, 4s) up to 3 attempts total. Permanent failures (HTTP 403, 409, non-transient 405) MUST NOT be retried.

#### Scenario: Squash merge PR

- **WHEN** `mergePullRequest(owner, repo, prNumber, { mergeMethod: "squash" })` is called
- **THEN** the system calls `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with `{ merge_method: "squash" }` and returns `{ merged: true, message }` on success

#### Scenario: PR not mergeable

- **WHEN** the GitHub API returns 405 (Method Not Allowed) with a non-transient message
- **THEN** the function returns `{ merged: false, message }` without retry

#### Scenario: Head branch modified

- **WHEN** the GitHub API returns 409 (Conflict)
- **THEN** the function returns `{ merged: false, message }` without retry

#### Scenario: Transient 405 merge failure with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "Base branch was modified"
- **THEN** the adapter retries with exponential backoff (1s, 2s, 4s), up to 3 attempts total, and returns the final result

#### Scenario: Transient 405 unstable state with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "unstable state"
- **THEN** the adapter retries with exponential backoff, up to 3 attempts total, and returns the final result

#### Scenario: Transient 423 Locked merge failure with retry

- **WHEN** `mergePullRequest()` receives HTTP 423 (Locked)
- **THEN** the adapter retries with exponential backoff, up to 3 attempts total, and returns the final result

#### Scenario: Permanent 403 merge failure without retry

- **WHEN** `mergePullRequest()` receives HTTP 403
- **THEN** the function returns `{ merged: false, message }` immediately without retry

#### Scenario: Permanent 409 merge failure without retry

- **WHEN** `mergePullRequest()` receives HTTP 409
- **THEN** the function returns `{ merged: false, message }` immediately without retry

#### Scenario: Transient retry exhausted

- **WHEN** `mergePullRequest()` receives transient failures for all 3 attempts
- **THEN** the function returns `{ merged: false, message }` from the last attempt (does not throw)

#### Scenario: Merge retry logging

- **WHEN** a transient merge failure triggers a retry
- **THEN** the adapter writes a log line to stdout in the format "GitHub PR merge retry: {message}, retrying ({attempt}/3)..." before sleeping

### Requirement: Retry and Rate Limit Handling

The client SHALL cap 429 and `X-RateLimit-Remaining: 0` retries at `MAX_429_RETRIES` (5) using a single shared counter, and MUST throw `SpecRunnerError(GITHUB_API_ERROR)` when the limit is exceeded.

#### Scenario: 429 retry exhausted

- **WHEN** a REST API call returns 429 Too Many Requests continuously
- **THEN** the client retries up to `MAX_429_RETRIES` (5) times, and throws `SpecRunnerError(GITHUB_API_ERROR)` when exhausted

#### Scenario: Rate limit remaining exhausted

- **WHEN** `X-RateLimit-Remaining` is `0` on consecutive responses
- **THEN** the client retries up to `MAX_429_RETRIES` (5) times (counter shared with 429), and throws `SpecRunnerError(GITHUB_API_ERROR)` when exhausted

#### Scenario: 429 and rate-limit share retry counter

- **WHEN** 429 responses and `X-RateLimit-Remaining: 0` responses occur in any combination
- **THEN** a single shared counter tracks both, and the total retries do not exceed `MAX_429_RETRIES` (5)

### Requirement: API Version Header

All GitHub REST API calls SHALL include the `X-GitHub-Api-Version` header.

#### Scenario: Version header present
- **WHEN** any REST API call is made
- **THEN** the request includes `X-GitHub-Api-Version: 2022-11-28`

### Requirement: GitHubApiClient は baseUrl 経由で API endpoint にアクセスする

`GitHubApiClient` は MUST constructor で受け取った `baseUrl` を使って全 API endpoint の URL を構築する。adapter 内に `api.github.com` のハードコードは SHALL 存在しない（コメント除く）。`createGitHubClient` factory は MUST `baseUrl` パラメータを受け取り、`GitHubApiClient` に渡す。

`GitHubClient` port interface は host / baseUrl を露出せず不変とする。baseUrl は adapter の内部詳細であり、port を経由して domain に漏れてはならない（B-2 の延長）。

#### Scenario: github.com の baseUrl

- **GIVEN** `baseUrl` が `https://api.github.com`
- **WHEN** `verifyBranch("owner", "repo", "main")` を呼ぶ
- **THEN** `https://api.github.com/repos/owner/repo/branches/main` にリクエストする

#### Scenario: GHES の baseUrl

- **GIVEN** `baseUrl` が `https://ghes.corp.example.com/api/v3`
- **WHEN** `verifyBranch("owner", "repo", "main")` を呼ぶ
- **THEN** `https://ghes.corp.example.com/api/v3/repos/owner/repo/branches/main` にリクエストする

#### Scenario: カスタム apiBaseUrl

- **GIVEN** `baseUrl` が `https://custom-proxy.example.com/gh`
- **WHEN** `getRawFile("owner", "repo", "main", "README.md")` を呼ぶ
- **THEN** `https://custom-proxy.example.com/gh/repos/owner/repo/contents/README.md?ref=main` にリクエストする

#### Scenario: port interface は変更されない

- **WHEN** `GitHubClient` port interface の型定義を確認する
- **THEN** `host` / `baseUrl` に関するメンバーは存在しない
