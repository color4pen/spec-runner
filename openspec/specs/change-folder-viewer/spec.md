## ADDED Requirements

### Requirement: Change Folder File Listing
The system SHALL retrieve the list of files in a change folder from a specified branch using the GitHub Contents API.

#### Scenario: List change folder contents
- **WHEN** an authenticated user requests the contents of a change folder for a request they own
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/openspec/changes/{slug}/?ref={branch}` and returns the list of files and directories

#### Scenario: Nested directory listing
- **WHEN** the change folder contains subdirectories (e.g., `specs/`)
- **THEN** the system recursively retrieves the contents of subdirectories to build a complete file tree

#### Scenario: Change folder not found
- **WHEN** the specified branch does not exist or the change folder path does not exist on the branch
- **THEN** the system returns an empty result with an appropriate message (not an error)

### Requirement: Change Folder File Content Display
The system SHALL retrieve and display the content of individual markdown files from the change folder.

#### Scenario: Display markdown file content
- **WHEN** an authenticated user selects a file from the change folder listing
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`, decodes the Base64 content, and renders it as formatted markdown

#### Scenario: Supported file types
- **WHEN** displaying change folder contents
- **THEN** the system renders `.md` files as formatted markdown and displays other file types as plain text

#### Scenario: File content access control
- **WHEN** requesting file content
- **THEN** the system verifies that the requesting user owns the repository (through the request -> repository -> user chain) before making the GitHub API call

### Requirement: Change Folder Viewer Page
The system SHALL provide a dedicated page or panel within the workspace for viewing change folder contents.

#### Scenario: Viewer accessible from request detail
- **WHEN** an authenticated user views a request that has a propose session completed
- **THEN** the UI shows a link or tab to view the generated change folder with the list of files (proposal.md, design.md, tasks.md, specs/)

#### Scenario: File navigation
- **WHEN** viewing the change folder
- **THEN** the user can navigate between files (proposal.md, design.md, tasks.md, and spec files under specs/) without leaving the page

#### Scenario: Session status indicator
- **WHEN** viewing a request with a propose session
- **THEN** the UI displays the session status (active, waiting, completed, archived) so the user knows if change folder generation is still in progress

### Requirement: Change Folder Server Actions
The Server Actions for change folder retrieval SHALL be defined in `propose-actions.ts` with `'use server'` directive, performing ownership verification before GitHub API calls.

#### Scenario: getChangeFolderFiles Server Action
- **WHEN** `getChangeFolderFiles(requestId)` is called
- **THEN** the function authenticates via `getAuthenticatedUser()`, verifies request ownership via `verifyRequestOwnership()`, derives the branch name and change folder path from the request metadata, and calls `getDirectoryContents()` with the repository's OAuth token

#### Scenario: getChangeFolderFileContent Server Action
- **WHEN** `getChangeFolderFileContent(requestId, filePath)` is called
- **THEN** the function authenticates via `getAuthenticatedUser()`, verifies request ownership, validates that `filePath` is within the change folder path (preventing path traversal), and calls `getFileContent()` with the repository's OAuth token

#### Scenario: Path traversal prevention
- **WHEN** `getChangeFolderFileContent` receives a `filePath` parameter
- **THEN** the function validates that the resolved path starts with `openspec/changes/{slug}/` and does not contain `..` segments, rejecting invalid paths with an error
