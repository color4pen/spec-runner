## MODIFIED Requirements

### Requirement: Requests Table Schema Extension
The `requests` table SHALL include `branch_name` and `base_branch` columns for storing agent-reported branch information.

#### Scenario: branch_name column added to requests table
- **WHEN** the database schema is applied
- **THEN** the `requests` table contains a `branch_name` column of type TEXT, nullable, default null, for storing the agent-reported full branch name (e.g., `feat/2026-04-25-slug-delegation`)

#### Scenario: base_branch column added to requests table
- **WHEN** the database schema is applied
- **THEN** the `requests` table contains a `base_branch` column of type TEXT, nullable, default null, for storing the base branch for comparison (null means the repository's default branch)

#### Scenario: Backward compatibility with existing requests
- **WHEN** existing request records are queried after the schema change
- **THEN** the `branch_name` and `base_branch` columns return null for records created before the migration

#### Scenario: Updated requests table structure
- **WHEN** the database schema is applied
- **THEN** the `requests` table contains columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `repository_id` (INTEGER NOT NULL FK to repositories.id), `type` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'draft'), `title` (TEXT NOT NULL), `content` (TEXT), `enabled` (TEXT, nullable, default null), `branch_name` (TEXT, nullable, default null), `base_branch` (TEXT, nullable, default null), `created_at` (TEXT NOT NULL DEFAULT current_timestamp), `updated_at` (TEXT NOT NULL DEFAULT current_timestamp)

### Requirement: Branch Name Migration
The system SHALL add `branch_name` and `base_branch` columns to the existing `requests` table via migration.

#### Scenario: Migration adds branch_name column
- **WHEN** the migration runs on a database with an existing `requests` table
- **THEN** the `branch_name` column (TEXT, nullable, default null) is added to the `requests` table

#### Scenario: Migration adds base_branch column
- **WHEN** the migration runs on a database with an existing `requests` table
- **THEN** the `base_branch` column (TEXT, nullable, default null) is added to the `requests` table

#### Scenario: Migration idempotency
- **WHEN** the migration is run on a database where the `branch_name` and `base_branch` columns already exist
- **THEN** no errors occur and no data is modified
