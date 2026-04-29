## Purpose

GitHub OAuth integration for the web app via Auth.js.

## Requirements

### Requirement: GitHub OAuth Login
The system SHALL authenticate users via GitHub OAuth using Auth.js v5 with the GitHub Provider. The OAuth flow SHALL request `repo` scope to obtain a token usable for GitHub API access.

**Scope justification**: The `repo` scope is required because Managed Agents Sessions mount GitHub repositories with read/write access (the agent needs to create branches, commit files, and push changes). A narrower scope (e.g., `public_repo` or `read:user`) would be insufficient for Session repository mounting. In the future, migration to a GitHub App with fine-grained permissions is recommended to reduce the scope of access (see Risks in design.md).

#### Scenario: Successful login
- **WHEN** an unauthenticated user clicks the "Sign in with GitHub" button
- **THEN** the system redirects to GitHub's OAuth authorization page and, after consent, creates an authenticated session with a JWT containing the user's GitHub profile and access token

#### Scenario: Login callback processing
- **WHEN** GitHub redirects back to the application with an authorization code
- **THEN** Auth.js exchanges the code for an access token, extracts the GitHub user profile (id, login, avatar_url), and stores the access token in the encrypted JWT

#### Scenario: First-time login creates user record
- **WHEN** a user logs in for the first time (no matching github_id in the users table)
- **THEN** the system creates a new record in the users table with github_id, github_login, and github_avatar_url

#### Scenario: Returning user updates profile
- **WHEN** a user with an existing record logs in again
- **THEN** the system updates github_login and github_avatar_url if they have changed

### Requirement: Logout
The system SHALL allow authenticated users to sign out, destroying their session.

#### Scenario: Successful logout
- **WHEN** an authenticated user clicks the logout button
- **THEN** the Auth.js session is destroyed, the JWT cookie is cleared, and the user is redirected to the login page

### Requirement: Authentication Guard
The system SHALL protect all routes under the `(protected)` route group, redirecting unauthenticated users to the login page.

#### Scenario: Unauthenticated access to protected page
- **WHEN** an unauthenticated user navigates to any URL under the `(protected)` route group
- **THEN** the system redirects the user to the login page

#### Scenario: Authenticated access to protected page
- **WHEN** an authenticated user navigates to a URL under the `(protected)` route group
- **THEN** the system renders the requested page with the user's session context available

#### Scenario: Unauthenticated API access
- **WHEN** an unauthenticated request is made to a protected API route (e.g., SSE stream endpoint)
- **THEN** the system returns HTTP 401 Unauthorized

### Requirement: OAuth Token Availability
The system SHALL make the GitHub OAuth access token available to server-side code for GitHub API calls and Managed Agents session creation.

#### Scenario: Token available in server context
- **WHEN** server-side code (Server Actions, API Routes) needs the GitHub access token
- **THEN** the system provides the token by decoding the authenticated user's JWT session

#### Scenario: Token used for Managed Agents session
- **WHEN** creating a Managed Agents Session with a GitHub repository resource
- **THEN** the system uses the authenticated user's OAuth token as the `authorization_token` instead of a static environment variable

#### Scenario: Token invalidation handling
- **WHEN** a GitHub API call returns HTTP 401 (token revoked or expired)
- **THEN** the system clears the current Auth.js session and redirects the user to the login page with a message indicating re-authentication is required

#### Scenario: Token invalidation during session operation
- **WHEN** a Managed Agents Session operation fails due to an invalid GitHub token
- **THEN** the system displays an error indicating the GitHub token is no longer valid and prompts the user to re-authenticate
