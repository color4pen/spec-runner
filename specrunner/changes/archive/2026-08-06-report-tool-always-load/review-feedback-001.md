# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装変更（`src/adapter/claude-code/agent-runner.ts`）

`git diff main...HEAD -- src/adapter/claude-code/agent-runner.ts` で確認。差分は 1 行：

```diff
 reportMcpServer = createMcpServerFn({
   name: REPORT_MCP_SERVER_NAME,
+  alwaysLoad: true,
   tools: [
```

`REPORT_MCP_SERVER_NAME` 定数が渡される MCP server factory の呼び出しに `alwaysLoad: true` を追加している。配置は T-01 の「変更後」コードと完全一致。

### テスト追加（`src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`）

262 行追加。TC-001〜TC-004 および `makeCapturingCreateMcpServerFn()` ヘルパーを確認。

**TC-001**（alwaysLoad: true が渡る）
- `makeCapturingCreateMcpServerFn()` で options を捕捉
- `expect(capturedCalls[0]).toMatchObject({ alwaysLoad: true })` で assert
- `capturedCalls` の長さも `toHaveLength(1)` で固定（余分な呼び出しなし）

**TC-002**（in-process 構造の固定）
- `queryOptions.mcpServers["specrunner_report"]` に `command` / `url` がないことを assert
- 同じ server オブジェクトの `type === "sdk"` を別 `it` ブロックで直接 assert

**TC-003**（reportTool 未設定時に MCP server を生成しない）
- `policy: {}` で `reportTool` を渡さない
- `capturedCalls` が空（`toHaveLength(0)`）であることを assert
- `"mcpServers" in opts` が false であることを assert

**TC-004**（回帰ガード）
- TC-001 と同構造だが `toBe(true)`（厳密等値）で assert
- `alwaysLoad` を省略すると `capturedCalls[0]?.["alwaysLoad"]` が `undefined` になり fail する設計

### 受け入れ基準の照合

| 受け入れ基準 | 結果 |
|---|---|
| `createMcpServerFn` 呼び出しが `alwaysLoad: true` を含む | ✅ agent-runner.ts L533 |
| `alwaysLoad: true` を含むことを assert する unit test が存在し、削除で fail する | ✅ TC-001（toMatchObject）+ TC-004（toBe(true)）|
| reportTool undefined では MCP server を生成しないことがテストで固定されている | ✅ TC-003（createMcpServerFn 呼び出しなし、mcpServers キーなし）|
| report server が stdio/SSE 形式でないことを assert するテストが存在する | ✅ TC-002（command/url 不在 + type === "sdk"）|
| 既存テストが無変更で green | ✅ verification-result.md: 10596 tests passed |
| `typecheck && test` が green | ✅ 両フェーズとも passed |

### test-cases.md との照合

must 5 件（TC-001〜TC-004、TC-005 gate）はすべて実装・通過済み。
TC-006（should、既存テスト gate）も verification で pass 確認。

## 検証できなかった項目

- request.md のスコープ外として明示されている「修正後 opus セッションでの ToolSearch 非出現」「cache_read_input_tokens の実測」は CI 内では検証不可。レビュー対象外。

## Findings 詳細

指摘なし。
