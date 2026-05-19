# ADR Naming: Drop Sequential Number, Use `YYYY-MM-DD-slug.md`

- **Date**: 2026-05-19
- **Status**: Accepted
- **Issue**: #310

## Context

ADR files were named `ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` (introduced in PR #303). The sequential number was intended to provide a short stable identifier (`ADR-0042`) and an explicit sort order.

In practice the numbering is derived at agent runtime: the adr-gen agent lists `specrunner/adr/`, finds the current maximum, and uses `max+1`. When multiple PRs run concurrently, each agent sees the same current maximum and independently generates the same number. This produced observed collisions:

- PR #307 / #308 / #309 all generated `ADR-0001-2026-05-18-<slug>.md`.
- PR #315 / #317 both generated `ADR-0004-2026-05-19-<slug>.md`, leaving two distinct files with identical numbering in main.

Because file suffixes differ, `git merge` succeeds silently. The numbered namespace is permanently broken as soon as one collision is merged.

## Decision

Remove the sequential number component entirely. ADR files are named:

```
specrunner/adr/{YYYY-MM-DD}-{slug}.md
```

The `ls` + `max+1` logic is removed from the `adr-gen-system` prompt. Uniqueness is guaranteed by `date + slug`; same-day same-slug is structurally impossible because the slug is derived from the request slug (one request = one ADR).

Existing five ADR files are renamed via `git mv` to the new format, resolving the pre-existing `ADR-0004` duplicate as a side effect.

## Alternatives Considered

### A: Centralized counter (file or DB)

A shared counter file (`specrunner/adr/.next-id`) incremented atomically during `finish`. Rejected because `finish` runs inside isolated worktrees; there is no safe atomic increment without either a lock mechanism or a service — both add operational complexity with no corresponding benefit (the short ID is unused in practice).

### B: Random suffix (`ADR-{UUID8}-{slug}.md`)

Collision-free and no coordination required. Rejected because:
- UUIDs convey no temporal information.
- Date-based sort order is lost.
- `YYYY-MM-DD-slug` is already unambiguous and human-readable.

### C: Keep numbering, fix via conflict detection in CI

Detect duplicate numbers in a CI lint step and block merge. Rejected because it converts a structural problem into a manual resolution step and does not prevent the collision from being created in the first place.

### D: Monotonic timestamp suffix

Use Unix timestamp instead of date (`1747612800-slug.md`). Rejected: not human-readable; offers no advantage over date + slug.

## Consequences

- Parallel `finish` runs are safe regardless of concurrency level; no coordination required.
- The `adr-gen-system` prompt is simpler (no `ls` + sort + increment logic).
- Short numeric IDs (`ADR-0042`) are not available. This is acceptable because no tooling or documentation currently references ADRs by number.
- `supersedes` / `superseded-by` cross-references, if added in future, will use `YYYY-MM-DD-slug` paths rather than numbers — consistent with how git history is typically referenced.
- The five existing ADRs are renamed; any external links using the old paths will break. Given the project is pre-v1 and ADRs are internal, this is accepted.

## Files Changed

| File | Change |
|------|--------|
| `src/prompts/adr-gen-system.ts` | MODIFIED: naming rule `{YYYY-MM-DD}-{slug}.md`; removed `ls` + `max+1` step |
| `specrunner/adr/ADR-0001-2026-05-18-prompt-fragment-registry.md` | RENAMED → `2026-05-18-prompt-fragment-registry.md` |
| `specrunner/adr/ADR-0002-2026-05-18-validation-rule-interface.md` | RENAMED → `2026-05-18-validation-rule-interface.md` |
| `specrunner/adr/ADR-0003-2026-05-18-one-shot-query-wrapper.md` | RENAMED → `2026-05-18-one-shot-query-wrapper.md` |
| `specrunner/adr/ADR-0004-2026-05-19-baseline-header-consistency-check.md` | RENAMED → `2026-05-19-baseline-header-consistency-check.md` |
| `specrunner/adr/ADR-0004-2026-05-19-spec-review-baseline-pull-model.md` | RENAMED → `2026-05-19-spec-review-baseline-pull-model.md` |
| `specrunner/changes/adr-numbering-removal/specs/adr-generation/spec.md` | NEW delta spec (MODIFIED requirement: naming convention) |
