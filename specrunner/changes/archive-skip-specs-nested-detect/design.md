# Design: archive-skip-specs-nested-detect

## Overview

This design addresses the misalignment between `archive-openspec.ts` auto-detection logic and openspec's nested delta spec convention (`specs/<spec-name>/spec.md`). The current flat `.md` detection causes systemic drift when nested delta specs exist.

## Design Decisions

### D1: Nested-first detection with flat fallback support

**Decision**: Implement two-tier detection — check nested structure first, fall back to flat layout for backward compatibility.

**Detection algorithm**:
```typescript
async function hasSpecFiles(specsPath: string, fs: FinishFs): Promise<boolean> {
  try {
    const entries = await fs.readdir(specsPath);
    
    // 1. Check nested convention: specs/<spec-name>/spec.md
    for (const entry of entries) {
      const entryPath = path.join(specsPath, entry);
      const isDir = await isDirectory(entryPath, fs);
      if (isDir) {
        const specFile = path.join(entryPath, 'spec.md');
        const exists = await fs.exists(specFile);
        if (exists) return true;
      }
    }
    
    // 2. Fallback: flat layout specs/*.md
    return entries.some((e) => e.endsWith('.md'));
  } catch {
    return false;
  }
}
```

**Rationale**:
- Aligns with openspec convention (nested is primary)
- Maintains backward compatibility with any existing flat layouts
- Detection order (nested-first) ensures nested takes precedence when both exist
- Graceful degradation: if nested check fails, flat fallback prevents false negatives

**Trade-offs**:
- **Pro**: Zero breaking changes for edge cases with flat layout
- **Pro**: Self-healing: this change's own delta spec will be detected by new logic during archive
- **Con**: Additional filesystem calls (directory check + exists for each entry)
- **Con**: Slightly more complex logic than nested-only approach

**Alternatives considered**:
- **Nested-only (no fallback)**: Simpler but risks breaking any existing flat layouts; no evidence such layouts exist in practice, but removing fallback requires exhaustive audit
- **Flat-only (status quo)**: Fails to detect nested convention; systemic drift continues
- **Configurable via flag**: Over-engineering; detection should be automatic based on convention

### D2: Delta spec structure for cli-finish-command

**Decision**: Create MODIFIED delta spec that updates both archive Scenarios to reflect nested convention.

**Delta spec location**: `openspec/changes/archive-skip-specs-nested-detect/specs/cli-finish-command/spec.md`

**Changes to base spec**:
1. **TC-024 Scenario** (`specs/ has .md files → openspec archive <slug>`):
   - **MODIFIED**: Update WHEN condition to "when `openspec/changes/<slug>/specs/<spec-name>/spec.md` exists for at least one `<spec-name>`"
   - Update THEN to clarify nested detection
   
2. **TC-025 Scenario** (`specs/ empty → openspec archive <slug> --skip-specs`):
   - **MODIFIED**: Update WHEN condition to "when `openspec/changes/<slug>/specs/` is empty OR contains only directories without `spec.md` files"
   - Update THEN to clarify `--skip-specs` is added when no nested OR flat specs detected

**Rationale**:
- Self-referential: this change itself uses nested delta spec, serving as dogfooding test case
- MODIFIED (not REMOVED+ADDED) preserves Scenario structure and TC numbers
- Explicit mention of fallback in spec aligns with D1 implementation
- Archive of this change will validate the new logic during `specrunner finish`

### D3: Test fixture migration to nested structure

**Decision**: Convert TC-024 and TC-025 mock fixtures to use nested directory structure.

**Current fixture (TC-024)**:
```typescript
readdir: vi.fn().mockResolvedValue(["delta.md", "proposal.md"])
```

**New fixture (TC-024)**:
```typescript
exists: vi.fn((path) => {
  if (path.endsWith('openspec/changes/my-feature')) return Promise.resolve(true);
  if (path.endsWith('specs/cli-finish-command/spec.md')) return Promise.resolve(true);
  return Promise.resolve(false);
}),
readdir: vi.fn((path) => {
  if (path.endsWith('specs')) return Promise.resolve(['cli-finish-command']);
  return Promise.resolve([]);
}),
// Add stat/lstat for directory detection
stat: vi.fn((path) => {
  if (path.endsWith('cli-finish-command')) 
    return Promise.resolve({ isDirectory: () => true });
  return Promise.resolve({ isDirectory: () => false });
})
```

**New test cases to add**:
1. **TC-024b**: Nested layout with multiple specs → no `--skip-specs`
2. **TC-024c**: Flat layout (fallback) → no `--skip-specs`
3. **TC-025b**: Directory without spec.md → `--skip-specs`
4. **TC-025c**: Mixed (directory with spec.md + directory without) → no `--skip-specs` (at least one spec detected)

**Rationale**:
- Existing TC numbers preserved (backward compatible test naming)
- Nested structure reflects real-world usage
- Comprehensive coverage of edge cases (empty dirs, mixed layouts, flat fallback)

**Trade-offs**:
- **Pro**: Tests match production behavior (nested convention)
- **Pro**: Catches regression if nested detection breaks
- **Con**: More complex mock setup (need stat/isDirectory simulation)

### D4: FinishFs interface extension for directory detection

**Decision**: Add `stat` method to `FinishFs` interface to support directory detection.

**Interface addition**:
```typescript
export interface FinishFs {
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;  // NEW
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  unlink(path: string): Promise<void>;
}
```

**Implementation** (in archive-openspec.ts):
```typescript
async function isDirectory(path: string, fs: FinishFs): Promise<boolean> {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
```

**Rationale**:
- `fs.stat` is standard Node.js API; natural addition to FinishFs
- Enables detection without introducing filesystem coupling in tests
- Mock-friendly: tests control directory vs file via mock return values

**Alternatives considered**:
- **Use dirent from readdir**: `fs.readdir(path, { withFileTypes: true })` returns Dirent objects with `isDirectory()` method; more efficient but requires changing FinishFs.readdir signature and all call sites
- **Hardcode directory convention**: Assume anything without `.md` is a directory; fragile and breaks if non-spec files exist in `specs/`

### D5: ADR structure and content

**Decision**: Create ADR-20260503-archive-skip-specs-nested-detect.md following established ADR template.

**Structure**:
- **Context**: Explain flat detection problem, nested convention, drift exposure via PR #64/66
- **Decision**: Nested-first with flat fallback (D1)
- **Alternatives Considered**:
  - Nested-only (no fallback)
  - Configurable detection
  - Status quo
- **Consequences**:
  - Positive: Drift prevention, convention alignment, self-validating
  - Negative: Slightly slower detection (multiple fs calls), fallback code maintenance
  - Risks: Flat layouts in wild (mitigated by fallback), complexity in tests
- **Related**: Link to PR #64, PR #66, this change folder

**Rationale**:
- Documents "why nested convention" for future maintainers
- Captures flat fallback decision (not obvious from code alone)
- Records drift history as context for future spec changes

## Open Questions

### Q1: Should flat fallback be removed in future version?
**Status**: Deferred to post-implementation review

**Options**:
1. Keep fallback indefinitely (current design)
2. Deprecate in this version, remove in next major version
3. Remove immediately if audit confirms no flat layouts exist

**Recommendation**: Ship with fallback (D1), gather data from usage, revisit in 3 months. If no flat layouts observed in telemetry/logs, remove fallback in next cleanup request.

### Q2: Should detection logic be extracted to shared util?
**Status**: Not in this change

**Rationale**: Only `archive-openspec.ts` needs this logic currently. Extract if second consumer emerges (YAGNI principle). Over-abstraction is worse than targeted duplication at this scale.

### Q3: Should we add `--skip-specs=auto|always|never` flag?
**Status**: Out of scope

**Rationale**: Auto-detection meets 99% use case. Explicit flags add API surface and test burden. Revisit if users report need to override detection (no evidence of such need).

## Implementation Phases

### Phase 1: Core detection logic
1. Add `stat` to `FinishFs` interface
2. Implement `isDirectory` helper
3. Implement nested-first detection with flat fallback
4. Update `archiveOpenspec` to use new detection

### Phase 2: Test updates
1. Add `stat` mock to test helpers
2. Migrate TC-024 fixture to nested structure
3. Migrate TC-025 fixture to nested structure
4. Add TC-024b, TC-024c, TC-025b, TC-025c

### Phase 3: Spec and documentation
1. Create delta spec for cli-finish-command
2. Create ADR
3. Update inline code comments in archive-openspec.ts

### Phase 4: Validation
1. Run full test suite
2. Run typecheck and lint
3. E2E: archive this change itself and verify `--skip-specs` NOT present

## Acceptance Checklist

- [ ] `FinishFs` interface includes `stat` method
- [ ] `isDirectory` helper implemented and tested
- [ ] Nested detection checks `specs/<name>/spec.md` for each directory
- [ ] Flat fallback checks `specs/*.md` if no nested specs found
- [ ] TC-024/TC-025 use nested fixtures
- [ ] TC-024b (nested), TC-024c (flat), TC-025b (empty dir), TC-025c (mixed) added
- [ ] Delta spec created at `specs/cli-finish-command/spec.md`
- [ ] ADR created at `openspec-workflow/adr/ADR-20260503-archive-skip-specs-nested-detect.md`
- [ ] All tests pass (`bun test`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)
- [ ] E2E validation: `specrunner finish archive-skip-specs-nested-detect` does NOT use `--skip-specs`
