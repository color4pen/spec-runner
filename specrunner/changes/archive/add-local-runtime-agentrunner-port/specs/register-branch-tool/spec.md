## ADDED Requirements

### Requirement: register_branch は runtime === "managed" のときのみ登録される

`register_branch` Custom Tool は MUST `runtime: "managed"` のときのみ Agent に登録され、SSE dispatch の対象となる。`runtime: "local"` の場合、CLI は SHALL `register_branch` を Agent の `custom_tools` 配列に含めず、SDK にも登録しない。

#### Scenario: managed runtime で登録される

- **GIVEN** `config.runtime === "managed"` で ProposeStep を実行する
- **WHEN** `ManagedAgentRunner` が agent 起動時に `custom_tools` を構築する
- **THEN** `register_branch` definition が `custom_tools` に含まれる
- **AND** SSE dispatch table が `register_branch` handler を解決可能である

#### Scenario: local runtime で登録されない

- **GIVEN** `config.runtime === "local"` で ProposeStep を実行する
- **WHEN** `ClaudeCodeRunner` が `query()` を呼び出す
- **THEN** `register_branch` への参照は存在しない（tool 自体が SDK 経路に渡されない）
- **AND** agent には `additionalInstructions` で `git checkout -b feat/<slug>` が直接指示される

## MODIFIED Requirements

### Requirement: definition と handler は同一モジュールに colocate される

`register_branch` の definition と handler は MUST 単一の TypeScript モジュールから `defineCustomTool({ definition, handler })` 経由で `{ definition, handler }` を含む単一オブジェクトとして export される。Agent 作成時の `custom_tools` 配列および SSE dispatch table は SHALL 同じ tool registry から導出される。

本モジュールの所在は MUST `src/adapter/managed-agent/tools/register-branch.ts`（または `src/adapter/managed-agent/tools/` 配下の同等ファイル）である。`src/core/tools/` および `src/core/step/` 配下に register_branch を import / 参照する箇所は SHALL 存在しない。

#### Scenario: 単一 source-of-truth

- **WHEN** Agent 作成時の custom_tools 配列を生成する
- **THEN** `tool-registry.getDefinitions()` を呼び出し、その配列を渡す（手動で definition オブジェクトを別箇所に書かない）
- **AND** registry のソースは `src/adapter/managed-agent/tools/` 配下に存在する

#### Scenario: SSE dispatch も同じ registry から取得する

- **WHEN** SSE で `agent.custom_tool_use` イベントを受信する
- **THEN** `tool-registry.getHandler(event.name)` を呼び出してハンドラを解決する
- **AND** dispatch コードも `src/adapter/managed-agent/` 配下に位置する

#### Scenario: core が register_branch を import しない

- **WHEN** `grep -r "register_branch" src/core/` を実行する
- **THEN** マッチ行は 0 である

#### Scenario: ProposeStep が register_branch を toolHandlers に持たない

- **WHEN** `ProposeStep.toolHandlers` を inspect する
- **THEN** `register_branch` key は存在しない、または `toolHandlers` 自体が undefined である
- **AND** runtime 固有 tool は `ManagedAgentRunner` が adapter 内部で注入する
