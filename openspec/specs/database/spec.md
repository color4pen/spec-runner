## Requirements

### Requirement: Database Connection
The system SHALL connect to a SQLite database using Drizzle ORM with the `bun:sqlite` driver. The database file SHALL be located at `data/spec-runner.db`.

#### Scenario: Database initialization
- **WHEN** the application starts and the database file does not exist
- **THEN** Drizzle ORM creates the database file at `data/spec-runner.db` and applies pending migrations

#### Scenario: Database connection singleton
- **WHEN** multiple server-side functions access the database within the same process
- **THEN** they share a single database connection instance (no connection pool needed for SQLite)

#### Scenario: Foreign key enforcement enabled
- **WHEN** the database connection is initialized
- **THEN** the system executes `PRAGMA foreign_keys = ON` to enable foreign key constraint enforcement

#### Scenario: Database file excluded from version control
- **WHEN** the project is committed to git
- **THEN** `data/*.db` and `data/*.db-journal` are listed in `.gitignore`

### Requirement: Users Table Schema
The system SHALL define a `users` table with columns for GitHub identity and profile information.

#### Scenario: Users table structure
- **WHEN** the database schema is applied
- **THEN** the `users` table contains columns: `id` (TEXT PRIMARY KEY, generated as UUID v4 via `crypto.randomUUID()`), `github_id` (INTEGER UNIQUE NOT NULL), `github_login` (TEXT NOT NULL), `github_avatar_url` (TEXT), `created_at` (TEXT NOT NULL DEFAULT current_timestamp)

#### Scenario: Unique GitHub ID constraint
- **WHEN** an attempt is made to insert a user with a `github_id` that already exists
- **THEN** the database rejects the insert with a unique constraint violation

### Requirement: User Sessions Table Schema
The system SHALL define a `user_sessions` table that maps users to Managed Agents sessions with repository context.

#### Scenario: User sessions table structure
- **WHEN** the database schema is applied
- **THEN** the `user_sessions` table contains columns: `id` (TEXT PRIMARY KEY, generated as UUID v4 via `crypto.randomUUID()`), `user_id` (TEXT NOT NULL FK to users.id), `session_id` (TEXT NOT NULL), `repo` (TEXT NOT NULL), `title` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'active'), `created_at` (TEXT NOT NULL DEFAULT current_timestamp), `updated_at` (TEXT NOT NULL DEFAULT current_timestamp)

#### Scenario: Foreign key enforcement
- **WHEN** an attempt is made to insert a user_session with a `user_id` that does not exist in the users table
- **THEN** the database rejects the insert with a foreign key constraint violation

#### Scenario: Session query by user and repo
- **WHEN** querying user_sessions filtered by user_id and repo
- **THEN** the database returns only sessions belonging to that user for that repository, ordered by created_at descending

### Requirement: Migration Management
The system SHALL manage database schema changes using Drizzle Kit migrations.

#### Scenario: Generate migration
- **WHEN** a developer modifies the Drizzle schema definition
- **THEN** running `bunx drizzle-kit generate` creates a new SQL migration file in the `drizzle/` directory

#### Scenario: Apply migrations
- **WHEN** the application starts or `bunx drizzle-kit migrate` is run
- **THEN** all pending migrations are applied to the database in order

#### Scenario: Migration idempotency
- **WHEN** migrations are run on a database that is already up to date
- **THEN** no changes are applied and the application starts normally
