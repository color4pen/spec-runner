# agent-runner-port Specification (delta)

## Requirements

### Requirement: AgentRunContext は followUpPrompts を伝搬する

`AgentRunContext` SHALL `followUpPrompts?: string[]` field を持つ。この field は step が宣言した follow-up prompt および project rules から生成された follow-up prompt 列を adapter に伝搬する。

`followUpPrompts` が non-empty の場合、adapter は作業 turn 完了後に同一 session で各 prompt を順番に投げる。`followUpPrompts` が未指定 (undefined) または空配列の場合、adapter は作業 turn のみで返す (既存挙動)。

この field は runtime-neutral な string 配列であり、SDK 固有型を含まない (TC-002 準拠)。旧 `followUpPrompt?: string` field は `followUpPrompts?: string[]` に置き換えられる。

#### Scenario: followUpPrompts が AgentRunContext に含まれる

- **WHEN** `AgentRunContext` の field を inspect する
- **THEN** `followUpPrompts?: string[]` field が存在する
- **AND** field は optional である (未指定時は undefined)
- **AND** 旧 `followUpPrompt?: string` field は存在しない

#### Scenario: followUpPrompts 未指定時は既存挙動のまま

- **GIVEN** `ctx.followUpPrompts` が undefined である
- **WHEN** `runner.run(ctx)` を実行する
- **THEN** adapter は作業 turn のみを実行する
- **AND** result は従来と同一構造である

#### Scenario: followUpPrompts 空配列時は既存挙動のまま

- **GIVEN** `ctx.followUpPrompts` が `[]` である
- **WHEN** `runner.run(ctx)` を実行する
- **THEN** adapter は作業 turn のみを実行する

## Removed

- "AgentRunContext は followUpPrompt を伝搬する"
