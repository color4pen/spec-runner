## Requirements

### Requirement: Login Page
The system SHALL display a login page at the root URL for unauthenticated users with a "Sign in with GitHub" button.

#### Scenario: Login page display
- **WHEN** an unauthenticated user navigates to the application root
- **THEN** the system displays a login page with the application name "SpecRunner" and a "Sign in with GitHub" button

#### Scenario: Login button initiates OAuth
- **WHEN** the user clicks "Sign in with GitHub"
- **THEN** the system initiates the Auth.js GitHub OAuth flow

#### Scenario: Authenticated user redirected from login
- **WHEN** an already-authenticated user navigates to the login page
- **THEN** the system redirects them to the repository list page

### Requirement: Repository List Page
The system SHALL display the authenticated user's GitHub repositories as the default page after login.

#### Scenario: Repository list display
- **WHEN** an authenticated user navigates to the repository list page
- **THEN** the system fetches repositories from the GitHub API using the user's OAuth token and displays them as a list or card grid

#### Scenario: Repository information shown
- **WHEN** repositories are displayed
- **THEN** each repository entry shows the repository name, owner, description, primary language, and last updated date

#### Scenario: Repository selection navigates to workspace
- **WHEN** the user clicks on a repository entry
- **THEN** the system navigates to the workspace page at `/repos/{owner}/{repo}`

#### Scenario: Repository list pagination
- **WHEN** the user has more repositories than a single GitHub API page returns (default 30 per page)
- **THEN** the system fetches all pages from the GitHub API and displays the complete list of accessible repositories

#### Scenario: Empty repository list
- **WHEN** the user has no accessible repositories
- **THEN** the system displays a message indicating no repositories were found

### Requirement: Workspace Page
The system SHALL display a workspace page for a selected repository with a sidebar and main content area.

#### Scenario: Workspace layout
- **WHEN** an authenticated user navigates to `/repos/{owner}/{repo}`
- **THEN** the system displays a page with a sidebar on the left and a main content area on the right

#### Scenario: Sidebar shows session list
- **WHEN** the workspace page loads
- **THEN** the sidebar displays a list of the user's sessions for that repository (from user_sessions table) and a "New Session" button

#### Scenario: Main area shows session detail
- **WHEN** the user selects a session from the sidebar
- **THEN** the main area displays the session detail including the chat interface (SSE streaming from Phase 1)

#### Scenario: Main area default state
- **WHEN** no session is selected in the workspace
- **THEN** the main area displays a prompt to create a new session or select an existing one

### Requirement: Protected Layout with Navigation
The system SHALL wrap all protected pages in a common layout with a header navigation bar.

#### Scenario: Header navigation display
- **WHEN** an authenticated user views any protected page
- **THEN** the system displays a header with the application name, the user's GitHub avatar and login name, and a logout button

#### Scenario: Navigation to repository list
- **WHEN** the user clicks the application name in the header
- **THEN** the system navigates back to the repository list page

### Requirement: Debug Page Preservation
The system SHALL preserve the Phase 1 debug UI at `/debug` behind authentication.

#### Scenario: Debug page accessible
- **WHEN** an authenticated user navigates to `/debug`
- **THEN** the system displays the Phase 1 debug dashboard (Agent/Environment/Session/Chat tabs)

#### Scenario: Debug page protected
- **WHEN** an unauthenticated user navigates to `/debug`
- **THEN** the system redirects to the login page
