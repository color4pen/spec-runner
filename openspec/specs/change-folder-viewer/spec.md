## MODIFIED Requirements

### Requirement: Change Folder File Listing
The system SHALL retrieve the list of files in a change folder from a specified branch using the GitHub Contents API.

#### Scenario: List change folder contents
- **WHEN** an authenticated user requests the contents of a change folder for a request they own
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/openspec/changes/{slug}/?ref={branch}` and returns the list of files and directories

#### Scenario: Nested directory listing
- **WHEN** the change folder contains subdirectories (e.g., `specs/`)
- **THEN** the initial listing returns shallow entries including directories with `type: 'dir'`; subdirectory contents are fetched lazily when the user expands a directory in the viewer

#### Scenario: Change folder not found
- **WHEN** the specified branch does not exist or the change folder path does not exist on the branch
- **THEN** the system returns an empty result with an appropriate message (not an error)

### Requirement: Change Folder Viewer Page
The system SHALL provide a dedicated page or panel within the workspace for viewing change folder contents.

#### Scenario: Viewer accessible from request detail
- **WHEN** an authenticated user views a request that has a propose session completed
- **THEN** the UI shows a link or tab to view the generated change folder with the list of files (proposal.md, design.md, tasks.md, specs/)

#### Scenario: File navigation
- **WHEN** viewing the change folder
- **THEN** the user can navigate between files (proposal.md, design.md, tasks.md, and spec files under specs/) without leaving the page, including expanding directories to access nested files

#### Scenario: Session status indicator
- **WHEN** viewing a request with a propose session
- **THEN** the UI displays the session status (active, waiting, completed, archived) so the user knows if change folder generation is still in progress

#### Scenario: Directory click handling
- **WHEN** the user clicks an entry with `type: 'dir'` in the file tree
- **THEN** the system expands the directory to show its children instead of attempting to load it as a file
