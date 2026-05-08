## Why

spec-runner では全 agent が同一の toolset（`AGENT_TOOLSET_TYPE`）を使用している。code-review の system prompt で「Do NOT modify any source files」と指示しているが、ツールレベルでの制約はない。reviewer が誤ってコードを書き換えるリスクが構造的に残っている。

openspec-workflow の agent 定義では agent ごとに利用可能なツールを制約している（reviewer 系は Read/Grep/Glob のみ、implementer/fixer 系は Read/Write/Edit/Bash/Grep/Glob）。spec-runner でも同等の制約をツールレベルで実現できるか調査する。

## What Changes

調査タスク。コード変更なし。

- Claude Code SDK（`@anthropic-ai/claude-agent-sdk`）の `query()` で agent ごとに tools を制限する方法を調査
- Managed Agents SDK（`@anthropic-ai/sdk`）の agent 作成で特定ツールのみを有効化する方法を調査
- 調査結果に基づき実現方法を提案し `research-result.md` に記録

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — 調査のみ)

## Impact

- コード変更なし
- 成果物: `specrunner/requests/active/agent-tool-constraints-research/research-result.md`
