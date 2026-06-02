# Delta Spec: spec-merge

## Requirements

### Requirement: finish SHALL NOT merge delta specs into baseline specs

`job finish` SHALL NOT call `mergeSpecsForChange` or perform any delta-to-baseline spec merge. The finish pipeline SHALL execute archive folder move, usage.json derivation, archive commit, push, and PR merge without writing to any baseline spec file.

#### Scenario: finish completes without modifying baseline specs

- **GIVEN** a change with a valid delta spec under `specs/<capability>/spec.md`
- **WHEN** `job finish` is executed
- **THEN** no file under the baseline `specs/` directory is created or modified

## Removed

- "delta apply skip/fail is determined by request type"
- "empty delta (0 entries) is a fatal error"
- "cross-capability delta apply is atomic"
- "TYPE_CONFIG is the authoritative source for known request types"
- "baseline header consistency check before merge application"
- "parseDeltaSpec SHALL parse the new format without section-level classification"
- "classifyDeltaSpec SHALL auto-classify requirements as ADDED or MODIFIED by baseline comparison"
- "mergeSpecsForChange SHALL use parseDeltaSpec then classifyDeltaSpec"
