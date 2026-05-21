# Design: request-manager

## Overview

`src/core/request/` モジュールを新設し、request のライフサイクル管理（生成・検証・レビュー・一覧・パス解決）を独立層として構築する。

### 現状の課題

| 問題 | 箇所数 |
|------|--------|
| パス知識のハードコード (`specrunner/requests/{active,merged}/<slug>/`) | 6 箇所 |
| `executeReview()` が `query()` を直接呼び出しており DI 不可 | 1 箇所 |
| `specrunner run` がファイルパスのみ受け付けており slug 指定不可 | — |
| テキスト入力 → request.md 生成の自動化層が存在しない | — |

### 設計方針

1. **store.ts がパス知識の単一ソース** — `ACTIVE_SUBDIR` / `MERGED_SUBDIR` 定数と `resolve` / `list` / `write` API を提供。既存コードの store 経由への切り替えは別 PR で行う
2. **reviewer.ts が query DI 点** — `runReview(content, config, cwd, queryFn?)` で query 関数を注入可能にしてユニットテスト対応
3. **manager.ts は thin coordinator** — store / generator / reviewer を組み合わせるだけ。ロジックを持たない
4. **後方互換優先** — ファイルパス指定の既存フローは一切変更しない

## Component Structure

### New Files

| File | Role |
|------|------|
| `src/core/request/types.ts` | `ParsedRequest`, `ParsedRequestSections`, `RequestState` 型定義 |
| `src/core/request/store.ts` | FS 永続化・パス解決 CRUD + `checkSlugCollision` |
| `src/core/request/reviewer.ts` | `runReview()` + parse / build / verdict 関数群 |
| `src/core/request/generator.ts` | テキスト → request.md LLM 生成 |
| `src/core/request/manager.ts` | thin coordinator（module-level functions） |
| `src/core/command/request-create.ts` | `executeCreate()` CLI ハンドラ |
| `src/core/command/request-list.ts` | `executeList()` CLI ハンドラ |
| `src/prompts/request-generate-system.ts` | generator 用システムプロンプト |

### Modified Files

| File | Change |
|------|--------|
| `src/core/command/request-review.ts` | 型・ヘルパーを reviewer.ts から re-export に変更。`executeReview()` を `runReview()` ラッパーに変更 |
| `src/parser/request-md.ts` | `ParsedRequest` / `ParsedRequestSections` 定義を types.ts に移動し、re-export に変更 |
| `src/util/slugify.ts` | `checkSlugCollision` を store.ts から re-export に変更 |
| `src/cli/command-registry.ts` | `request create` / `request list` 追加; `request review` の slug 対応; `run` positional 表記更新; USAGE 更新 |
| `src/cli/run.ts` | slug → ファイルパス解決を追加 |

## Detailed Design

### `src/core/request/types.ts`

```typescript
export interface ParsedRequestSections {
  背景?: string;
  目的?: string;
}

export interface ParsedRequest {
  type: string;
  title: string;
  slug: string;
  baseBranch: string;
  content: string;
  enabled: string[];
  sections?: ParsedRequestSections;
}

export type RequestState = "active" | "merged";
```

`src/parser/request-md.ts` はこれらインターフェース定義を削除し、`export type { ParsedRequest, ParsedRequestSections } from "../core/request/types.js"` を追加する。13 ファイルの既存 import は `src/parser/request-md.ts` からのままで変更不要（re-export により透過的）。

### `src/core/request/store.ts`

パス定数（module-level const）:

```typescript
const ACTIVE_SUBDIR = path.join("specrunner", "requests", "active");
const MERGED_SUBDIR = path.join("specrunner", "requests", "merged");
```

エクスポート関数:

```typescript
/** slug から active request.md の絶対パスを返す（存在確認なし） */
export function resolve(cwd: string, slug: string): string

/** active request の slug 一覧を返す（request.md を持つエントリのみ） */
export async function list(cwd: string): Promise<string[]>

/** active request.md を読み込んでパースして返す */
export async function read(cwd: string, slug: string): Promise<ParsedRequest>

/** request.md を active/ に書き込む（mkdir -p 含む） */
export async function write(cwd: string, slug: string, content: string): Promise<void>

/** slug の衝突を確認する（active/ と merged/ 両方を確認）*/
export async function checkSlugCollision(cwd: string, slug: string): Promise<void>
```

`checkSlugCollision` は `src/util/slugify.ts` から移動する。slugify.ts は同名関数を `export { checkSlugCollision } from "../core/request/store.js"` で re-export して後方互換を維持する。

`list()` の実装: `path.join(cwd, ACTIVE_SUBDIR)` を readdir し、各エントリに `request.md` が存在するものだけを返す。active/ ディレクトリが存在しない場合は空配列を返す（throw しない）。

### `src/core/request/reviewer.ts`

`src/core/command/request-review.ts` から以下を移動:
- `RequestReviewVerdict`, `RequestReviewFinding`, `RequestReviewResult` 型
- `isValidVerdict()` 内部関数
- `parseReviewOutput(text: string): RequestReviewResult`
- `buildInitialMessage(requestContent: string, projectContext: string): string`
- `verdictToExitCode(verdict: RequestReviewVerdict): number`

新設:

```typescript
import { query, type SDKMessage, type SDKResultMessage, type SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";
import type { SpecRunnerConfig } from "../../config/schema.js";

export async function runReview(
  content: string,
  config: SpecRunnerConfig,
  cwd: string,
  queryFn: typeof query = query,
): Promise<RequestReviewResult>
```

`runReview` の実装（`executeReview` の Step 3〜9 を抽出）:
1. プロジェクトコンテキスト読み込み（graceful degrade、失敗時は空文字で続行）
2. `getStepExecutionConfig(config, "request-review", { model: "claude-opus-4-5", maxTurns: 30, timeoutMs: 300_000 })`
3. AbortController でタイムアウト設定
4. `queryFn({ prompt: buildInitialMessage(content, projectContext), options: { cwd, allowedTools: ["Read", "Bash", "Grep", "Glob"], permissionMode: "bypassPermissions", model, systemPrompt, abortController, ...maxTurnsOption } })`
5. ストリーム消費 → `lastResult` 取得
6. lastResult が success でない場合は SpecRunnerError を throw
7. `parseReviewOutput(lastResult.result)` → 返す

`executeReview()` は以下の構造に変更:
- Step 1: ファイル読み込み（残す）
- Step 2: `parseRequestMdContent` バリデーション（残す）
- Step 3: `loadConfig()`（残す）
- Step 4〜9: `await runReview(content, config, process.cwd())` に置き換え
- Step 10〜12: 出力 + exit code（残す）

`src/core/command/request-review.ts` は型・ヘルパー関数を reviewer.ts から re-export する。既存の `tests/unit/command/request-review.test.ts` は `src/core/command/request-review.ts` から import しているため、re-export によりテスト変更不要。

### `src/core/request/generator.ts`

```typescript
export interface GeneratedRequest {
  slug: string;
  content: string;
}

export async function generate(
  text: string,
  cwd: string,
  config: SpecRunnerConfig,
  queryFn: typeof query = query,
): Promise<GeneratedRequest>

export function buildGeneratePrompt(text: string): string
```

`generate()` の実装フロー:
1. `slug = slugify(text)` — 入力テキストから slug 生成
2. `await store.checkSlugCollision(cwd, slug)` — 衝突確認（SLUG_COLLISION なら throw）
3. `getStepExecutionConfig(config, "request-generate", { model: "claude-opus-4-5", maxTurns: 1, timeoutMs: 120_000 })`
4. `queryFn({ prompt: buildGeneratePrompt(text), options: { maxTurns: 1, allowedTools: [], permissionMode: "bypassPermissions", model: resolvedModel, systemPrompt: REQUEST_GENERATE_SYSTEM_PROMPT } })`
5. ストリーム消費 → result テキスト取得
6. result 内の `<generated-slug>` を実際の slug で置換
7. `parseRequestMdContent(result, "<generated>")` — バリデーション（失敗時 throw、リトライなし）
8. `await store.write(cwd, slug, result)` — 保存
9. return `{ slug, content: result }`

`buildGeneratePrompt(text)`:
```
以下のテキストから request.md を生成してください:

<input>
{text}
</input>
```

システムプロンプト (`src/prompts/request-generate-system.ts`) の指示内容:
- request.md の正確なフォーマット（`# Title`, `## Meta`, `## Workflow Options` 等）を明示
- 入力テキストから type（new-feature / bug-fix / spec-change / refactor）を推定
- title・背景・目的・要件・スコープ外・受け入れ基準を入力から導出
- slug には `<generated-slug>` を出力（caller 側で差し替え）
- Workflow Options セクションは `- enabled: []`
- 出力は request.md の内容のみ（説明文なし）

`allowedTools: []` の理由: 生成は純粋なテキスト変換。ファイル探索は不要。

### `src/core/request/manager.ts`

module-level functions（クラスではない）:

```typescript
/** テキスト入力から request を生成して store に保存し、slug を返す */
export async function create(
  text: string,
  cwd: string,
  config: SpecRunnerConfig,
  queryFn?: typeof query,
): Promise<string>

/** slug またはファイルパスを指定してレビューを実行 */
export async function review(
  slugOrPath: string,
  cwd: string,
  config: SpecRunnerConfig,
  queryFn?: typeof query,
): Promise<RequestReviewResult>

/** active な request の一覧（slug + type + state）を返す */
export async function list(
  cwd: string,
): Promise<Array<{ slug: string; type: string; state: RequestState }>>

/** slug → active request.md の絶対パスを返す（存在確認なし） */
export function resolve(cwd: string, slug: string): string
```

実装:
- `create`: `generator.generate(text, cwd, config, queryFn)` → `result.slug`
- `review`: `path.resolve(cwd, slugOrPath)` が存在するならそのまま使い、しなければ `store.resolve(cwd, slugOrPath)` で解決 → ファイル読み込み → `reviewer.runReview(content, config, cwd, queryFn)`
- `list`: `store.list(cwd)` → 各 slug の `store.read(cwd, slug)` → `{ slug, type: parsed.type, state: "active" as const }`
- `resolve`: `store.resolve(cwd, slug)`

### `src/core/command/request-create.ts`

```typescript
export async function executeCreate(
  text: string | null,
  opts: { stdin: boolean; cwd: string },
): Promise<number>
```

実装:
1. `text !== null` ならそのまま使う（positional が `--stdin` より優先される — REQ-CLI-RC-02）
2. `text === null` かつ `opts.stdin` が true なら stdin を全読み（Node.js `process.stdin` ストリーム消費）して text とする
3. `text === null` かつ `!opts.stdin` なら stderr に `Error: テキスト引数または --stdin フラグが必要です` を書いて 1 を返す
4. config を `loadConfig().catch(() => ({} as SpecRunnerConfig))` で読み込む
5. `manager.create(resolvedText, cwd, config)` → slug を stdout に書いて（末尾改行付き）0 を返す
6. `SpecRunnerError` なら stderr に `Error: ${err.message}\nHint: ${err.hint}` を書いて 1 を返す

stdin 読み込み実装（Bun.* は使わない）:
```typescript
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as ArrayBuffer));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
```

### `src/core/command/request-list.ts`

```typescript
export async function executeList(cwd: string): Promise<number>
```

実装:
1. `manager.list(cwd)` を呼ぶ
2. 結果が空なら `(no active requests)\n` を stdout に書いて 0 を返す
3. 結果がある場合は以下フォーマットで stdout に書いて 0 を返す:
   ```
   SLUG                    TYPE          STATE
   request-manager         new-feature   active
   ```
   フィールド幅は固定（SLUG: 24, TYPE: 14, STATE: 残り）

### CLI Integration

#### `src/cli/run.ts` — slug 解決

```typescript
import * as fs from "node:fs"; // 追加（同期 existsSync のため）
import { resolve as storeResolve } from "../core/request/store.js"; // 追加

export async function runRunCore(
  requestMdPath: string,
  options: { cwd?: string; verbose?: boolean },
): Promise<number> {
  setVerbose(options.verbose ?? false);
  const cwd = options.cwd ?? process.cwd();

  // slug/path 解決: ファイルが存在すればそのまま（後方互換）
  // 存在しなければ slug として store に問い合わせる
  let absolutePath = path.resolve(cwd, requestMdPath);
  if (!fs.existsSync(absolutePath)) {
    const slugResolved = storeResolve(cwd, requestMdPath);
    if (!fs.existsSync(slugResolved)) {
      process.stderr.write(
        `Error: '${requestMdPath}' is neither a file path nor an active request slug.\n`,
      );
      process.stderr.write(
        "Hint: Use 'specrunner request list' to see available slugs.\n",
      );
      return 1;
    }
    absolutePath = slugResolved;
  }

  // ... 既存の preflight + pipeline フロー（変更なし）
```

注: `absolutePath` は `const` から `let` に変更する。

#### `src/cli/command-registry.ts` — 新コマンド・更新

`request.subcommands.review` の変更:
- `positional: { name: "file" }` → `{ name: "file-or-slug" }`
- handler に slug 解決ロジックを追加:
  ```typescript
  const input = parsed.positional!;
  const direct = path.resolve(process.cwd(), input);
  let filePath: string;
  if (fs.existsSync(direct)) {
    filePath = direct;
  } else {
    const slugPath = storeResolve(process.cwd(), input);
    if (!fs.existsSync(slugPath)) {
      process.stderr.write(`Error: '${input}' is neither a file nor an active request slug.\n`);
      process.exit(1);
    }
    filePath = slugPath;
  }
  process.exit(await executeReview(filePath, { json: !!parsed.flags["json"] }));
  ```

新設 `request.subcommands.create`:
```typescript
create: {
  flags: { stdin: { type: "boolean" } },
  positional: { name: "text", required: false },
  handler: async (parsed) => {
    const text = parsed.positional ?? null;
    process.exit(
      await executeCreate(text, {
        stdin: !!parsed.flags["stdin"],
        cwd: process.cwd(),
      }),
    );
  },
},
```

新設 `request.subcommands.list`:
```typescript
list: {
  flags: {},
  handler: async () => {
    process.exit(await executeList(process.cwd()));
  },
},
```

`run` の `positional: { name: "request.md" }` → `{ name: "request.md|slug" }`

USAGE 更新:
```
  run <request.md|slug> [--verbose]            Run design pipeline for a request
  request template [--type <type>]             Print a scaffold request.md template to stdout
  request validate <file>                      Validate a request.md file
  request review <file-or-slug> [--json]       Architect review (file path or active slug)
  request create "<text>" [--stdin]            Generate request.md from text input
  request list                                 List active requests
```

## Data Flow

### `specrunner request create "テキスト入力"`

```
CLI: specrunner request create "テキスト入力"
  │
  ▼
command-registry.ts → executeCreate("テキスト入力", { stdin: false, cwd })
  │
  ▼
manager.create(text, cwd, config)
  │
  ▼
generator.generate(text, cwd, config)
  ├─ slug = slugify(text)
  ├─ store.checkSlugCollision(cwd, slug)
  ├─ queryFn(prompt, { maxTurns: 1, allowedTools: [], ... })
  ├─ parseRequestMdContent(result)  ← バリデーション
  └─ store.write(cwd, slug, result)

slug → stdout
```

### `specrunner run <slug>`

```
CLI: specrunner run my-feature
  │
  ▼
run.ts → runRunCore("my-feature", options)
  ├─ absolutePath = path.resolve(cwd, "my-feature")
  ├─ fs.existsSync(absolutePath) → false
  ├─ slugResolved = storeResolve(cwd, "my-feature")
  │    → "<cwd>/specrunner/requests/active/my-feature/request.md"
  ├─ fs.existsSync(slugResolved) → true
  └─ absolutePath = slugResolved → 既存フロー（変更なし）
```

### `specrunner request review <slug>`

```
CLI: specrunner request review my-feature
  │
  ▼
command-registry.ts
  ├─ fs.existsSync(path.resolve(cwd, "my-feature")) → false
  ├─ slugPath = storeResolve(cwd, "my-feature")
  │    → "<cwd>/specrunner/requests/active/my-feature/request.md"
  └─ fs.existsSync(slugPath) → true → filePath = slugPath

executeReview(filePath, { json })
  ├─ fs.readFile(filePath)
  ├─ parseRequestMdContent(content)
  ├─ loadConfig()
  └─ reviewer.runReview(content, config, cwd)
       ├─ read project context
       ├─ getStepExecutionConfig
       ├─ queryFn(...)
       └─ parseReviewOutput(result) → RequestReviewResult
```

## Error Handling

| エラー | 対応 |
|--------|------|
| slug 衝突 | `SLUG_COLLISION` → stderr + exit 1 |
| LLM 出力がパース失敗 | `SpecRunnerError` throw → stderr + exit 1（リトライなし） |
| active slug が存在しない（run コマンド） | `Error: '...' is neither a file path nor an active request slug.` + Hint → exit 1 |
| active slug が存在しない（review コマンド） | 同上 → exit 1 |
| text も stdin もない（create コマンド） | stderr: テキスト引数または --stdin が必要 → exit 1 |
| active/ ディレクトリ不在（list コマンド） | 空一覧 `(no active requests)` → exit 0 |

## Non-Goals

- `collectRequestPatterns()` / `resolve-target.ts` / `pipeline-run.ts` の store 経由への切り替え（別 PR）
- active → merged 以外の状態遷移（canceled ディレクトリは未定義のため対象外）
- watch コマンド（本モジュールの上に後で薄いポーリング層として実装）
- request-review の pipeline step 組み込み（別リクエストで検討）
- `moveRequestsDir()` の store.ts への取り込み（finish orchestrator の責務として残す）
- `src/context/request-patterns.ts` の store 経由への切り替え（別 PR）
