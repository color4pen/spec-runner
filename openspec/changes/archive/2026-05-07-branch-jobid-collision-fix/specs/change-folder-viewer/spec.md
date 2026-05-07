# change-folder-viewer

## MODIFIED Requirements

### Requirement: Change Folder Server Actions
The Server Actions for change folder retrieval SHALL use the DB-stored `branch_name` when available, falling back to deterministic derivation.

#### Scenario: getChangeFolderFiles uses DB branch_name
- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has a non-null `branch_name` in the database
- **THEN** the function uses the DB-stored `branch_name` for the GitHub Contents API call and derives the change folder path by extracting the slug from `branch_name`: take the substring after the first `/` character (e.g., `feat/my-slug-abcd1234` -> `my-slug-abcd1234`), then strip any trailing jobId suffix matching `/-[0-9a-f]{8}$/` (e.g., `my-slug-abcd1234` -> `my-slug`), and construct the path as `openspec/changes/{slug}/`. If `branch_name` does not contain `/`, treat it as an error and fall back to deterministic derivation

#### Scenario: getChangeFolderFiles with suffix-less branch (backward compat)
- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has `branch_name = "feat/readme-status-section"` in the database
- **THEN** the function takes the substring after `/` (`readme-status-section`), the jobId suffix strip is a no-op (no matching `/-[0-9a-f]{8}$/` pattern), and constructs the path as `openspec/changes/readme-status-section/`
