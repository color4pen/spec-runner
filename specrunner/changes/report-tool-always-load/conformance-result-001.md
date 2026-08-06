# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. request.md 受け入れ基準

| 基準 | 確認箇所 | 結果 |
|------|----------|------|
| `createMcpServerFn` 呼び出しが `alwaysLoad: true` を含む | `agent-runner.ts:533` | ✅ |
| `alwaysLoad: true` を assert する unit test が存在し、削除すると fail する | TC-001（`toMatchObject`）、TC-004（厳密等値 `toBe(true)`） | ✅ |
| `reportTool` 未設定時に MCP server を生成しないことをテストで固定 | TC-003 が `capturedCalls.toHaveLength(0)` と `mcpServers` 不在を assert | ✅ |
| report server が stdio / SSE / HTTP 形式でないことを assert するテストが存在する | TC-002 が `command` / `url` 不在と `type === "sdk"` を確認 | ✅ |
| 既存テストが無変更で green | verification-result.md: 10596 tests passed (1 skipped) | ✅ |
| `typecheck && test` が green | verification-result.md: typecheck・test 両 phase passed | ✅ |

### 2. design.md 設計判断

| 判断 | 実装箇所 | 結果 |
|------|----------|------|
| D1: `createSdkMcpServer` 呼び出しに `alwaysLoad: true` | `agent-runner.ts:531-548` | ✅ |
| D2: `alwaysLoad: true` を unit test で assert | TC-001 / TC-004 | ✅ |
| D3: report server が in-process であることを unit test で固定 | TC-002 | ✅ |

### 3. tasks.md チェックボックス

T-01〜T-05 すべて `[x]` 完了済み。

### 4. spec.md 要件 vs 実装

| 要件 | シナリオ | テスト | 結果 |
|------|---------|--------|------|
| report MCP server は alwaysLoad: true で生成されなければならない | reportTool が設定されている場合に alwaysLoad: true が渡る | TC-001 | ✅ |
| report MCP server は in-process の SDK MCP server でなければならない | report server が外部プロセス形式でない | TC-002 | ✅ |
| reportTool が未設定の場合は MCP server を生成してはならない | reportTool が undefined の場合に MCP server が生成されない | TC-003 | ✅ |

### 確認ポイント補足

- `REPORT_MCP_SERVER_NAME = "specrunner_report"`（`agent-runner.ts:477`）はテスト（TC-002 のキー）と一致している。
- `agent-runner.ts:615` の条件付き展開 `...(reportMcpServer ? { mcpServers: { [...] } } : {})` により、`reportTool` が falsy な場合は `mcpServers` が queryOptions に含まれないことが構造的に保証されている。
- TC-004 は `capturedCalls[0]?.["alwaysLoad"] === true` の厳密等値で assert しており、`alwaysLoad` を削除すると `undefined !== true` で確実に fail する。

## 検証できなかった項目

None。すべての判断項目を確認できた。

## Findings 詳細

None。指摘なし。
