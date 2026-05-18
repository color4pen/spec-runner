## Purpose

Run a propose session that produces a change folder on a feature branch.
## Requirements

### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt that instructs the agent to use the openspec CLI (`openspec new change`, `openspec status`, `openspec instructions`) for artifact generation.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-opus-4-6[1m]`, `agent_toolset_20260401`, and a system prompt containing openspec CLI workflow instructions

#### Scenario: Agent and environment selection
- **WHEN** starting a propose session
- **THEN** the system requires an agent ID and environment ID to be specified (passed from the UI or pre-configured)

#### Scenario: Custom Tool included in session creation
- **WHEN** creating a propose session via `createBoundSession()`
- **THEN** the session is created with the `register_branch` Custom Tool in the `tools` array, defined as `type: 'custom'` with the appropriate `name`, `description`, and `input_schema`

### Requirement: Slug Derivation
The system SHALL delegate slug generation to the agent and no longer derive it deterministically on the server side during propose session startup.

#### Scenario: No server-side slug generation during propose startup
- **WHEN** starting a propose session
- **THEN** the system does NOT generate a slug from the request title. The `generateSlug()` call is removed from `startPropose()`. The slug will be reported by the agent via the `register_branch` Custom Tool

#### Scenario: Branch name not pre-computed
- **WHEN** starting a propose session
- **THEN** the system does NOT pre-compute a `branchName` to pass to the agent. The agent determines the branch name autonomously based on the request context

#### Scenario: Idempotent branch cleanup removed
- **WHEN** starting a propose session
- **THEN** the system does NOT check for or delete existing branches before session creation, because the branch name is not known until the agent determines it. Branch conflict handling is the agent's responsibility

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

### Requirement: DynamicContext は specIndex フィールドを含む

`DynamicContext` 型は MUST `specIndex: SpecIndexEntry[]` フィールドを持つ。`SpecIndexEntry` は `{ capability: string; purpose: string; requirementCount: number }` で構成される。`collectDynamicContext()` は `specrunner/specs/*/spec.md` を走査し、各 spec から capability 名・Purpose 1行目・requirement 数を収集して `specIndex` に格納する。

`specrunner/specs/` ディレクトリが存在しない場合は空配列を返す（SHALL）。個別の spec.md 読み取り失敗時はそのエントリをスキップする（MUST）。結果は capability 名で昇順ソートされる。

#### Scenario: specrunner/specs/ が存在しない場合に空配列を返す

- **GIVEN** ワークスペースに `specrunner/specs/` ディレクトリが存在しない
- **WHEN** `collectDynamicContext()` を実行する
- **THEN** `specIndex` が空配列 `[]` になる

#### Scenario: spec.md を走査して正しい SpecIndexEntry を返す

- **GIVEN** `specrunner/specs/foo/spec.md` に `## Purpose` セクション（1行目: "Manage foo resources"）と `### Requirement:` が 3 つ存在する
- **WHEN** `collectDynamicContext()` を実行する
- **THEN** `specIndex` に `{ capability: "foo", purpose: "Manage foo resources", requirementCount: 3 }` が含まれる

#### Scenario: 読み取り不可の spec.md はスキップされる

- **GIVEN** `specrunner/specs/bar/` ディレクトリが存在するが `spec.md` が読めない
- **WHEN** `collectDynamicContext()` を実行する
- **THEN** `specIndex` に `bar` のエントリが含まれず、他のエントリは正常に返される

### Requirement: Propose specIndex Injection

`buildInitialMessage()` の第4引数は MUST `DynamicContext` 型（optional）を受け取る。従来の `{ changesList?: string[] }` partial pick 型から `DynamicContext` 型への統一により、`specIndex` を含む全フィールドを一貫して渡せるようにする。

`DynamicContext.specIndex` が非空の場合、初期メッセージの Repository Context セクションに Baseline Specs テーブルを MUST 含める。テーブルは capability 名・Purpose 1行目・requirement 数の 3 列で構成する。`specIndex` が空の場合はテーブルセクションを SHALL 省略する。

`changesList` と `specIndex` は独立に条件判定され、両方とも空の場合は Repository Context セクション自体を出力しない。

#### Scenario: specIndex が存在する場合に Baseline Specs テーブルが含まれる

- **GIVEN** `DynamicContext` に 2 つ以上の `SpecIndexEntry` がある
- **WHEN** `buildInitialMessage()` を呼び出す
- **THEN** 初期メッセージに `### Baseline Specs` セクションヘッダーと capability / Purpose / requirement 数のテーブルが含まれる

#### Scenario: specIndex が空の場合にテーブルが省略される

- **GIVEN** `DynamicContext` の `specIndex` が空配列
- **WHEN** `buildInitialMessage()` を呼び出す
- **THEN** 初期メッセージに `Baseline Specs` セクションが含まれない

#### Scenario: changesList のみ存在し specIndex が空

- **GIVEN** `DynamicContext` の `changesList` が非空で `specIndex` が空配列
- **WHEN** `buildInitialMessage()` を呼び出す
- **THEN** Repository Context セクションに Active Changes のみが含まれ、Baseline Specs テーブルは含まれない

#### Scenario: buildInitialMessage の引数型が DynamicContext に統一される

- **GIVEN** `buildInitialMessage()` の第4引数に `DynamicContext` 型のオブジェクトを渡す
- **WHEN** `changesList` と `specIndex` の両方が非空
- **THEN** Active Changes と Baseline Specs の両方が Repository Context セクションに含まれる

### Requirement: Baseline Spec Reference in System Prompt

propose agent のシステムプロンプトは MUST path-fence セクション直後に baseline spec 参照指示セクションを含む。`specrunner/specs/` 配下の baseline spec の Read は SHALL 許可される（path-fence の「編集禁止」ルールに該当しないため）。

agent は delta spec（MODIFIED / REMOVED）を書く前に、対応する baseline spec を Read して既存 Requirement を把握しなければならない（MUST）。initial message に specIndex テーブルが含まれている場合は、それを手がかりに関連する baseline spec を特定する。

#### Scenario: system prompt に baseline 参照指示が含まれる

- **WHEN** propose セッションのシステムプロンプトを参照する
- **THEN** `specrunner/specs/` 配下の baseline spec の Read 許可と、delta spec 作成前の参照指示がプロンプト内に存在する

#### Scenario: path-fence と baseline 参照の共存

- **GIVEN** path-fence が `specrunner/changes/<slug>/` 外のファイル編集を禁止している
- **WHEN** propose agent が `specrunner/specs/` 配下の baseline spec を Read する
- **THEN** Read は編集ではないため path-fence 違反にならない

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
