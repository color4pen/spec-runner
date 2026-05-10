# Proposal: Fix archive-openspec auto-detect for nested delta spec convention

**slug**: archive-skip-specs-nested-detect  
**type**: spec-change  
**date**: 2026-05-03  
**author**: color4pen

## Background

The `specrunner finish` command uses `archive-openspec.ts` to archive change folders via `openspec archive <slug>`. The module auto-detects whether to include `--skip-specs` flag based on whether delta specs exist. Currently, it detects specs by checking if immediate children of `specs/` directory end with `.md`:

```typescript
const specsEntries = await fs.readdir(specsPath);
hasSpecFiles = specsEntries.some((e) => e.endsWith(".md"));
```

However, openspec's delta spec convention uses **nested structure**: `specs/<spec-name>/spec.md`, not flat `specs/*.md`. When delta specs follow the nested convention, `fs.readdir(specsPath)` returns directory names (e.g., `["cli-finish-command", "job-state-store"]`), none of which end with `.md`, causing `hasSpecFiles=false` and incorrectly appending `--skip-specs`.

This results in **systemic drift**: delta specs are not applied to base specs during archive. The issue was exposed by PR #64 (specrunner-dir-rename) as the first `specrunner finish` execution, with manual drift recovery performed in PR #66. Past changes archived via openspec-workflow plugin (2-PR model) were unaffected because that flow did not use `--skip-specs`.

This is not a bug but a **spec change** — `openspec/specs/cli-finish-command/spec.md` currently describes the flat detection behavior in its Scenarios, and the code follows the spec correctly. The spec itself is misaligned with openspec convention.

## Proposal

Update the `--skip-specs` auto-detection logic to align with openspec's nested delta spec convention:

1. **Modify detection logic**: Check for `specs/<spec-name>/spec.md` pattern (nested directories containing `spec.md` files) instead of flat `*.md` files
2. **Update spec**: Revise `openspec/specs/cli-finish-command/spec.md` archive Requirement Scenarios to reflect nested convention
3. **Update tests**: Migrate TC-024/TC-025 fixtures to nested structure and add test coverage for the new detection logic
4. **Document decision**: Create ADR explaining the alignment with nested convention and the decision on flat fallback handling

## What Changes

### Files Modified
- `src/core/finish/archive-openspec.ts` — detection logic
- `tests/finish-archive-openspec.test.ts` — test fixtures and scenarios
- `openspec/specs/cli-finish-command/spec.md` — archive Requirement (via delta spec)
- `openspec-workflow/adr/ADR-20260503-archive-skip-specs-nested-detect.md` — new ADR

### Behavior Change
- **Before**: `specs/` containing directories (nested layout) → `--skip-specs` incorrectly added → drift
- **After**: `specs/<name>/spec.md` detected → `--skip-specs` omitted → delta specs applied correctly
- **Flat fallback decision**: TBD in design phase (either support both nested+flat or nested-only)

## Impact

### Affected Components
- `specrunner finish` command (archive step)
- All future changes with nested delta specs

### User Impact
- **Positive**: Future `specrunner finish` executions will correctly apply delta specs to base specs
- **Positive**: No more manual drift recovery like PR #66
- **Neutral**: Past archived changes remain unaffected (this does not perform retroactive drift recovery)

### Backward Compatibility
- Exit codes and error handling remain unchanged
- Changes archived via openspec-workflow plugin unaffected (different code path)
- Future changes must follow nested convention (flat layout handling TBD in design)

## Acceptance Criteria

- [ ] `openspec/specs/cli-finish-command/spec.md` archive Requirement updated to reflect nested convention (via delta spec)
- [ ] `src/core/finish/archive-openspec.ts` correctly detects `specs/<spec-name>/spec.md` pattern
- [ ] TC-024/TC-025 updated with nested fixtures and pass
- [ ] New test case added: nested layout does NOT trigger `--skip-specs`
- [ ] Flat fallback handling decided and test coverage added
- [ ] `bun run typecheck`, `bun run lint`, `bun test` all pass
- [ ] ADR created in `openspec-workflow/adr/`
- [ ] E2E verification: this change (which has nested delta specs) archives correctly without `--skip-specs`

## Out of Scope

- **Retrospective drift recovery**: Finding/fixing drift from past archived changes beyond PR #66
- **openspec-workflow plugin changes**: 2-PR model archive flow is separate and unaffected
- **openspec CLI changes**: `openspec archive` command behavior unchanged; only `specrunner finish` detection logic updated
