## Purpose

CRUD operations on requests (draft, in-progress, reviewing, completed, cancelled).

## Requirements
### Requirement: Request Creation with Enabled Options
The existing `createRequest()` Server Action SHALL be refactored to accept an options object instead of positional parameters, adding support for the `enabled` workflow options field.

#### Scenario: createRequest signature change
- **WHEN** `createRequest()` is called
- **THEN** the function signature is `createRequest(repositoryId: number, options: { type: string; title: string; content: string | null; enabled?: string[] })` replacing the previous 4-positional-parameter signature

#### Scenario: Create request with enabled field
- **WHEN** an authenticated user creates a request with an `enabled` array in the options object
- **THEN** the system stores the enabled value as a JSON string in the `requests.enabled` TEXT column alongside type, title, and content

#### Scenario: Valid enabled options
- **WHEN** creating a request with enabled values
- **THEN** the system validates that each value is one of `test-case-generator`, `adr`, `module-architect`, `security-reviewer`, `pattern-reviewer` and rejects any invalid values

#### Scenario: Empty enabled array
- **WHEN** creating a request with an empty enabled array or without the enabled parameter
- **THEN** the system stores `null` or `"[]"` in the enabled column (both are valid)

#### Scenario: Existing request creation behavior preserved
- **WHEN** creating a request without the enabled parameter
- **THEN** the system behaves identically to the current implementation, with enabled defaulting to null

### Requirement: Request Creation Form Extension
The request creation form in workspace-client.tsx SHALL include a multi-select field for enabled workflow options.

#### Scenario: Enabled multi-select displayed
- **WHEN** the user opens the request creation form
- **THEN** the form displays a multi-select or checkbox group with options: test-case-generator, adr, module-architect, security-reviewer, pattern-reviewer

#### Scenario: Enabled selection persisted
- **WHEN** the user submits the request creation form with enabled options selected
- **THEN** the selected values are passed to `createRequest()` as an array and stored in the database

### Requirement: Request Schema Extension
The `requests` database table SHALL include an `enabled` column.

#### Scenario: Enabled column definition
- **WHEN** the database schema is defined
- **THEN** the `requests` table includes an `enabled` column of type TEXT, nullable, default null

#### Scenario: Backward compatibility
- **WHEN** existing requests are queried
- **THEN** the `enabled` field returns null for records created before the schema change
