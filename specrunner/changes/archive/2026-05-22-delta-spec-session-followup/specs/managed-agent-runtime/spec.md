# managed-agent-runtime Specification (delta)

## Requirements

### Requirement: ManagedAgentRunner は followUpPrompt 指定時に SSE 後 follow turn を実行する

`ManagedAgentRunner.runDesignStyle(ctx)` SHALL `ctx.followUpPrompt` が指定されている場合、SSE `end_turn` 完了後に同一 session で follow プロンプトを 1 本投げる 2 段実行を行う。

2 段実行の手順:

1. 作業 turn を SSE streaming で実行 (既存の `streamEvents` 呼び出し)
2. SSE が `end_turn` で完了した後、同一 `sessionId` に対して `sendUserMessage(sessionId, ctx.followUpPrompt)` を呼ぶ
3. `pollUntilComplete(sessionId)` で follow turn の完了を待つ
4. follow turn 完了後、既存の GitHub verification (branch / change folder 確認) を実行する

follow turn には SSE streaming を使わず polling で完了を待つ。follow turn は custom tool 不要の self-fix 作業であるため、SSE の event dispatch は不要。

`ctx.followUpPrompt` が未指定の場合は既存パスのまま返す (早期 return)。

SSE が `end_turn` 以外で終了した場合 (polling fallback / terminated) は follow turn を実行しない。follow turn は作業 turn が正常完了した場合のみ実行する。

#### Scenario: SSE end_turn 後に follow turn を実行する

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** SSE streaming が `end_turn` で完了する
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** `sendUserMessage(sessionId, ctx.followUpPrompt)` が呼ばれる
- **AND** `pollUntilComplete(sessionId)` が呼ばれる
- **AND** follow turn 完了後に GitHub verification が実行される

#### Scenario: SSE が terminated の場合 follow turn を実行しない

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** SSE streaming が `terminated` で完了する
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** `sendUserMessage` は follow turn 目的では呼ばれない
- **AND** 既存の terminated エラーハンドリングが実行される

#### Scenario: followUpPrompt 未指定時は既存挙動

- **GIVEN** `ctx.followUpPrompt` が undefined である
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** SSE 完了後すぐに GitHub verification + return する
- **AND** `sendUserMessage` は呼ばれない

### Requirement: ManagedAgentRunner は followUpPrompt 指定時に polling style でも follow turn を実行する

`ManagedAgentRunner.runPollingStyle(ctx)` SHALL `ctx.followUpPrompt` が指定されている場合、polling 完了後に同一 session で follow プロンプトを 1 本投げる 2 段実行を行う。

polling が `idle` (成功) で完了した場合のみ follow turn を実行する。`terminated` やエラーの場合は follow turn を実行しない。

2 段実行の手順:

1. 作業 turn を polling で実行 (既存の `sendUserMessage` + `pollUntilComplete`)
2. polling が `idle` で完了した後、同一 `sessionId` に対して `sendUserMessage(sessionId, ctx.followUpPrompt)` を呼ぶ
3. `pollUntilComplete(sessionId)` で follow turn の完了を待つ
4. follow turn 完了後、既存の artifact 検証を実行する

#### Scenario: polling idle 後に follow turn を実行する

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** 作業 turn の polling が `idle` で完了する
- **WHEN** `ManagedAgentRunner.runPollingStyle(ctx)` を実行する
- **THEN** `sendUserMessage` が 2 回呼ばれる (作業 turn + follow turn)
- **AND** `pollUntilComplete` が 2 回呼ばれる (作業 turn + follow turn)

#### Scenario: follow turn の sendUserMessage が失敗した場合 graceful degradation

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** follow turn の `sendUserMessage` が例外を throw する
- **WHEN** `ManagedAgentRunner` が follow turn を試みる
- **THEN** 例外を catch して stderr に warning を出力する
- **AND** 作業 turn の result をそのまま返す (follow turn 失敗は非致命的)

### Requirement: ManagedAgentRunner は follow turn の timeout を既存の effectiveTimeoutMs で管理する

ManagedAgentRunner の 2 段実行 SHALL 既存の timeout 計算 (`resolvedConfig.timeoutMs` or `DEFAULT_POLL_TIMEOUT_MS`) を作業 turn と follow turn で共有する。

SSE 経路では既存の AbortController が run() 全体をカバーする。polling 経路では wall-clock timeout の残時間を follow turn に引き継ぐ。

#### Scenario: follow turn が timeout 残時間内で実行される

- **GIVEN** `effectiveTimeoutMs` が 900000ms である
- **AND** 作業 turn が 600000ms かかる
- **WHEN** follow turn の pollUntilComplete を inspect する
- **THEN** timeout は残時間 (300000ms 以下) が設定されている
