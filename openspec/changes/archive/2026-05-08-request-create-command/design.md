# Design: request-create-command

## Architecture

create コマンドは pipeline の外に配置する。CommandRunner / Pipeline / StepExecutor に変更なし。

```
bin/specrunner.ts (switch case "create")
  → src/cli/create.ts: runCreate()
    → src/core/command/create.ts: executeCreate()
      → slugify() + collision check
      → collectDynamicContext()
      → collectRequestPatterns()
      → RuntimeStrategy.query() (1-shot LLM call)
      → extract & validate → write request.md
      → optional: runRunCore()
```

## D1: LocalRuntime.query() の実装

空プレースホルダ (`src/core/runtime/local.ts:66-68`) を実装する。

- Claude Code SDK の `sdkQuery()` を呼び出し、`SDKResultMessage` を yield
- `ClaudeCodeRunner.run()` の SDK パターンを参考に、branch verification / commit check を省いた軽量版
- options: `{ cwd, allowedTools: ["Read", "Grep", "Glob"], permissionMode: "bypassPermissions", model }`
- systemPrompt は SDK の `options.systemPrompt` で渡す（prompt パラメータに結合しない）
- テスト用に `QueryFn` を注入可能にする

## D2: LocalRuntime コンストラクタの named options 化

コンストラクタ引数が 5 個になるため、named options object に移行する。

```typescript
interface LocalRuntimeOptions {
  cwd: string;
  githubClient: GitHubClient;
  manager?: ReturnType<typeof createWorktreeManager>;
  spawnFn?: SpawnFn;
  queryFn?: QueryFn;
}
```

呼び出し元（`factory.ts`、テスト）も同時に更新。

## D3: slug 導出

`src/util/slugify.ts` に実装。

- kebab-case 変換（英数字 + ハイフンのみ）
- 50 文字以内に切り詰め
- 日本語を含む場合はローマ字変換せず削除（slug は識別子であり可読性より一意性を優先）

衝突チェック: `specrunner/requests/active/` と `specrunner/requests/merged/` を走査。

## D4: request パターン収集

`src/context/request-patterns.ts` に実装。

- `specrunner/requests/merged/` を走査
- 同一 type の request.md をアルファベット順で最大 3 件
- 異なる type から 1 件追加（最大 4 件）
- ディレクトリが空 or 存在しない場合は空配列

## D5: prompt 設計

system prompt (`src/prompts/create-system.ts`):
- request.md の構造ルール（title / Meta / 背景 / 要件 / スコープ外 / 受け入れ基準）
- 番号付き要件リスト
- 受け入れ基準はチェックリスト形式
- 最後に `bun run typecheck && bun run test` が green を含める
- 「応答はマークダウンのみ。コードフェンスで囲まない」

user message:
- description, type
- DynamicContext（specsList / changesList）
- request パターン（full text）

## D6: 応答抽出の 3 段フォールバック

1. 応答全体を `parseRequestMdContent()` に通す → 成功ならそのまま
2. 失敗 → `` ```markdown ... ``` `` ブロックを正規表現で抽出 → 再度パース
3. 失敗 → エラー終了

## D7: query() 応答の型安全性

`RuntimeStrategy.query()` の戻り値 `AsyncGenerator<unknown>` から SDK の result message へナローイングする型ガード関数を `create.ts` に定義。

```typescript
function isResultMessage(v: unknown): v is { type: "result"; subtype: string; result?: string }
```

adapter 層の SDKMessage 型への直接依存は避ける。

## D8: QueryOptions の拡張

`QueryOptions` に `model` と `allowedTools` を追加する。create コマンドが query() に read-only ツールセットと model を渡すため。

```typescript
export interface QueryOptions {
  cwd?: string;
  maxTurns?: number;
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
}
```
