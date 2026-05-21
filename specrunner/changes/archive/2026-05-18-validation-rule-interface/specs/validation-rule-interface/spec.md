## ADDED Requirements

### Requirement: ValidationRule interface SHALL declare name, severity, and check

The `ValidationRule<TInput, TViolation>` interface SHALL expose three mandatory members:
- `name: string` — unique identifier for the rule
- `severity: "error" | "warning"` — how violations are treated by the caller
- `check(input: TInput): TViolation[]` — returns zero or more violations for the given input

#### Scenario: Implementing a rule

- **GIVEN** a TypeScript module implementing `ValidationRule<ParsedRequestRaw, RequestMdViolation>`
- **WHEN** the TypeScript compiler checks the module
- **THEN** `name`, `severity`, and `check` are all required; omitting any one causes a type error

---

### Requirement: RuleRegistry SHALL collect rules and aggregate violations

The `RuleRegistry<TInput, TViolation>` class SHALL provide:
- `register(rule)` — adds a rule to the registry; throws `Error` if a rule with the same name is already registered
- `validate(input)` — executes all registered rules and returns a flat array of all violations

#### Scenario: Aggregating violations from multiple rules

- **GIVEN** a RuleRegistry with rule "r1" returning 1 violation and rule "r2" returning 2 violations
- **WHEN** `validate(input)` is called
- **THEN** a flat array of 3 violations is returned

#### Scenario: Duplicate rule registration

- **GIVEN** a RuleRegistry with rule "dup" already registered
- **WHEN** a second `register()` call is made with name "dup"
- **THEN** an `Error: Duplicate rule name: dup` is thrown

---

### Requirement: Parser layer and DSV layer rules SHALL each be defined as individual files registered via a registry factory

Each validation check that was previously inline in `request-md.ts` or `delta-spec-validator.ts` SHALL be extracted into a dedicated rule file implementing the appropriate interface, and SHALL be registered via a factory function (`createRequestMdRegistry` / `createDeltaSpecRegistry`).

#### Scenario: Parser rules registered

- **GIVEN** `createRequestMdRegistry()` is called
- **WHEN** the result's `validate()` is called with a raw input missing all required fields
- **THEN** violations for `title-required`, `type-required`, `slug-required`, `base-branch-required`, and `adr-required` are all present in the result

---

### Requirement: Migration SHALL preserve existing inline validation behaviour exactly

After migrating `request-md.ts` and `delta-spec-validator.ts` to use the registry pattern, the public API signatures and error behaviour SHALL remain unchanged.

#### Scenario: Regression guard

- **GIVEN** the existing tests in `tests/unit/parser/request-md.test.ts` and `tests/unit/core/spec/delta-spec-validator.test.ts` are unmodified
- **WHEN** the full test suite is executed
- **THEN** all tests pass without modification
