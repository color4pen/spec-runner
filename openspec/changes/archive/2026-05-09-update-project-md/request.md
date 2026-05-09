# project.md を現行アーキテクチャに書き換える

## Meta

- **type**: chore
- **slug**: update-project-md
- **base-branch**: main

## 背景

`openspec/project.md` が CLI 転換前の Next.js/React/SSE アーキテクチャを記述したまま放置されている。propose agent がこのファイルを読んで設計判断するため、古い内容が全 pipeline の品質に影響する（architect レビュー Finding #1, HIGH）。

## 要件

1. `openspec/project.md` を現行アーキテクチャに書き換える。以下を正確に反映すること:
   - **Runtime**: Bun (TypeScript)
   - **テスト**: vitest
   - **主要依存**: `@anthropic-ai/claude-agent-sdk`（Claude Agent SDK）、`@anthropic-ai/sdk`（Anthropic API SDK）、`octokit`
   - **アーキテクチャ**: CLI-first。local runtime（Claude Agent SDK 経由）と managed runtime（Anthropic Managed Agents API 経由）の dual runtime
   - **パイプライン**: 10 ステップの state-machine（propose → spec-review → spec-fixer → test-case-gen → implementer → verification → build-fixer → code-review → code-fixer → pr-create）
   - **設計パターン**: ports & adapters、遷移テーブル駆動、Step as data / Executor as behavior、CommandRunner Template Method
   - **状態管理**: `~/.local/share/specrunner/jobs/` に JSON で永続化。git worktree でジョブ隔離
   - **設定**: `~/.config/specrunner/config.json`。4 レベルの step-config resolution chain

2. Next.js、React、SSE、Web アプリケーション関連の記述を全て除去する

3. Stack セクションに現行の依存関係（package.json の dependencies）を反映する

## スコープ外

- openspec/specs/ 配下の spec ファイルの更新
- ソースコードの変更
- README.md の更新

## 受け入れ基準

- [ ] project.md に Next.js / React / SSE の記述が残っていない
- [ ] CLI-first アーキテクチャが正確に記述されている
- [ ] 10 ステップ pipeline が記載されている
- [ ] `bun run typecheck && bun run test` が green
