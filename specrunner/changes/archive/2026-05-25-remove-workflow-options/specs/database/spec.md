## Purpose

SQLite + Drizzle ORM schema for repositories, requests, and sessions.

## Requirements

### Requirement: Requests Table Schema Extension

The `requests` table SHALL include `branch_name` and `base_branch` columns for storing agent-reported branch information. The `enabled` column SHALL NOT be present in the schema definition.

#### Scenario: Updated requests table structure without enabled column

- **WHEN** the database schema is applied
- **THEN** the `requests` table contains columns: `id`, `repository_id`, `type`, `status`, `title`, `content`, `branch_name`, `base_branch`, `created_at`, `updated_at`
- **AND** the `enabled` column is not present in the table definition
