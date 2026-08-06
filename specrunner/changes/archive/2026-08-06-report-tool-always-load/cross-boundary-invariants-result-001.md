# Cross-Boundary Invariants Review Result — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## レビュー観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

## 変更スコープ

```
src/adapter/claude-code/agent-runner.ts          +1 行（alwaysLoad: true を追加）
src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts  +262 行（TC-001〜TC-004 + ヘルパー）
```

## 検証した境界

### 境界 1: `createMcpServerFn` → 返り値 → `queryOptions.mcpServers`

`createMcpServerFn({ ..., alwaysLoad: true, ... })` の返り値は `McpSdkServerConfigWithInstance`（`{ type: 'sdk'; name: string; instance: McpServer }`）である。`alwaysLoad` は SDK 内部で tool metadata（`_meta['anthropic/alwaysLoad']`）として消費されるため、返り値オブジェクトに `alwaysLoad` フィールドは存在しない。

確認: `sdk.d.ts:954-957` の `McpSdkServerConfig = { type: 'sdk'; name: string; }` と `McpSdkServerConfigWithInstance = McpSdkServerConfig & { instance: McpServer }` を参照。

**結論**: `queryOptions.mcpServers.specrunner_report` の shape は変更前後で同一（`command` / `url` 不在）。他のコードがこのオブジェクトを参照している箇所はなく、boundary 違反なし。

### 境界 2: `alwaysLoad: true` と report-retry turn (`retryOptions`)

`agent-runner.ts:877-891`（変更なし）:
```ts
const retryOptions: Record<string, unknown> = {
  ...queryOptions,
  resume: extractedSessionId,
};
// Remove MCP server from retry options to avoid re-registering
// (the closure is still active so tool calls will be captured)
await runFollowUpQueryWithRetry(retryPrompt, retryOptions);
```

コメントには "Remove MCP server from retry options" とあるが、`delete retryOptions["mcpServers"]` は存在しない。`mcpServers` は retry turn にも引き継がれる。

この動作は変更前から存在する。`alwaysLoad: true` を加えた後は、retry turn でも report tool が即時ロードされる（ToolSearch 不要）。report_result の retry が目的の turn で report tool が確実に利用可能であることは、むしろ正しい挙動である。

**結論**: `alwaysLoad: true` の追加は retry turn 挙動を改善するが、不変条件を破らない。コメントは stale だが pre-existing であり、今回の変更が引き起こしたものではない（observation に記録）。

### 境界 3: `alwaysLoad: true` と postWork turn (`followUpOptions`)

`agent-runner.ts:899-904`（変更なし）:
```ts
const followUpOptions: Record<string, unknown> = {
  ...queryOptions,
  resume: extractedSessionId,
};
delete followUpOptions["mcpServers"];
```

postWork turn では `mcpServers` が明示的に削除される。`alwaysLoad: true` の追加は、このパスに何も影響しない。

**結論**: 不変条件維持。

### 境界 4: `ClaudeSdkCreateMcpServer` 型と typecheck の保護範囲

`sdk-loader.ts:10` の型定義:
```ts
export type ClaudeSdkCreateMcpServer = (params: Record<string, unknown>) => unknown;
```

この緩い型は `alwaysLoad` フィールドを型としては検証しない。SDK の `CreateSdkMcpServerOptions.alwaysLoad?: boolean` に適合しているかは typecheck では保証されず、TC-001 / TC-004 の unit test が行動的に保護している。

**結論**: pre-existing の設計。今回の変更が新たな未保護境界を作ったわけではない。

### 境界 5: `REPORT_MCP_SERVER_NAME` 定数とテストの文字列リテラル

`agent-runner.ts:477` に `const REPORT_MCP_SERVER_NAME = "specrunner_report"` がローカル定数として定義される。TC-002 はこれを `"specrunner_report"` の文字列リテラルで参照する。定数が変更された場合、テストが実行時に fail して検出できる。

**結論**: 文字列の重複は許容範囲内。不変条件違反なし。

## 検証できなかった項目

- 実 run（opus session）での ToolSearch 排除・cache hit 挙動 — request.md のスコープ外として明示済み。

## Findings 詳細

指摘なし。

## Observations

### observation-01: report-retry turn の stale コメント（pre-existing）

`agent-runner.ts:881-882` のコメント "Remove MCP server from retry options to avoid re-registering" は `delete retryOptions["mcpServers"]` が存在しないにもかかわらず "Remove" と記述している。実際の挙動（`mcpServers` を含めたまま retry する）は report_result retry の目的に対して正しい。`alwaysLoad: true` の追加によってこの挙動はさらに改善されるが、将来の開発者がコメントを "バグ修正" として削除を試みる恐れがある。

このコメントは今回の変更で導入されたものではなく、本 PR の修正対象外である。記録にとどめる。
