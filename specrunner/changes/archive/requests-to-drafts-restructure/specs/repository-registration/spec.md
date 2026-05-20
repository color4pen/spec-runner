# Delta Spec: repository-registration

## Requirements

### Requirement: Bootstrap status detection uses drafts/ directory

**Replaces**: Bootstrap status detection scenarios referencing `requests/active/`

#### Scenario: Bootstrap status detection - fully bootstrapped repository

- **WHEN** the system registers a repository where both `openspec/project.md` and `specrunner/drafts/` exist on the default branch (or `specrunner/requests/active/` for backward compatibility)
- **THEN** the system SHALL set `bootstrap_status` to `ready`

#### Scenario: Bootstrap status detection - partially bootstrapped repository

- **WHEN** the system registers a repository where `openspec/project.md` exists but neither `specrunner/drafts/` nor `specrunner/requests/active/` exist on the default branch
- **THEN** the system SHALL set `bootstrap_status` to `uninitialized`

#### Scenario: Bootstrap status detection uses parallel API calls

- **WHEN** the system performs bootstrap status detection
- **THEN** the system SHALL check `openspec/project.md` and `specrunner/drafts/` (with `specrunner/requests/active/` fallback) in parallel using `Promise.all` to minimize registration latency
