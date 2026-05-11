## Purpose

Display change folder contents (proposal/design/tasks/specs) from a branch in the workspace UI.
## Requirements
### Requirement: Change Folder Server Actions
The Server Actions for change folder retrieval SHALL use the DB-stored `branch_name` when available, falling back to deterministic derivation.

#### Scenario: getChangeFolderFiles uses DB branch_name
- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has a non-null `branch_name` in the database
- **THEN** the function uses the DB-stored `branch_name` for the GitHub Contents API call and derives the change folder path by extracting the slug from `branch_name`: take the substring after the first `/` character (e.g., `feat/my-slug-abcd1234` -> `my-slug-abcd1234`), then strip any trailing jobId suffix matching `/-[0-9a-f]{8}$/` (e.g., `my-slug-abcd1234` -> `my-slug`), and construct the path as `openspec/changes/{slug}/`. If `branch_name` does not contain `/`, treat it as an error and fall back to deterministic derivation

#### Scenario: getChangeFolderFiles with suffix-less branch (backward compat)
- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has `branch_name = "feat/readme-status-section"` in the database
- **THEN** the function takes the substring after `/` (`readme-status-section`), the jobId suffix strip is a no-op (no matching `/-[0-9a-f]{8}$/` pattern), and constructs the path as `openspec/changes/readme-status-section/`

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

