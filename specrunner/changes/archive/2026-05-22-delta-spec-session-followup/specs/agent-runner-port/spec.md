# agent-runner-port Specification (delta)

## Requirements

### Requirement: AgentRunContext は followUpPrompt を伝搬する

`AgentRunContext` SHALL `followUpPrompt?: string` field を持つ。この field は step が宣言した follow-up prompt を adapter に伝搬する。

`followUpPrompt` が指定されている場合、adapter は作業 turn 完了後に同一 session で follow プロンプトを 1 本投げて self-fix を促す。`followUpPrompt` が未指定 (undefined) の場合、adapter は作業 turn のみで返す (既存挙動)。

`AgentRunContext` に追加される field:

```ts
/** 作業 turn 後に同一 session へ投げる follow プロンプト。未指定時は作業 turn のみ。 */
followUpPrompt?: string;
```

この field は runtime-neutral な string であり、SDK 固有型を含まない (TC-002 準拠)。

#### Scenario: followUpPrompt が AgentRunContext に含まれる

- **WHEN** `AgentRunContext` の field を inspect する
- **THEN** `followUpPrompt?: string` field が存在する
- **AND** field は optional である (未指定時は undefined)

#### Scenario: followUpPrompt 未指定時は既存挙動のまま

- **GIVEN** `ctx.followUpPrompt` が undefined である
- **WHEN** `runner.run(ctx)` を実行する
- **THEN** adapter は作業 turn のみを実行する
- **AND** result は従来と同一構造である
