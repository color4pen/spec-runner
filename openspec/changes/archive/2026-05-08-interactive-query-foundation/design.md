## Context

`LocalRuntime.query()` は `prompt: string` を受け取り `AsyncGenerator<unknown>` を yield する 1-shot 設計。Claude Agent SDK は対話セッション（`sessionId` / `continue` / `resume`）と generator prompt（`AsyncIterable<SDKUserMessage>`）をサポートしているが、現在の実装はこれらを活用できない。

CLI 層では `create.ts`、`run.ts`、`resume.ts` が loadConfig → createGitHubClient → createRuntime を個別にコピペしている。repo の取得方法だけが異なる（run は preflight、resume は state、create は getOriginInfo）。

`isResultMessage()` は `src/core/command/create.ts` に定義されているが、SDK メッセージの汎用判定であり create 固有ではない。

## Goals / Non-Goals

**Goals:**

- QueryOptions に sessionId / continue / resume / includePartialMessages を追加
- LocalRuntime.query() で新フィールドを SDK Options にパススルー
- LocalRuntime.queryInteractive() で generator prompt を受け取り SDK Query オブジェクトを返す
- CLI bootstrap の共通化（bootstrap.ts）
- isResultMessage() の adapter 層への移動

**Non-Goals:**

- 対話 REPL の UI 層（R2 スコープ）
- draft 永続化（R2 スコープ）
- RuntimeStrategy interface の query() signature 変更
- ManagedRuntime.query() の対話対応

## Decisions

### D1: QueryOptions の拡張と RuntimeStrategy の不変性

`QueryOptions` に以下を追加する:

```typescript
interface QueryOptions {
  cwd?: string;
  maxTurns?: number;
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  // 追加
  sessionId?: string;
  continue?: boolean;
  resume?: string;
  includePartialMessages?: boolean;
}
```

`RuntimeStrategy.query()` の signature は `prompt: string` のまま変更しない。

**理由**: `AsyncIterable<SDKUserMessage>` は SDK 固有の型であり、core 層（strategy.ts）に持ち込むと Hexagonal Architecture の依存方向違反になる。`ManagedRuntime` は Agent SDK を使わないため generator prompt を生成する手段がない。session 関連の option は SDK 固有だが、string 型なので core 層に持ち込んでも型依存は発生しない。

### D2: LocalRuntime.queryInteractive() — interface 外メソッド

`RuntimeStrategy` interface には含めず `LocalRuntime` 固有のメソッドとする:

```typescript
queryInteractive(
  prompt: AsyncIterable<SDKUserMessage>,
  opts?: QueryOptions,
): Query  // SDK の Query オブジェクトをそのまま返す
```

- `Query` は `AsyncGenerator<SDKMessage, void>` + `interrupt()` / `streamInput()` 等のメソッドを持つ SDK オブジェクト
- `for await` で中継する `query()` とは異なり、caller が Query の全メソッドにアクセスできる
- `create-dialog.ts`（R2）は `LocalRuntime` を直接参照して呼ぶ（create は local-only 機能）

**実装方針**: `queryInteractive()` は `queryFn`（return type: `AsyncGenerator<unknown, void>`）を経由しない。代わりに `sdkQueryFn` を DI で受け取る:

```typescript
type SdkQueryFn = (params: {
  prompt: AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => Query;
```

`LocalRuntime` コンストラクタで `sdkQueryFn` を受け取り、`queryInteractive()` はこれを呼び出して `Query` を直接返す。テストでは `sdkQueryFn` にモックを注入する。`queryFn` は `query()`（1-shot）専用のまま維持する。

**理由**: `queryFn` の return type は `AsyncGenerator<unknown, void>` であり、追加メソッド（`interrupt()` / `streamInput()`）を持つ `Query` 型にキャストできない。`queryInteractive()` が `Query` を返す約束（request.md 要件 #5/#6）を満たすには、型が保存される別の注入経路が必要。`queryFn` と `sdkQueryFn` を分離することで、各 DI 経路の型安全性を維持する。

**理由（interface 外）**: queryInteractive() は local runtime の SDK バインディングに密結合しており、ManagedRuntime が実装する手段がない。interface に含めると ManagedRuntime に throw-not-implemented を強制し、LSP 違反になる。create は `specrunner create` の性質上 local-only なので、`LocalRuntime` 直接参照で問題ない。

### D3: QueryFn 型の拡張と SdkQueryFn の追加

```typescript
// query() 用（1-shot。return type は unknown で SDKMessage 依存を排除）
export type QueryFn = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncGenerator<unknown, void>;

// queryInteractive() 用（Query 型を保持するための専用 DI 経路）
export type SdkQueryFn = (params: {
  prompt: AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => Query;
```

`QueryFn` の prompt を `string | AsyncIterable<unknown>` に拡張し、return type を `AsyncGenerator<unknown, void>` に変更する。`QueryFn` は `query()` 専用。

`SdkQueryFn` は新規型。`queryInteractive()` はこちらを使い、`Query` 型を caller に返す。

**理由**: D2 で述べた通り、`queryInteractive()` が `Query` を返すには型が保存される注入経路が必要。`QueryFn`（return type: `AsyncGenerator<unknown, void>`）では `Query` の追加メソッドが失われるため、`SdkQueryFn`（return type: `Query`）を分離する。`ClaudeCodeRunner` は `QueryFn` と `SdkQueryFn` の両方を具体実装として提供する。`unknown` return type の `QueryFn` を維持することで、`query()` のユースケースで SDKMessage への直接依存を LocalRuntime が持たない設計を維持する。

### D4: CLI bootstrap の共通化

```typescript
// src/cli/bootstrap.ts
interface BootstrapResult {
  config: SpecRunnerConfig;
  githubClient: GitHubClient;
  runtime: RuntimeStrategy;
}

async function bootstrap(cwd: string, repo: OriginInfo): Promise<BootstrapResult>
```

repo の取得方法は 3 コマンドで異なるため、repo は呼び出し元が渡す:
- `run`: preflight が返す `repo`
- `resume`: state から復元する `repo`
- `create`: `getOriginInfo(cwd)` で取得

bootstrap 内部で行うこと:
1. `loadConfig()` — config 読み込み
2. `createGitHubClient(fetch, config.github?.accessToken ?? "")` — GitHub クライアント生成
3. `createRuntime(config, cwd, githubClient, repo)` — runtime 生成

**理由**: 3 コマンドの共通部分を最大限抽出しつつ、repo 取得の差異を呼び出し元に残す。loadConfig のエラーハンドリングも bootstrap 内で統一する。

### D5: isResultMessage() の移動

`src/core/command/create.ts` → `src/adapter/claude-code/message-types.ts` に移動する。

`message-types.ts` は新規ファイル。isResultMessage() 自体は SDK 型を import せず、structural typing で判定する（`{ type: "result"; subtype: string; result?: string }`）。adapter 層に置く理由は「SDK メッセージの構造知識」が adapter の責務であるため。

create.ts と create.test.ts の import パスを更新する。

## Risks / Trade-offs

- [Risk] `queryInteractive()` の具体的な利用パターン（interrupt / streamInput）は R2 の REPL 設計で確定するため、R1 では「メソッドの提供」までをスコープとし、利用パターンは R2 で追加テストする
- [Risk] `QueryFn` の return type を `AsyncGenerator<unknown, void>` に変更すると、`ClaudeCodeRunner.run()` 内で `message.type === "result"` 等の SDKMessage プロパティアクセスがコンパイルエラーになる → `for await (const message of messages as AsyncGenerator<SDKMessage, void>)` の型アサーションで解決する（tasks 2.4 参照）。元々 `sdkQuery as unknown as QueryFn` で cast しているため adapter 層での実質的な型安全性への影響なし
- [Trade-off] bootstrap() に loadConfig エラーハンドリングを含めると、run.ts は preflight 経由で config を取得するため bootstrap の config 読み込みと重複する → **決定**: `run.ts` は `bootstrap()` を使わず、preflight 結果の config/repo を使って `createGitHubClient` + `createRuntime` を直接呼ぶ。`bootstrap()` は `create.ts` と `resume.ts` 専用とする（D4 の signature `bootstrap(cwd, repo)` は変更しない）。これにより bootstrap の単一 signature が確定し、テスト記述も安定する（tasks 5.4 参照）
