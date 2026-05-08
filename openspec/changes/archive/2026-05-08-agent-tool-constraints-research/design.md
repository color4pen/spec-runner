## Context

spec-runner の agent はすべて同一 toolset を使用しており、reviewer 系 agent が Write/Edit/Bash を呼べる構造になっている。system prompt で制約しているが、ツールレベルの制約はない。

両 SDK の tool 制約機能を調査し、AgentDefinition に反映する設計案を提案する。

## Goals / Non-Goals

**Goals:**

- Claude Code SDK の `query()` で agent ごとに利用可能ツールを制限できるか確認
- Managed Agents SDK の agent 定義で特定ツールの有効/無効を制御できるか確認
- 結論と設計案を research-result.md に記録

**Non-Goals:**

- 実装（別 request で行う）
- テスト方法の検討
- 既存 system prompt の変更

## Decisions

### D1: 調査対象の SDK バージョンとエントリポイント

**Claude Code SDK** (`@anthropic-ai/claude-agent-sdk`):
- `query()` の `Options` 型を調査対象とする
- 特に `allowedTools`, `disallowedTools`, `tools` フィールドの意味と挙動を確認

**Managed Agents SDK** (`@anthropic-ai/sdk`):
- `beta.agents.create()` のパラメータ型を調査対象とする
- `agent_toolset_20260401` の `configs` 配列による per-tool 設定を確認

### D2: 調査で確認すべき観点

各 SDK について以下を確認する:

1. **制約の粒度**: tool 単位 / toolset 単位 / 全体のいずれか
2. **設定タイミング**: agent 定義時 / query 実行時
3. **制約の方式**: allowlist / denylist / per-tool enable/disable
4. **MCP tools**: MCP server 由来のツールもフィルタリング可能か

### D3: 成果物のフォーマット

research-result.md に以下の構成で記録:

1. 調査結果（SDK ごとのセクション）
2. 現状の実装との差分
3. 結論と推奨設計案

## Risks / Trade-offs

- [Risk] SDK の型定義と実際の挙動が異なる可能性 → 型定義から読み取れる情報に限定し、実証は実装 request で行う
- [Risk] SDK バージョンアップで API が変わる可能性 → 調査時点のバージョンを明記する
