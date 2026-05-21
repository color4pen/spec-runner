# Delta Spec: spec-merge auto-classification

## ADDED Requirements

### Requirement: parseDeltaSpec SHALL parse the new format without section-level classification

`parseDeltaSpec` SHALL accept the new delta spec format where agent-written content uses `## Requirements` (unclassified), `## Removed` (name list), and `## Renamed` (rename list) sections. The function SHALL return a `ParsedDelta` type:

```typescript
interface ParsedDelta {
  requirements: RequirementBlock[];  // unclassified
  removed: string[];                 // requirement names to delete
  renamed: RenameEntry[];            // { from: string, to: string }
}
```

`## Requirements` section SHALL be parsed into `RequirementBlock[]` using the existing `### Requirement:` header splitting logic. `## Removed` section SHALL parse list items matching `- "name"` into a `string[]`. `## Renamed` section SHALL parse list items matching `- "old" → "new"` into `RenameEntry[]`.

The old format section headers (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`) SHALL NOT be recognized by the new parser.

#### Scenario: new format with Requirements and Removed

- **GIVEN** a delta spec with `## Requirements` containing 2 Requirement blocks and `## Removed` containing 1 name
- **WHEN** `parseDeltaSpec` is called
- **THEN** `requirements` has length 2, `removed` has length 1, `renamed` is empty

#### Scenario: old format returns empty result

- **GIVEN** a delta spec with `## ADDED Requirements` section
- **WHEN** `parseDeltaSpec` is called
- **THEN** all arrays are empty (old format is not parsed)

### Requirement: classifyDeltaSpec SHALL auto-classify requirements as ADDED or MODIFIED by baseline comparison

A new `classifyDeltaSpec(parsed: ParsedDelta, baselineRequirements: RequirementBlock[] | null): DeltaSpec` function SHALL be exported. It MUST:

1. Apply `renamed` entries to the baseline (rename matching headers from `from` to `to`)
2. Compare each `requirements` entry against the (post-rename) baseline using `normalizeRequirementHeader()`:
   - If a matching baseline requirement exists: classify as `modified`
   - If no matching baseline requirement exists: classify as `added`
3. Convert `removed` name strings into `RequirementBlock` entries (minimal content: header line only) for the `removed` array

When `baselineRequirements` is `null` (new capability), all `requirements` SHALL be classified as `added`, and `removed` / `renamed` MUST produce empty arrays (the caller validates this constraint separately).

#### Scenario: existing capability with mix of new and changed requirements

- **GIVEN** a baseline with requirements ["A", "B"] and a parsed delta with requirements ["B-updated", "C"] where "B-updated" has header "B"
- **WHEN** `classifyDeltaSpec` is called
- **THEN** "B" is classified as `modified` and "C" is classified as `added`

#### Scenario: new capability auto-classifies all as ADDED

- **GIVEN** `baselineRequirements` is `null` and parsed delta has 3 requirements
- **WHEN** `classifyDeltaSpec` is called
- **THEN** all 3 are in `added`, `modified` is empty, `removed` is empty

#### Scenario: renamed entry applied before classification

- **GIVEN** a baseline with requirement "Old Name", a renamed entry `{ from: "Old Name", to: "New Name" }`, and a requirement with header "New Name"
- **WHEN** `classifyDeltaSpec` is called
- **THEN** the requirement is classified as `modified` (matched against renamed baseline)

### Requirement: mergeSpecsForChange SHALL use parseDeltaSpec then classifyDeltaSpec

`mergeSpecsForChange` SHALL call `parseDeltaSpec` to obtain `ParsedDelta`, then call `classifyDeltaSpec` with the parsed result and the baseline requirements to obtain the classified `DeltaSpec`. The empty-delta check SHALL use `parsed.requirements.length + parsed.removed.length + parsed.renamed.length === 0`. The downstream `validateDeltaSpec` → `checkBaselineHeaderConsistency` → `applyMerge` chain SHALL receive the classified `DeltaSpec` and remain unchanged.

#### Scenario: end-to-end merge with new format

- **GIVEN** a new-format delta spec with `## Requirements` containing 1 requirement that matches a baseline requirement
- **WHEN** `mergeSpecsForChange` is called
- **THEN** the requirement is auto-classified as MODIFIED and the baseline is updated with the new content

## MODIFIED Requirements

### Requirement: empty delta (0 entries) is a fatal error

After parsing a capability's delta spec file, `mergeSpecsForChange` MUST check that the total count of `requirements + removed + renamed` entries is greater than zero. A delta spec file that parses successfully but contains no entries SHALL be treated as a semantic error and MUST cause the capability's merge to fail with an error message indicating that the delta is empty.

This check MUST be performed before `classifyDeltaSpec` and before any baseline read or merge operations.

#### Scenario: empty delta fails with capability name in escalation

- **GIVEN** `specs/<cap>/spec.md` exists but contains no `## Requirements`, `## Removed`, or `## Renamed` sections with entries
- **WHEN** `mergeSpecsForChange` processes the capability
- **THEN** `{ ok: false }` is returned and the escalation message references the capability name and the empty delta condition
