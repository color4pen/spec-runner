# claude-code-runtime Specification (delta)

## Removed

- "ClaudeCodeRunner は followUpPrompt 指定時に 2 段実行する"
- "ClaudeCodeRunner は作業 turn と follow turn の modelUsage を加算して session 総量とする"
- "ClaudeCodeRunner は follow turn を既存 AbortController で timeout する"

## Requirements

### Requirement: ClaudeCodeRunner は N 段 follow-up を実行する

`ClaudeCodeRunner.run(ctx)` SHALL `ctx.followUpPrompts` が non-empty かつ作業 turn が success の場合、各 prompt を順番に同一 session で実行する N 段 follow-up を行う。

N 段 follow-up の手順:
1. 作業 turn を `queryFn()` で実行 (既存)
2. `ctx.followUpPrompts` の各 prompt に対して、`resume: extractedSessionId` で `queryFn()` を再呼び出し
3. 各 follow turn の modelUsage を累積加算 (per-model sum)
4. 最終 turn の resultContent を `mergeFollowUpResult` で採用
5. いずれかの follow turn が error の場合、即座に error result を返す

AbortController は run() 全体に 1 本。N 段全 follow turn を同一 AbortController で覆う。

#### Scenario: N 段 follow-up が順番に実行される

- **GIVEN** `ctx.followUpPrompts` が `["rule-a prompt", "rule-b prompt"]` である
- **AND** 作業 turn が success で sessionId が取得されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 3 回呼ばれる (作業 turn + follow turn x2)
- **AND** 2 回目と 3 回目の呼び出しは `resume: sessionId` オプションを含む
- **AND** 2 回目の prompt は `"rule-a prompt"` である
- **AND** 3 回目の prompt は `"rule-b prompt"` である

#### Scenario: followUpPrompts が空の場合は作業 turn のみ

- **GIVEN** `ctx.followUpPrompts` が `undefined` または `[]` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 1 回のみ呼ばれる

#### Scenario: N 段 follow-up の modelUsage が累積される

- **GIVEN** 3 turn 実行 (作業 + follow x2) で各 turn が modelUsage を返す
- **WHEN** `ClaudeCodeRunner.run(ctx)` が完了する
- **THEN** 結果の modelUsage は 3 turn 分の per-model 加算である

#### Scenario: follow turn 中の AbortController が全 turn を覆う

- **GIVEN** `ctx.followUpPrompts` が `["a", "b", "c"]` で timeout が設定されている
- **WHEN** 2 turn 目の途中で AbortController が abort される
- **THEN** 残りの follow turn は実行されない
- **AND** timeout result が返される
