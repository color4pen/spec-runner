## Why

PR #124 で `LocalRuntime.query()` を実装したが、1 回の query() で完結する設計のため対話ができない。Claude Agent SDK は `prompt: string | AsyncIterable<SDKUserMessage>` を受け付け、`Options.continue` / `Options.resume` / `Options.sessionId` で対話セッションをサポートしている。また SDK の `Query` オブジェクトは `streamInput()` で追加メッセージを送れる。

`specrunner create` を対話型に再設計するための基盤として、QueryOptions の拡張と LocalRuntime の対話メソッド追加、CLI bootstrap の共通化を行う。

併せて `src/cli/create.ts`、`run.ts`、`resume.ts` の 3 ファイルで loadConfig → getOriginInfo → createGitHubClient → createRuntime の 4 ステップが同一コードでコピペされている問題を解消する。

## What Changes

- `QueryOptions` に `sessionId` / `continue` / `resume` / `includePartialMessages` を追加（全 optional）
- `LocalRuntime.query()` で新フィールドを SDK にパススルー
- `RuntimeStrategy.query()` の signature は `prompt: string` のまま維持（Hexagonal 依存方向）
- `LocalRuntime.queryInteractive()` を新設（SDK の `Query` オブジェクトを直接返す。`RuntimeStrategy` interface には含めない）
- `QueryFn` の型を generator prompt 対応に更新
- `src/cli/bootstrap.ts` に CLI 共通 bootstrap を抽出し、create/run/resume から利用
- `isResultMessage()` を `src/adapter/claude-code/message-types.ts` に移動

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `cli-commands`: CLI bootstrap の共通化（create/run/resume が `bootstrap()` を利用）
- `step-execution-architecture`: QueryOptions の拡張、LocalRuntime.queryInteractive() の追加

## Impact

- `src/core/runtime/strategy.ts`: QueryOptions に 4 フィールド追加
- `src/core/runtime/local.ts`: query() のパススルー拡張、queryInteractive() 新設
- `src/adapter/claude-code/agent-runner.ts`: QueryFn 型の拡張、SdkQueryFn 型の追加
- `src/adapter/claude-code/message-types.ts`: 新規。isResultMessage() の移動先
- `src/core/command/create.ts`: isResultMessage() を削除し import に置換
- `src/cli/bootstrap.ts`: 新規。共通 bootstrap 関数（create/resume 専用）
- `src/cli/create.ts`: bootstrap() 利用に書き換え
- `src/cli/run.ts`: createGitHubClient + createRuntime を直接呼ぶ（bootstrap() 非使用）
- `src/cli/resume.ts`: bootstrap() 利用に書き換え
- 既存テスト: import パス変更、新テスト追加

**delta spec について**: `step-execution-architecture` および `claude-code-runtime` の capability 契約が変更されるが、追加フィールドは全て optional であり後方互換。delta spec ファイルは作成しない（全フィールド optional で後方互換のため spec lineage の明示的な記録は不要と判断）。
