## Context

PR #80 で `AgentRunner` port を導入し managed/local の runtime を切り替え可能にした。しかし 2 つの設計負債が残った（Issue #81）:

1. **型の過剰結合**: Step メソッド（`buildMessage`/`resultFilePath`/`parseResult`）は `PipelineDeps`（= `StepDeps`）を受け取るが、実際にアクセスするのは `slug`/`request`/`cwd`/`repo`/`config` のみ。ClaudeCodeRunner は `SessionClient`/`GitHubClient` を持たないため `undefined as any` で 4 箇所迂回している。

2. **state 管理の責務二重化**: ManagedAgentRunner が内部で `JobStateStore` を操作し、`_updatedState` として完全な state を `AgentRunResult` に piggyback して返す。executor は managed path（`_updatedState` があればそのまま返す）と local path（executor 自身で state 管理）の 2 系統を持つ。

現在の `StepDeps` は `PipelineDeps` の alias であり、Step 側から見ると不要なフィールド（`client`、`githubClient`、`sleepFn`）が見える。

## Goals / Non-Goals

**Goals:**

- Step メソッドの型パラメータを必要最小限に狭める（`StepContext`）
- `undefined as any` を全除去し型安全性を回復する
- executor の state 管理パスを 1 本化する
- ManagedAgentRunner から `JobStateStore` 操作を除去し、`AgentRunResult` のみ返す純粋な adapter にする
- `_updatedState` を完全廃止する
- `specrunner ps` の step 表示バグを修正する（executor 冒頭で `store.update`）

**Non-Goals:**

- Step インターフェースの根本的な再設計（`kind` discriminator や `AgentStep`/`CliStep` 分割は維持）
- AgentRunContext の変更（adapter への入力は不変）
- ManagedAgentRunner の SSE/polling ロジック自体の変更（state 操作の除去のみ）
- 新機能の追加

## Decisions

### D1: StepContext interface を PipelineDeps のスーパータイプとして定義

`StepContext` を `src/core/types.ts` に新設し、Step メソッドが実際にアクセスするフィールドのみを含める:

```ts
export interface StepContext {
  config: SpecRunnerConfig;
  slug: string;
  cwd?: string;
  request: ParsedRequest;
  repo: OriginInfo;
}

export interface PipelineDeps extends StepContext {
  client?: SessionClient;
  githubClient: GitHubClient;
  sleepFn?: (ms: number) => Promise<void>;
}
```

**理由**: `PipelineDeps extends StepContext` にすることで、既存の `PipelineDeps` を受け取る呼び出し元はそのまま動く（Liskov 置換原則）。Step 側は `StepContext` のみを要求するため、ClaudeCodeRunner は `client`/`githubClient` を渡す必要がなくなる。

**代替案**: Step メソッドから `deps` パラメータを除去し、必要な値を `AgentRunContext` 経由で渡す方法。しかし既存の Step 実装の変更が大きく、CliStep にも影響するため不採用。

### D2: StepDeps を StepContext alias に変更

`src/core/step/types.ts` の `StepDeps` を `PipelineDeps` alias から `StepContext` alias に変更:

```ts
export type StepDeps = StepContext;  // was: PipelineDeps
```

**理由**: Step の全メソッドシグネチャは `StepDeps` を使用しており、alias 先を変えるだけで全 Step の型が自動的に狭まる。呼び出し元（executor）が `PipelineDeps` を渡しても `PipelineDeps extends StepContext` により型互換が成立する。

### D3: ManagedAgentRunner から JobStateStore を完全除去

ManagedAgentRunner の `runProposeStyle`/`runPollingStyle` から:
- `JobStateStore` の import と instantiation を除去
- `store.update`/`store.appendHistory`/`store.fail`/`store.persist` の全呼び出しを除去
- `pushStepResult` の呼び出しを除去
- return を `AgentRunResult` のフィールドのみにする（`_updatedState` 削除）

session 操作（`sessionClient.create`/`send`/`pollMessages`）と result 取得（`githubClient.getRawFile`）は adapter 内に残す。state 管理は executor に一元化する。

**理由**: adapter は「agent との通信」が責務であり、「state の永続化」は executor の責務。責務が混在していたことが `_updatedState` という非公開フィールドを生んだ根本原因。

**リスク**: ManagedAgentRunner が内部で history append していた中間状態（session-created、register_branch-received 等）が失われる。executor は step 単位の粒度でしか history を記録しないため、observability が低下する可能性がある。 → **緩和策**: executor の `runAgentStep` に step 開始/完了の history entry を追加する（最低限の観測ポイントは維持）。中間状態の詳細ログは将来の observability 改善（Phase 2）で対応。

### D4: executor の state 管理を 1 本化

executor の `runAgentStep` から `_updatedState` 分岐（L107-116）を削除し、現在の local path（L120 以降）を唯一のパスとする:

1. `store.update(state, { step: step.name })` を冒頭に追加（ps 表示修正）
2. `runner.run(ctx)` で `AgentRunResult` を取得
3. error path: `recordFailedStepResult` → `store.fail` → `store.persist`
4. success path: `parseResult` → `pushStepResult` → `store.appendHistory` → `store.persist`
5. `result.sessionId` を step result の session フィールドに記録
6. `result.agentBranch` が存在する場合は `state.branch` にセット

**理由**: managed/local で同一の state 管理フローを通ることで、振る舞いの一貫性が保証される。

### D5: ClaudeCodeRunner の deps 構築を StepContext に変更

`StepDeps` が `StepContext` alias になるため、ClaudeCodeRunner は `buildMessage`/`resultFilePath`/`parseResult` に渡す deps から `client`/`githubClient` を削除できる:

```ts
const deps: StepContext = {
  config: ctx.config,
  slug: ctx.slug,
  cwd,
  request: { type: "feature", title: "", slug: ctx.slug, content: ctx.requestContent, enabled: [] },
  repo: { owner: "", name: "" },
};
```

`undefined as any` が 4 箇所すべて除去される。

## Risks / Trade-offs

- **[Observability 低下]** ManagedAgentRunner の中間 history（session-created, register_branch-received, polling-started 等）が消える → 緩和策: executor に step-start/step-complete の history entry を追加。詳細ログは後続の observability 改善で対応
- **[テスト修正量]** ManagedAgentRunner のテストが `JobStateStore` mock に依存している場合、mock 除去による書き直しが必要 → テスト側は adapter の返り値（`AgentRunResult`）のみを検証するよう書き換える
- **[振る舞い変化リスク]** ManagedAgentRunner が内部で `store.fail` を呼んでいた error path を executor に移すため、エラーハンドリングの順序やタイミングが微妙に変わる可能性 → 緩和策: 既存テストで振る舞い不変を検証し、`bun run typecheck && bun run test` で全テスト pass を確認
