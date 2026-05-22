# Design: core-layer-boundary-fix

## Problem

`module-boundary/spec.md` は core が adapter / cli を import してはならないと規定しているが、3 箇所で違反している:

1. **core -> cli**: `src/core/command/runner.ts` が `src/cli/progress.ts` の `ProgressDisplay` を直接 import
2. **core -> adapter**: `src/core/request/reviewer.ts` が `src/adapter/claude-code/query-one-shot.ts` の `queryOneShot` / `QueryFn` を import
3. **core -> SDK**: `src/core/request/manager.ts` と `generator.ts` が `@anthropic-ai/claude-agent-sdk` の `query` を直接 import

さらに `one-shot-query/spec.md` が reviewer に adapter の `queryOneShot` 直 import を義務付けており、`module-boundary` spec と矛盾している。

## Design Decisions

### D1: EventBus をコンストラクタ注入にし ProgressDisplay 配線を cli 層に移す

**現状**: `CommandRunner.execute()` 内で `new EventBus()` + `new ProgressDisplay(events, ...)` している。ProgressDisplay は cli 層にあるため core -> cli 違反。

**変更**: `EventBus` を `CommandRunner` のコンストラクタ引数として受け取る。`ProgressDisplay` の生成・EventBus への subscribe は cli 層（`run.ts` / `resume.ts`）で行う。

- `CommandRunner` constructor: `(runtime: RuntimeStrategy, events: EventBus)`
- `PipelineRunCommand` constructor: `(runtime: RuntimeStrategy, events: EventBus, ...)`
- `ResumeCommand` constructor: `(runtime: RuntimeStrategy, events: EventBus, ...)`
- cli 側の共通ヘルパー `wireProgressDisplay(events, opts)` を用意し、run.ts / resume.ts の両経路で重複なく配線する

**不採用案**: PrepareResult 経由で EventBus を返す — prepare に infra 配線責務が漏れ SRP 違反。

### D2: OneShotQueryClient port を core/port/ に新設する

**現状**: `reviewer.ts` が adapter の `queryOneShot` 関数を直 import。`manager.ts` / `generator.ts` が SDK の `query` を直 import し default 引数に使用。

**変更**: `src/core/port/one-shot-query-client.ts` に `OneShotQueryClient` interface を定義する。

```typescript
export interface OneShotQueryClient {
  run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>;
}

export interface OneShotQueryOptions {
  systemPrompt: string;
  prompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
  cwd?: string;
  stepName?: string;
  model?: string;
}

export interface OneShotQueryResult {
  text: string;
  sessionId?: string;
  turnCount?: number;
  stopReason?: string;
}
```

型定義は既存の `QueryOneShotOptions` / `QueryOneShotResult` と同一形状。config 引数は adapter 側の実装詳細として interface から除外する（adapter 実装がコンストラクタで保持する）。

**不採用案**: 生の `QueryFn` 型をそのまま port にする — SDK ストリーム形状 (`AsyncGenerator`) が core に漏れる。

### D3: adapter/claude-code に OneShotQueryClient 実装を配置する

`src/adapter/claude-code/one-shot-query-client.ts` に `ClaudeCodeOneShotQueryClient` class を新設。既存の `queryOneShot()` 関数をラップし、`SpecRunnerConfig` をコンストラクタで受け取る。

```typescript
export class ClaudeCodeOneShotQueryClient implements OneShotQueryClient {
  constructor(private readonly config: SpecRunnerConfig) {}

  async run(opts: OneShotQueryOptions): Promise<OneShotQueryResult> {
    return queryOneShot(opts, this.config);
  }
}
```

`queryOneShot()` 関数自体は adapter 内に存続する（実装ロジックの変更なし）。

### D4: composition point の確立と default fallback の削除

**現状**: `executeReview()` は `queryFn` なしで `runReview()` を呼び、`manager.review()` は `queryFn ?? query` で SDK default にフォールバック。この暗黙 fallback が違反の温床。

**変更**:
- `executeReview()` / `executeCreate()` を composition point として確立
- 両関数で `ClaudeCodeOneShotQueryClient` を生成し、`runReview()` / `manager.create()` / `manager.review()` に注入する
- `reviewer.ts`: `runReview(content, config, cwd, queryFn?)` -> `runReview(content, cwd, client: OneShotQueryClient)`
  - `config` 引数が不要になる（client が内部に保持）
- `manager.ts`: `review(slug, cwd, config, queryFn?)` -> `review(slug, cwd, client: OneShotQueryClient)`
  - `create(text, cwd, config, queryFn?)` -> `create(text, cwd, client: OneShotQueryClient)`
- `generator.ts`: `generate(text, cwd, config, queryFn)` -> `generate(text, cwd, client: OneShotQueryClient)`
  - SDK の `query` / `SDKMessage` 等の直 import を削除
  - `for await` stream loop を `client.run()` 呼び出しに置換
- default 引数 (`queryFn ?? query`, `queryFn: typeof query = query`) をすべて削除

### D5: テスト seam の移行

既存テストは `mockQueryFn` (AsyncGenerator) を `queryFn` 引数に渡している。port 移行後は `OneShotQueryClient` interface の mock に変更する。

```typescript
const mockClient: OneShotQueryClient = {
  run: vi.fn().mockResolvedValue({ text: "...", stopReason: "success" }),
};
```

既存テストの async generator mock より簡潔になる。

### D6: cli 層ヘルパー wireProgressDisplay

run.ts / resume.ts の両方で同一の ProgressDisplay 配線が必要。共通化のため `src/cli/progress.ts` に factory 関数を追加する。

```typescript
export function wireProgressDisplay(events: EventBus, opts: { verbose: boolean; slug: string }): ProgressDisplay {
  return new ProgressDisplay(events, opts);
}
```

既存の `ProgressDisplay` class はそのまま。factory 関数は cli 層に閉じた thin wrapper。

## Affected Capabilities

| Capability | Impact |
|------------|--------|
| one-shot-query | delta spec: reviewer の queryOneShot 直 import 義務を OneShotQueryClient port 依存に更新 |
| module-boundary | baseline scenario pass を回復（変更なし — 既存 spec を満たす側の是正） |

## Dependency Flow (After)

```
cli/run.ts ──┐
cli/resume.ts ┤
              ├─> new EventBus()
              ├─> wireProgressDisplay(events, opts)
              └─> new PipelineRunCommand(runtime, events, ...)
                    └─> CommandRunner.execute() // events is injected, no cli import

cli/commands/request-review.ts
  └─> new ClaudeCodeOneShotQueryClient(config)
  └─> runReview(content, cwd, client)  // client is port, no adapter import

cli/commands/request-create.ts
  └─> new ClaudeCodeOneShotQueryClient(config)
  └─> manager.create(text, cwd, client) // client is port, no SDK import
```
