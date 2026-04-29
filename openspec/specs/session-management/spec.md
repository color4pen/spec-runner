## Purpose

Lifecycle management of sessions: create, retrieve, archive, list.

## Requirements
### Requirement: Session Role Extension
The session role enum SHALL include `'propose'` to support the propose workflow session.

#### Scenario: Propose role accepted
- **WHEN** creating a session with role `'propose'`
- **THEN** the system accepts the role and creates the session record with `role = 'propose'`

#### Scenario: Updated role enum
- **WHEN** the session role is validated
- **THEN** the valid roles are `implementer`, `reviewer`, `fixer`, `explorer`, `bootstrap`, `propose`

#### Scenario: createBoundSession accepts propose role
- **WHEN** `createBoundSession()` is called with `role: 'propose'`
- **THEN** the system creates a Managed Agents session and inserts a sessions record with role `'propose'`, using the same flow as other roles
