# DynamicContext 注入の統合テストを追加する

## Meta

- **slug**: dynamic-context-integration-tests
- **type**: refactoring
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`collectDynamicContext` 単体と各 `buildMessage` 単体はカバーされているが、CommandRunner → PipelineDeps → StepExecutor → AgentRunContext の転送チェーン全体を検証する統合テストがない。DynamicContext に specIndex、projectContext、baselineSpecs が最近追加され、注入経路が複雑化している。

GitHub Issue #123。

## 目的

DynamicContext が pipeline 実行を通じて各ステップの AgentRunContext に正しく渡されることを統合テストで検証する。

## 要件

1. `tests/pipeline-integration.test.ts` に DynamicContext 注入を検証するテストケースを追加する

2. 検証項目:
   - `collectDynamicContext` の結果が `PipelineDeps.dynamicContext` に格納される
   - `StepExecutor.runAgentStep()` が `AgentRunContext.dynamicContext` に正しく転記する
   - `projectContext` が allowlist ステップ（propose, spec-review, implementer, code-review）にのみ注入される
   - `projectContext` が allowlist 外のステップには注入されない
   - `specIndex` が DynamicContext に含まれる
   - `enrichContext` が呼ばれた場合に `baselineSpecs` が追加される

3. 既存のテストフレームワーク（vitest + mock）を使用する。新しいテストユーティリティの追加は最小限にする

## 受け入れ基準

- [ ] DynamicContext の転送チェーンを検証する統合テストが存在する
- [ ] projectContext の allowlist 判定がテストされている
- [ ] 既存テストが壊れない
- [ ] `bun run typecheck` / `bun run test` が全 pass
