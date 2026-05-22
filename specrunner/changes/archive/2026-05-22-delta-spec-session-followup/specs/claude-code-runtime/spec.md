# claude-code-runtime Specification (delta)

## Requirements

### Requirement: ClaudeCodeRunner は followUpPrompt 指定時に 2 段実行する

`ClaudeCodeRunner.run(ctx)` SHALL `ctx.followUpPrompt` が指定されている場合、作業 turn 完了後に同一 session で follow プロンプトを 1 本投げる 2 段実行を行う。

2 段実行の手順:

1. 作業 turn を実行 (既存の `queryFn` 呼び出し)
2. 作業 turn の result から `session_id` を取得する
3. `queryFn` を 2 回目で `resume: session_id` option 付きで呼び出し、`ctx.followUpPrompt` を prompt として渡す
4. follow turn 完了後の result を最終 result として返す

`ctx.followUpPrompt` が未指定の場合は `if (!ctx.followUpPrompt) return result;` 相当の早期 return で既存パスを汚さず分離する。

#### Scenario: followUpPrompt 指定時に 2 回 query が呼ばれる

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 2 回呼ばれる
- **AND** 1 回目は `fullPrompt` (作業 turn)
- **AND** 2 回目は `ctx.followUpPrompt` で `resume: sessionId` option 付き

#### Scenario: follow turn が同一 session を resume する

- **GIVEN** 作業 turn の result が `session_id: "sess-abc"` を返す
- **WHEN** follow turn の `queryFn` 呼び出しを inspect する
- **THEN** options に `resume: "sess-abc"` が含まれる

#### Scenario: followUpPrompt 未指定時は 1 回のみ

- **GIVEN** `ctx.followUpPrompt` が undefined である
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 1 回のみ呼ばれる
- **AND** result は従来と同一構造である

### Requirement: ClaudeCodeRunner は作業 turn と follow turn の modelUsage を加算して session 総量とする

`ClaudeCodeRunner` SHALL 作業 turn と follow turn の `modelUsage` を per-model で加算し、session 総量として最終 result に採用する。

follow turn は `resume` による別 query invocation であり、follow query の `modelUsage` はその invocation 単体の usage (= 履歴 re-read を input に含む) であって session 累積ではない。真の総コストは作業 query と follow query の加算で得られるため、両者を per-model で合算する MUST。

作業 turn のみの場合は従来通りその turn の `modelUsage` を返す。

#### Scenario: 作業 turn と follow turn の modelUsage が加算される

- **GIVEN** 作業 turn の `modelUsage` が `{ inputTokens: 1000, outputTokens: 200 }` である
- **AND** follow turn の `modelUsage` が `{ inputTokens: 1200, outputTokens: 150 }` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` の result を inspect する
- **THEN** `result.modelUsage` は両者の per-model 加算 (`{ inputTokens: 2200, outputTokens: 350 }`) である

### Requirement: ClaudeCodeRunner は follow turn を既存 AbortController で timeout する

ClaudeCodeRunner の 2 段実行 SHALL 既存の AbortController を作業 turn と follow turn で共有する。turn ごとに個別の timeout を設けない。

作業 turn + follow turn の合算が wall-clock timeout 1 本として有効になる。

#### Scenario: timeout が作業 turn + follow turn 合算で適用される

- **GIVEN** `resolvedConfig.timeoutMs` が 60000ms である
- **AND** 作業 turn が 50000ms かかる
- **WHEN** follow turn が 15000ms 目に到達する (合計 65000ms)
- **THEN** AbortController が abort する
- **AND** result は `completionReason: "timeout"` である
