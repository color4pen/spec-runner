## Purpose

Layout structure of the workspace UI: sidebar request list and main content area.

## Requirements
### Requirement: Workspace Page
The system SHALL display a workspace page for a selected repository with a sidebar showing request list and main content area showing request detail.

#### Scenario: Workspace layout
- **WHEN** an authenticated user navigates to `/repos/{owner}/{repo}`
- **THEN** the system displays a page with a sidebar on the left and a main content area on the right

#### Scenario: Sidebar shows request list
- **WHEN** the workspace page loads
- **THEN** the sidebar displays a list of the user's requests for that repository (from `requests` table via `repositories`) with each request showing title, type badge, and status indicator, and a "New Request" button

#### Scenario: Main area shows request detail
- **WHEN** the user selects a request from the sidebar
- **THEN** the main area displays the request detail including title, type, status, content, and a list of associated sessions with their role, step, and status

#### Scenario: Session selection from request detail
- **WHEN** the user selects a session from the request detail view
- **THEN** the main area displays the session chat interface (SSE streaming from Phase 1) with the request context visible

#### Scenario: Main area default state
- **WHEN** no request is selected in the workspace
- **THEN** the main area displays a prompt to create a new request or select an existing one

#### Scenario: New request creation from workspace
- **WHEN** the user clicks "New Request" in the sidebar
- **THEN** the system displays a form to create a new request with fields for type (dropdown), title (text), and content (textarea)
