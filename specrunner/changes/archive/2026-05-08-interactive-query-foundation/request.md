# RuntimeStrategy.query() を対話セッションに対応させる

## Meta

- **type**: spec-change
- **slug**: interactive-query-foundation

## 背景

PR #124 で `LocalRuntime.query()` を実装したが、1 回の query() で完結する設計のため対話ができない。Claude Agent SDK は `prompt: string | AsyncIterable<SDKUserMessage>` を受け付け、`Options.continue` / `Options.resume` / `Options.sessionId` で対話セッションをサポートしている。また SDK の `Query` オブジェクトは `streamInput()` で追加メッセージを送れる。

`specrunner create` を対話型に再設計するための基盤として、QueryOptions の拡張と LocalRuntime.query() の改修、CLI bootstrap の共通化を行う。

併せて `src/cli/create.ts`、`run.ts`、`resume.ts` の 3 ファイルで loadConfig → getOriginInfo → createGitHubClient → createRuntime の 4 ステップが同一コードでコピペされている問題を解消する。

## 要件

### 1. QueryOptions の拡張

1. `src/core/runtime/strategy.ts` の `QueryOptions` に以下を追加する:

```typescript
interface QueryOptions {
  cwd?: string;
  maxTurns?: number;
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  // 以下を追加
  sessionId?: string;
  continue?: boolean;
  resume?: string;
  includePartialMessages?: boolean;
}
```

2. 全フィールドは optional。既存の呼び出し元に影響しない

### 2. LocalRuntime.query() の拡張

3. `LocalRuntime.query()` で `opts.sessionId` / `opts.continue` / `opts.resume` / `opts.includePartialMessages` を SDK の `Options` にパススルーする

4. `RuntimeStrategy` interface の `query()` signature は `prompt: string` のまま変更しない。`SDKUserMessage` は SDK 固有の型であり、core 層（strategy.ts）に持ち込むと Hexagonal Architecture の依存方向違反になる。`ManagedRuntime` は Agent SDK を使わないため `AsyncIterable<SDKUserMessage>` を生成する手段がない

5. 代わりに `LocalRuntime` に `queryInteractive()` メソッドを追加する。このメソッドは `RuntimeStrategy` interface には含めず、`LocalRuntime` 固有のメソッドとする。`create-dialog.ts`（R2）は `LocalRuntime` を直接参照して呼ぶ（create は local-only 機能）

```typescript
// LocalRuntime 固有メソッド（RuntimeStrategy interface には含めない）
queryInteractive(
  prompt: AsyncIterable<SDKUserMessage>,
  opts?: QueryOptions,
): Query  // SDK の Query オブジェクトをそのまま返す
```

6. `queryInteractive()` は SDK の `Query` オブジェクト（`AsyncGenerator<SDKMessage, void>` + `interrupt()` / `streamInput()` 等）をそのまま返す。`for await` で中継する `query()` とは異なり、caller が Query の全メソッドにアクセスできる。ただし Query オブジェクトの具体的な利用パターン（interrupt / streamInput）は R2 の REPL 設計で確定するため、R1 では `queryInteractive()` の提供までをスコープとする

7. テスト用の `QueryFn` 注入は維持する。generator prompt を受け取れるように `QueryFn` の型を `(params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) => AsyncGenerator<unknown, void>` に更新する

### 3. CLI bootstrap の共通化

8. `src/cli/bootstrap.ts` を新設し、以下の共通処理を抽出する。repo の取得方法は 3 コマンドで異なる（run は preflight、resume は state から復元、create は getOriginInfo）ため、repo は呼び出し元が渡す:

```typescript
interface BootstrapResult {
  config: SpecRunnerConfig;
  githubClient: GitHubClient;
  runtime: RuntimeStrategy;
}

async function bootstrap(cwd: string, repo: OriginInfo): Promise<BootstrapResult>
```

9. `src/cli/create.ts`、`src/cli/run.ts`、`src/cli/resume.ts` から重複した loadConfig → createGitHubClient → createRuntime を `bootstrap()` の呼び出しに置き換える。各コマンドは自身の方法で repo を取得してから `bootstrap(cwd, repo)` を呼ぶ

### 4. isResultMessage の移動

10. `src/core/command/create.ts` の `isResultMessage()` 型ガードを `src/adapter/claude-code/message-types.ts` に移動する。create 固有ではなく SDK メッセージの汎用判定関数

### 5. テスト

11. `QueryOptions` の新フィールドが `LocalRuntime.query()` で SDK に渡されることのテスト
12. `queryInteractive()` に generator prompt を渡した場合に Query オブジェクトが返ることのテスト
13. `bootstrap()` のテスト: config ロード失敗時のエラーハンドリング
14. `isResultMessage()` の移動後も既存テストが通ること

## スコープ外

- 対話 REPL の UI 層（R2 で実装）
- draft 永続化（R2 で実装）
- 対話用 system prompt（R2 で実装）
- slug の対話化（R3 で実装）
- ManagedRuntime.query() の対話対応

## 受け入れ基準

- [ ] `QueryOptions` に `sessionId` / `continue` / `resume` / `includePartialMessages` が追加されている
- [ ] `LocalRuntime.query()` が新フィールドを SDK にパススルーする
- [ ] `RuntimeStrategy` interface の `query()` signature は `prompt: string` のまま変更されていない
- [ ] `LocalRuntime.queryInteractive()` が generator prompt を受け取り SDK の `Query` オブジェクトを返す
- [ ] CLI bootstrap が `src/cli/bootstrap.ts` に共通化され、create/run/resume が利用している
- [ ] `isResultMessage()` が `src/adapter/claude-code/message-types.ts` に移動している
- [ ] 既存の 1-shot create が壊れていない
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/interactive-query-foundation.md` by `merged-to-archive-consolidation`.
