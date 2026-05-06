# StepContext 型分離 + _updatedState 責務重複の解消

## Meta

- **type**: refactoring
- **date**: 2026-05-06
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator

## 背景

PR #80 で AgentRunner port を導入した際、2 つの設計負債が残った（Issue #81）。

1. **Step メソッドが PipelineDeps を要求する型の過剰結合**: `buildMessage` / `resultFilePath` / `parseResult` は `PipelineDeps` を受け取るが、実際にアクセスするフィールドは `slug` / `request` / `cwd` / `repo` のみ。ClaudeCodeRunner は `SessionClient` / `GitHubClient` を持たないため `undefined as any` で 4 箇所迂回している。

2. **`_updatedState` による state 管理の責務二重化**: ManagedAgentRunner が内部で `JobStateStore` を操作し、`AgentRunResult` に非公開フィールド `_updatedState` として state を返す。executor は managed / local で 2 系統の state 管理パスを持つ。

## 目的

- `StepContext` interface を新設し step メソッドの型を最小化
- `PipelineDeps extends StepContext` で既存コードとの互換維持
- ClaudeCodeRunner の `undefined as any` を全除去
- ManagedAgentRunner から `JobStateStore` 操作を全除去し `AgentRunResult` のみ返す
- executor の managed/local 分岐を消し 1 本道の state 管理にする
- `_updatedState` を完全廃止

## 要件

### Phase 1: StepContext 型の定義と接続

1. `src/core/types.ts` に `StepContext` interface を定義（config, slug, cwd?, request, repo）
2. `PipelineDeps extends StepContext` に変更
3. `src/core/step/types.ts` の `StepDeps` を `StepContext` への alias に変更

### Phase 2: ClaudeCodeRunner の undefined as any 除去

4. `src/adapter/claude-code/agent-runner.ts` の deps 構築を `StepContext` 型に変更（`client` / `githubClient` 削除）
5. `grep -r "undefined as any" src/` で残存ゼロを確認

### Phase 3: ManagedAgentRunner から JobStateStore 除去

6. `runProposeStyle` / `runPollingStyle` から `JobStateStore` の全操作を除去
7. return を `AgentRunResult` のみにする（`_updatedState` 削除）
8. step メソッド呼び出し（buildMessage / resultFilePath / parseResult）は adapter 内に残す必要があるか判断（session 操作のみ残す方針との整合）

### Phase 4: executor の統合

9. `_updatedState` 分岐（executor.ts L107-116）を削除
10. managed / local 共通の 1 本道 state 管理にする
11. `result.sessionId` を step result の session フィールドに記録
12. `result.agentBranch` が存在する場合は `state.branch` にセット
13. **`store.update(state, { step: step.name })` を `runAgentStep` 冒頭に追加**（ps の step 表示修正 — managed adapter が内部でやっていた処理を executor に移す）

### Phase 5: テスト修正

14. `_updatedState` を参照するテストを修正
15. ManagedAgentRunner のテストから `JobStateStore` の mock を除去
16. `bun run typecheck && bun run test` で全テスト pass

## 受け入れ基準

- [ ] `grep -r "undefined as any" src/` で残存ゼロ
- [ ] `grep -r "_updatedState" src/` で残存ゼロ
- [ ] executor.ts の `runAgentStep` 内に managed/local の if 分岐が存在しない
- [ ] executor.ts の `runAgentStep` 冒頭で `store.update(state, { step: step.name })` を呼んでいる
- [ ] `bun run typecheck` が green
- [ ] `bun run test` が全テスト pass

## 補足

### 先行調査の成果物

spec-runner の dogfood（Job 16d71a81）で propose + spec-review まで完了した成果物がブランチ `feat/stepcontext-type-separation` に残っている。design.md の設計判断（D1〜D5）と tasks.md の Phase 分割は検証済み（spec-review approved, score 8-9）。本 request はそれを引き継ぐ。

### 関連 issue

- Issue #81: StepContext 型分離 + _updatedState 責務重複の解消
- Issue #83: ClaudeCodeRunner SDK 化（PR #84 で対応済み）

### ps の step 表示バグ

executor の local path で `store.update(state, { step: step.name })` を呼んでいないため、`specrunner ps` の step 列が `init` のまま更新されない。Phase 4 要件 13 で対応する。
