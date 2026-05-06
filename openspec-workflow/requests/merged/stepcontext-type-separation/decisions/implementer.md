# Implementer Decisions

## 実装方針

- `StepContext` を `src/core/types.ts` に追加し `PipelineDeps extends StepContext` に変更する :: design.md D1 に従い Liskov 置換原則で後方互換を維持するため
- `StepDeps` の alias 先を `PipelineDeps` から `StepContext` に変更する :: design.md D2。alias 先を変えるだけで全 Step メソッドシグネチャが自動的に型が狭まる
- `ClaudeCodeRunner` の deps 構築から `client`/`githubClient` を削除し `StepContext` 型で組み立てる :: `StepDeps = StepContext` になるため `undefined as any` が不要になる（design.md D5）
- `ManagedAgentRunner` の `runProposeStyle`/`runPollingStyle` から `JobStateStore` import と全操作を除去する :: design.md D3。adapter の責務は agent との通信のみ。state 管理は executor に一元化
- `ManagedAgentRunner` の return から `_updatedState` を除去して `AgentRunResult` のみを返す :: `_updatedState` は port contract 外の private extension field で禁止パターン（constraints.md）
- `executor.ts` の `runAgentStep` 冒頭に `store.update(state, { step: step.name })` を追加する :: design.md D4。`specrunner ps` の step 表示バグ修正
- `executor.ts` の `_updatedState` 分岐（L109-116）を削除し、1 本道の state 管理にする :: design.md D4。managed/local で同一パスを通ることで振る舞いの一貫性が保証される
- `result.sessionId` を `pushStepResult` の `session: { id: sessionId, agentId: "", environmentId: "" }` として記録する :: `StepResultInput.session` フィールドが sessionId を保持する唯一のルート。`StepRun.sessionId` は `session?.id` から導出される
- `result.agentBranch` が存在し `state.branch` が未設定の場合のみ `state.branch` をセットする :: tasks.md 4.4。`setsBranch` フラグとの整合のため既存 branch は上書きしない
- `store.appendHistory` で step 開始/完了の history entry を executor に追加する :: design.md D3 緩和策。ManagedAgentRunner が消す中間 history の代替として最低限の観測ポイントを維持
- `ManagedAgentRunner` の `runPollingStyle` で `buildMessage`/`resultFilePath`/`parseResult` の deps 構築を `StepContext` に変更する :: `StepDeps = StepContext` になるため `client as never` の回避が不要になる
- テスト: `_updatedState` を参照する executor テストは新しい管理 path に書き換え、state を executor が管理することを検証する :: tasks.md 5.1
- テスト: `ManagedAgentRunner` テストの `JobStateStore` mock を除去し `AgentRunResult` の返り値のみ検証する :: tasks.md 5.2
