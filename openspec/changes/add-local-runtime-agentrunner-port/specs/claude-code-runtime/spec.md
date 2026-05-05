## ADDED Requirements

### Requirement: ClaudeCodeRunner は Claude Code SDK の query() を介して実行する

`src/adapter/claude-code/agent-runner.ts` に `ClaudeCodeRunner` SHALL 実装される。`ClaudeCodeRunner` は `AgentRunner` interface を実装し、内部で `@anthropic-ai/claude-code` の `query()` を呼ぶ。

`ClaudeCodeRunner.run(ctx)` は MUST 以下のステップを実施する:

1. `ctx.step.buildMessage(ctx.state, deps)` で得た runtime-neutral prompt を取得する
2. runtime 固有 `additionalInstructions`（git checkout / commit / push / cwd 内ファイル直接読み書きの指示）を prompt に append する
3. `query({ cwd: ctx.cwd, prompt, additionalInstructions, ...sdkOptions })` を呼び、agent の完了まで await する
4. branch 検証: `git rev-parse --abbrev-ref HEAD` または `git branch --list <ctx.branch>` で期待 branch の存在を確認する
5. resultContent 取得: `ctx.step.resultFilePath(ctx.state)` が non-null の場合、`fs.readFile(path.join(ctx.cwd, resultPath))` で読む
6. `AgentRunResult` を組み立てて返す（`sessionId` は `undefined`）

`ClaudeCodeRunner` は MUST `@anthropic-ai/sdk` の `SessionClient` 系を import しない。

#### Scenario: ClaudeCodeRunner が AgentRunner interface を実装する

- **WHEN** `ClaudeCodeRunner` クラスを inspect する
- **THEN** `run(context: AgentRunContext): Promise<AgentRunResult>` method を実装する
- **AND** `AgentRunner` interface に compliant である

#### Scenario: query() に cwd が渡される

- **GIVEN** `ctx.cwd === "/path/to/worktree"`
- **WHEN** `ClaudeCodeRunner.run(ctx)` が `query()` を呼ぶ
- **THEN** `query()` の引数の `cwd` プロパティが `"/path/to/worktree"` である

#### Scenario: ClaudeCodeRunner が SessionClient を import しない

- **WHEN** `grep -r "SessionClient" src/adapter/claude-code/` を実行する
- **THEN** マッチ行は 0 である
- **AND** `grep -r "@anthropic-ai/sdk" src/adapter/claude-code/` も 0 マッチである

#### Scenario: resultContent は fs.readFile で取得される

- **GIVEN** `ctx.step.resultFilePath(state)` が `"openspec/changes/<slug>/spec-review-result-001.md"` を返す
- **WHEN** agent 完了後 `ClaudeCodeRunner` が結果を取得する
- **THEN** `fs.readFile(path.join(ctx.cwd, "openspec/changes/<slug>/spec-review-result-001.md"))` 経由で内容を読み出す
- **AND** GitHub API は呼ばれない

### Requirement: ClaudeCodeRunner は branch を CLI 入力として扱い register_branch を使わない

`ClaudeCodeRunner` は MUST `ctx.branch` を期待 branch として `additionalInstructions` に注入する。agent には「この branch で `git checkout -b` してから commit / push せよ」と指示し、`register_branch` 系の Custom Tool は SHALL 利用しない。

#### Scenario: additionalInstructions に branch 指示が含まれる

- **GIVEN** `ctx.branch === "feat/foo-bar"`、`ctx.slug === "foo-bar"`
- **WHEN** `ClaudeCodeRunner` が `query()` に渡す additionalInstructions を inspect する
- **THEN** instructions 中に `git checkout -b feat/foo-bar` 相当の指示が含まれる
- **AND** `register_branch` Custom Tool への参照は含まれない

#### Scenario: ClaudeCodeRunner は register_branch を import しない

- **WHEN** `grep -r "register_branch" src/adapter/claude-code/` を実行する
- **THEN** マッチ行は 0 である

### Requirement: ClaudeCodeRunner は requiresCommit guard を fs / git で検証する

`ClaudeCodeRunner` は MUST agent 完了後に `step` が commit を要求するかを判定し、要求する場合は `git status` / `git log` / `git rev-parse` をローカルで実行して期待状態を検証する。検証失敗時は `AgentRunResult.completionReason === "error"` を返す。

#### Scenario: branch が advance していない場合 error

- **GIVEN** ProposeStep を実行後、`git rev-parse feat/foo-bar` が `main` と同一 SHA を返す
- **WHEN** `ClaudeCodeRunner` が完了検証を行う
- **THEN** `result.completionReason === "error"` である
- **AND** `result.error.message` に「branch HEAD did not advance」相当の文言が含まれる

#### Scenario: 期待 branch が存在しない場合 error

- **GIVEN** ProposeStep を実行後、`git branch --list feat/foo-bar` が空を返す
- **WHEN** `ClaudeCodeRunner` が完了検証を行う
- **THEN** `result.completionReason === "error"` である
- **AND** GitHub API は呼ばれない（fs / git のみで検証する）

### Requirement: prompts/ は runtime-neutral に保たれる

`src/prompts/` 配下の prompt 定義 SHALL runtime（managed / local）に依存する文字列を含まない。runtime 固有の git 操作 instruction は MUST adapter の `run()` 内で `additionalInstructions` として動的に注入される。

#### Scenario: prompts/ に runtime 固有指示が含まれない

- **WHEN** `grep -rE "register_branch|claude-code|@anthropic-ai/claude-code" src/prompts/` を実行する
- **THEN** マッチ行は 0 である

#### Scenario: 同じ Step の buildMessage が両 runtime で同じ文字列を返す

- **GIVEN** ProposeStep の `buildMessage(state, deps)` を managed mode と local mode の同等 state で呼ぶ
- **WHEN** 両者の出力を比較する
- **THEN** Step が返す runtime-neutral prompt 部分は完全に一致する
- **AND** runtime ごとに違う部分は adapter が append する additionalInstructions のみである
