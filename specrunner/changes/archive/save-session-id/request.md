# agent セッションの session_id を StepRun に記録する

## Meta

- **slug**: save-session-id
- **type**: bug-fix
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`StepRun.sessionId` フィールドと `AgentRunResult.sessionId` フィールドは既に定義されているが、local runtime の `ClaudeCodeRunner` が SDK の `query()` result から `session_id` を抽出していない。常に `null` が記録される。

session_id があれば:
- `~/.claude/projects/` のセッションファイルと紐づけて turn ごとの詳細コスト分析が可能
- 将来の session resume（#208）の前提

GitHub Issue #208 Phase 1。

## 目的

`ClaudeCodeRunner.run()` で SDK result の `session_id` を抽出し、`AgentRunResult.sessionId` に設定する。

## 要件

1. `src/adapter/claude-code/agent-runner.ts` の success result 処理部分で `successResult.session_id` を取得する（SDK の `SDKResultSuccess` 型に `session_id` フィールドがあるか確認し、なければ `lastResult` から取得する方法を調査する）

2. 取得した session_id を `AgentRunResult` の return に含める。既存の `sessionId?: string` フィールドに設定する

3. session_id が取得できない場合は `undefined` のまま（既存動作を維持）

## 受け入れ基準

- [ ] pipeline 実行後の job state JSON で StepRun.sessionId に値が入っている
- [ ] session_id が取得できない場合でもエラーにならない
- [ ] `bun run typecheck` / `bun run test` が全 pass
