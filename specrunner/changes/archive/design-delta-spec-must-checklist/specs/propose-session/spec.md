## MODIFIED Requirements

### Requirement: Propose Instruction Message Content (Updated)
The propose instruction message SHALL instruct the agent to use the openspec CLI for artifact generation. The agent SHALL execute `openspec new change "<slug>"` to scaffold the change folder, then use `openspec status --change "<slug>" --json` and `openspec instructions <artifact-id> --change "<slug>" --json` to determine and generate required artifacts in dependency order. The agent MUST NOT skip artifacts that openspec CLI indicates as required.

The initial message MUST include a `Request type:` field injected via `{{REQUEST_TYPE}}` placeholder, enabling the design agent to reference the request type for completion checklist conditional logic.

#### Scenario: Propose instruction message content
- **WHEN** building the propose instruction message
- **THEN** the message includes: (1) instruction to use the slug and branch provided by the CLI, (2) instruction to use openspec CLI commands for artifact generation, (3) instruction to call `register_branch` Custom Tool after branch creation, (4) the request content wrapped in `<user-request>` tags, (5) commit and push instruction

#### Scenario: openspec CLI workflow in system prompt
- **WHEN** the propose agent starts executing
- **THEN** the system prompt instructs the following workflow: (1) `openspec new change "<slug>"` to create the change scaffold, (2) `openspec status --change "<slug>" --json` to get the artifact build order, (3) for each ready artifact, `openspec instructions <artifact-id> --change "<slug>" --json` to get generation instructions, (4) generate the artifact following the instructions template, (5) repeat until all `applyRequires` artifacts are complete

#### Scenario: Delta spec generation is schema-driven
- **WHEN** `openspec instructions specs --change "<slug>" --json` returns instructions for specs
- **THEN** the agent MUST generate the specs as directed by the instructions, and MUST NOT skip delta spec generation based on the agent's own judgment

#### Scenario: buildInitialMessage signature
- **WHEN** `buildInitialMessage()` is called
- **THEN** the function accepts `requestContent`, `slug`, optional `branch`, optional `dynamicContext`, and optional `requestType` parameters

#### Scenario: Request type is injected into initial message
- **GIVEN** a request with `type: spec-change`
- **WHEN** `buildInitialMessage()` is called with `requestType = "spec-change"`
- **THEN** the output message contains `Request type: \`spec-change\``

#### Scenario: Request type omitted for backward compatibility
- **GIVEN** `buildInitialMessage()` is called without the `requestType` argument
- **WHEN** the message is rendered
- **THEN** the output message contains `Request type: \`\`` (empty string, no error thrown)

## ADDED Requirements

### Requirement: Design step completion checklist enforces delta spec for spec-change/new-feature
The design agent system prompt MUST include a Completion Checklist section that enforces type-aware self-check before end_turn. When `Request type` is `spec-change` or `new-feature`, the checklist SHALL require at least one delta spec file under `specs/<capability>/spec.md` as a REQUIRED item. When `Request type` is `bug-fix` or `refactoring`, the checklist SHALL require only `design.md` and `tasks.md`.

The agent MUST NOT end_turn if any checklist item is unsatisfied.

#### Scenario: type=spec-change requires delta spec in completion checklist
- **GIVEN** the design system prompt contains a Completion Checklist section
- **WHEN** the request type is `spec-change`
- **THEN** the checklist includes an item stating that at least one delta spec file under `specs/<capability>/spec.md` is REQUIRED, and the agent must not end_turn without creating it

#### Scenario: type=new-feature requires delta spec in completion checklist
- **GIVEN** the design system prompt contains a Completion Checklist section
- **WHEN** the request type is `new-feature`
- **THEN** the checklist includes the same delta spec REQUIRED item as spec-change

#### Scenario: type=bug-fix does not require delta spec
- **GIVEN** the design system prompt contains a Completion Checklist section
- **WHEN** the request type is `bug-fix`
- **THEN** the checklist requires only `design.md` and `tasks.md`, and does not require delta spec creation
