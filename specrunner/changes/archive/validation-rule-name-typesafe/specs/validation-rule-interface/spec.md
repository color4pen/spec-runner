## MODIFIED Requirements

### Requirement: ValidationRule interface SHALL declare name, severity, and check

The `ValidationRule<TInput, TViolation, TName extends string = string>` interface SHALL expose three mandatory members:
- `name: TName` — unique identifier for the rule, constrained by the `TName` type parameter to enable compile-time typo detection when specialized with a string literal union
- `severity: "error" | "warning"` — how violations are treated by the caller
- `check(input: TInput): TViolation[]` — returns zero or more violations for the given input

The third type parameter `TName` SHALL default to `string` to maintain backward compatibility with existing callers that use `ValidationRule<TInput, TViolation>`.

#### Scenario: Implementing a rule

- **GIVEN** a TypeScript module implementing `ValidationRule<ParsedRequestRaw, RequestMdViolation>`
- **WHEN** the TypeScript compiler checks the module
- **THEN** `name`, `severity`, and `check` are all required; omitting any one causes a type error

#### Scenario: Implementing a parser rule with RequestMdRuleName specialization

- **GIVEN** a TypeScript module implementing `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>`
- **WHEN** the module assigns a name value not in the `RequestMdRuleName` union (e.g. `"type-requied"`)
- **THEN** the TypeScript compiler reports a type error

#### Scenario: Backward compatibility with two type parameters

- **GIVEN** existing code using `ValidationRule<TInput, TViolation>` without specifying TName
- **WHEN** the TypeScript compiler checks the code
- **THEN** `TName` defaults to `string` and the code compiles without modification

---

### Requirement: RuleRegistry SHALL collect rules and aggregate violations

The `RuleRegistry<TInput, TViolation, TName extends string = string>` class SHALL provide:
- `register(rule)` — adds a rule to the registry; throws `Error` if a rule with the same name is already registered. The rule's `name` is constrained by `TName`.
- `validate(input)` — executes all registered rules and returns a flat array of all violations

The third type parameter `TName` SHALL default to `string` to maintain backward compatibility with existing callers that use `RuleRegistry<TInput, TViolation>`.

#### Scenario: Aggregating violations from multiple rules

- **GIVEN** a RuleRegistry with rule "r1" returning 1 violation and rule "r2" returning 2 violations
- **WHEN** `validate(input)` is called
- **THEN** a flat array of 3 violations is returned

#### Scenario: Duplicate rule registration

- **GIVEN** a RuleRegistry with rule "dup" already registered
- **WHEN** a second `register()` call is made with name "dup"
- **THEN** an `Error: Duplicate rule name: dup` is thrown

---

## ADDED Requirements

### Requirement: Parser layer SHALL define RequestMdRuleName union type for compile-time name safety

`src/parser/rules/types.ts` SHALL export a `RequestMdRuleName` type as a string literal union containing all 7 parser rule names: `"type-required"`, `"type-known"`, `"slug-required"`, `"base-branch-required"`, `"adr-required"`, `"adr-valid"`, `"title-required"`.

Each parser rule file SHALL use `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>` as its type annotation. `createRequestMdRegistry()` SHALL return `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>`.

#### Scenario: Parser rule with typo in name causes compile error

- **GIVEN** a parser rule file declares `ValidationRule<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>`
- **WHEN** the `name` property is set to `"type-requied"` (typo)
- **THEN** the TypeScript compiler reports a type error because `"type-requied"` is not assignable to `RequestMdRuleName`

#### Scenario: createRequestMdRegistry returns typed registry

- **GIVEN** `createRequestMdRegistry()` is called
- **WHEN** the return type is inspected
- **THEN** it is `RuleRegistry<ParsedRequestRaw, RequestMdViolation, RequestMdRuleName>`
