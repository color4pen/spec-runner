## ADDED Requirements

### Requirement: parseRequestMdContent SHALL route validation through RuleRegistry

The `parseRequestMdContent` function SHALL delegate all field validation to a `RuleRegistry<ParsedRequestRaw, RequestMdViolation>` instance obtained from `createRequestMdRegistry()`, rather than performing inline checks.

#### Scenario: Validation via registry

- **GIVEN** `parseRequestMdContent` is called with content missing the `type` field
- **WHEN** the function executes the validation phase
- **THEN** the `type-required` rule in the registry produces the violation and `requestMdInvalidError` is thrown with the rule's message

#### Scenario: Warning emitted via registry

- **GIVEN** content with an unknown request type value
- **WHEN** `parseRequestMdContent` is called
- **THEN** the `type-known` rule produces a warning-severity violation, which is emitted to stderr via `stderrWrite`, and the function does not throw
