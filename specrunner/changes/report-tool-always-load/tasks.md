# Tasks: report tool を alwaysLoad にして ToolSearch 経由の cache 全破棄を止める

## T-01: `createMcpServerFn` 呼び出しに `alwaysLoad: true` を追加

対象ファイル: `src/adapter/claude-code/agent-runner.ts`

- [x] `agent-runner.ts:531-533` の `createMcpServerFn({ name: REPORT_MCP_SERVER_NAME, tools: [...] })` 呼び出しに `alwaysLoad: true` を追加する

変更前:
```ts
reportMcpServer = createMcpServerFn({
  name: REPORT_MCP_SERVER_NAME,
  tools: [ ... ],
});
```

変更後:
```ts
reportMcpServer = createMcpServerFn({
  name: REPORT_MCP_SERVER_NAME,
  alwaysLoad: true,
  tools: [ ... ],
});
```

**Acceptance Criteria**:
- `agent-runner.ts` の `createMcpServerFn` 呼び出しが `alwaysLoad: true` を含む
- `typecheck` が green（`CreateSdkMcpServerOptions.alwaysLoad?: boolean` に適合）

## T-02: `alwaysLoad: true` が渡ることを assert する unit test を追加

対象ファイル: `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`

`makeMockCreateMcpServerFn()` を拡張してキャプチャできる版を作るか、既存 mock を差し替える形で options を捕捉し、`alwaysLoad: true` を assert するテストを追加する。

- [x] `_createMcpServerFn` に渡す mock を「受け取った options を変数に保存して返す」形に作る（`makeMockCreateMcpServerFn` を拡張するか、新規の helper 関数を追加）
- [x] `reportTool` が設定されたコンテキストで `ClaudeCodeRunner.run()` を実行し、mock が受け取った options に `alwaysLoad: true` が含まれることを assert する
- [x] テスト説明文に TC 番号を付与する（例: `TC-FW-08` 等、既存 TC 番号と重複しない番号を使う）

**Acceptance Criteria**:
- `_createMcpServerFn` に渡された options が `alwaysLoad: true` を含むことを assert するテストが存在する
- T-01 の変更で `alwaysLoad: true` を削除すると当該テストが fail する
- `test` が green

## T-03: report server が in-process であることを assert する unit test を追加

対象ファイル: `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`

`queryOptions.mcpServers` に登録された report server オブジェクトが外部プロセス形式・ネットワーク形式でないことを assert する。

- [x] `queryFn` に渡された `options.mcpServers` を捕捉する（既存の `capturedParams` 機構を流用可能）
- [x] `options.mcpServers[REPORT_MCP_SERVER_NAME]` が存在することを assert する
- [x] そのオブジェクトが `command` プロパティを持たないことを assert する（stdio 形式でない）
- [x] そのオブジェクトが `url` プロパティを持たないことを assert する（SSE/HTTP 形式でない）
- [x] （オプション）`type === "sdk"` のように in-process であることをより直接的に示せる場合は追加 assert する

**Acceptance Criteria**:
- `queryOptions.mcpServers` に載る report server が stdio 形式でも SSE/HTTP 形式でもないことを assert するテストが存在する
- `test` が green

## T-04: `reportTool` が未設定の場合に MCP server が生成されないことを確認

対象ファイル: `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`

- [x] 既存テストで `ctx.policy?.reportTool` が undefined の場合に `_createMcpServerFn` が呼ばれないこと、または `queryOptions.mcpServers` が含まれないことが既に assert されているか確認する
- [x] 上記 assert が存在しない場合のみ、新規テストを追加する（存在する場合は「確認済み」とコメントを残すだけでよい）

**Acceptance Criteria**:
- `ctx.policy?.reportTool` が undefined の step では `_createMcpServerFn` が呼ばれず、`queryOptions` に `mcpServers` が含まれないことが既存または新規テストで固定されている
- `test` が green

## T-05: 全テスト・型チェックの通過確認

- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green であることを確認する（`src/adapter/claude-code/__tests__/` の既存テストを含む）

**Acceptance Criteria**:
- `typecheck && test` が green
- `src/adapter/claude-code/__tests__/` の既存テストが無変更で green
