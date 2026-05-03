# job-state-store Delta Spec (specrunner-dir-rename)

This delta spec modifies the `job-state-store` specification for the `specrunner-dir-rename` change.

## Modified Requirements

### Requirement: `RequestInfo.slug` field stores the canonical change slug

`JobState.request: RequestInfo` SHALL include a `slug: string | null` field that stores the canonical change slug. The field is populated by `specrunner run` at job startup from `path.basename(<request-path>)` where `<request-path>` is the directory containing `request.md` (typically `specrunner/requests/active/<slug>/`).

The schema:

```ts
export interface RequestInfo {
  path: string;
  title: string;
  type: string;
  slug: string | null;  // null only for legacy state files migrated on load
}
```

The `slug` field is the **canonical source** for slug consumers (`specrunner finish`, `specrunner ps`, archive operations). Consumers SHALL NOT compute slug from `request.path` basename or `state.branch` directly; they SHALL go through `getJobSlug(state)` helper.

When `specrunner run` is invoked with a `request.md` path that resolves to a directory matching the canonical layout (`<repo>/specrunner/requests/active/<slug>/request.md` or worktree-relative variant), `slug` SHALL be set to the parent directory name. When the path is non-canonical (e.g., `/tmp/dogfooding-001-request.md` or a flat file), `slug` SHALL be set to `null` and the `getJobSlug` fallback chain takes over.

#### Canonical Pattern

The CANONICAL_PATTERN regex used in `src/cli/run.ts` SHALL be:

```typescript
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/;
```

This pattern matches paths of the form:
- `<any-prefix>/specrunner/requests/active/<slug>/<filename>.md`

The pattern does NOT include alternation for other directories (e.g., `awaiting-merge`). Only the `active/` directory is a valid invocation point for `specrunner run`.

#### Scenario: Canonical request path populates slug

- **GIVEN** `specrunner run specrunner/requests/active/readme-status-section/request.md` is invoked
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === "readme-status-section"` and is persisted on the first save

#### Scenario: Non-canonical request path leaves slug null

- **GIVEN** `specrunner run /tmp/dogfooding-001-request.md` is invoked (legacy / ad-hoc invocation)
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === null` and `getJobSlug` falls back to other sources

Note: The previous requirement referenced `openspec-workflow/requests/active/<slug>/` and allowed `awaiting-merge/` paths. This delta spec updates the canonical layout to `specrunner/requests/active/<slug>/` only.
