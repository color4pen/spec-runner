# Tasks: fix-create-dialog-repl-timing

## 1. dialog loop の書き換え

- [x] 1.1 `src/core/command/create-dialog.ts` の `executeCreateDialog()` から `createPromptGenerator()` / `queryInteractive()` を使う generator 方式を廃止する。`hasQueryInteractive()` のガードは `runtime.query` の存在チェック（または config/instanceof ベース）に置き換えるか、LocalRuntime 専用であることをコメントで示して残す（ManagedRuntime の `query()` は no-op なので対話 REPL は機能しない。既存のエラーメッセージは維持する）
- [x] 1.2 while ループで毎ターン `runtime.query()` を呼ぶ方式に書き換える:
  - 初回: `runtime.query(initialUserText, { systemPrompt, cwd, allowedTools: ["Read", "Grep", "Glob"], includePartialMessages: true })`
  - for await で全メッセージを処理（ストリーミング表示 + FINAL_DRAFT 検出 + slug 検出）
  - result メッセージから `session_id` を取得して変数に保持する（`isResultMessage()` + `(msg as Record<string, unknown>)["session_id"]` で取得）
  - assistant メッセージ完了後に `rl.question("> ")` でユーザー入力を受け取る
  - exit/quit なら draft 保存して break
  - 2 回目以降: `runtime.query(userInput, { resume: sessionId, cwd, allowedTools: ["Read", "Grep", "Glob"], includePartialMessages: true })`
  - `systemPrompt` は初回のみ。2 回目以降は渡さない
  - `continue` と `resume` を同時に渡さない（SDK の mutually exclusive 制約）
- [x] 1.3 while ループ化後も論理的な phase 境界を関数分割で維持する。既存の dialogLoop 内の処理を整理し、assistant ターン処理・ユーザー入力処理のブロックを明確にする
- [x] 1.4 slug collision 時の LLM フィードバックは、次のターンの `query()` に collision メッセージを prompt として渡す。現在の `pendingAutoMessage` の仕組みは generator 用なので、while ループでは単純に次のターンの prompt として使えばよい

## 2. createPromptGenerator と関連型の削除

- [x] 2.1 `src/core/command/create-dialog.ts` から以下を削除する:
  - `createPromptGenerator()` 関数
  - `ReadlineInterface` 型（export されているが createPromptGenerator 専用）
  - `RuntimeWithQueryInteractive` interface
  - `hasQueryInteractive()` type guard
  - `SDKUserMessage` の import（不要になる）
  - `pendingAutoMessage` / `getPendingMessage` のシグナリング機構（while ループでは不要）
- [x] 2.2 ManagedRuntime 非対応のガードを `hasQueryInteractive()` から別の判定に変更する。`executeCreateDialog()` 冒頭で ManagedRuntime では対話 REPL が動作しないことを検出するガードが必要。候補: `typeof runtime.queryInteractive === "function"` の代わりに `runtime.constructor.name !== "ManagedRuntime"` や config flag を使う、または `runtime.query` を 1 ターン呼んでみて空なら error にする等。最もシンプルなのは `isLocalRuntime(runtime)` 型のヘルパーか、constructor name チェック

## 3. queryInteractive / SdkQueryFn の削除

- [x] 3.1 `src/core/runtime/local.ts` から `queryInteractive()` メソッドを削除する
- [x] 3.2 `src/core/runtime/local.ts` から `sdkQueryFn` フィールドと constructor での初期化を削除する。`LocalRuntimeOptions.sdkQueryFn` も削除する
- [x] 3.3 `src/core/runtime/local.ts` から `SdkQueryFn` の import、`SDKUserMessage` の import、`Query` の import を削除する（使われなくなる分のみ）
- [x] 3.4 `src/core/runtime/strategy.ts` の `RuntimeStrategy` interface から `queryInteractive?()` メソッドを削除する
- [x] 3.5 `src/adapter/claude-code/agent-runner.ts` から `SdkQueryFn` 型を削除する。`Query` と `SDKUserMessage` の import は `ClaudeCodeRunner` が直接使っている場合のみ残す

## 4. resume パスの修正

- [x] 4.1 hot resume を `runtime.query("(セッション再開)", { resume: sessionId, cwd, allowedTools: [...], includePartialMessages: true })` で実現する。現在の `hotResumeGenerator()` + `queryInteractive()` を廃止。通常のターンと同じフロー
- [x] 4.2 cold start は初回 query に `buildResumeInitialMessage()` の内容を prompt として渡す。通常の初回 query と同じフロー（`systemPrompt` 付き）。session_id は新規取得

## 5. テスト修正

- [x] 5.1 `tests/unit/core/command/create-dialog.test.ts` から `createPromptGenerator` のテスト（TC-CD-005〜TC-CD-007）を削除する
- [x] 5.2 `tests/unit/core/command/create-dialog.test.ts` から `hasQueryInteractive` のテスト（TC-CD-008〜TC-CD-009）を削除する
- [x] 5.3 `ReadlineInterface` の import を削除する
- [x] 5.4 新しい dialog loop のテストを追加する:
  - runtime.query() が初回は systemPrompt 付きで呼ばれ、2 回目以降は resume: sessionId で呼ばれることの検証
  - exit/quit 入力で draft が保存されることの検証（既存 TC-CD-006/007 の while ループ版）
  - ManagedRuntime 非対応のエラーが引き続き動作することの検証（既存 executeCreateDialog routing test の更新）
- [x] 5.5 既存の detectCompletion / detectSlugProposal / finalize / streaming display のテストは変更不要（pure function）

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
