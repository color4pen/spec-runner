# Tasks: request-review-command

## [x] T-01: `src/prompts/request-review-system.ts` を新規作成

**新規ファイル**: `src/prompts/request-review-system.ts`

以下を実装する：

- `REQUEST_REVIEW_SYSTEM_PROMPT: string` — エクスポートされた定数
- システムプロンプトの内容は `request.md` の「補足」セクションに定義された architect レビュープロセスを完全に実装すること：
  1. 現状分析（既存アーキテクチャ・パターン確認）
  2. 要件整理（機能要件・非機能要件・統合ポイント）
  3. 設計評価（コンポーネント責務・データモデル・API 契約）
  4. トレードオフ分析（Pros/Cons/Alternatives/Recommendation）
  5. Domain Synthesis（findings 3件以上の場合）
  6. Devil's Advocate（過剰設計・代替案・リスク）
- 設計原則・アンチパターン表も `request.md` の定義通りに含める
- **出力フォーマット指示**をシステムプロンプトに含めること：
  - `## Findings Summary` テーブル（#/Severity/Category/Description 列）
  - `## Verdict: <approve|needs-discussion|reject>` 行
  - summary テキスト
  - 末尾に必ず ` ```json ` フェンスで以下のスキーマの JSON ブロックを出力すること：
    ```json
    {
      "verdict": "approve|needs-discussion|reject",
      "findings": [{"severity": "HIGH|MEDIUM|LOW", "category": "string", "description": "string"}],
      "summary": "string"
    }
    ```
- Verdict 導出ルール（HIGH 件数ベース）をシステムプロンプトに明記する：
  - HIGH が 0 件 → `approve`
  - HIGH が 1 件以上だが設計判断で解決可能 → `needs-discussion`
  - HIGH が複数かつ要件矛盾・構造破綻 → `reject`
- プロジェクト固有の設計観点: `<project-context>` タグ内の Tech Stack を読み、該当技術に応じた観点でレビューするよう指示する

---

## [x] T-02: `src/core/command/request-review.ts` を新規作成

**新規ファイル**: `src/core/command/request-review.ts`

### 2-a: 型定義

```typescript
export type RequestReviewVerdict = "approve" | "needs-discussion" | "reject";

export interface RequestReviewFinding {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  description: string;
}

export interface RequestReviewResult {
  verdict: RequestReviewVerdict;
  findings: RequestReviewFinding[];
  summary: string;
}
```

### 2-b: `parseReviewOutput(text: string): RequestReviewResult`

- 入力テキストから末尾の ` ```json ... ``` ` ブロックを正規表現で抽出
- `JSON.parse()` でデシリアライズ
- `verdict` が `"approve"|"needs-discussion"|"reject"` のいずれかであることを検証
- パース失敗 or 無効 verdict の場合は fallback として以下を返す：
  ```typescript
  {
    verdict: "needs-discussion",
    findings: [{ severity: "HIGH", category: "parse-error", description: "Could not parse structured output from reviewer" }],
    summary: text.slice(0, 500)   // 最初の500文字をサマリとして使用
  }
  ```

### 2-c: `verdictToExitCode(verdict: RequestReviewVerdict): number`

- `"approve"` → `0`
- `"needs-discussion"` → `0`
- `"reject"` → `1`

### 2-d: `buildInitialMessage(requestContent: string, projectContext: string): string`

- `<project-context>` タグで projectContext を囲む
- `<request>` タグで requestContent を囲む
- 「以下の request.md を architect 観点でレビューしてください」的な指示を含む

### 2-e: `executeReview(filePath: string, opts: { json: boolean }): Promise<number>`

実装順序：

1. `fs.readFile(filePath, "utf-8")` でファイルを読む。失敗時 stderr + return 1
2. `parseRequestMdContent(content, filePath)` でフォーマット検証。失敗時 stderr + return 1
3. `projectMdPath()` を `path.join(process.cwd(), ...)` で絶対パスに変換し読み込む。
   失敗時は `""` を使い、stderr に警告を出して続行
4. `loadConfig()` で config を読む。失敗時は `{}` を使う（init 未実行でも動作させる）
5. `getStepExecutionConfig(config, "request-review", { model: "claude-opus-4-5", maxTurns: 30, timeoutMs: 300_000 })` で resolvedModel を取得
6. `query()` を以下で呼ぶ：
   ```typescript
   import { query, type SDKMessage, type SDKResultMessage, type SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";
   const messages = query({
     prompt: buildInitialMessage(content, projectContext),
     options: {
       cwd: process.cwd(),
       allowedTools: ["Read", "Grep", "Glob"],
       permissionMode: "bypassPermissions",
       model: resolvedConfig.model,
       systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
     },
   });
   ```
7. `for await (message of messages)` でイテレート、`message.type === "result"` の最後のメッセージを `lastResult` に保持
8. `lastResult.subtype !== "success"` なら stderr + return 1
9. `parseReviewOutput((lastResult as SDKResultSuccess).result)` で `RequestReviewResult` を取得
10. `opts.json` が true の場合: `JSON.stringify(result, null, 2)` を stdout に書き出す
11. `opts.json` が false の場合: `(lastResult as SDKResultSuccess).result` を stdout に書き出す
12. `return verdictToExitCode(result.verdict)` で終了

---

## [x] T-03: `src/cli/command-registry.ts` を更新

**変更点**:

### 3-a: import 追加

```typescript
import { executeReview } from "../core/command/request-review.js";
```

`executeTemplate`, `executeValidate` と同じ行に追加する。

### 3-b: `request.subcommands` に `review` を追加

```typescript
review: {
  flags: {
    json: { type: "boolean" },
  },
  positional: { name: "file", required: true },
  handler: async (parsed) => {
    process.exit(await executeReview(parsed.positional!, { json: !!parsed.flags["json"] }));
  },
},
```

### 3-c: `USAGE` 文字列を更新

`request validate <file>` の行の次に以下を追加：
```
  request review <file> [--json]            Architect review of a request.md file
```

---

## [x] T-04: テストを新規作成

**新規ファイル**: `src/core/command/request-review.test.ts`

### テストケース

- `parseReviewOutput`: 正常な JSON ブロックを含む文字列からの抽出
- `parseReviewOutput`: JSON ブロックなし → fallback verdict (`needs-discussion`)
- `parseReviewOutput`: 無効な verdict 値 → fallback
- `verdictToExitCode`: approve → 0, needs-discussion → 0, reject → 1
- `buildInitialMessage`: requestContent と projectContext がそれぞれのタグで囲まれていることを確認

`executeReview()` 自体のテストは query() のモックが必要であり複雑なため、このスコープでは省略可。

---

## [x] T-05: delta spec 作成

**新規ファイル**: `specrunner/changes/request-review-command/delta-spec/cli-commands.md`

`cli-commands` baseline spec に対して以下の requirement を ADDED として追加する：

```
## ADDED

### R-request-review-command: `specrunner request review <file>` subcommand
- `specrunner request review <file>` サブコマンドを提供する
- `--json` フラグで構造化 JSON 出力（`{ verdict, findings[], summary }`）を返す
- フォーマット検証は `parseRequestMdContent()` で行い、不正なファイルは exit 1 で拒否する
- レビュー verdict: `approve` / `needs-discussion` / `reject` の 3 種
- exit code: approve=0, needs-discussion=0, reject=1
```

---

## 受け入れ基準（チェックリスト）

- [x] `specrunner request review <file>` が実行できる
- [x] verdict が `approve` / `needs-discussion` / `reject` のいずれかで返る
- [x] レビュー理由が具体的に stdout に出力される
- [x] `--json` で `{ verdict, findings[], summary }` スキーマの JSON が得られる
- [x] exit code: approve/needs-discussion=0, reject=1
- [x] `bun run typecheck && bun run test` が green
