# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

| アサーション | 実測 |
|---|---|
| `agent-runner.ts:563-588` capturedToolResult 閉包キャプチャ | ✓ lines 562–588 — MCP handler が parseResult.ok の場合に capturedToolResult にセット、コメント「accessed after the query loop」あり |
| `agent-runner.ts:677-680` for-await ループに capturedToolResult 抜け出し条件なし | ✓ line 677–707 — `for await` ループ内に capturedToolResult チェックなし、ループ終了は generator 終了のみ |
| `agent-runner.ts:1136-1154` watchdog abort catch が `toolResult: null` を返す | ✓ line 1143–1154 — `completionReason: "timeout"`, `toolResult: null` で返却、閉包の capturedToolResult を無視 |
| `agent-runner.ts:904-921` sessionId/metrics を最終 success result からのみ抽出 | ✓ lines 903–921 — `lastResult.subtype === "success"` の場合のみ extractedSessionId / extractedMetrics をセット |
| `agent-runner.ts:931-951` report retry が `resume: extractedSessionId` で走る | ✓ lines 931–950 — `if (reportTool && capturedToolResult === null && extractedSessionId)` で retry、`resume: extractedSessionId` を使用 |
| `inactivity-watchdog.ts:12` DEFAULT_INACTIVITY_TIMEOUT_MS = 900 秒 | ✓ `15 * 60 * 1000` = 900,000ms = 900s |
| `codex/agent-runner.ts:15-16,164-184` codex は finalResponse が report | ✓ lines 15-16 は codex-typed-outcome comment、lines 163–198 は tryExtractToolResult 関数、outputSchema 方式で session が残留しない構造を確認 |

### SDK 型定義検証（session_id の早期取得可能性）

`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` を確認。`session_id` は `SDKAssistantMessage`（type: 'assistant'）、各種 system サブタイプメッセージ等、generator が閉じる前に到着するメッセージに含まれる。要件 3（extractedSessionId の早期確保）は SDK の実際の型と整合する。

### 既存テスト構造確認

`agent-runner-timeout-last-tool.test.ts` の TC-005/006/007 は report なし + watchdog 発火のシナリオを検証済み。これらのモック generator は success result のみを yield し、新機能（grace タイマー・早期 sessionId キャプチャ）は別コードパスに分岐するため、既存テストは無改変で green が見込める（AC #5 の "(既存テスト無改変で green)" 条件）。

### 設計判断の整合性

- grace 固定値 60s（YAGNI 正当化あり）
- immediate abort を採用しない理由（正常系の usage 回収保持）が要件と整合
- watchdog に report 受領 bump を足さない（意味論の分離）
- completionReason に新値を増やさない（executor 契約不変）

いずれも要件・受け入れ基準と矛盾しない。

### 受け入れ基準の完結性確認

6 件の AC すべてが要件 1〜5 に対応し、テストで機械検証可能な振る舞いを名指ししている。

## 検証できなかった項目

- issue #1003 の実測（「4 attempt 連続、うち 1 attempt は report 受領済みの完了状態を破棄」）— 外部観察、コードから確認不可
- abort teardown による子プロセスの道連れ動作（実測ゼロゾンビ）— 実行環境依存

## Findings 詳細

None
