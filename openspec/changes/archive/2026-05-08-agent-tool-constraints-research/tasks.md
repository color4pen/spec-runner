## 1. Claude Code SDK の調査

- [x] 1.1 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` の `Options` 型から tool 制約関連フィールドを特定する
  - `allowedTools?: string[]` — 権限プロンプトなしで自動実行される tools のリスト
  - `disallowedTools?: string[]` — モデルのコンテキストから完全に除外される tools
  - `tools?: string[] | { type: 'preset'; preset: 'claude_code' }` — 利用可能な built-in tools のベースセット
- [x] 1.2 現在の ClaudeCodeRunner の `allowedTools` 使用箇所（`src/adapter/claude-code/agent-runner.ts:130`）を確認し、`disallowedTools` / `tools` との関係を整理する
- [x] 1.3 reviewer 向け制約の実現方法を特定する: `tools: ["Read", "Grep", "Glob"]` で Write/Edit/Bash を除外可能か、または `disallowedTools: ["Write", "Edit", "Bash"]` で除外可能か

## 2. Managed Agents SDK の調査

- [x] 2.1 `node_modules/@anthropic-ai/sdk/resources/beta/agents/agents.d.ts` の agent 作成パラメータから tool 制約関連の型を特定する
  - `configs?: Array<{ name: string; enabled?: boolean; permission_policy?: ... }>` — per-tool 設定
  - `default_config?: { ... }` — toolset 全体のデフォルト設定
- [x] 2.2 `agent_toolset_20260401` のサブセット指定方法を確認する: `configs` で `enabled: false` を設定すると特定ツールを無効化できるか
- [x] 2.3 現在の `toSdkTool()` 実装（`src/adapter/managed-agent/anthropic-client.ts`）が `configs` を渡していないことを確認する

## 3. 結論と設計案の策定

- [x] 3.1 両 SDK の制約機能を比較表にまとめる（粒度、設定タイミング、方式、MCP 対応）
- [x] 3.2 AgentDefinition への反映案を策定する: `allowedTools?: string[]` フィールドを追加し、各 adapter が runtime 固有の制約に変換する設計
- [x] 3.3 ロール別の tool 制約プリセットを定義する（reviewer: Read/Grep/Glob、implementer: full、fixer: full）

## 4. 成果物の作成

- [x] 4.1 `specrunner/requests/active/agent-tool-constraints-research/research-result.md` に調査結果・比較表・設計案を記録する
- [x] 4.2 SDK バージョンを明記する（`@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`）
