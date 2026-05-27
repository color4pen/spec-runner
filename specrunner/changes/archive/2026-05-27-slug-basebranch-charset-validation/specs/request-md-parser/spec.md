## Requirements

### Requirement: slug field SHALL be validated against SLUG_REGEX charset pattern

The `slug-required` parser rule SHALL validate that the slug value, when present, matches `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/`. If the slug is present but does not match, the rule MUST return an error-severity violation with field `"slug"` and a message containing the invalid value and the expected pattern.

The `SLUG_REGEX` constant SHALL be defined in `src/util/validation-patterns.ts` and imported by all consumers (`slug-required.ts`, `request-new.ts`, `rules-new.ts`, `command-registry.ts`). No local duplicate definitions SHALL exist.

#### Scenario: slug with path traversal characters

- **GIVEN** a `ParsedRequestRaw` with `slug: "../etc/passwd"`
- **WHEN** `slug-required` rule checks the input
- **THEN** an error violation is returned with field `"slug"`

#### Scenario: slug with git option injection

- **GIVEN** a `ParsedRequestRaw` with `slug: "--upload-pack=evil"`
- **WHEN** `slug-required` rule checks the input
- **THEN** an error violation is returned with field `"slug"`

#### Scenario: slug with uppercase characters

- **GIVEN** a `ParsedRequestRaw` with `slug: "UPPERCASE"`
- **WHEN** `slug-required` rule checks the input
- **THEN** an error violation is returned with field `"slug"`

#### Scenario: valid slug passes charset check

- **GIVEN** a `ParsedRequestRaw` with `slug: "valid-slug-123"`
- **WHEN** `slug-required` rule checks the input
- **THEN** no violations are returned

#### Scenario: existing missing-slug behavior is preserved

- **GIVEN** a `ParsedRequestRaw` with `slug: null`
- **WHEN** `slug-required` rule checks the input
- **THEN** an error violation is returned with message containing `missing 'slug'`

### Requirement: baseBranch field SHALL be validated against BASE_BRANCH_REGEX charset pattern

The `base-branch-required` parser rule SHALL validate that the baseBranch value, when present, matches `BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/`. The first character MUST NOT be a hyphen to prevent git option injection. If the baseBranch is present but does not match, the rule MUST return an error-severity violation with field `"baseBranch"` and a message containing the invalid value and the expected pattern.

The `BASE_BRANCH_REGEX` constant SHALL be defined in `src/util/validation-patterns.ts`.

#### Scenario: baseBranch with git option injection

- **GIVEN** a `ParsedRequestRaw` with `baseBranch: "--upload-pack=evil"`
- **WHEN** `base-branch-required` rule checks the input
- **THEN** an error violation is returned with field `"baseBranch"`

#### Scenario: baseBranch with leading dash

- **GIVEN** a `ParsedRequestRaw` with `baseBranch: "-flag"`
- **WHEN** `base-branch-required` rule checks the input
- **THEN** an error violation is returned with field `"baseBranch"`

#### Scenario: baseBranch with shell metacharacters

- **GIVEN** a `ParsedRequestRaw` with `baseBranch: "main; rm -rf /"`
- **WHEN** `base-branch-required` rule checks the input
- **THEN** an error violation is returned with field `"baseBranch"`

#### Scenario: valid branch names pass charset check

- **GIVEN** a `ParsedRequestRaw` with `baseBranch: "release/v1.0"`
- **WHEN** `base-branch-required` rule checks the input
- **THEN** no violations are returned

#### Scenario: existing missing-baseBranch behavior is preserved

- **GIVEN** a `ParsedRequestRaw` with `baseBranch: null`
- **WHEN** `base-branch-required` rule checks the input
- **THEN** an error violation is returned with message containing `missing 'base-branch'`

### Requirement: SLUG_REGEX SHALL be a single shared constant across the codebase

`SLUG_REGEX` SHALL be defined exactly once in `src/util/validation-patterns.ts` and SHALL be imported by all consumers. The following files MUST NOT define their own local `SLUG_REGEX`:
- `src/core/command/request-new.ts`
- `src/core/command/rules-new.ts`
- `src/cli/command-registry.ts`

#### Scenario: no duplicate SLUG_REGEX definitions

- **WHEN** `grep -rn "const SLUG_REGEX" src/` is executed
- **THEN** exactly one result is returned, in `src/util/validation-patterns.ts`
