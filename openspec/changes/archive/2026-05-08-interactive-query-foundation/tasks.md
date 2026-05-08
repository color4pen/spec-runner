## 1. QueryOptions の拡張

- [x] 1.1 `src/core/runtime/strategy.ts` の `QueryOptions` に `sessionId?: string`、`continue?: boolean`、`resume?: string`、`includePartialMessages?: boolean` を追加
- [x] 1.2 全フィールドが optional であることを確認（既存呼び出し元に影響しない）

## 2. LocalRuntime.query() のパススルー拡張

- [x] 2.1 `src/core/runtime/local.ts` の `query()` メソッドで `opts.sessionId`、`opts.continue`、`opts.resume`、`opts.includePartialMessages` を SDK options にパススルーする。undefined のフィールドは渡さない（spread ではなく明示的に条件付き追加）
- [x] 2.2 `QueryFn` 型（`src/adapter/claude-code/agent-runner.ts`）の prompt を `string | AsyncIterable<unknown>` に、return type を `AsyncGenerator<unknown, void>` に拡張する
- [x] 2.3 `LocalRuntime` の `queryFn` プロパティの型を新しい `QueryFn` に合わせる
- [x] 2.4 `src/adapter/claude-code/agent-runner.ts` の `ClaudeCodeRunner.run()` 内で `this.queryFn()` の戻り値を iterate する箇所（`message.type === "result"` / `message as SDKResultMessage` 等）に型アサーションを追加する: `for await (const message of messages as AsyncGenerator<SDKMessage, void>)`。`QueryFn` の return type が `AsyncGenerator<unknown, void>` になることで型推論が壊れるため

## 3. LocalRuntime.queryInteractive() の追加

- [x] 3.1 `src/adapter/claude-code/agent-runner.ts` に `SdkQueryFn` 型を追加（`(params: { prompt: AsyncIterable<unknown>; options?: Record<string, unknown> }) => Query`）。`LocalRuntime` コンストラクタで `sdkQueryFn: SdkQueryFn` を受け取れるようにする。`queryInteractive()` は `queryFn` を経由せず `sdkQueryFn({ prompt, options })` を呼び出し、`Query` をそのまま返す（`for await` で中継しない）。`ClaudeCodeRunner` は `sdkQueryFn` の具体実装として `sdkQuery` をラップした関数を提供する
- [x] 3.2 `queryInteractive()` は `RuntimeStrategy` interface に追加しない。`LocalRuntime` 固有メソッドとする
- [x] 3.3 opts の SDK パススルーは `query()` と同じロジック（2.1 と共通化。private ヘルパー `buildSdkOptions(opts)` を抽出してもよい）

## 4. isResultMessage() の移動

- [x] 4.1 `src/adapter/claude-code/message-types.ts` を新規作成し、`isResultMessage()` 関数を移動する
- [x] 4.2 `src/core/command/create.ts` から `isResultMessage()` の定義を削除し、`message-types.ts` からの re-export または import に置き換える
- [x] 4.3 `tests/unit/core/command/create.test.ts` の import パスを更新する

## 5. CLI bootstrap の共通化

- [x] 5.1 `src/cli/bootstrap.ts` を新規作成。`BootstrapResult` 型と `bootstrap(cwd, repo)` 関数を実装。内部で loadConfig → createGitHubClient → createRuntime を実行
- [x] 5.2 `src/cli/create.ts` を書き換え: getOriginInfo で repo を取得した後、`bootstrap(cwd, repo)` を呼ぶ。loadConfig / createGitHubClient / createRuntime の直接呼び出しを削除
- [x] 5.3 `src/cli/resume.ts` を書き換え: state から repo を復元した後、`bootstrap(cwd, repo)` を呼ぶ。loadConfig / createGitHubClient / createRuntime の直接呼び出しを削除
- [x] 5.4 `src/cli/run.ts` を書き換え: `bootstrap()` は使用しない。preflight が返す config と repo を使って `createGitHubClient(fetch, config.github?.accessToken ?? "")` と `createRuntime(config, cwd, githubClient, repo)` を直接呼ぶ。`bootstrap()` は `create.ts` / `resume.ts` 専用とし、signature は `bootstrap(cwd, repo)` のまま変更しない

## 6. テスト

- [x] 6.1 `tests/unit/core/runtime/local.test.ts` に TC-LR-013 を追加: `query()` が `sessionId` / `continue` / `resume` / `includePartialMessages` を SDK options にパススルーすることを検証
- [x] 6.2 `tests/unit/core/runtime/local.test.ts` に TC-LR-014 を追加: `queryInteractive()` が generator prompt を受け取り `Query` オブジェクト（`sdkQueryFn` の戻り値）をそのまま返すことを検証。モック `sdkQueryFn` を注入して `interrupt()` 等のメソッドが保持されることを確認
- [x] 6.3 `tests/unit/cli/bootstrap.test.ts` を新規作成: `bootstrap()` の正常系と config ロード失敗時のエラーハンドリングを検証
- [x] 6.4 `tests/unit/adapter/claude-code/message-types.test.ts` を新規作成: `isResultMessage()` の既存テストケースを移動（create.test.ts の isResultMessage テストは削除するか、import 先変更後もそのまま残す）
- [x] 6.5 既存の `tests/unit/core/command/create.test.ts` が import パス変更後も通ることを確認

## 7. 検証

- [x] 7.1 `bun run typecheck` が green
- [x] 7.2 `bun run test` が green
