## Requirements

### Requirement: Design and code-review steps inject request.md supplementary sections into agent initial message

The `buildInitialMessage` function (design step) and `buildCodeReviewInitialMessage` function (code-review step) SHALL extract request.md supplementary sections and inject them into the initial agent message **outside** the `<user-request>` tag.

The target supplementary sections are:
- `## スコープ外`
- `## 受け入れ基準`
- `## architect 評価済みの設計判断`

The extraction SHALL be performed by a reusable pure function `extractMarkdownSections(content: string, headings: string[]): Map<string, string>` in `src/parser/extract-section.ts`. The function MUST extract `##`-level heading sections by name and return their body text. `###` or deeper headings within a section MUST NOT be treated as section boundaries.

The injection SHALL use a wrapper function `buildRequestConstraintsBlock(requestContent: string): string | undefined` that extracts the 3 target sections and formats them as a labeled block. When no target sections are found, the function MUST return `undefined` and the initial message SHALL not include the constraints block.

The injected block MUST appear **after** the `</user-request>` closing tag and **before** any `## Repository Context` or `## Branch Context` sections.

This mechanism MUST NOT depend on the agent reading request.md via Read tool — the CLI guarantees the sections are in the agent's context.

Steps other than design and code-review MUST NOT be affected by this change. No changes to StepExecutor, AgentRunContext, or adapter interfaces are required.

#### Scenario: design step includes スコープ外 section in initial message

- **GIVEN** request.md contains a `## スコープ外` section with content "rules ファイルでの対応 — 省略"
- **WHEN** `buildInitialMessage` constructs the initial message
- **THEN** the message contains `## Request Constraints (CLI-injected)` followed by `### スコープ外` with the extracted content
- **AND** this section appears outside the `<user-request>` tag

#### Scenario: code-review step includes 受け入れ基準 section in initial message

- **GIVEN** request.md contains a `## 受け入れ基準` section with acceptance criteria items
- **WHEN** `buildCodeReviewInitialMessage` constructs the initial message
- **THEN** the message contains `### 受け入れ基準` with the extracted content outside `<user-request>`

#### Scenario: request.md without supplementary sections produces no injection

- **GIVEN** request.md contains only `## Meta`, `## 背景`, and `## 要件` sections (no スコープ外, 受け入れ基準, or architect 設計判断)
- **WHEN** `buildInitialMessage` constructs the initial message
- **THEN** the message does NOT contain `## Request Constraints (CLI-injected)`
- **AND** the message is identical to the pre-change behavior

#### Scenario: extractMarkdownSections extracts ## headings but not ### subheadings

- **GIVEN** markdown content with `## スコープ外` containing a `### 詳細` subheading
- **WHEN** `extractMarkdownSections(content, ["スコープ外"])` is called
- **THEN** the returned Map entry for `"スコープ外"` includes the `### 詳細` subheading and its content as part of the section body
