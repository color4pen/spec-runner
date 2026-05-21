# パイプラインステップの実行基盤を Codex でも動かせるようにする

## Meta

- **type**: spec-change
- **slug**: codex
- **base-branch**: main
- **date**: 2026-05-14
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

現在 spec-runner の各パイプラインステップは Claude Agent SDK の `query()` で実行している。6/15 以降 Agent SDK が専用クレジット $200/月に制限される見込みがあり、単一プロバイダーへの依存はコスト構造を一方的に変えられるリスクがある。

OpenAI Codex SDK（`@openai/codex-sdk` v0.130.0、npm 公開済み）で同等のエージェント実行が可能。SDK は内部で `@openai/codex` CLI バイナリを spawn し、stdin/stdout で JSONL イベントを交換する構造。つまり SDK を使う = CLI バイナリをプログラマブルに制御すること。

### 実測確認済みの Codex SDK API

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex({ apiKey: "...", config: { ... } });
const thread = codex.startThread({
  workingDirectory: string,
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access",
  model?: string,
  skipGitRepoCheck?: boolean,
});

// 同期実行
const turn: Turn = await thread.run(prompt: string | UserInput[], options?: { signal?: AbortSignal });
// turn.finalResponse: string — エージェントの最終応答テキスト
// turn.items: ThreadItem[] — 実行中のアクション（コマンド実行、ファイル変更等）
// turn.usage: Usage | null — { input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens }
```

### Claude と Codex のツールモデルの違い

- Claude: `allowedTools: ["Read", "Edit", "Bash"]` でツールを明示指定
- Codex: ツール指定なし。`sandboxMode` でアクセス境界を制御。ファイル操作・シェル実行はエージェントに組み込まれている

### ThreadItem の型（ファイル変更検出に使用）

```typescript
type FileChangeItem = {
  type: "file_change";
  changes: { path: string; kind: "add" | "delete" | "update" }[];
  status: "completed" | "failed";
};
type CommandExecutionItem = {
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: "in_progress" | "completed" | "failed";
};
type AgentMessageItem = { type: "agent_message"; text: string };
```

既存の `AgentRunner` port（`run(ctx): Promise<AgentRunResult>`）がプロバイダー中立なインターフェースを既に提供しているため、新しい抽象レイヤーは不要。`CodexAgentRunner implements AgentRunner` を追加すれば良い。

## 目的

`CodexAgentRunner` を追加し、config の設定で Claude / Codex をパイプラインステップ単位で切り替え可能にする。

## 要件

### CodexAgentRunner の実装

1. `src/adapter/codex/agent-runner.ts` に `CodexAgentRunner implements AgentRunner` を新設する
2. Codex SDK の `Codex` クラスをインスタンス化し、`thread.run(prompt)` でステップを実行する
3. プロンプト構築は `ClaudeCodeRunner` の実装を参照仕様とする。branch, slug, cwd, projectContext, additionalInstructions をプロンプトに注入する。`step.enrichContext()` も呼ぶ（spec-review のベースライン差分注入等）
4. Codex の `sandboxMode` は全ステップ `"workspace-write"` で統一する。全ステップがファイル書き込み（result.md やソースコード）と Bash 実行を必要とするため、`read-only` で済むステップはない。ソースコード変更の制御はプロンプトで行う（spec-review / code-review は「ソースコードを変更するな」とプロンプトで制御する既存パターンを踏襲）。Claude adapter の `allowedTools` は現行のまま変更しない
5. 結果テキストの取得: `ClaudeCodeRunner` と同じく、ステップの `resultFilePath` が定義されていれば worktree 内のそのファイルを `fs.readFile()` で読んで `AgentRunResult.resultContent` に設定する。`resultFilePath` が null のステップでは `Turn.finalResponse` を `resultContent` に設定する
6. `Turn.items` から `FileChangeItem`（`type: "file_change"`）をフィルタし、`changes[].path` で変更ファイル一覧を取得する。用途はロギング
7. `Turn.usage` を `AgentRunResult.modelUsage` にマッピングする。Codex の `Usage` には `cached_input_tokens` があるが Claude の `cacheCreationInputTokens` に相当するフィールドはないため、`cacheCreationInputTokens: 0` で固定する
8. `TurnOptions.signal` に `AbortSignal` を渡してタイムアウト制御する（既存の AbortController パターンと同じ）
9. `skipGitRepoCheck: true` を設定する（worktree 内での実行のため）

### config 拡張

10. `config.models` にモデル名と provider のレジストリを持つ。組み込みデフォルトで現行の全モデルをカバーし、ユーザーが新モデルを追加・上書きできる:
    ```json
    {
      "models": {
        "claude-opus-4-7": { "provider": "anthropic" },
        "claude-opus-4-6": { "provider": "anthropic" },
        "claude-sonnet-4-6": { "provider": "anthropic" },
        "claude-sonnet-4-5": { "provider": "anthropic" },
        "claude-opus-4-5": { "provider": "anthropic" },
        "claude-haiku-4-5": { "provider": "anthropic" },
        "o3": { "provider": "openai" },
        "gpt-5.4": { "provider": "openai" },
        "gpt-5.3-codex": { "provider": "openai" },
        "gpt-5.2-codex": { "provider": "openai" },
        "gpt-5.1": { "provider": "openai" },
        "gpt-5.5": { "provider": "openai" }
      }
    }
    ```
    組み込みデフォルトはコード内の定数として持ち、config.json に明示的に書かなくても動作する。config.json に書いた場合はマージ（上書き優先）する
11. `config.steps[stepName].model` で指定されたモデル名を `config.models`（組み込みデフォルト + ユーザー設定のマージ結果）で引いて provider を解決し、対応する adapter でそのステップを実行する
12. 未知のモデル名（マージ後のレジストリに存在しない）はエラーにする。暗黙の推測はしない
13. Codex adapter を使うステップがある場合、`OPENAI_API_KEY` 環境変数が必要。`runtime: "managed"` との組み合わせは `validateConfig()` で reject する

### runtime 層の拡張

14. `DispatchingAgentRunner implements AgentRunner` を新設する。`ClaudeCodeRunner` は起動時に生成、`CodexAgentRunner` は初回使用時に lazy に生成する（`OPENAI_API_KEY` 未設定のユーザーが Claude のみで使う場合に影響しないようにする）。`run(ctx)` で `getStepExecutionConfig()` で解決した model を `config.models` レジストリで引いて provider を解決、対応する runner に委譲する（config.steps のオーバーライドが効くようにするため）
15. `LocalRuntime.createAgentRunner()` は `DispatchingAgentRunner` を返す。`PipelineDeps` / `StepExecutor` の変更は不要

### doctor チェック

16. config に OpenAI モデルを使うステップがある場合、`codex` CLI バイナリの存在を `specrunner doctor` でチェックする

## スコープ外

- `request/generator.ts` / `request/reviewer.ts` の Codex 対応（パイプライン外のユーティリティ。Claude 固定で十分）
- マネージドランタイムの Codex 対応
- Codex 以外のプロバイダー（Gemini, Mistral 等）
- プロバイダー間のストリーミング中間イベント共通化
- Codex の MCP サーバーモード / Agents SDK 統合

## 受け入れ基準

- [ ] `CodexAgentRunner` が `AgentRunner` port を実装している
- [ ] `config.models` レジストリでモデル名から provider が解決される
- [ ] `config.steps[stepName].model` に OpenAI モデル名を指定すると、そのステップが Codex で実行される
- [ ] 未知のモデル名がエラーになる
- [ ] OpenAI モデル + `runtime: "managed"` の組み合わせが reject される
- [ ] 既存の Claude パイプライン（デフォルト）が後方互換で動作する
- [ ] `specrunner doctor` が OpenAI モデル使用時に codex CLI の存在をチェックする
- [ ] `bun run typecheck && bun run test` が green

## 補足

- `@openai/codex-sdk` は内部で `@openai/codex` CLI を spawn する。SDK を使うこと = CLI をプログラマブルに制御すること。別途 `codex exec` をサブプロセスで呼ぶ必要はない
- Codex のツール使用は暗黙的。Claude の `allowedTools` に相当する制御は `sandboxMode` で行う
- `Turn.usage` の `cached_input_tokens` は Claude の `cacheReadInputTokens` に対応。`cacheCreationInputTokens` に相当するフィールドは Codex にはない
