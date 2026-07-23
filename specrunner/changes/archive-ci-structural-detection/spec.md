# Spec: structural CI-presence detection for `job archive --with-merge`

## Requirements

### Requirement: CI presence for the merge gate is determined structurally from the archive commit's tree

When the check rollup for the archive commit is `"none"` and the grace window has
elapsed (and the PR is not `BLOCKED`), `job archive --with-merge` SHALL decide
whether to keep waiting or to merge based on whether the archive commit's tree
contains a workflow definition that triggers on `push` or `pull_request` — not based
on elapsed time. The decision MUST use only local git inspection of the archive
commit's tree and MUST NOT issue additional GitHub API calls. The structural
decision MUST be computed at most once per run and reused across poll iterations.

#### Scenario: repo with a push/pull_request workflow waits fail-closed and escalates on timeout

**Given** an unmerged, non-BLOCKED PR whose archive-commit tree contains a
`.github/workflows/` file with a `push` or `pull_request` trigger
**And** the check rollup for the archive commit stays `"none"` past the none-check grace window
**When** `job archive --with-merge` runs its check-wait loop with a finite `mergeWaitTimeoutMs`
**Then** it does not merge while the rollup remains `"none"`
**And** once the elapsed wait exceeds `mergeWaitTimeoutMs` it returns a merge-gate escalation without merging

#### Scenario: repo with no workflow definition proceeds to merge after grace

**Given** an unmerged, non-BLOCKED PR whose archive-commit tree contains no
`.github/workflows/` workflow files
**And** the check rollup stays `"none"` past the none-check grace window
**When** `job archive --with-merge` runs its check-wait loop
**Then** it proceeds to squash-merge the PR (the existing CI-less behavior is preserved)

#### Scenario: repo whose only workflows lack push/pull_request triggers is treated as CI-less

**Given** an unmerged, non-BLOCKED PR whose archive-commit tree contains
`.github/workflows/` files that trigger only on events other than `push` /
`pull_request` (for example `schedule`)
**And** the check rollup stays `"none"` past the none-check grace window
**When** `job archive --with-merge` runs its check-wait loop
**Then** it treats the repo as CI-less and proceeds to squash-merge the PR

#### Scenario: unreadable archive commit resolves to the waiting side

**Given** an unmerged, non-BLOCKED PR for which the archive commit SHA is unavailable,
or the archive commit's tree cannot be inspected with local git
**And** the check rollup stays `"none"` past the none-check grace window
**When** `job archive --with-merge` evaluates CI presence
**Then** it treats the repo as CI-present and continues waiting (fail-closed) rather than merging

### Requirement: trigger detection adds no dependency and touches no GitHub API

Workflow-trigger detection SHALL be performed at the text level over the workflow
file bodies and MUST NOT introduce a YAML parser or any new package dependency. A
`push` or `pull_request` trigger token in a workflow body MUST be sufficient to
classify the workflow as CI-present; ambiguous or over-matching text MUST resolve to
the CI-present (waiting) side rather than the merge side.

#### Scenario: detection uses local git only

**Given** the archive commit has been recorded and pushed
**When** CI presence is evaluated for the check-wait loop
**Then** the evaluation reads the workflow files from the local git tree
**And** it does not call any GitHub API endpoint to decide CI presence

#### Scenario: no new package dependency is introduced

**Given** the change is implemented
**When** `package.json` is compared against its pre-change state
**Then** the `dependencies` are unchanged (no YAML parser or other package added)
