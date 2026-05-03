# ADR-20260503: Archive Skip-Specs Nested Detection

**Date**: 2026-05-03  
**Status**: Accepted

## Context

The `src/core/finish/archive-openspec.ts` module implements auto-detection of delta specs to determine whether to pass `--skip-specs` to the `openspec archive` command. The existing implementation used **flat `.md` file detection**: checking if any immediate child of `specs/` ends with `.md`.

However, openspec's delta spec convention is **nested**: `specs/<spec-name>/spec.md`. The flat detection logic was:

```typescript
const specsEntries = await fs.readdir(specsPath);
hasSpecFiles = specsEntries.some((e) => e.endsWith(".md"));
```

For nested layouts, `fs.readdir(specsPath)` returns directory names (e.g., `["cli-finish-command", "job-state-store"]`), not `.md` files. This caused:

- `hasSpecFiles` to always be `false`
- `--skip-specs` to be incorrectly added
- Delta specs to not be applied to base specs during archive
- **Systemic drift** between delta specs and base specs

This was exposed by PR #64 (`specrunner-dir-rename`), which was the first change archived via `specrunner finish`. PR #66 performed manual drift recovery for that specific case.

The original spec (`openspec/specs/cli-finish-command/spec.md`) described the flat detection behavior in its Scenarios, so the code was **spec-compliant but the spec itself was misaligned with openspec convention**. This is a spec-change, not a bug fix.

## Decision

We adopt **nested-first detection with flat fallback**:

1. **D1: Nested-first detection algorithm**
   - Check if `specs/<name>/` directories exist
   - For each directory, check if `<name>/spec.md` exists
   - If at least one exists, `hasSpecFiles=true`
   - If none found, fall back to flat detection (`.md` suffix check)

2. **D2: Delta spec MODIFIED approach**
   - Create delta spec at `openspec/changes/archive-skip-specs-nested-detect/specs/cli-finish-command/spec.md`
   - Use MODIFIED directive to update the archive auto-detection requirement
   - Document nested convention as primary, flat as fallback

3. **D3: Test-driven implementation**
   - Add test helpers `makeNestedSpecsFs` and `makeFlatSpecsFs`
   - Add TC-024b (nested), TC-024c (flat fallback), TC-025b (dir without spec.md), TC-025c (mixed layout)
   - Update existing TC-024/TC-025 to use nested fixtures

4. **D4: Extend FinishFs interface**
   - Add `stat(path): Promise<{ isDirectory(): boolean }>` method
   - Enables directory detection without breaking abstraction
   - Follows existing pattern from DoctorFs

## Alternatives Considered

### Alt 1: Nested-only (no flat fallback)

**Why not**: While there's no evidence of flat layouts in the wild, removing fallback would require an exhaustive audit of all past archives and dogfood usage. The fallback is low-cost insurance and maintains strict backward compatibility.

### Alt 2: Configurable detection via CLI flag

**Why not**: Over-engineering. The auto-detection meets all use cases:
- Nested convention: primary openspec layout (detected)
- Flat layout: legacy/custom layouts (detected via fallback)
- No specs: change-only archives (detected via empty check)

Adding a flag (`--detection-mode=nested|flat`) would increase CLI surface area without solving a real problem.

### Alt 3: Keep status quo (flat-only detection)

**Why not**: Causes systemic drift for all future `specrunner finish` archives with nested delta specs. This is the default openspec convention, so the drift would be continuous and require manual recovery after every archive.

## Consequences

### Positive

- **Prevents drift**: Nested delta specs are now correctly detected and applied during archive
- **Aligns with convention**: Matches openspec's standard `specs/<spec-name>/spec.md` layout
- **Self-validating**: This change itself contains a nested delta spec, so when archived via `specrunner finish`, it validates the new logic works correctly
- **Backward compatible**: Flat fallback ensures existing flat layouts (if any) continue to work

### Negative

- **Additional fs calls**: Detection now requires `stat()` calls for each directory entry (perf impact minor: typical changes have 0-3 spec dirs)
- **Fallback code maintenance**: Must maintain flat detection logic indefinitely for backward compatibility

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Flat layouts exist in wild | Flat fallback preserves behavior |
| Test complexity increases | Helper functions (`makeNestedSpecsFs`, `makeFlatSpecsFs`) simplify fixtures |
| Breaking change if fallback removed later | Document fallback as permanent in spec |

## Related

- **PR #64** (specrunner-dir-rename): Exposed drift by being first `specrunner finish` archive
- **PR #66**: Manual drift recovery for PR #64's base spec updates
- **Request**: `openspec/changes/archive-skip-specs-nested-detect/`
- **GitHub Issue #65**: Drift exposure tracking
