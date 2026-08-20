# Spec: issue-target 層の新設 — start 面

## Requirements

### Requirement: issue-target layer must not depend on the cli layer

The `core/issue-target/` layer SHALL NOT import from `cli/` — neither via static
`import ... from "…cli/…"` nor via dynamic `await import("…cli/…")`. The start entry
point (`runRunCore`-equivalent) MUST be received as an injected `startPrimitive`
parameter, so the layer's one-way dependency (issue-target → core primitives) holds
both statically and dynamically.

#### Scenario: no cli import exists in issue-target

**Given** the `src/core/issue-target/` directory
**When** the source files are scanned for the substring `cli/`
**Then** zero matches are found (both static and dynamic import forms)

#### Scenario: start primitive is injected, not imported

**Given** the relocated `materializeDraftAndStart`
**When** it starts the pipeline for an issue body
**Then** it invokes the injected `startPrimitive` (not an imported `cli/run` symbol)
and passes options containing `inboxOrigin: true` and `issue: <issueNumber>`

### Requirement: relocation preserves the issue-body start contract

The relocation of `materializeDraftAndStart` into `core/issue-target/` MUST preserve
its observable contract: `writeDraft` SHALL be called before the start primitive, the
start primitive SHALL be called with `inboxOrigin: true` and the correct `issue`, and
errors thrown by the start primitive (e.g. `SlugOccupiedError`) SHALL propagate to the
caller unchanged.

#### Scenario: writeDraft precedes start

**Given** a valid issue body and slug
**When** `materializeDraftAndStart` runs
**Then** `writeDraft` is invoked before the start primitive is invoked

#### Scenario: occupancy error propagates

**Given** the start primitive rejects with a `SlugOccupiedError`
**When** `materializeDraftAndStart` runs
**Then** the same error propagates to the caller (no swallowing)

### Requirement: all issue-linked start routes go through issue-target and register a Development linked branch

All three issue-linked start routes (`--from-issue`, inbox-origin, and positional
request + `--issue <n>`) SHALL route through `core/issue-target/` before entering the
generic start primitive. Each route MUST register the feature branch as the issue's
Development linked branch via `createLinkedBranch`. The pipeline / start body MUST NOT
read `issueNumber` to call the Development API; registration is carried by an opaque
injected effect (`onFeatureBranchCreated`).

#### Scenario: positional + --issue routes through issue-target

**Given** `job start <slug> --issue 42`
**When** the command handler runs
**Then** the start is routed through the issue-target positional-link function (not a
direct `runRun` call), and the Development link effect is threaded into the start options

#### Scenario: each route fires the link registration

**Given** a successful worktree creation for an issue-linked start on any of the three routes
**When** the feature branch is created
**Then** `createLinkedBranch(issueId, branchName, baseOid)` is invoked (GitHub API mocked)

#### Scenario: inbox-origin start still passes inboxOrigin

**Given** the inbox default `startJob` effect for an approved issue
**When** it starts the job
**Then** the start primitive is called with `inboxOrigin: true`

### Requirement: linked branch and local feature branch use the same immutable base OID

For a new-run issue-linked start, the base OID SHALL be resolved exactly once (a single
`git rev-parse` of `origin/<base-branch>`). The local feature branch and the
`createLinkedBranch` registration MUST both use that same immutable OID.

#### Scenario: base OID resolved once and shared

**Given** a new-run issue-linked start
**When** the workspace is materialized
**Then** `origin/<base-branch>` is resolved to an OID exactly once, and that OID is used
both as the worktree branch base ref and as the `oid` argument to `createLinkedBranch`

### Requirement: link registration is ordered after worktree creation and is best-effort

The Development link registration MUST occur only after the local worktree + feature
branch are created successfully, and before the bootstrap commit / push. If worktree
creation fails, `createLinkedBranch` SHALL NOT be called (no empty linked branch is left
on GitHub). If registration itself fails (permissions / API error), the failure SHALL be
logged as a warning and MUST NOT stop the start.

#### Scenario: worktree failure skips link registration

**Given** worktree creation throws
**When** the materializer runs the new-run arm
**Then** `onFeatureBranchCreated` (and thus `createLinkedBranch`) is never called

#### Scenario: registration failure does not stop start

**Given** worktree creation succeeds but `createLinkedBranch` throws
**When** the materializer invokes the link effect
**Then** a warning is emitted through the logger seam and materialization continues to a
successful start

#### Scenario: registration precedes bootstrap commit

**Given** a successful worktree creation on the new-run arm
**When** the arm proceeds
**Then** the link effect is invoked before the request.md bootstrap commit is made

#### Scenario: no-worktree route fires link registration after branch creation

**Given** an issue-linked start on the no-worktree path (`setupWorkspaceNoWorktree`)
**When** the feature branch is checked out successfully
**Then** `onFeatureBranchCreated` is invoked best-effort after the checkout and before
request materialisation; if `createLinkedBranch` fails, a warning is emitted and the
start continues

### Requirement: branch name is constructed by a single shared builder

The feature-branch name (`<prefix><slug>-<jobId[0:8]>`) SHALL be constructed by a single
shared builder (`buildFeatureBranchName`). All three construction sites
(`pipeline-run.ts`, `design.ts`, `commit-orchestrator.ts`) MUST call it, and the link
registration MUST consume the builder's output (the same branch-name string) rather than
re-derive it. The builder MUST NOT be used as an inverse function for branch discovery.

#### Scenario: construction sites converge on the builder

**Given** the codebase after this change
**When** feature-branch-name construction sites are inspected
**Then** all three call `buildFeatureBranchName` and no inline
`${getBranchPrefix(...)}...slice(0, 8)` construction remains

#### Scenario: linked branch name equals local branch name

**Given** an issue-linked start
**When** the link is registered
**Then** the `name` passed to `createLinkedBranch` is byte-identical to the local feature
branch name created by the worktree

### Requirement: getIssue exposes the GraphQL node id and createLinkedBranch is available

The `GitHubClient.getIssue()` return value SHALL include `nodeId` (mapped from the REST
`node_id`). The port MUST expose `createLinkedBranch(issueId, name, oid)`, implemented in
the adapter via a GraphQL POST; non-2xx responses or non-empty GraphQL `errors` SHALL
cause it to throw (fail-closed), leaving the best-effort decision to the caller.

#### Scenario: getIssue returns nodeId

**Given** a REST issue response containing `node_id`
**When** the adapter `getIssue()` maps it
**Then** the returned object includes `nodeId` equal to the REST `node_id`

#### Scenario: createLinkedBranch posts the GraphQL mutation

**Given** an `issueId`, `name`, and `oid`
**When** `createLinkedBranch` is called
**Then** a GraphQL `createLinkedBranch` mutation is POSTed to the GraphQL endpoint with
those three values as variables

#### Scenario: createLinkedBranch fails closed at the adapter

**Given** a GraphQL response with a non-empty `errors` array or a non-2xx status
**When** `createLinkedBranch` processes it
**Then** it throws (the caller is responsible for best-effort handling)

#### Scenario: GraphQL endpoint is derived correctly for github.com and GHES

**Given** a REST base URL of `https://api.github.com` or `https://HOST/api/v3`
**When** the adapter derives the GraphQL endpoint
**Then** `https://api.github.com` maps to `https://api.github.com/graphql` and
`https://HOST/api/v3` maps to `https://HOST/api/graphql`
