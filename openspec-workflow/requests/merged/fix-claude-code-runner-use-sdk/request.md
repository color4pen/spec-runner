# ClaudeCodeRunner を spec 準拠の SDK query() 実装に修正

## Meta

- **type**: bug-fix
- **date**: 2026-05-05
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

PR #80 で導入された `ClaudeCodeRunner`（`src/adapter/claude-code/agent-runner.ts`）は、design.md D2 および request.md Phase 2 要件 6 で `@anthropic-ai/claude-code` SDK の `query()` を使う設計だが、実装は `claude --print` subprocess invocation になっている。

implementer が「SDK が環境にない」と誤判断し subprocess に切り替えた。実際には openspec-workflow のローカル環境で `bun add` すれば利用可能だった。

## 再現手順

`src/adapter/claude-code/agent-runner.ts` を確認すると、`query()` ではなく `spawn("claude", ["--print", ...])` でCLI を子プロセス起動している。

## 期待される動作

`@anthropic-ai/claude-code` SDK の `query()` async generator を使用し:
- `allowedTools` で使用可能ツールを制御
- `permissionMode: "bypassPermissions"` で自動承認
- `maxTurns` で agent ループ回数を制限
- `cwd` で作業ディレクトリを指定
- `SDKMessage` stream から completion/error を判定

## 実際の動作

`claude --print` subprocess 1-shot 実行。streaming なし、ツール制御なし、turn 制御なし。

## 要件

1. `bun add @anthropic-ai/claude-code` で SDK を devDependencies ではなく dependencies に追加
2. `src/adapter/claude-code/agent-runner.ts` の `runSubprocess` を `query()` async generator に置換
3. `query()` に渡すオプション:
   - `prompt`: step.buildMessage() + additionalInstructions
   - `options.cwd`: ctx.cwd（worktree path）
   - `options.allowedTools`: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
   - `options.permissionMode`: "bypassPermissions"
   - `options.maxTurns`: 適切な上限（30 程度）
   - `options.model`: config から取得（or step.agent.model）
4. `SDKMessage` stream を iterate し、最終 result を取得
5. completion 後に resultFilePath を `fs.readFile()` で読む（既存ロジック維持）
6. requiresCommit guard は git コマンドで検証（既存ロジック維持）
7. error 時は `AgentRunResult.completionReason = "error"` を返す（既存 interface 維持）
8. テストでは `query` を mock する（実際の Claude Code 呼び出しは行わない）
9. port interface (`AgentRunner.run()`) は変更しない

## 受け入れ基準

- [ ] `@anthropic-ai/claude-code` が package.json の dependencies に存在する
- [ ] `src/adapter/claude-code/agent-runner.ts` に `spawn` / `child_process` の import がない
- [ ] `src/adapter/claude-code/agent-runner.ts` が `@anthropic-ai/claude-code` から `query` を import している
- [ ] `query()` に `cwd`, `allowedTools`, `permissionMode`, `maxTurns` が渡されている
- [ ] 既存テストが green（`bun run typecheck && bun test`）
- [ ] `AgentRunner` port interface に変更がない

## 補足

- Issue #83 に対応
- `src/adapter/claude-code/agent-runner.ts` の内部実装のみの変更。他ファイルへの影響は package.json とテストファイルのみ
- `@anthropic-ai/claude-code` の現在の最新バージョンは npm で確認すること
