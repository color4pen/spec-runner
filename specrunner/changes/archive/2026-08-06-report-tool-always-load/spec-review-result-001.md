# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード前提の確認

1. `agent-runner.ts:531-547` — `createMcpServerFn({ name, tools: [...] })` を読んで確認。`alwaysLoad` が渡っていないことを実証した。
2. `agent-runner.ts:582-585` — `allowedTools` が `["Read", "Grep", "Glob"]` に report tool の MCP 名を加えた構造であることを確認。
3. `agent-runner.ts:392, 399, 429` — `_createMcpServerFn` が `ClaudeCodeRunnerDeps` にあり、コンストラクタで `this.injectedCreateMcpServerFn` に格納されていることを確認。
4. `agent-runner.ts:529` — `this.injectedCreateMcpServerFn ?? (await this.loadSdkFn()).createSdkMcpServer` の分岐でモック注入が成立することを確認。
5. `agent-runner.ts:614` — `reportMcpServer` が truthy のときのみ `mcpServers` キーが `queryOptions` に追加されるスプレッド構文を確認。
6. `workspace-tool-guard.test.ts:115-119` — `makeMockCreateMcpServerFn()` が存在し `{ type: "sdk", name, instance: {} }` 形式を返すことを確認。
7. `sdk.d.ts:425-434` — `CreateSdkMcpServerOptions.alwaysLoad?: boolean` の型定義と「全 tool を常に prompt に含め tool search に deferred されない」旨の doc comment を確認。
8. `sdk-loader.ts:10` — `ClaudeSdkCreateMcpServer` が `(params: Record<string, unknown>) => unknown` と緩い型で定義されていることを確認。

### 既存テストカバレッジの確認

9. TC-FW-06 (`workspace-tool-guard.test.ts:285-378`) — `reportTool` なし時に `allowedTools` に `mcp__specrunner_report__*` が含まれないことを assert しているが、`mcpServers` キーの absence や `_createMcpServerFn` 呼び出し有無は assert していないことを確認。→ T-04 で追加が必要。
10. TC-FW-07 (`workspace-tool-guard.test.ts:385-423`) — `reportTool` あり時に `allowedTools` に `mcp__specrunner_report__report_result` が含まれることを assert しているが、`alwaysLoad` や server 形式は assert していないことを確認。→ T-02 / T-03 で追加が必要。

### セキュリティ観点

11. 本変更は MCP server 生成時のフラグ追加のみ。認証変更・入力バリデーション変更・データアクセス変更はなし。OWASP Top 10 該当なし。

### 設計判断の整合性確認

12. server 単位の `alwaysLoad: true` は tool が 1 つのみのため per-tool 指定と等価であること、却下された代替案（config toggle, disallowedTools, per-tool 指定）の棄却理由が合理的であることを確認。
13. in-process SDK MCP server の「5 秒ブロック」リスクは外部プロセス接続待ちに起因するものであり、in-process では当該経路が存在しないことを設計文書で確認。T-03 がこれを構造として固定することを確認。

## 検証できなかった項目

- 実 run（opus session）での `ToolSearch` 排除確認 — 設計上スコープ外（request.md に明示）。
- `alwaysLoad: true` 追加前後の実際のキャッシュ挙動差 — CI では検証不可、スコープ外に明示あり。

## Findings 詳細

### observation-01: `ClaudeSdkCreateMcpServer` の緩い型により TypeCheck は `alwaysLoad` の型を検証しない

`sdk-loader.ts:10` の `ClaudeSdkCreateMcpServer` 型は `(params: Record<string, unknown>) => unknown` と定義されており、`alwaysLoad` フィールドの型（`boolean`）は typecheck では検証されない。T-01 の受け入れ基準に「typecheck が green（`CreateSdkMcpServerOptions.alwaysLoad?: boolean` に適合）」と記述されているが、この typecheck は `alwaysLoad: "true"` のような型誤りも通過してしまう。実際の保護は T-02 の unit test（値の assert）が担う。blocking ではないが実装者が混乱する可能性があるため記録する。

### observation-02: TC-FW-06 は `mcpServers` キーの absence を直接 assert していない

`reportTool` が未設定の場合のテスト（TC-FW-06）は `allowedTools` の不在を間接的に確認するのみで、`capturedParams.options.mcpServers` の undefined を直接 assert していない。T-04 は「既存テストで assert されていない場合に追加」と記載されており、実装者は追加の assert が必要と判断できるが、間違えると TC-FW-06 の `allowedTools` チェックで「十分」と判断する恐れがある。T-04 の完了条件は明確に `mcpServers` 不在の assert を要求しており、実装者が読む限り問題ない。参考情報として記録する。
