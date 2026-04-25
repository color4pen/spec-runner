## MODIFIED Requirements

### Requirement: Propose Session Completion Handling
The session-completion-handler SHALL handle propose session completion by verifying the branch existence and updating session/request status.

#### Scenario: Propose session completed with branch present
- **WHEN** a propose session (role: `'propose'`) completes and the expected branch exists
- **THEN** the system updates the session status to `'completed'` and the request remains in `in-progress` status (no PR creation, no status transition to reviewing)

#### Scenario: Propose session completed without branch
- **WHEN** a propose session completes but the expected branch does not exist
- **THEN** the system updates the session status to `'completed'` and the request remains in `in-progress` status (the user can inspect the session log or retry)

#### Scenario: Branch name derivation for propose
- **WHEN** determining the expected branch for a propose session
- **THEN** the system derives the branch name from the request's metadata using the `{prefix}/{slug}` convention, where the slug is stored in the request or derived from the request title and creation date

#### Scenario: Propose completion does not create PR
- **WHEN** a propose session completes (regardless of branch existence)
- **THEN** the system does NOT create a pull request (unlike bootstrap completion which creates a PR)

#### Scenario: Request status remains in-progress after propose completion
- **WHEN** a propose session completes
- **THEN** the request remains in `in-progress` status. The next status transition (`in-progress` -> `reviewing`) will be triggered by the spec-review session, which is out of scope for this change and will be implemented in a subsequent request
