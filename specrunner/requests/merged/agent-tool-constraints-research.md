# agent ごとの tool 制約の実現可能性を調査する

## Meta

- **type**: chore
- **slug**: agent-tool-constraints-research

## 背景

openspec-workflow の agent 定義では、agent ごとに利用可能なツールを制約している:
- reviewer 系（code-reviewer, spec-reviewer）: Read, Grep, Glob のみ
- implementer, fixer 系: Read, Write, Edit, Bash, Grep, Glob

spec-runner では全 agent が同一の toolset（`AGENT_TOOLSET_TYPE`）を使用している。code-review の system prompt で「Do NOT modify any source files」と指示しているが、ツールレベルでの制約はない。reviewer が誤ってコードを書き換えるリスクが構造的に残っている。

Claude Code SDK（local runtime）と Managed Agents SDK（managed runtime）の両方で、agent に渡す tools を制限する方法があるか調査する。

## 要件

### 1. Claude Code SDK の調査

1. `@anthropic-ai/claude-code` SDK の `runAgent()` / `query()` に tools 制約オプションがあるか確認する
2. `allowedTools` / `disallowedTools` のようなフィールドが存在するか
3. MCP tools のフィルタリングが可能か

### 2. Managed Agents SDK の調査

4. Agent Definition の tools 設定で特定ツールのみを有効化できるか確認する
5. `computer_20250124` toolset のサブセット指定が可能か

### 3. 実現方法の提案

6. 調査結果に基づき、以下のいずれかの結論を出す:
   - SDK でネイティブに制約可能 → AgentDefinition に `allowedTools` フィールドを追加する設計案
   - SDK では不可能だが system prompt で十分 → 現状維持。根拠を記録
   - SDK では不可能だが別の方法がある → その方法の設計案

### 4. 成果物

7. 調査結果を `specrunner/requests/active/agent-tool-constraints-research/research-result.md` に記録する

## スコープ外

- 実装（調査結果に基づく実装は別 request）
- tool 制約のテスト方法の検討
- 既存の system prompt での制約指示の変更

## 受け入れ基準

- [ ] Claude Code SDK での tool 制約の可否が明確になっている
- [ ] Managed Agents SDK での tool 制約の可否が明確になっている
- [ ] 結論と根拠が research-result.md に記録されている
