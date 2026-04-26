## ADDED Requirements

### Requirement: Directory Entry Expansion
The system SHALL expand directory entries in the change folder viewer by fetching their contents from the GitHub Contents API, instead of attempting to read them as files.

#### Scenario: Click a directory entry
- **WHEN** the user clicks an entry with `type: 'dir'` in the change folder viewer
- **THEN** the system calls `getDirectoryContents()` for that directory path and displays the returned entries as children of the clicked directory

#### Scenario: Directory already expanded
- **WHEN** the user clicks a directory entry that is already expanded
- **THEN** the system collapses the directory, hiding its children without making an API call

#### Scenario: Nested directory expansion
- **WHEN** a directory contains subdirectories (e.g., `specs/app-layout/`)
- **THEN** the user can expand those subdirectories recursively, each level fetching contents lazily on click

#### Scenario: Empty directory
- **WHEN** the user expands a directory that contains no files
- **THEN** the system displays an "Empty directory" message within the expanded area

### Requirement: Directory Contents Server Action
The system SHALL provide a `getChangeFolderDirectoryContents(requestId, dirPath)` server action that retrieves subdirectory contents with ownership verification and path-traversal prevention.

#### Scenario: Fetch subdirectory contents
- **WHEN** `getChangeFolderDirectoryContents(requestId, dirPath)` is called with a valid directory path within the change folder
- **THEN** the function authenticates via `getAuthenticatedUser()`, verifies request ownership, validates that `dirPath` starts with `openspec/changes/{slug}/` and does not contain `..` segments, and returns the directory listing from `getDirectoryContents()`

#### Scenario: Path traversal rejected
- **WHEN** `getChangeFolderDirectoryContents()` receives a `dirPath` containing `..` or not starting with the change folder prefix
- **THEN** the function throws an error with message "Invalid file path: must be within the change folder"

### Requirement: Tree Rendering
The system SHALL render the change folder file listing as an indented tree, visually distinguishing directories from files.

#### Scenario: Visual differentiation
- **WHEN** rendering the file tree
- **THEN** directory entries display a folder indicator (e.g., trailing `/` or icon) and file entries display without the indicator

#### Scenario: Indentation
- **WHEN** a directory is expanded and its children are displayed
- **THEN** the children are indented relative to their parent directory to convey hierarchy

#### Scenario: File selection within expanded directory
- **WHEN** the user clicks a file entry inside an expanded directory
- **THEN** the system loads and displays that file's content in the content pane, same as top-level file selection
