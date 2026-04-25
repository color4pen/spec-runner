## MODIFIED Requirements

### Requirement: Requests Table Schema Extension
The `requests` table SHALL include an `enabled` column for storing workflow option selections.

#### Scenario: Enabled column added to requests table
- **WHEN** the database schema is applied
- **THEN** the `requests` table contains an additional `enabled` column of type TEXT, nullable, default null, for storing a JSON array string of workflow options

#### Scenario: Backward compatibility with existing requests
- **WHEN** existing request records are queried after the schema change
- **THEN** the `enabled` column returns null for records created before the migration

#### Scenario: Updated requests table structure
- **WHEN** the database schema is applied
- **THEN** the `requests` table contains columns: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `repository_id` (INTEGER NOT NULL FK to repositories.id), `type` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'draft'), `title` (TEXT NOT NULL), `content` (TEXT), `enabled` (TEXT, nullable, default null), `created_at` (TEXT NOT NULL DEFAULT current_timestamp), `updated_at` (TEXT NOT NULL DEFAULT current_timestamp)

### Requirement: Sessions Role CHECK Constraint Extension
The `sessions.role` CHECK constraint SHALL include `'propose'` as a valid role value.

#### Scenario: Updated session role CHECK constraint
- **WHEN** an attempt is made to insert a session with a `role` value
- **THEN** the database accepts values in (`implementer`, `reviewer`, `fixer`, `explorer`, `bootstrap`, `propose`) and rejects any other value with a CHECK constraint violation

#### Scenario: Propose role accepted by database
- **WHEN** a session record is inserted with `role = 'propose'`
- **THEN** the database accepts the insert without constraint violation

### Requirement: Enabled Column Migration
The system SHALL add an `enabled` column to the existing `requests` table via migration.

#### Scenario: Migration adds enabled column
- **WHEN** the migration runs on a database with an existing `requests` table
- **THEN** the `enabled` column (TEXT, nullable, default null) is added to the `requests` table

#### Scenario: Migration idempotency
- **WHEN** the migration is run on a database where the `enabled` column already exists
- **THEN** no errors occur and no data is modified
