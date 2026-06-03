# Spec: remove-baseline-corpus

## Requirements

### Requirement: DynamicContext SHALL NOT contain baseline spec index

DynamicContext MUST NOT include a `specIndex` field or `SpecIndexEntry` type. Baseline spec collection is removed entirely.

#### Scenario: DynamicContext has no specIndex field

**Given** a pipeline run starts and `collectDynamicContext` is called
**When** the function returns a `DynamicContext` object
**Then** the object does not contain a `specIndex` property

### Requirement: commit-push SHALL NOT detect authority spec violations

The commit-push step MUST NOT inspect staged or committed files for `specrunner/specs/` prefixed paths. No warning is emitted for files under that prefix.

#### Scenario: staged files include a path under specrunner/specs/

**Given** staged files include a path starting with `specrunner/specs/`
**When** `commitAndPush` executes
**Then** no warning about authority spec edits is emitted and the commit proceeds normally

### Requirement: Agent prompts SHALL NOT reference baseline corpus

Pipeline agent prompts (rules, design-system, code-fixer-system, request-generate-system, request-review-system) MUST NOT contain guidance about `specrunner/specs/` being read-only, authority path edit prohibition, or baseline edit protection.

#### Scenario: rules.md content has no baseline references

**Given** the `RULES_MD_CONTENT` constant is rendered
**When** inspected for `specrunner/specs/` references
**Then** no matches are found

### Requirement: No source references to removed baseline paths

`src/` SHALL NOT contain references to `baselineSpecPath`, `specsDirRel`, `SPECS_DIR`, `specIndex`, or `SpecIndexEntry`. `src/` SHALL NOT contain string literals matching `specrunner/specs/`.

#### Scenario: grep for baseline symbols returns no matches

**Given** the codebase after this change is applied
**When** searching `src/` for `baselineSpecPath`, `specsDirRel`, `SPECS_DIR`, `specIndex`, `SpecIndexEntry`, or the literal `specrunner/specs/`
**Then** zero matches are returned
