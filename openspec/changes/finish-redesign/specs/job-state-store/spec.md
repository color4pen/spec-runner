## ADDED Requirements

### Requirement: `RequestInfo.slug` field stores the canonical change slug

`JobState.request: RequestInfo` SHALL include a `slug: string | null` field that stores the canonical change slug. The field is populated by `specrunner run` at job startup from `path.basename(<request-path>)` where `<request-path>` is the directory containing `request.md` (typically `openspec-workflow/requests/active/<slug>/`).

The schema:

```ts
export interface RequestInfo {
  path: string;
  title: string;
  type: string;
  slug: string | null;  // null only for legacy state files migrated on load
}
```

The `slug` field is the **canonical source** for slug consumers (`specrunner finish`, `specrunner ps`, archive operations). Consumers SHALL NOT compute slug from `request.path` basename or `state.branch` directly; they SHALL go through `getJobSlug(state)` helper (defined in the next Requirement).

When `specrunner run` is invoked with a `request.md` path that resolves to a directory matching the canonical layout (`<repo>/openspec-workflow/requests/active/<slug>/request.md` or worktree-relative variant), `slug` SHALL be set to the parent directory name. `specrunner run` is only invoked from the `active/` phase; `awaiting-merge/` paths are not valid invocation points. When the path is non-canonical (e.g., `/tmp/dogfooding-001-request.md` or a flat file), `slug` SHALL be set to `null` and the `getJobSlug` fallback chain takes over.

#### Scenario: Canonical request path populates slug

- **GIVEN** `specrunner run openspec-workflow/requests/active/readme-status-section/request.md` is invoked
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === "readme-status-section"` and is persisted on the first save

#### Scenario: Non-canonical request path leaves slug null

- **GIVEN** `specrunner run /tmp/dogfooding-001-request.md` is invoked (legacy / ad-hoc invocation)
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === null` and `getJobSlug` falls back to other sources

#### Scenario: Legacy state file lacking slug field loads successfully

- **GIVEN** a state file written by a prior CLI version that lacks the `slug` field in `request`
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `state.request.slug === null` (treated as missing) and no error is thrown
- **AND** `getJobSlug(state)` returns a value derived from `state.branch` or `request.path`

#### Scenario: Subsequent persist writes slug field

- **GIVEN** a legacy state was loaded with `slug === null` and the runtime determines slug from branch fallback
- **WHEN** a downstream code path explicitly assigns `state.request.slug` and calls `JobStateStore.persist()`
- **THEN** the on-disk JSON includes the `slug` field

### Requirement: `getJobSlug(state)` helper resolves slug via fallback chain

`getJobSlug(state: JobState): string` is a pure helper exported from the state module. It SHALL resolve slug via the following ordered fallback:

1. If `state.request.slug` is a non-empty string, return it.
2. Else if `state.branch` is set, strip the conventional prefix (`feat/`, `fix/`, `change/`, `refactor/`, `chore/`) and if the remainder is non-empty, return it.
3. Else, return `path.basename(state.request.path)` with any trailing `.md` extension stripped.

The helper SHALL NOT throw; if all sources are absent (extremely degenerate state), it SHALL return an empty string and the caller is expected to error out via Phase 0 pre-flight in `specrunner finish` (slug 解決不可で escalation)。

All slug consumers (`specrunner finish` の入力解決 / `specrunner ps` の SLUG 列 / archive 操作の slug 引数 / `register_branch` custom tool handler) SHALL use this helper. Direct access to `state.request.slug` or ad-hoc derivation from `state.branch` / `request.path` SHALL be avoided.

#### Scenario: Primary source (slug field present)

- **GIVEN** `state.request.slug === "readme-status-section"` and `state.branch === "feat/readme-status-section"`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it returns `"readme-status-section"` from the slug field

#### Scenario: Branch fallback when slug is null

- **GIVEN** `state.request.slug === null` and `state.branch === "feat/readme-status-section"`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it strips the `feat/` prefix and returns `"readme-status-section"`

#### Scenario: request.path basename fallback

- **GIVEN** `state.request.slug === null`, `state.branch === ""`, `state.request.path === "/tmp/dogfooding-001-request.md"`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it returns `"dogfooding-001-request"` (basename with `.md` stripped)

#### Scenario: All sources absent returns empty string

- **GIVEN** `state.request.slug === null`, `state.branch === ""`, `state.request.path === ""`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it returns `""` (Phase 0 of `specrunner finish` will escalate on this empty slug)

### Requirement: `JobStatus` includes `archived` as a terminal status

`JobStatus` SHALL be typed as `"running" | "success" | "failed" | "terminated" | "archived"`. The `archived` status indicates that `specrunner finish` has completed Phase 4 (markJobArchived after `git pull --ff-only`) for this job. No intermediate `merged` status is introduced; the 1-PR model means feature PR merge and archive land in the same commit, so `success → archived` is the canonical transition.

Legacy state files with `status: "success"` SHALL load successfully; transition to `archived` happens only via `specrunner finish` Phase 4.

#### Scenario: New status value `archived` persists across load/save

- **WHEN** `state.status` is set to `archived` and `JobStateStore.persist()` is called, then `JobStateStore.load()` reads the same file
- **THEN** the loaded state has `state.status === "archived"`

#### Scenario: Legacy `success` state loads without migration

- **GIVEN** a state file with `status: "success"` written by a prior CLI version
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `state.status === "success"` (no automatic migration to `archived`)

#### Scenario: No intermediate `merged` status

- **WHEN** `specrunner finish` Phase 3 (`gh pr merge`) succeeds but Phase 4 (markJobArchived) has not yet executed
- **THEN** `state.status` remains `success`. After Phase 4 completes, it transitions directly to `archived`. There is no observable `merged` intermediate value.
