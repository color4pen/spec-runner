# Spec: test-placement-convention

## Requirements

### Requirement: Project config SHALL declare a test placement convention via `tests.placement`

The config schema SHALL accept an optional `tests.placement` value that declares where generated
test files belong. `placement` MUST be a discriminated union on `style`:

- `style: "sibling"` with optional `suffix` (string).
- `style: "mirror"` with required `testsRoot` (non-empty string) and optional `sourceRoot` / `suffix` (strings).

Any value that is not one of these shapes (unknown `style`, missing `testsRoot` for `mirror`, or a
field of the wrong type) MUST be rejected at config load time with a `CONFIG_INVALID` error. When
`tests` / `tests.placement` is absent, the config MUST validate successfully (backward compatible).

#### Scenario: valid sibling placement loads

**Given** a config `{ version: 1, agents: {}, tests: { placement: { style: "sibling" } } }`
**When** `validateConfig` is called
**Then** validation succeeds and `tests.placement.style === "sibling"` is preserved on the returned config

#### Scenario: valid mirror placement loads

**Given** a config with `tests: { placement: { style: "mirror", testsRoot: "tests", sourceRoot: "src" } }`
**When** `validateConfig` is called
**Then** validation succeeds and `tests.placement.testsRoot === "tests"` is preserved

#### Scenario: unknown style is rejected at load

**Given** a config with `tests: { placement: { style: "colocated" } }`
**When** `validateConfig` is called
**Then** it throws an error whose message contains `CONFIG_INVALID` and references `tests.placement`

#### Scenario: mirror without testsRoot is rejected at load

**Given** a config with `tests: { placement: { style: "mirror" } }`
**When** `validateConfig` is called
**Then** it throws an error whose message contains `CONFIG_INVALID` and references `tests.placement`

#### Scenario: absent tests section stays valid

**Given** a config `{ version: 1, agents: {} }` with no `tests` key
**When** `validateConfig` is called
**Then** validation succeeds and no error is thrown

### Requirement: A configured placement SHALL be injected deterministically into the implementer user message

When `tests.placement` is configured, the implementer step's initial user message SHALL contain an
explicit, deterministic test-placement directive derived from the config value (not free-form agent
judgment). The directive MUST state that it takes precedence over the default "follow the existing
test placement pattern" guidance. The directive content MUST be determined solely by the config value
(`style`, `testsRoot`, `sourceRoot`, `suffix`), so the same config always produces the same instruction.

#### Scenario: sibling placement appears in the implementer message

**Given** `tests.placement = { style: "sibling" }`
**When** the implementer initial user message is built with that placement
**Then** the message contains a `Test File Placement` section instructing that test files be placed in
the same directory as the source file under test, including the `.test.ts` suffix

#### Scenario: mirror placement appears in the implementer message

**Given** `tests.placement = { style: "mirror", testsRoot: "tests", sourceRoot: "src" }`
**When** the implementer initial user message is built with that placement
**Then** the message contains a `Test File Placement` section that references `testsRoot` (`tests`) and a
before→after mapping example showing a source path mirrored under `tests/`

#### Scenario: custom suffix overrides the default

**Given** `tests.placement = { style: "sibling", suffix: ".spec.ts" }`
**When** the implementer initial user message is built with that placement
**Then** the directive uses `.spec.ts` as the test file suffix and does not assert `.test.ts`

### Requirement: Unset placement SHALL leave existing prompts unchanged

When `tests.placement` is absent, the implementer user message and all step system prompts SHALL be
byte-for-byte identical to the current behavior. The test-case-gen prompt MUST NOT mention test
placement in any configuration (placement is a coding-time concern handled only by the implementer).

#### Scenario: implementer message has no placement section when unset

**Given** no `placement` is provided to the implementer message builder
**When** the implementer initial user message is built
**Then** the message does not contain a `Test File Placement` section and is identical to the message
produced before this change for the same inputs

#### Scenario: test-case-gen prompt never mentions placement

**Given** the test-case-gen system prompt
**When** its content is inspected
**Then** it contains no test-placement directive (no `Test File Placement` section)
