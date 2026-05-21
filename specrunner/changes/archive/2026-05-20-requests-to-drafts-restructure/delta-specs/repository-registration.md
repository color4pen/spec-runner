# Delta Spec: repository-registration

## Changes

### Bootstrap structure detection

The doctor `workflow-structure` check is updated:

- **Required**: `specrunner/drafts/` directory (was `specrunner/requests/active/`)
- **Required**: `specrunner/changes/` directory (unchanged)
- **Deprecated**: `specrunner/requests/active/` — if present, emit deprecation warning
- **Read-only**: `specrunner/requests/merged/` — presence allowed, not checked

### Archive path

New requests are archived exclusively to `specrunner/changes/archive/<slug>/`. The `specrunner/requests/merged/` directory is retained read-only for historical entries but no new files are written there.
