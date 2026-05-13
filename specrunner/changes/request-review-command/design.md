# Design: request-review-command

## Overview

`specrunner request review <file>` を stateless な one-shot architect レビューコマンドとして実装する。
Pipeline machinery（StepExecutor / AgentStep / JobState）を一切使わず、
SDK の `query()` を直接呼び出す独立コマンド。

## Component Structure

### New Files

| File | Role |
|------|------|
| `src/prompts/request-review-system.ts` | architect レビュー用システムプロンプト |
| `src/core/command/request-review.ts` | `RequestReviewVerdict` 型定義 + `executeReview()` 関数 |

### Modified Files

| File | Change |
|------|--------|
| `src/cli/command-registry.ts` | `request.subcommands.review` エントリを追加 |

**`src/core/command/request.ts` は変更しない。** `executeReview` は独立ファイルに置き、`command-registry.ts` から直接インポートする。

## Type Definitions

`RequestReviewVerdict` は pipeline の `Verdict`（`"approved" | "needs-fix" | ...`）とは完全に独立して定義する。

```typescript
// src/core/command/request-review.ts

/** pipeline の Verdict とは独立した verdict 型 */
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

## Data Flow

```
CLI: specrunner request review <file> [--json]
  │
  ▼
command-registry.ts
  └─ executeReview(filePath, { json })
       │
       ├─ 1. readFile(filePath)
       │      └─ parseRequestMdContent()  ← フォーマット検証（subprocess なし）
       │
       ├─ 2. readFile(path.join(cwd, projectMdPath()))
       │      └─ projectContext: string
       │
       ├─ 3. loadConfig() → getStepExecutionConfig("request-review", defaults)
       │      └─ resolvedModel: string
       │
       ├─ 4. query({ prompt, options: { systemPrompt, model, allowedTools, ... } })
       │      └─ for await (message) → lastResult (SDKResultSuccess)
       │
       ├─ 5. parseReviewOutput(lastResult.result)
       │      └─ RequestReviewResult { verdict, findings, summary }
       │
       └─ 6. output + process.exit(verdictToExitCode(verdict))
```

## query() Invocation Pattern

```typescript
import {
  query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";

const messages = query({
  prompt: buildInitialMessage(requestContent, projectContext),
  options: {
    cwd: process.cwd(),
    allowedTools: ["Read", "Grep", "Glob"],   // read-only architect exploration
    permissionMode: "bypassPermissions",
    model: resolvedModel,
    systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
  },
});

let lastResult: SDKResultMessage | null = null;
for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
  if (message.type === "result") {
    lastResult = message as SDKResultMessage;
  }
}
```

`SDKResultSuccess.result: string` がエージェントの最終テキスト出力。
これをパースして `RequestReviewResult` に変換する。

## System Prompt Design (`src/prompts/request-review-system.ts`)

エージェントに以下を指示する：

1. **現状分析**: 既存アーキテクチャ・パターンの確認（Read/Grep/Glob で探索）
2. **要件整理**: 機能要件・非機能要件・統合ポイントの整理
3. **設計評価**: コンポーネント責務・データモデル・API 契約の評価
4. **トレードオフ分析**: Pros / Cons / Alternatives / Recommendation
5. **Domain Synthesis**（findings 3件以上）: クラスタリング + 統合抽象の提案
6. **Devil's Advocate**: 過剰設計・代替案・隠れたコスト・リスク

**出力フォーマット指示**（エージェントへの指示として）：

```markdown
## Findings Summary
| # | Severity | Category | Description |

## Domain Cluster（クラスタが識別された場合のみ）

## Alternative Proposals

## Verdict: <approve|needs-discussion|reject>
<summary>

```json
{
  "verdict": "approve",
  "findings": [{"severity": "HIGH", "category": "...", "description": "..."}],
  "summary": "..."
}
```

最後の ```json ブロックをパースして `RequestReviewResult` を構築する。

## Output Parsing Strategy (`parseReviewOutput`)

エージェント出力からの抽出手順：

1. 末尾の ` ```json ... ``` ` ブロックを正規表現で抽出
2. `JSON.parse()` で `RequestReviewResult` にデシリアライズ
3. `verdict` が有効値（"approve"|"needs-discussion"|"reject"）か検証
4. パース失敗時は `needs-discussion` verdict + エラー findings を返す（throw しない）

## Config Resolution

```typescript
// Step name "request-review" で解決。既存の step-config resolution chain を再利用。
const config = await loadConfig().catch(() => ({} as SpecRunnerConfig));
const resolved = getStepExecutionConfig(config, "request-review", {
  model: "claude-opus-4-5",   // hardcoded step default
  maxTurns: 30,
  timeoutMs: 300_000,         // 5分
});
```

config.json がない場合（init 未実行）でも動作するよう、loadConfig() のエラーを握り潰して空 config を使う。

## CLI Integration

`src/cli/command-registry.ts` の `request.subcommands` に `review` を追加：

```typescript
review: {
  flags: {
    json: { type: "boolean" },
  },
  positional: { name: "file", required: true },
  handler: async (parsed) => {
    const { executeReview } = await import("../core/command/request-review.js");
    process.exit(await executeReview(parsed.positional!, { json: !!parsed.flags["json"] }));
  },
},
```

また `USAGE` 文字列に以下を追記する：
```
  request review <file> [--json]            Review a request.md file with architect perspective
```

## Output Behavior

| Mode | stdout | stderr | exit |
|------|--------|--------|------|
| default (no --json) | エージェントの full markdown output | エラー時のみ | 0 or 1 |
| `--json` | `{"verdict":..., "findings":..., "summary":...}` のみ | エラー時のみ | 0 or 1 |

**Exit code**:
- `approve` → 0
- `needs-discussion` → 0  （Unix 慣例準拠：非エラー）
- `reject` → 1

**Default mode の出力**: `lastResult.result` をそのまま stdout に書き出す。エージェントが末尾に JSON ブロックを含めるため、テキスト出力の中に構造化情報も含まれる。

**JSON mode の出力**: `lastResult.result` からパースした `RequestReviewResult` を `JSON.stringify(result, null, 2)` で stdout に書き出す。

## Error Handling

| Error | Response |
|-------|----------|
| ファイル読み込み失敗 | stderr + exit 1 |
| request.md フォーマット不正 | `executeValidate` と同じ形式で stderr + exit 1 |
| project.md 不在 | 警告を stderr に出し、空文字で続行 |
| query() 失敗 | stderr + exit 1 |
| JSON パース失敗 | `needs-discussion` verdict として exit 0 で返す |

## Non-Goals

- ファイル出力なし（stateless）
- 状態管理なし
- worktree 不要（cwd = process.cwd()）
- git 操作なし
