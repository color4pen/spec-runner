## MODIFIED Requirements

### Requirement: `specrunner init` は冪等に Agent と Environment を作成する

`specrunner init` は MUST `AgentRegistry.fromSteps(steps)` で組み立てた registry の各 role に対して `AgentSyncer.syncAll()` を実行し、per-role に `retrieve` → 比較 → `create` または `update` または no-op を判断する。Environment についても retrieve → 既存 ID 再利用、または新規作成を行う。

`init` の各 role 操作は SHALL 独立に実行され、ある role の sync 失敗が他 role の sync を妨げない範囲で進行する（ただし途中で例外が発生した場合は AgentSyncer の orphan rollback ルールに従い、この呼び出しで create したすべての Agent をロールバックする）。

#### Scenario: 既存 Agent ID が有効（per-role）

- **GIVEN** config に `agents.propose.agentId = "agent_01x"`、`agents["spec-review"].agentId = "agent_02y"`、`agents["spec-fixer"].agentId = "agent_03z"` がある
- **AND** 各 ID の `retrieveAgent` が成功する
- **AND** definitionHash が全 role で一致する
- **WHEN** `specrunner init` を実行する
- **THEN** いずれの role でも `createAgent` / `updateAgent` は呼ばれない
- **AND** config の各 `agents[role]` は変化しない（lastSyncedAt の更新を除く）

#### Scenario: 既存 ID が 404（per-role fallback）

- **GIVEN** config に `agents.propose.agentId = "agent_01x"` があり、`retrieveAgent` が 404 を返す
- **AND** `agents["spec-review"]` および `agents["spec-fixer"]` の retrieveAgent は成功する
- **WHEN** `specrunner init` を実行する
- **THEN** propose に対してのみ `createAgent` が呼ばれ、新 ID が `config.agents.propose.agentId` に書き込まれる
- **AND** spec-review / spec-fixer の agentId は変化しない

### Requirement: Agent 定義は Step が所有する `AgentDefinition` から派生する

各 Agent の `system_prompt`、`custom_tools`、`toolset`、`model` は MUST 該当 Step の `AgentDefinition`（`step.agent.system` / `step.agent.tools` / `step.agent.model`）から取得される。`AgentRegistry.hashOf(role)` が canonical JSON SHA-256 で `definitionHash` を計算し、config の `agents[role].definitionHash` と SHALL 比較する。

#### Scenario: ハッシュ一致（per-role）

- **WHEN** ある role の `AgentRegistry.hashOf(role)` が `config.agents[role].definitionHash` と一致する
- **THEN** その role の Agent は更新されない（再利用、no-op）

#### Scenario: ハッシュ不一致（per-role）

- **WHEN** ある role の `AgentRegistry.hashOf(role)` が `config.agents[role].definitionHash` と異なる
- **THEN** その role に対して `client.updateAgent(agentId, def)` を実行し、新ハッシュと新 lastSyncedAt を `config.agents[role]` に書き込む
- **AND** 他 role には影響しない

### Requirement: Custom Tools は Step が所有する `AgentDefinition.tools` から派生する

`specrunner init` における Agent 作成・更新時、`custom_tools` フィールドの値は MUST 該当 Step の `AgentDefinition.tools` 配列を直接渡す。手動で definition オブジェクトを別箇所に書き起こしては SHALL ならない。`tool-registry` のような中間グローバル registry は廃止される（既に PR #26 で D9 が完了）。

#### Scenario: 定義の単一導出

- **WHEN** Agent 作成リクエストを構築する
- **THEN** `custom_tools` の値は該当 Step の `step.agent.tools` 由来であり、コードを grep して `name: "register_branch"` の文字列が ProposeStep ファイル以外に存在しない

### Requirement: Environment は OpenSpec CLI を含む

Environment 作成時、`packages.npm` には MUST 少なくとも `@fission-ai/openspec` を含める（後続 propose セッションが `openspec` コマンドを使うため）。これにより SHALL Agent の OpenSpec 依存が事前に充足される。

#### Scenario: 初回作成

- **WHEN** Environment を新規作成する
- **THEN** リクエストに `packages: { npm: ["@fission-ai/openspec"] }` が含まれる

### Requirement: 多段リソース作成失敗時は逆順で cleanup する

`AgentSyncer.syncAll()` の途中、または Environment 作成までを含む `init` 全体の途中で失敗した場合、CLI は MUST 既に **create** したリソース（Agent および Environment）を逆順で `archive` または `delete` を試行する。**update した既存 Agent は SHALL ロールバック対象外**とする（Agent バージョンの戻し操作が SDK にないため）。cleanup 失敗は warning として stderr に出すが、init 全体は SHALL exit code 1 で終了する。

#### Scenario: spec-fixer Agent 作成失敗で propose / spec-review もロールバック

- **WHEN** propose Agent と spec-review Agent の `createAgent` は成功したが、spec-fixer Agent の `createAgent` が失敗する
- **THEN** propose と spec-review に対して `archiveAgent` を呼ぶ
- **AND** いずれの新規 ID も config に書き込まれない（init 失敗時は config を更新しない）

#### Scenario: Environment 作成失敗で全 Agent ロールバック

- **WHEN** 全 Agent の `createAgent` は成功したが Environment 作成が失敗する
- **THEN** すべての新規作成 Agent に対して `archiveAgent` を呼ぶ
- **AND** いずれの新規 ID も config に書き込まれない

#### Scenario: cleanup も失敗

- **WHEN** 部分失敗 → cleanup 経路に入り、`archiveAgent` の一部が失敗する
- **THEN** stderr に `Failed to cleanup orphaned agent <id>; please archive manually.` を出力する
- **AND** 残りの archive 対象に対する rollback は継続する
- **AND** init 全体は exit code 1 で終了する

### Requirement: init 完了で Agent が動作するための前提を満たす

init 成功後の状態は MUST 以下を保証する:

- (a) `AgentRegistry` に登録されているすべての role について `config.agents[role].agentId` が retrieve 可能
- (b) `config.environment.id` が retrieve 可能
- (c) propose Agent の `custom_tools` に `register_branch` が含まれ、`toolset.type` が `agent_toolset_20260401` である
- (d) spec-review Agent の `custom_tools` が空配列または最小集合（propose 用 `register_branch` を含まない）であり、`toolset.type` が `agent_toolset_20260401` である
- (e) spec-fixer Agent の `custom_tools` が空配列であり、`toolset.type` が `agent_toolset_20260401` である

これらは SHALL post-init の不変条件である。

#### Scenario: post-init 検証

- **WHEN** init が exit code 0 で終了する
- **THEN** 上記 (a)-(e) のすべてが満たされる
- **AND** (d) および (e) の `custom_tools` 検証において、Anthropic API の retrieve 結果が `custom_tools: []`、`null`、`undefined` のいずれを返した場合も「空または最小集合」とみなす（`=== []` による厳密比較は行わない）

### Requirement: spec-fixer Agent は Custom Tools を持たない

`specrunner init` は MUST spec-fixer Agent を作成・更新する際、`custom_tools` フィールドに **空配列** を渡す。`register_branch` を含む Custom Tool は SHALL 一切含めない。`toolset` は SHALL `agent_toolset_20260401`（標準ツール）のみとする。

この制約は MUST `SpecFixerStep.agent.tools = []` として Step ファイル内で宣言される。

#### Scenario: spec-fixer Agent の custom_tools

- **WHEN** spec-fixer Agent 作成リクエストを構築する
- **THEN** `custom_tools` の値は `[]` であり、`register_branch` の文字列を含まない

### Requirement: 各 Step Agent の system_prompt は Step が所有する `AgentDefinition.system` 由来である

`specrunner init` は MUST 各 role の Agent の `system_prompt` を該当 Step の `step.agent.system` の戻り値で設定する。各 Step（propose / spec-review / spec-fixer）の system prompt は SHALL 互いに独立した文字列であり、grep して同じ文字列リテラルが他のロケーションに重複定義されていない。

#### Scenario: 派生元の単一性

- **WHEN** 各 role の Agent 作成リクエストを構築する
- **THEN** `system_prompt` の値は該当 Step の `step.agent.system` 由来である
- **AND** propose / spec-review / spec-fixer の system prompt は互いに異なる文字列である

## ADDED Requirements

### Requirement: spec-review 専用 Agent を作成・更新する

`specrunner init` は MUST `SpecReviewStep.agent` を元に spec-review 専用の Anthropic Agent を作成・更新する。propose Agent ID を spec-review に流用しては SHALL ならない。

#### Scenario: 新規 init で 3 つの独立 Agent が作成される

- **GIVEN** 新規環境（config ファイルが存在しない）
- **WHEN** `specrunner init` を実行する
- **THEN** Anthropic API 上に 3 つの独立した Agent が作成される
- **AND** `config.agents.propose.agentId`、`config.agents["spec-review"].agentId`、`config.agents["spec-fixer"].agentId` の 3 つはすべて異なる文字列である

#### Scenario: 旧 schema migration 後の spec-review Agent 作成

- **GIVEN** config に旧 `agent` 単数のみが存在し、spec-review 専用 Agent が未作成
- **WHEN** `specrunner init` を実行する
- **THEN** ConfigStore.load() が旧 schema を新 schema に詰め直す（`agents.propose` のみ）
- **AND** AgentSyncer.syncAll() が `agents["spec-review"]` を新規作成する
- **AND** init 完了後の config に `agents["spec-review"].agentId` が新 ID で書き込まれている

## REMOVED Requirements

### Requirement: config.agent.id を propose Agent ID と同期する（旧形式互換）
**Reason**: 互換シム廃止。消費者は specrunner 単体であり、旧形式 `config.agent.id` フィールドの維持は不要。新 schema では `config.agents.propose.agentId` が唯一の正である。
**Migration**: `ConfigStore.load()` が旧 schema を読み込んだ際に `agent.id` → `agents.propose.agentId` へ in-memory で詰め直す。`ConfigStore.save()` で新 schema として永続化されると `config.agent` フィールドは消える。以降は `config.agents[role].agentId` を直接参照する。

### Requirement: spec-fixer Agent の system_prompt は `buildSpecFixerSystemPrompt` 由来である
**Reason**: system prompt の所有権が `SpecFixerStep.agent.system`（Step 同居）に移った。中間 helper 関数 `buildSpecFixerSystemPrompt` の存在自体は実装詳細として許容するが、spec 上の正は Step が所有する `AgentDefinition.system` 値である。
**Migration**: 既存の `buildSpecFixerSystemPrompt` の戻り値をそのまま `SpecFixerStep.agent.system` に渡す。grep で他箇所に重複コピーがないことは新 spec の "派生元の単一性" シナリオで保証される。
