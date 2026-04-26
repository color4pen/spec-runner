## MODIFIED Requirements

### Requirement: Change Folder Server Actions
The Server Actions for change folder retrieval SHALL use the DB-stored `branch_name` when available, falling back to deterministic derivation.

#### Scenario: getChangeFolderFiles uses DB branch_name
- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has a non-null `branch_name` in the database
- **THEN** the function uses the DB-stored `branch_name` for the GitHub Contents API call and derives the change folder path by extracting the slug from `branch_name`: take the substring after the first `/` character (e.g., `feat/2026-04-25-my-slug` -> `2026-04-25-my-slug`), then construct the path as `openspec/changes/{slug}/`. If `branch_name` does not contain `/`, treat it as an error and fall back to deterministic derivation

#### Scenario: getChangeFolderFiles fallback to deterministic derivation
- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has a null `branch_name` in the database
- **THEN** the function falls back to deriving slug and branch name from `request.createdAt` and `request.title` using `generateSlug()` and `generateBranchName()`

#### Scenario: getChangeFolderFileContent uses DB branch_name
- **WHEN** `getChangeFolderFileContent(requestId, filePath)` is called and the request has a non-null `branch_name` in the database
- **THEN** the function uses the DB-stored `branch_name` for the GitHub Contents API call

#### Scenario: Path traversal prevention preserved
- **WHEN** `getChangeFolderFileContent` receives a `filePath` parameter
- **THEN** the function validates that the resolved path starts with `openspec/changes/` and does not contain `..` segments, rejecting invalid paths with an error

### Requirement: Diff URL Display
The UI SHALL display a GitHub compare URL when the request has a `branch_name` stored in the database.

#### Scenario: Diff URL displayed when branch_name exists
- **WHEN** viewing a request detail and the request has a non-null `branch_name` in the database
- **THEN** the UI displays a link to `https://github.com/{owner}/{repo}/compare/{base}...{branch_name}` where `{base}` is the repository's `defaultBranch` (or `main` if null)

#### Scenario: Diff URL hidden when branch_name is null
- **WHEN** viewing a request detail and the request has a null `branch_name`
- **THEN** the UI does NOT display a diff URL link

#### Scenario: Diff URL opens in new tab
- **WHEN** the user clicks the diff URL link
- **THEN** the link opens in a new browser tab (`target="_blank"`) with `rel="noopener noreferrer"`
