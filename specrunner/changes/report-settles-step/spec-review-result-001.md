# Spec Review Result: report-settles-step

**Reviewer**: spec-review step  
**Date**: 2026-08-16

---

## 検証した項目

### spec.md 構造検証

| 検証観点 | 結果 |
|---------|------|
| 全 Requirement に SHALL / MUST (normative keyword) が存在する | ✅ 5 件全件 |
| 全 Requirement に少なくとも 1 件の Scenario (Given/When/Then) が存在する | ✅ 7 Scenario |
| 各 Requirement の header が `### Requirement:` 形式 | ✅ |
| Layer-0 (型・FSM 強制) の内容が混入していない | ✅ |

### request.md 要件 → spec.md マッピング

| request 要件 | 対応 spec Requirement | 状態 |
|-------------|----------------------|------|
| 要件 1: report 受領を主契機に | Requirement: report 受領が step 完了の主契機になる | ✅ |
| 要件 2: grace 付きの脱出 | 同上 (grace logic) + Requirement: grace 内自然終了時 usage 回収 | ✅ |
| 要件 3: sessionId の早期確保 | Requirement: sessionId を最終 result より前に確保し grace 後 abort でも postWork を resume する | ✅ |
| 要件 4: abort 経路で受領済み report を破棄しない | Requirement: abort catch 経路は受領済み report を破棄しない | ✅ |
| 要件 5: report 不在時 fallback 不変 | Requirement: report 不在時の fallback 挙動は不変である | ✅ |
| 要件 6: codex adapter 対象外 | スコープ外として spec 外 (正しい) | ✅ |

### request.md 受け入れ基準 → test-cases.md マッピング

| 受け入れ基準 | TC | 状態 |
|------------|-----|------|
| ok:true 受領 grace 後 success | TC-001 | ✅ |
| ok:false 受領 grace 後 success | TC-002 | ✅ |
| sessionId 早期確保 + grace 後 postWork resume | TC-004 | ✅ |
| grace 内自然終了 modelUsage 回収 | TC-003 | ✅ |
| report 不在 generator 終了 → report retry 不変 | TC-007 | ✅ |
| report 不在 watchdog → STEP_TIMEOUT halt (既存 green) | TC-006 | ✅ |
| typecheck && test green | TC-009 | ✅ |

### 現状コードの前提検証 (request.md 記載のライン番号)

| 前提 | 検証結果 |
|-----|---------|
| `:563-588` — handler が `capturedToolResult` に格納し loop を抜けない | ✅ handler は parse 成功時のみ代入し return するだけ、break なし |
| `:677-707` — loop 終了条件は generator 終了のみ (capturedToolResult で break しない) | ✅ break 条件は agentRedirectCounter > 3 のみ |
| `:1136-1154` — watchdog abort catch が `completionReason: "timeout"` / `toolResult: null` を返す | ✅ 実測 |
| `:904-921` — `extractedSessionId` は最終 success result からのみ代入 | ✅ `extractedSessionId = successResult.session_id` (line 919) |
| `:931-951` — report retry は `resume: extractedSessionId` で走る | ✅ 実測 |
| `:955-967` — postWork prompts も `resume: extractedSessionId` で走る | ✅ 実測 |
| `inactivity-watchdog.ts:12` — `DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 = 900_000ms` | ✅ 実測 |

### executor の verdict 導出確認

`src/core/step/step-completion.ts:166-234`: reportTool を持つ step の verdict は `toolResult` から排他的に導出される。`resultContent` は prose-parse path のみで使用。design D3/D5 の「executor 側の変更が不要」前提が型・実装の両面で成立することを確認。✅

### SDK 型定義の確認

| 型 | session_id |
|---|-----------|
| `SDKSystemMessage` (subtype: init) — SDK 公開型 | `session_id: string` (required) ✅ |
| `SDKResultSuccess` — SDK 公開型 | `session_id: string` (required) ✅ |
| `SDKUserMessage` — SDK 公開型 | `session_id?: string` (optional) ⚠️ |
| `SDKResultSuccess` — プロジェクト内ローカル typedef (agent-runner.ts:374-379) | `session_id?: string` (optional) — SDK 公開型と相違 |

`SDKSystemMessage` (init) の session_id は required。実際の session では init が先頭メッセージとして届く前提が成立しており、早期確保の実用上の根拠として十分。

### テスト注入パターンの互換性

既存テスト (`agent-runner-timeout-last-tool.test.ts`) の `hangingQueryFn` は `params.options.abortController?.signal` をリッスンして abort で reject する。設計 D2 では main work turn に `mainQueryAbort` を渡すため、`params.options.abortController` = `mainQueryAbort` になる。watchdog → shared.abort() → 伝播 → mainQueryAbort.abort() → `hangingQueryFn` の Promise が reject → 既存テストの TC-006 挙動を再現できる。✅

### design.md D1〜D7 内部一貫性

各判断の Rationale と Alternatives considered を照合。7 つの選択は互いに矛盾しない。`completionReason` に新値を追加しないという D5 の判断と `AgentRunResult.completionReason: "success" | "error" | "timeout"` 型定義は整合。✅

---

## 検証できなかった項目

| 項目 | 理由 |
|-----|------|
| SDK session の実際の先頭 message が常に `SDKSystemMessage` (init) かどうか | `@anthropic-ai/claude-agent-sdk` は dist のみ参照可能。ランタイム動作は実行せずには確認不可 |
| vitest fake timer と D2 `mainQueryAbort` + D4 grace timer の組み合わせ下での決定論性 | 実行なしでは確認不可。既存テストの二段前進 (`advanceTimersByTimeAsync(100)` → `advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS)`) のパターンが grace timer 追加後も成立するか不明 |

---

## Findings 詳細

### Finding 1: design.md D4 の "SDK の全 message は `session_id` を持つ" は SDKUserMessage と不整合

**Severity**: medium  
**File**: specrunner/changes/report-settles-step/design.md

design.md の「確定している前提」セクションに「SDK の全 message は `session_id` を持つ (`SDKSystemMessage` init 等)。最初の SDK message で sessionId は判明しており、最終 result を待つ必要はない。」と記載されている。

しかし SDK 公開型定義 (`sdk.d.ts`) では `SDKUserMessage.session_id?: string` (optional) であり、「全 message」という表現は技術的に不正確。

影響の確認:
- `SDKSystemMessage` (init) は `session_id: string` (required) → 先頭 message からの early capture は実用上成立する
- T-02 のタスク記述は `(string かつ非空)` ガードで正しく補正されているため実装への直接影響なし
- spec.md の対応記述「session 初期化 message 等、`session_id` を持つ最初の message」は正確

design.md 側の当該文を「SDKSystemMessage (init) を含む大多数の message は `session_id` を持ち、先頭 (init) からの early capture が可能」等の正確な表現に修正することを推奨する。

### Finding 2: test-cases.md TC-005 は D5 catch path に到達するテスト構成が未記述

**Severity**: low  
**File**: specrunner/changes/report-settles-step/test-cases.md

TC-005 は「report 受領後に hard abort が発火しても report を保全する」を対象とする。これは design D5 の outer catch 経路 (shared abort が grace timer より先に発火するケース) を指す。

一方 TC-001/TC-002 (D3 grace path) は「grace timer が mainQueryAbort を abort → catch inside runQuery が settledByReport=true かつ shared 未 abort → 正常 return」という異なる経路。

D5 catch path を TC-001 と区別してテストするには `REPORT_SETTLE_GRACE_MS` 経過より先に shared abort を発火させる必要がある (watchdog の 900s > grace の 60s なので timer 前進だけでは不可)。tasks.md T-06/TC-F に「grace より watchdog を先に到達させる構成、または main の hang を shared abort 経由で解く構成」という代替案が記載されているが、test-cases.md の TC-005 エントリにはこの情報がなく TC ドキュメントとして単独では完結していない。

修正案: TC-005 の記述に「検証方法: REPORT_SETTLE_GRACE_MS より短い wall-clock timeout を設定するか、shared abort を direct に call し、D3 grace path (mainQueryAbort のみ abort) と区別する」等の一文を追記する。
