## ADDED Requirements

### Requirement: `specrunner init` は冪等に Agent と Environment を作成する

`specrunner init` は MUST config に既存 Agent ID と Environment ID があればまず `retrieve` で存在を確認し、存在すれば SHALL 再利用する。存在しない場合のみ新規作成する。

#### Scenario: 既存 ID が有効

- **WHEN** config に agent.id `agent_01x` があり Anthropic API で retrieve すると成功する
- **THEN** 新規作成は行わず、definitionHash の一致確認のみ行う

#### Scenario: 既存 ID が 404

- **WHEN** 既存 agent.id を retrieve すると 404 が返る
- **THEN** 新規 Agent を作成し、新 ID を config に保存する

### Requirement: Agent 定義は CLI コードの source-of-truth から派生する

Agent の `system_prompt`、`custom_tools`、`toolset`、`model` は MUST CLI コードの定数として定義される。`specrunner init` 時にその構造のハッシュ（例: SHA-256 of canonical JSON）を計算し、config の `agent.definitionHash` と SHALL 比較する。

#### Scenario: ハッシュ一致

- **WHEN** CLI 側 definition のハッシュと config の definitionHash が一致する
- **THEN** Agent は更新されない（再利用）

#### Scenario: ハッシュ不一致

- **WHEN** ハッシュが異なる
- **THEN** `client.beta.agents.update(agentId, { system_prompt, custom_tools })` を実行し、新ハッシュを config に書き込む

### Requirement: Custom Tools は registry 経由で Agent に登録される

`specrunner init` における Agent 作成・更新時、`custom_tools` フィールドの値は MUST `tool-registry.getDefinitions()` の戻り値を直接渡す。手動で definition オブジェクトを別箇所に書き起こしては SHALL ならない。

#### Scenario: 定義の単一導出

- **WHEN** Agent 作成リクエストを構築する
- **THEN** `custom_tools` の値は `tool-registry` 由来であり、コードを grep して `name: "register_branch"` の文字列が registry 以外に存在しない

### Requirement: Environment は OpenSpec CLI を含む

Environment 作成時、`packages.npm` には MUST 少なくとも `@fission-ai/openspec` を含める（後続 propose セッションが `openspec` コマンドを使うため）。これにより SHALL Agent の OpenSpec 依存が事前に充足される。

#### Scenario: 初回作成

- **WHEN** Environment を新規作成する
- **THEN** リクエストに `packages: { npm: ["@fission-ai/openspec"] }` が含まれる

### Requirement: 多段リソース作成失敗時は逆順で cleanup する

Agent 作成 → Environment 作成 の途中で失敗した場合、CLI は MUST 既に作成したリソースを逆順で `archive` または `delete` を試行する。cleanup 失敗は warning として stderr に出すが、init 全体は SHALL exit code 1 で終了する。

#### Scenario: Environment 作成失敗

- **WHEN** Agent 作成は成功したが Environment 作成が失敗する
- **THEN** Agent を `archive` または `delete` し、新規作成された Agent ID は config に書き込まれない

#### Scenario: cleanup も失敗

- **WHEN** Environment 作成失敗 → Agent cleanup も失敗
- **THEN** stderr に `Failed to cleanup orphaned agent <id>; please archive manually.` を出力し、init 全体は exit code 1 で終了する

### Requirement: init 完了で Agent が動作するための前提を満たす

init 成功後の状態は MUST 以下を保証する: (a) config の `agent.id` が retrieve 可能、(b) config の `environment.id` が retrieve 可能、(c) Agent の `custom_tools` に `register_branch` が含まれる、(d) Agent の `toolset.type` が `agent_toolset_20260401` である。これらは SHALL post-init の不変条件である。

#### Scenario: post-init 検証

- **WHEN** init が exit code 0 で終了する
- **THEN** 上記 (a)-(d) のすべてが満たされる
