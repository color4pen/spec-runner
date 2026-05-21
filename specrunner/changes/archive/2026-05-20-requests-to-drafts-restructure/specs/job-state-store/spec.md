# Delta Spec: job-state-store

## Requirements

### Requirement: `JobState.request.slug` は起票 path から抽出される（drafts パス対応）

**Replaces**: 「`JobState.request` SHALL include a `slug: string | null` field」のうち CANONICAL_PATTERN および解説

`JobState.request.slug` は `specrunner run` のジョブ起動時に `CANONICAL_PATTERN` により抽出される。

#### Canonical Pattern

`src/core/command/pipeline-run.ts` の CANONICAL_PATTERN regex SHALL be:

```typescript
const CANONICAL_PATTERN = /^.*\/specrunner\/drafts\/([^/]+)\.md$/;
```

This pattern matches paths of the form:
- `<any-prefix>/specrunner/drafts/<slug>.md`

Only the `drafts/` directory is a valid invocation point for `specrunner run` via slug resolution.

Note: The previous requirement referenced `specrunner/changes/active/<slug>/` (directory form). This delta spec updates the canonical layout to `specrunner/drafts/<slug>.md` (flat file form).

#### Scenario: Canonical request path populates slug

- **GIVEN** `specrunner run specrunner/drafts/readme-status-section.md` is invoked
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === "readme-status-section"` and is persisted on the first save

#### Scenario: Non-canonical request path leaves slug null

- **GIVEN** `specrunner run /tmp/dogfooding-001-request.md` is invoked (legacy / ad-hoc invocation)
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === null` and `getJobSlug` falls back to other sources
