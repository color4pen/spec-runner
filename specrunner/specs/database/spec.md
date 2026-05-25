## Purpose

SQLite + Drizzle ORM schema for repositories, requests, and sessions.
## Requirements

### Requirement: Requests Table Schema Extension

The `requests` table SHALL include `branch_name` and `base_branch` columns for storing agent-reported branch information. The `enabled` column SHALL NOT be present in the schema definition.

#### Scenario: Updated requests table structure without enabled column

- **WHEN** the database schema is applied
- **THEN** the `requests` table contains columns: `id`, `repository_id`, `type`, `status`, `title`, `content`, `branch_name`, `base_branch`, `created_at`, `updated_at`
- **AND** the `enabled` column is not present in the table definition

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
