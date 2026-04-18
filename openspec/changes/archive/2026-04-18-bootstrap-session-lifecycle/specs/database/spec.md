## MODIFIED Requirements

_Note: The following modifications supersede specific scenarios in `openspec/specs/database/spec.md`. On archive, the existing spec's "Request type CHECK constraint" scenario (accepting only `new-feature, spec-change, refactoring, bugfix`) is replaced by this delta's updated scenario. The existing spec's "Session role CHECK constraint" scenario (accepting only `implementer, reviewer, fixer, explorer`) is replaced by this delta's updated scenario. All other existing database spec scenarios remain unchanged._

### Requirement: Users Table Schema
The `users` table SHALL include a `vault_id` column for Anthropic Vault association.

#### Scenario: Users table structure with vault_id
- **WHEN** the database schema is applied
- **THEN** the `users` table contains the existing columns plus `vault_id` (TEXT, nullable, default null) for storing the Anthropic Vault identifier

#### Scenario: Existing users default to null vault_id
- **WHEN** the migration adds the `vault_id` column
- **THEN** all existing user records have `vault_id` set to null

### Requirement: Request type CHECK constraint
The `requests` table SHALL include `bootstrap` in its type enum.

#### Scenario: Request type CHECK constraint
- **WHEN** an attempt is made to insert a request with a `type` value
- **THEN** the database accepts values in (`new-feature`, `spec-change`, `refactoring`, `bugfix`, `bootstrap`) and rejects all other values

### Requirement: Session role CHECK constraint
The `sessions` table SHALL include `bootstrap` in its role enum.

#### Scenario: Session role CHECK constraint
- **WHEN** an attempt is made to insert a session with a `role` value
- **THEN** the database accepts values in (`implementer`, `reviewer`, `fixer`, `explorer`, `bootstrap`) and rejects all other values

### Requirement: Vault ID Migration
The system SHALL add a `vault_id` column to the existing `users` table via migration.

#### Scenario: Migration adds vault_id column
- **WHEN** the migration runs on a database with an existing `users` table
- **THEN** the `vault_id` column (TEXT, nullable) is added to the `users` table

#### Scenario: Migration idempotency
- **WHEN** the migration is run on a database where the `vault_id` column already exists
- **THEN** no errors occur and no data is modified
