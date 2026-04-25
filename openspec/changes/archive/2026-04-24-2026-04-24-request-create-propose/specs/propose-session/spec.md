## ADDED Requirements

### Requirement: Propose Session Startup
The system SHALL start a propose session after a request is created, using the same pattern as bootstrap session startup (Vault setup, session creation, message sending).

#### Scenario: Start propose session for a request
- **WHEN** an authenticated user triggers propose session startup for a request they own in `draft` status
- **THEN** the system transitions the request to `in-progress`, ensures the user's Vault is configured, creates a bound session with role `'propose'`, and sends an instruction message containing the request's type, title, content, enabled options, and branch name

#### Scenario: Branch naming convention
- **WHEN** starting a propose session
- **THEN** the system generates the branch name as `{prefix}/{slug}` where prefix is mapped from request type (`new-feature` -> `feat/`, `spec-change` -> `change/`, `refactoring` -> `refactor/`, `bugfix` -> `fix/`) and slug is derived from the request

#### Scenario: Propose instruction message content
- **WHEN** building the propose instruction message
- **THEN** the message includes: (1) branch creation instruction with the generated branch name, (2) openspec-propose skill execution with the request's title and content as context, (3) request type and enabled workflow options, (4) commit and push instruction

#### Scenario: Idempotent branch handling
- **WHEN** starting a propose session and a branch with the same name already exists
- **THEN** the system deletes the existing branch before proceeding (same pattern as bootstrap)

#### Scenario: Request not in draft status rejected
- **WHEN** attempting to start a propose session for a request not in `draft` status
- **THEN** the system rejects the operation with an error message indicating the request must be in draft status

#### Scenario: Non-owned request rejected
- **WHEN** an authenticated user attempts to start a propose session for a request they do not own
- **THEN** the system rejects with "Request not found" without revealing whether the request exists

### Requirement: Propose Session Rollback
The system SHALL roll back state changes if propose session startup fails at any step after the request status transition.

#### Scenario: Rollback on session creation failure
- **WHEN** session creation or message sending fails during propose startup
- **THEN** the system reverts the request status back to `draft` and attempts to cancel the session if it was partially created

#### Scenario: Rollback preserves request record
- **WHEN** rollback occurs during propose startup
- **THEN** the request record remains in the database with `draft` status (not deleted or cancelled), allowing the user to retry

### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt tailored to openspec-propose skill execution.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-sonnet-4-6`, `agent_toolset_20260401`, and a system prompt containing openspec-propose workflow instructions

#### Scenario: Agent and environment selection
- **WHEN** starting a propose session
- **THEN** the system requires an agent ID and environment ID to be specified (passed from the UI or pre-configured)

### Requirement: Slug Derivation
The system SHALL derive a deterministic slug from the request's creation date and title, and store it on the request record for consistent branch name reconstruction.

#### Scenario: Slug generation from title
- **WHEN** starting a propose session
- **THEN** the system generates a slug by converting the title to kebab-case (lowercase, spaces and special characters replaced with hyphens, consecutive hyphens collapsed, leading/trailing hyphens removed), prefixed with the request creation date in `YYYY-MM-DD-` format. Only ASCII alphanumeric characters and hyphens are retained; all other characters are removed before hyphen collapsing

#### Scenario: Slug length limit
- **WHEN** generating a slug
- **THEN** the slug (including date prefix) is truncated to a maximum of 60 characters, with truncation applied at a hyphen boundary to avoid partial words

#### Scenario: Slug stored on request record
- **WHEN** a slug is generated for a propose session
- **THEN** the slug is stored in the `requests.slug` column (or derived deterministically from title and creation date without storage, as the derivation is pure and idempotent). The chosen approach is deterministic derivation without a dedicated column -- the slug is computed from `createdAt` (date portion) and `title` using the same algorithm wherever needed

#### Scenario: English-only title assumption
- **WHEN** generating a slug from a title
- **THEN** the system assumes English input. Non-ASCII characters are stripped. If the resulting slug (excluding date prefix) is empty after stripping, the system rejects the request with a validation error

### Requirement: Module Design for Propose Actions
The `propose-actions.ts` module SHALL use the `'use server'` directive. All exported functions perform authentication via `getAuthenticatedUser()` and verify resource ownership before proceeding.

#### Scenario: 'use server' directive present
- **WHEN** inspecting `src/lib/propose-actions.ts`
- **THEN** the file contains `'use server'` at the top

#### Scenario: Authentication in all exported functions
- **WHEN** any exported async function in `propose-actions.ts` is called
- **THEN** the function calls `getAuthenticatedUser()` at the top and does not accept `userId` as a parameter
