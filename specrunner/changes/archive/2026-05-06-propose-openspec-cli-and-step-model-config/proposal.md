## Why

spec-runner の propose agent は openspec CLI を使わずに artifact を直接書くため、delta spec を省略しがちで、PR #88 dogfood で実際に欠落した。また全 step が `claude-sonnet-4-5` / `maxTurns: 30` 固定であり、step の性質（設計 vs 実装 vs レビュー）に応じた最適化ができていない。

## What Changes

- **propose step の openspec CLI 対応**: system prompt を修正し、`openspec new change` → `openspec status --json` → `openspec instructions` のワークフローで artifact を生成させる。openspec CLI のスキーマが指示する artifact（delta spec 含む）を agent の判断で省略できなくなる
- **step ごとの model 設定**: 設計・レビュー step は `claude-opus-4-6[1m]`（長文コンテキスト理解 + 判断力）、実装・修正 step は `claude-sonnet-4-6`（SWE-bench で Opus との差 1.2pt、コスト効率）に最適化する
- **step ごとの maxTurns 設定**: `AgentStep` interface に `maxTurns?: number` を追加し、ClaudeCodeRunner が `step.maxTurns ?? 30` を SDK の `query()` に渡す。step の性質に応じた上限（propose: 20, implementer: 60 等）を設定する

## Capabilities

### New Capabilities

(なし — 既存機能の改善)

### Modified Capabilities

- `propose-session`: system prompt を openspec CLI ワークフローに変更。agent が openspec CLI コマンドで artifact を生成する
- `step-execution-architecture`: AgentStep に `maxTurns` フィールドを追加。各 step に model 選定根拠と maxTurns 設計を追加

## Impact

- `src/prompts/propose-system.ts`: PROPOSE_SYSTEM_PROMPT を openspec CLI ワークフローに全面書き換え
- `src/core/step/propose.ts`: model を `claude-opus-4-6[1m]` に変更
- `src/core/step/{spec-review,code-review}.ts`: model を `claude-opus-4-6[1m]` に変更
- `src/core/step/{spec-fixer,implementer,build-fixer,code-fixer}.ts`: model を `claude-sonnet-4-6` に変更
- `src/core/step/types.ts`: AgentStep interface に `maxTurns?: number` 追加
- `src/adapter/claude-code/agent-runner.ts`: `maxTurns: 30` ハードコードを `step.maxTurns ?? 30` に変更
- 各 step ファイル: maxTurns 値を設定
