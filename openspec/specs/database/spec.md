## ADDED Requirements

### Requirement: Repositories Table Schema
The system SHALL define a `repositories` table that binds users to their connected repositories, with bootstrap status tracking.

#### Scenario: Repositories table structure
- **WHEN** the database schema is applied
- **THEN** the `repositories` table contains columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `user_id` (INTEGER NOT NULL FK to users.id), `owner` (TEXT NOT NULL), `name` (TEXT NOT NULL), `full_name` (TEXT NOT NULL), `default_branch` (TEXT, nullable — populated from GitHub API on registration, null if API does not return it), `bootstrap_status` (TEXT NOT NULL DEFAULT 'uninitialized'), `bootstrap_pr_url` (TEXT), `created_at` (TEXT NOT NULL DEFAULT current_timestamp)

#### Scenario: Bootstrap status CHECK constraint
- **WHEN** an attempt is made to insert or update a repository with a `bootstrap_status` value not in (`uninitialized`, `bootstrapping`, `pr_pending`, `ready`)
- **THEN** the database rejects the operation with a CHECK constraint violation

#### Scenario: Unique constraint on user and repository
- **WHEN** an attempt is made to insert a repository with a `user_id` and `full_name` combination that already exists
- **THEN** the database rejects the insert with a unique constraint violation

#### Scenario: Cascade delete repositories on user deletion
- **WHEN** a user record is deleted from the `users` table
- **THEN** all associated `repositories` records are deleted via cascade

### Requirement: Bootstrap Column Migration
The system SHALL add `bootstrap_status` and `bootstrap_pr_url` columns to the existing `repositories` table via migration.

#### Scenario: Migration adds bootstrap columns
- **WHEN** the migration runs on a database with an existing `repositories` table
- **THEN** the `bootstrap_status` column (TEXT NOT NULL DEFAULT 'uninitialized') and `bootstrap_pr_url` column (TEXT, nullable) are added to the `repositories` table

#### Scenario: Migration idempotency
- **WHEN** the migration is run on a database where the bootstrap columns already exist
- **THEN** no errors occur and no data is modified

#### Scenario: Existing repositories default to uninitialized
- **WHEN** the migration adds the `bootstrap_status` column
- **THEN** all existing repository records have `bootstrap_status` set to `uninitialized`

### Requirement: Requests Table Schema
The system SHALL define a `requests` table that represents workflow units within a repository.

#### Scenario: Requests table structure
- **WHEN** the database schema is applied
- **THEN** the `requests` table contains columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `repository_id` (INTEGER NOT NULL FK to repositories.id), `type` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'draft'), `title` (TEXT NOT NULL), `content` (TEXT), `created_at` (TEXT NOT NULL DEFAULT current_timestamp), `updated_at` (TEXT NOT NULL DEFAULT current_timestamp)

#### Scenario: Foreign key to repositories enforced
- **WHEN** an attempt is made to insert a request with a `repository_id` that does not exist in the repositories table
- **THEN** the database rejects the insert with a foreign key constraint violation

#### Scenario: Cascade delete requests on repository deletion
- **WHEN** a repository record is deleted from the `repositories` table
- **THEN** all associated `requests` records are deleted via cascade

#### Scenario: Request type CHECK constraint
- **WHEN** an attempt is made to insert a request with a `type` value not in (`new-feature`, `spec-change`, `refactoring`, `bugfix`)
- **THEN** the database rejects the insert with a CHECK constraint violation

#### Scenario: Request status CHECK constraint
- **WHEN** an attempt is made to insert or update a request with a `status` value not in (`draft`, `in-progress`, `reviewing`, `completed`, `cancelled`)
- **THEN** the database rejects the operation with a CHECK constraint violation

### Requirement: Sessions Table Schema (Redesigned)
The system SHALL define a `sessions` table that binds Managed Agents sessions to requests with role and step tracking.

#### Scenario: Sessions table structure
- **WHEN** the database schema is applied
- **THEN** the `sessions` table contains columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `request_id` (INTEGER NOT NULL FK to requests.id), `managed_session_id` (TEXT NOT NULL), `role` (TEXT NOT NULL), `step` (TEXT), `status` (TEXT NOT NULL DEFAULT 'active'), `title` (TEXT NOT NULL), `created_at` (TEXT NOT NULL DEFAULT current_timestamp), `updated_at` (TEXT NOT NULL DEFAULT current_timestamp)

#### Scenario: Foreign key to requests enforced
- **WHEN** an attempt is made to insert a session with a `request_id` that does not exist in the requests table
- **THEN** the database rejects the insert with a foreign key constraint violation

#### Scenario: Cascade delete sessions on request deletion
- **WHEN** a request record is deleted from the `requests` table
- **THEN** all associated `sessions` records are deleted via cascade

#### Scenario: Session role CHECK constraint
- **WHEN** an attempt is made to insert a session with a `role` value not in (`implementer`, `reviewer`, `fixer`, `explorer`)
- **THEN** the database rejects the insert with a CHECK constraint violation

#### Scenario: Session status CHECK constraint
- **WHEN** an attempt is made to insert or update a session with a `status` value not in (`active`, `waiting`, `completed`, `archived`)
- **THEN** the database rejects the operation with a CHECK constraint violation

### Requirement: Data Migration from user_sessions
The system SHALL migrate existing `user_sessions` data to the new schema without data loss.

#### Scenario: Migration creates repository records
- **WHEN** the migration runs on a database with existing `user_sessions` records
- **THEN** for each unique `(user_id, repo)` combination in `user_sessions`, a `repositories` record is created with `owner` and `name` parsed from the `repo` column

#### Scenario: Migration creates request records
- **WHEN** the migration runs on a database with existing `user_sessions` records
- **THEN** for each `user_sessions` record, a `requests` record is created with `repository_id` referencing the corresponding `repositories` record, type `new-feature`, status mapped from the user_session status, and title from the user_session title

#### Scenario: Migration creates session records
- **WHEN** the migration runs on a database with existing `user_sessions` records
- **THEN** for each `user_sessions` record, a `sessions` record is created with `request_id` referencing the corresponding `requests` record, `managed_session_id` from `session_id`, role `implementer`, and status from the user_session status

#### Scenario: Migration idempotency
- **WHEN** the migration is run on a database where migration has already been applied
- **THEN** no duplicate records are created and no errors occur

#### Scenario: Migration status mapping
- **WHEN** the migration maps `user_sessions.status` values to the new tables
- **THEN** existing status values (`idle`, `active`, `archived`) are mapped as follows: `idle` → `sessions.status = 'active'` (idle was the default in implementation, treated as active), `active` → `sessions.status = 'active'`, `archived` → `sessions.status = 'archived'`. The corresponding `requests.status` is set to `completed` for archived sessions and `in-progress` for active/idle sessions

### Requirement: Timestamp Update Convention
The system SHALL update `updated_at` columns explicitly at the application layer since SQLite does not support ON UPDATE triggers natively.

#### Scenario: Application-layer timestamp update
- **WHEN** any record in `requests` or `sessions` tables is updated via a Server Action
- **THEN** the Server Action sets the `updated_at` column to `new Date().toISOString()` explicitly in the UPDATE query

### Requirement: Existing Spec Correction — users.id Type
The `users.id` column SHALL use `INTEGER PRIMARY KEY AUTOINCREMENT` as the canonical type, correcting the prior spec that recorded it as `TEXT PRIMARY KEY (UUID v4)`.

#### Scenario: users.id is integer autoincrement
- **WHEN** inspecting the `users` table schema
- **THEN** the `id` column is `INTEGER PRIMARY KEY AUTOINCREMENT`, matching the actual implementation in `schema.ts`

## REMOVED Requirements

### Requirement: User Sessions Table Schema
**Reason**: Replaced by the `repositories → requests → sessions` 3-table model. The `user_sessions` table conflated repository binding, request tracking, and session management into a single table.
**Migration**: Data is migrated to `repositories`, `requests`, and `sessions` tables via the data migration step. All code referencing `user_sessions` SHALL be updated to use the new tables.
