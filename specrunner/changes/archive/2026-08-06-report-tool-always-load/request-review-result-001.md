# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 現状コードの前提（コードアサーション）

| アサーション | 確認結果 |
|---|---|
| `agent-runner.ts:531-533` — `createMcpServerFn({ name, tools })` に `alwaysLoad` なし | ✓ 確認（lines 531–547 を読んだ） |
| `agent-runner.ts:582-585` — `allowedTools` は `["Read","Grep","Glob"]` + MCP tool 名 | ✓ 確認 |
| `agent-runner.ts:529` — `this.injectedCreateMcpServerFn` 経由でファクトリを差し替え可能 | ✓ 確認 |
| `agent-runner.ts:392` — `CreateMcpServerFn` 型エクスポート | ✓ 確認 |
| `agent-runner.ts:399` — `_createMcpServerFn?: CreateMcpServerFn` in `ClaudeCodeRunnerDeps` | ✓ 確認 |
| `agent-runner.ts:429` — コンストラクタで `this.injectedCreateMcpServerFn = deps._createMcpServerFn` | ✓ 確認 |
| `workspace-tool-guard.test.ts:115-119` — `makeMockCreateMcpServerFn()` 存在 | ✓ 確認（lines 115–119 を読んだ） |
| `workspace-tool-guard.test.ts:396` — テスト内で `_createMcpServerFn` 注入 | ✓ 確認 |
| `sdk.d.ts:434` — `CreateSdkMcpServerOptions` に `alwaysLoad?: boolean` | ✓ 確認 |
| `sdk.d.ts:431` — per-tool `tool({ alwaysLoad })` 言及 | ✓ 確認（comment lines 431–432） |

### SDK 型構造の確認

- `createSdkMcpServer` は `McpSdkServerConfigWithInstance` を返す。型は `type: 'sdk'` を持つ。
- `McpStdioServerConfig` は `command`/`args` を持ち `type?: 'stdio'`。
- `McpSSEServerConfig` は `url` を持ち `type: 'sse'`。
- `McpHttpServerConfig` は `url` を持ち `type: 'http'`。
- 受け入れ基準「`command`/`args` を持たず、`url` を持たない」は SDK の型構造と整合する。

### スコープ外「起動時間の実測」の適切性確認

- スコープ外 item 4 が「起動時間（wall-clock）の実測比較」を明示的に除外し、根拠を説明している。
- 要件 4 が代替として構造テスト（report server が in-process SDK MCP server であること）を規定。
- sdk.d.ts:940 のコメントが「blocking は外部サーバーへの接続待ち（上限 5 秒）」と明記しており、in-process であれば blocking 経路が存在しないことを型定義が裏付けている。
- architect 評価済みセクションで「却下: 起動時間の wall-clock 実測」が詳細な理由付きで文書化されている。

### 要件完全性の確認

- 要件 1: 実装変更（`alwaysLoad: true` を options に追加）— 一行変更で完結、アサーション精度高い。
- 要件 2: unit test で `alwaysLoad: true` を assert — 既存の注入経路を使うため追加工数が小さく明確。
- 要件 3: 設定による切り替えなし（固定 true）— 実装上の判断不要。
- 要件 4: report server が in-process SDK server であることを assert — `type: 'sdk'` の確認、または `command`/`url` の不在確認で実装可能。
- 受け入れ基準 5 件がすべて要件に対応し、機械的に検証可能。

## 検証できなかった項目

None

## Findings 詳細

None — 指摘なし。
