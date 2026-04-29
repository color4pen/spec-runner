## MODIFIED Requirements

### Requirement: `specrunner init` は冪等に Agent と Environment を作成する

`specrunner init` は MUST config に既存 Agent ID と Environment ID があればまず `retrieve` で存在を確認し、存在すれば SHALL 再利用する。存在しない場合のみ新規作成する。Agent は SHALL `propose` ロールと `specFixer` ロールの 2 種類を独立して扱い、それぞれ `config.agents.propose` および `config.agents.specFixer` に記録する。

#### Scenario: 既存の propose Agent が有効

- **WHEN** config の `agents.propose.id` `agent_01x` が Anthropic API で retrieve すると成功する
- **THEN** propose Agent は再利用され、definitionHash の一致確認のみ行う

#### Scenario: 既存の spec-fixer Agent が 404

- **WHEN** config の `agents.specFixer.id` を retrieve すると 404 が返る
- **THEN** 新規 spec-fixer Agent を作成し、新 ID を `config.agents.specFixer.id` に保存する

#### Scenario: legacy `agent.id` のみ存在

- **WHEN** 旧形式 config で `agent.id` のみが設定され `agents.propose.id` が未設定
- **THEN** `agent.id` を propose Agent として retrieve し、結果を `agents.propose.id` にも書き込み、spec-fixer Agent は新規作成する

### Requirement: Agent 定義は CLI コードの source-of-truth から派生する

各ロール（propose / specFixer）の `system_prompt`、`custom_tools`、`toolset`、`model` は MUST CLI コードの定数として独立に定義される。`specrunner init` 時にロールごとの構造ハッシュ（SHA-256 of canonical JSON）を計算し、config の `agents.{role}.definitionHash` と SHALL 比較する。

#### Scenario: ハッシュ一致

- **WHEN** propose ロールの CLI 側 definition のハッシュと `config.agents.propose.definitionHash` が一致する
- **THEN** propose Agent は更新されない（再利用）

#### Scenario: ハッシュ不一致

- **WHEN** spec-fixer ロールのハッシュが異なる
- **THEN** `client.beta.agents.update(config.agents.specFixer.id, { system_prompt, custom_tools })` を実行し、新ハッシュを `config.agents.specFixer.definitionHash` に書き込む

## ADDED Requirements

### Requirement: spec-fixer Agent は Custom Tools を持たない

`specrunner init` は MUST spec-fixer Agent を作成・更新する際、`custom_tools` フィールドに **空配列** を渡す。`register_branch` を含む Custom Tool は SHALL 一切含めない。`toolset` は SHALL `agent_toolset_20260401`（標準ツール）のみとする。

#### Scenario: spec-fixer Agent の custom_tools

- **WHEN** spec-fixer Agent 作成リクエストを構築する
- **THEN** `custom_tools` の値は `[]` であり、`register_branch` の文字列を含まない

### Requirement: spec-fixer Agent の system_prompt は `buildSpecFixerSystemPrompt` 由来である

`specrunner init` は MUST spec-fixer Agent の `system_prompt` を `buildSpecFixerSystemPrompt(input)` の戻り値で設定する。propose Agent の system_prompt とは独立した文字列とする。

#### Scenario: 派生元の単一性

- **WHEN** spec-fixer Agent 作成リクエストを構築する
- **THEN** `system_prompt` の値は `buildSpecFixerSystemPrompt` 由来であり、ソースを grep して同じ文字列リテラルが他のロケーションに重複定義されていない

## MODIFIED Requirements

### Requirement: init 完了で Agent が動作するための前提を満たす

init 成功後の状態は MUST 以下を保証する: (a) `config.agents.propose.id` が retrieve 可能、(b) `config.agents.specFixer.id` が retrieve 可能、(c) `config.environment.id` が retrieve 可能、(d) propose Agent の `custom_tools` に `register_branch` が含まれ、`toolset.type` が `agent_toolset_20260401` である、(e) spec-fixer Agent の `custom_tools` が空配列であり、`toolset.type` が `agent_toolset_20260401` である、(f) `config.agent.id` も propose Agent の ID と同期した値で書かれている（旧形式互換）。これらは SHALL post-init の不変条件である。

#### Scenario: post-init 検証

- **WHEN** init が exit code 0 で終了する
- **THEN** 上記 (a)-(f) のすべてが満たされる。(e) の `custom_tools` 検証において、Anthropic API の retrieve 結果が `custom_tools: []`、`null`、`undefined` のいずれを返した場合も「空」とみなし、`register_branch` の文字列が含まれないことのみを検証する（`=== []` による厳密比較は行わない）
