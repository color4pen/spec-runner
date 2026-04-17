## MODIFIED Requirements

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

## ADDED Requirements

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
