# Delta Spec: delta-spec-rule DSV update

## ADDED Requirements

### Requirement: canonical-spec-structure rule SHALL validate new delta spec format

The `canonical-spec-structure` rule SHALL check for the presence of `## Requirements` as the valid section header in delta spec files. The old section headers (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`) SHALL be detected as a new violation reason `legacy-section-header` with severity `error`.

Validation logic:
- `## Requirements` present with at least one `### Requirement:` block → pass
- `## Requirements` absent → `missing-requirements-section` violation (unchanged)
- `## Requirements` present but no `### Requirement:` blocks → `empty-section` violation (unchanged)
- Any of `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` present → `legacy-section-header` violation with suggested fix: "Replace with ## Requirements (tool auto-classifies ADDED/MODIFIED)"

`## Removed` and `## Renamed` sections are optional and SHALL NOT be validated by this rule (their content is validated by the merger at finish time).

#### Scenario: new format passes validation

- **GIVEN** a delta spec file at `specs/<cap>/spec.md` containing `## Requirements` and `### Requirement:` blocks
- **WHEN** the `canonical-spec-structure` rule checks the file
- **THEN** no violations are returned

#### Scenario: old format ADDED header triggers violation

- **GIVEN** a delta spec file containing `## ADDED Requirements`
- **WHEN** the `canonical-spec-structure` rule checks the file
- **THEN** a `legacy-section-header` violation is returned

#### Scenario: old format MODIFIED header triggers violation

- **GIVEN** a delta spec file containing `## MODIFIED Requirements`
- **WHEN** the `canonical-spec-structure` rule checks the file
- **THEN** a `legacy-section-header` violation is returned

## MODIFIED Requirements

### Requirement: DeltaSpecRuleName union type

`src/core/spec/rules/types.ts` に `DeltaSpecRuleName` union 型を export する。

- DSV rule 4 件の name を string literal union で列挙する: `"canonical-spec-structure" | "no-legacy-flat-dir" | "no-legacy-flat-file" | "no-specs-for-required-type"`
- この union は「valid な rule name の制約」であり、registry に登録される rule 集合の列挙ではない（`no-specs-for-required-type` は union に含むが registry には登録しない）

#### Scenario: typo in rule name causes compile error

- **GIVEN** a rule file declares `DeltaSpecRule<DeltaSpecRuleName>`
- **WHEN** the `name` property is set to `"canonical-spec-strcuture"` (typo)
- **THEN** the TypeScript compiler reports a type error
