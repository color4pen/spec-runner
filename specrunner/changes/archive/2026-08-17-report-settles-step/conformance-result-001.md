# Conformance Result — report-settles-step — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### spec.md — Requirements & Scenarios

| Requirement | Scenario | 確認方法 | 結果 |
|---|---|---|---|
| report 受領が step 完了の主契機 | ok:true → grace → success settle | TC-001 (agent-runner-report-settles.test.ts:L158) + 実装 L703-710 追跡 | ✓ |
| report 受領が step 完了の主契機 | ok:false → grace → success settle | TC-002 (L204) + 実装追跡 | ✓ |
| grace 内自然終了 → usage 回収 | 受領後 grace 内に自然終了 → modelUsage 回収 | TC-003 (L247) + 実装 L987-1004 追跡 | ✓ |
| sessionId を最終 result より前に確保 | grace 後 abort でも postWork が resume で走る | TC-004 (L305) + 実装 L726-733, L1033-1037 追跡 | ✓ |
| abort catch 経路は受領済み report を破棄しない | hard abort 後も report 保全 (D5) | TC-005 (L370) + 実装 L1217-1233 追跡 | ✓ |
| report 不在時の fallback 不変 | report 不在 watchdog → STEP_TIMEOUT halt | TC-006 (L423) + 実装 L1235-1253 追跡 | ✓ |
| report 不在時の fallback 不変 | report 不在 generator 終了 → report retry 不変 | TC-007 (L534) + 実装 L1009-1028 追跡 | ✓ |

### request.md — 受け入れ基準

| 基準 | 対応 TC | 結果 |
|---|---|---|
| report(ok:true) → grace → success settle テスト固定 | TC-001 | ✓ |
| report(ok:false) → same settle テスト固定 | TC-002 | ✓ |
| sessionId 早期確保 + grace 後 postWork resume テスト固定 | TC-004 | ✓ |
| grace 内自然終了 → modelUsage 回収テスト固定 | TC-003 | ✓ |
| report 不在 fallback 不変テスト固定 (既存テスト無改変 green) | TC-006, TC-007, verification-result.md | ✓ |
| typecheck && test green | verification-result.md: build/typecheck/test/lint passed | ✓ |

### 実装詳細 — 主要ポイント確認

- **L69**: `export const REPORT_SETTLE_GRACE_MS = 60_000` — 60 秒固定定数、JSDoc 付き (D6 ✓)
- **L589-596**: handler が `capturedToolResult` 設定直後に `armReportGrace?.()` 呼び出し (T-04 ✓)
- **L685-695**: `mainQueryAbort` (専用 AbortController) 生成 + shared→main propagation listener `{ once: true }` (T-03 ✓)
- **L700**: `settledByReport` flag で grace 発火済みを管理
- **L703-710**: grace timer closure — idempotent, `REPORT_SETTLE_GRACE_MS` 後に `settledByReport = true` + `mainQueryAbort.abort()`
- **L716**: main work turn の queryFn 呼び出しに `mainQueryAbort` を渡す (shared とは別インスタンス)
- **L726-733**: for-await ループで `!extractedSessionId` のとき `message.session_id` から早期確保 (T-02 ✓)
- **L762-770**: inner catch で grace-exit 判定 (`settledByReport && !abortController.signal.aborted`) → 正常 return (D3 happy-path 合流 ✓)
- **L773-778**: finally で `clearTimeout(graceTimerId)` + `removeEventListener` + `armReportGrace = null` (leak 防止 ✓)
- **L845**: resume fallback 時に `extractedSessionId = undefined` でリセット (T-02 fallback session 対応 ✓)
- **L1003**: `extractedSessionId = successResult.session_id ?? extractedSessionId` (早期確保値を上書きしない ✓)
- **L1217-1233**: D5 branch — `abortController.signal.aborted && capturedToolResult !== null` → `completionReason: "success"` + `toolResult: capturedToolResult`、`clearTimeout(timeoutId)` 実施 (T-05 ✓)
- **L1235-1253**: D5 非対象の既存 timeout 分岐は無改変 (R5 fallback 不変 ✓)
- postWork prompts / output-repair turn の queryOptions は `...queryOptions` spread で shared `abortController` を継承 (T-03 ✓)

### スコープ確認

- codex adapter: 無改変 ✓
- inactivity-watchdog: 無改変 ✓
- executor / port 型: 無改変 ✓
- `completionReason` に新値なし ("success" を維持) ✓

## 検証できなかった項目

None

## Findings 詳細

None
