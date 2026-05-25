## Purpose

CRUD operations on requests (draft, in-progress, reviewing, completed, cancelled).
## Requirements

### Requirement: No enabled field in request management

The request management layer SHALL NOT include `enabled` workflow options functionality. The `createRequest()` Server Action, request creation form, and database schema SHALL NOT reference `enabled` fields.

#### Scenario: Request creation without enabled parameter

- **WHEN** `createRequest()` is called
- **THEN** the function signature does not include an `enabled` parameter and the `requests` table has no `enabled` column
