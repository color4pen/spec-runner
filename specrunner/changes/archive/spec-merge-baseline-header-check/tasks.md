# Tasks: spec-merge baseline header consistency check

## Task 1: [x] Create `normalizeRequirementHeader` in `src/core/finish/baseline-headers.ts`

New file `src/core/finish/baseline-headers.ts`:

- Export `normalizeRequirementHeader(text: string): string`
- Implementation:
  1. `text.trim()`
  2. Strip markdown bold: `**text**` -> `text` (regex: `/\*\*(.*?)\*\*/g`)
  3. Strip markdown italic: `*text*` -> `text` (regex: `/\*(.*?)\*/g`)
  4. Strip inline code: `` `text` `` -> `text` (regex: `/`(.*?)`/g`)
  5. Final `.trim()`
- Case-preserving (no toLowerCase)

Acceptance: function is exported and importable.

## Task 2: [x] Add `checkBaselineHeaderConsistency` to `src/core/finish/spec-merge.ts`

Add new exported function to `spec-merge.ts`:

```typescript
export function checkBaselineHeaderConsistency(
  delta: DeltaSpec,
  baselineRequirements: RequirementBlock[] | null,
  capability: string,
): string[]
```

Implementation:

1. Import `normalizeRequirementHeader` from `./baseline-headers.js`
2. Build a `Set<string>` of normalized baseline requirement names (empty set if `baselineRequirements` is null)
3. For each `delta.modified` block:
   - If `baselineRequirements` is null: push `[${capability}] MODIFIED: Requirement "${block.name}" cannot apply to non-existent baseline`
   - Else if `normalizeRequirementHeader(block.name)` not in normalized baseline set: push `[${capability}] MODIFIED: Requirement "${block.name}" not found in baseline`
4. For each `delta.removed` block:
   - If `baselineRequirements` is null: push `[${capability}] REMOVED: Requirement "${block.name}" cannot apply to non-existent baseline`
   - Else if `normalizeRequirementHeader(block.name)` not in normalized baseline set: push `[${capability}] REMOVED: Requirement "${block.name}" not found in baseline`
5. For each `delta.added` block:
   - If `baselineRequirements` is not null AND `normalizeRequirementHeader(block.name)` is in normalized baseline set: push `[${capability}] ADDED: Requirement "${block.name}" already exists in baseline (duplicate)`
6. Return the array

Acceptance: function is exported. Does not modify any existing function signatures.

## Task 3: [x] Refactor `mergeSpecsForChange` per-capability loop

In `src/core/finish/spec-merge.ts`, modify the per-capability loop in `mergeSpecsForChange` (current lines 460-524):

**Before** (current flow):
```
read delta -> parse -> empty check -> validateDeltaSpec ->
  if (!baselineExists) { ... }
  else { readBaseline -> applyMerge }
```

**After** (new flow):
```
read delta -> parse -> empty check -> validateDeltaSpec ->
  readBaseline (hoisted) ->
  checkBaselineHeaderConsistency -> violations? -> allErrors + continue ->
  if (!baselineExists) { ... }
  else { parseBaseline (reuse content) -> applyMerge }
```

Specific changes:

1. After `validateDeltaSpec` check (after current line 482), hoist the baseline read:
   - `const baselinePath = path.join(cwd, baselineSpecPath(capability));`
   - `const baselineExists = await fs.exists(baselinePath);`
   - If exists: read content, parse with `parseBaselineSpec`, extract `.requirements`
   - If read fails: push error, continue
   - If not exists: `baselineReqs = null`

2. Call `checkBaselineHeaderConsistency(delta, baselineReqs, capability)`
   - If violations.length > 0: push to `allErrors`, continue

3. Existing `if (!baselineExists)` branch: keep as-is (defense-in-depth). Remove the now-redundant `baselinePath`/`baselineExists` declarations (already hoisted).

4. Existing `else` branch: reuse the already-read `baselineContent` instead of re-reading. Parse with `parseBaselineSpec(baselineContent!)` and call `applyMerge` as before.

Acceptance: `mergeSpecsForChange` calls `checkBaselineHeaderConsistency` before `applyMerge`. Baseline is read once per capability.

## Task 4: [x] Write tests in `tests/unit/core/finish/spec-merge-baseline-check.test.ts`

New test file. Import `checkBaselineHeaderConsistency` from `spec-merge.ts` and `normalizeRequirementHeader` from `baseline-headers.ts`.

Use helpers matching existing test patterns (`makeBlock` from spec-merge test or define locally).

### TC-SMB-01: MODIFIED header exists in baseline -> pass
- delta: `modified: [makeBlock("Foo")]`
- baseline: `[makeBlock("Foo")]`
- expect: `[]` (no violations)

### TC-SMB-02: MODIFIED header not in baseline -> violation
- delta: `modified: [makeBlock("NonExistent")]`
- baseline: `[makeBlock("Foo"), makeBlock("Bar")]`
- expect: 1 violation containing "MODIFIED" and "NonExistent"

### TC-SMB-03: baseline absent + MODIFIED -> violation
- delta: `modified: [makeBlock("A"), makeBlock("B")]`
- baseline: `null`
- expect: 2 violations, each containing "non-existent baseline"

### TC-SMB-04: REMOVED header not in baseline -> violation
- delta: `removed: [makeBlock("Ghost")]`
- baseline: `[makeBlock("Foo")]`
- expect: 1 violation containing "REMOVED" and "Ghost"

### TC-SMB-05: ADDED header already in baseline -> violation (duplicate)
- delta: `added: [makeBlock("Foo")]`
- baseline: `[makeBlock("Foo")]`
- expect: 1 violation containing "ADDED" and "duplicate"

### TC-SMB-06: mixed violations across sections
- delta: `added: [makeBlock("Foo")], modified: [makeBlock("Missing")], removed: [makeBlock("Also-Missing")]`
- baseline: `[makeBlock("Foo")]`
- expect: 3 violations (ADDED duplicate + MODIFIED not found + REMOVED not found)

### TC-SMB-07: normalization strips markdown bold
- delta: `modified: [{ name: "**Foo**", content: "### Requirement: **Foo**\n\nbody\n" }]`
- baseline: `[makeBlock("Foo")]`
- expect: `[]` (normalization makes `**Foo**` match `Foo`)

### Additional normalization unit tests (in same file):
- `normalizeRequirementHeader("  **Foo**  ")` -> `"Foo"`
- `normalizeRequirementHeader("` `` "`Bar`" `` `")` -> `"Bar"`
- `normalizeRequirementHeader("Plain")` -> `"Plain"`

Acceptance: all tests green with `bun run test`.

## Task 5: [x] Create delta spec `specrunner/changes/spec-merge-baseline-header-check/specs/spec-merge/spec.md`

Delta spec for the spec-merge capability. Baseline has been read (4 existing requirements). This is an ADDED requirement.

```markdown
## ADDED Requirements

### Requirement: baseline header consistency check before merge application

`mergeSpecsForChange` MUST perform a baseline header consistency check for each capability before calling `applyMerge`. The check SHALL compare delta requirement header names against baseline requirement header names using normalized matching (markdown decoration stripped, whitespace trimmed, case preserved).

Violation rules:
- MODIFIED or REMOVED header whose normalized name does not exist in the baseline's normalized requirement names SHALL produce a violation.
- MODIFIED or REMOVED header when no baseline file exists SHALL produce a violation.
- ADDED header whose normalized name already exists in the baseline's normalized requirement names SHALL produce a violation (duplicate detection).

If one or more violations are detected, the capability's merge MUST be skipped (no call to `applyMerge`) and the violations MUST be collected into the cross-capability error list for escalation. The existing `applyMerge` exact-match checks are retained as defense-in-depth.

#### Scenario: MODIFIED header not in baseline triggers early escalation

- **GIVEN** a delta spec with `## MODIFIED Requirements` containing `### Requirement: Foo` and the baseline does not contain a requirement named `Foo`
- **WHEN** `mergeSpecsForChange` processes the capability
- **THEN** a violation is reported and `applyMerge` is not called for that capability

#### Scenario: ADDED duplicate detected before merge

- **GIVEN** a delta spec with `## ADDED Requirements` containing `### Requirement: Bar` and the baseline already contains `### Requirement: Bar`
- **WHEN** `mergeSpecsForChange` processes the capability
- **THEN** a violation is reported with "duplicate" indication

#### Scenario: normalized matching tolerates markdown decoration

- **GIVEN** a delta header `### Requirement: **Foo**` and a baseline header `### Requirement: Foo`
- **WHEN** the consistency check compares them
- **THEN** they are treated as matching (no violation)
```

Acceptance: delta spec file exists under the change folder's `specs/spec-merge/spec.md`.

## Task 6: [x] Verify

Run `bun run typecheck && bun run test`. All existing tests and new tests must pass.

## Task 7: [x] ADR (if adr: true in request.md)

Create `specrunner/adr/ADR-0004-2026-05-19-baseline-header-consistency-check.md`.

Record: defense-in-depth pre-check with normalization before `applyMerge`. Alternatives considered: modifying `applyMerge` directly (rejected: breaks existing exact-match contract, mixes concerns).
