# managed-agent-runtime Specification (delta)

## Requirements

### Requirement: ManagedAgentRunner は N 段 follow-up を graceful degradation で実行する

`ManagedAgentRunner` SHALL `ctx.followUpPrompts` が non-empty かつ作業 turn が success の場合、各 prompt を順番に `executeFollowUpTurn` で実行する N 段 follow-up を行う。

N 段 follow-up は既存の `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` をループ呼び出しして実現する。

graceful degradation:
- 各 follow turn は独立して try/catch される (既存の `executeFollowUpTurn` の挙動)
- 1 つの follow turn が失敗しても、残りの follow turn は続行される
- 失敗時は stderr に warning を出力し、作業 turn の result を保持する

SSE 経路 (`runDesignStyle`) と polling 経路 (`runPollingStyle`) の両方で N 段対応する。

#### Scenario: N 段 follow-up が順番に実行される (polling style)

- **GIVEN** `ctx.followUpPrompts` が `["rule-a prompt", "rule-b prompt"]` である
- **AND** 作業 turn の polling が `idle` で完了する
- **WHEN** `ManagedAgentRunner.runPollingStyle(ctx)` を実行する
- **THEN** `sendUserMessage` が作業 turn + follow turn x2 で合計 3 回呼ばれる
- **AND** `pollUntilComplete` が合計 3 回呼ばれる

#### Scenario: N 段 follow-up が順番に実行される (SSE style)

- **GIVEN** `ctx.followUpPrompts` が `["rule-a prompt", "rule-b prompt"]` である
- **AND** SSE streaming が `end_turn` で完了する
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** `sendUserMessage` が follow turn x2 で 2 回呼ばれる
- **AND** `pollUntilComplete` が follow turn x2 で 2 回呼ばれる

#### Scenario: 1 つの follow turn 失敗で残りが続行される

- **GIVEN** `ctx.followUpPrompts` が `["rule-a prompt", "rule-b prompt", "rule-c prompt"]` である
- **AND** 2 つ目の follow turn (`rule-b prompt`) で `sendUserMessage` が例外を throw する
- **WHEN** `ManagedAgentRunner` が N 段 follow-up を実行する
- **THEN** 2 つ目の follow turn は catch され stderr に warning が出力される
- **AND** 3 つ目の follow turn (`rule-c prompt`) は正常に実行される
- **AND** 作業 turn の result が最終結果として返される

#### Scenario: followUpPrompts が空の場合は作業 turn のみ

- **GIVEN** `ctx.followUpPrompts` が `undefined` または `[]` である
- **WHEN** `ManagedAgentRunner.run(ctx)` を実行する
- **THEN** follow turn 用の `sendUserMessage` は呼ばれない

## Removed

- "ManagedAgentRunner は followUpPrompt 指定時に SSE 後 follow turn を実行する"
- "ManagedAgentRunner は followUpPrompt 指定時に polling style でも follow turn を実行する"
- "ManagedAgentRunner は follow turn の timeout を既存の effectiveTimeoutMs で管理する"
