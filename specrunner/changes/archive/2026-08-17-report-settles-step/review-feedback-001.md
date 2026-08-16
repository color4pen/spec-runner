# Code Review Feedback — report-settles-step — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 範囲

- `git diff main...HEAD --stat` で 17 ファイル変更を確認。
- 実装変更: `src/adapter/claude-code/agent-runner.ts` (+157 -32)
- 新規テスト: `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts` (+515)

### 実装確認 (agent-runner.ts)

**T-01 (REPORT_SETTLE_GRACE_MS)**:
- module scope に `export const REPORT_SETTLE_GRACE_MS = 60_000` が定義されている。
- JSDoc が D6 (設定化しない) の理由を記述している。

**T-02 (sessionId 早期確保)**:
- `for await` ループ内で `!extractedSessionId` ガードのもと各メッセージから `session_id` を確保。
- 最終 success result での代入が `successResult.session_id ?? extractedSessionId` に変更されており、早期確保値を上書きしない。

**T-03 (main 専用 AbortController)**:
- `runQuery` 内で `mainQueryAbort = new AbortController()` を生成。
- shared → main の一方向伝播を `{ once: true }` リスナーで実装。
- `finally` で `removeEventListener` を呼んでリーク防止。
- postWork / output-repair は `queryOptions` をスプレッドして shared を継承したまま。

**T-04 (grace timer + grace-exit)**:
- `run()` スコープに `armReportGrace` 可変参照を宣言。
- handler 内で `armReportGrace?.()` を呼び、受領の瞬間に grace を arm する。
- `runQuery` 内で `armReportGrace` に closure を代入（一度だけ arm するよう `graceFired` フラグでガード）。
- grace 発火時: `settledByReport = true` → `mainQueryAbort.abort()`。
- inner catch: `settledByReport && !abortController.signal.aborted` なら正常 return（happy path へ合流）。
- `finally` で `clearTimeout(graceTimerId)` と `armReportGrace = null`。

**T-05 (D5: abort catch で report 保全)**:
- outer catch の `abortController.signal.aborted && capturedToolResult !== null` 分岐を追加。
- この分岐は `completionReason: "success"` + 受領済み `toolResult` を返す。
- `capturedToolResult === null` の場合は既存の STEP_TIMEOUT 経路へ fall-through。

**T-06 (テスト)**:
- TC-001〜TC-007 の全 7 ケースが実装されている。
- fake-timer + `hangingQueryFn` の作法を流用し、handler 呼び出しをテスト側から制御している。
- step timeout (TC-005) は `config.steps.implementer.timeoutMs = 5000` で解決チェーン経由。

### 検証 (verification-result.md)

- build / typecheck / test / lint / changed-line-coverage: すべて passed。
- `agent-runner-timeout-last-tool.test.ts` は既存テストとして無改変 green が維持されている（test 通過で確認）。

### TC-005 (D5 到達経路) の論理追跡

1. `getHandler()!({ ok: true })` → `capturedToolResult` set, `armReportGrace()` → 60s timer arm
2. step timeout (5s) → `abortController.abort()` → propagation listener → `mainQueryAbort.abort()`
3. `for await` throw → inner catch: `settledByReport = false`, `abortController.signal.aborted = true` → re-throw
4. `finally`: `clearTimeout(graceTimerId)` で 60s timer をキャンセル
5. outer catch: `abortController.signal.aborted && capturedToolResult !== null` → D5 → success

D5 到達経路と test-cases.md TC-005 の構成が一致している。

### 受け入れ基準の充足確認

| 受け入れ基準 | TC | 状態 |
|------------|-----|------|
| ok:true 受領後 grace 経過 → success settle | TC-001 | ✓ |
| ok:false 受領 → executor へ渡る | TC-002 | ✓ |
| sessionId 早期確保 + grace 後 postWork resume | TC-004 | ✓ |
| grace 内自然終了 → modelUsage 回収 | TC-003 | ✓ |
| report 不在 watchdog → STEP_TIMEOUT 不変 | TC-006 | ✓ |
| report 不在 generator 終了 → retry 経路不変 | TC-007 | ✓ |
| typecheck && test green | — | ✓ |

## 検証できなかった項目

None。

## Findings 詳細

### F-001 (low / fixable): `graceFired` 変数名が「arm済み」を「発火済み」と読ませる

**File**: `src/adapter/claude-code/agent-runner.ts` (line 698–710)

```typescript
let graceFired = false;   // ← 実態は "graceArmed"
let settledByReport = false;

armReportGrace = () => {
  if (graceFired) return; // already armed — idempotent
  graceFired = true;      // arm した時点で true になる
  graceTimerId = setTimeout(() => {
    settledByReport = true;   // ← こちらが "grace が発火した" の実態
    mainQueryAbort.abort();
  }, REPORT_SETTLE_GRACE_MS);
};
```

`graceFired` は grace タイマーを *arm した* ときに true になるが、名前は grace が *発火した* と読める。実際に「発火した」を示す変数は `settledByReport` (setTimeout コールバック内)。
コメント "already armed — idempotent" が正しい意図を述べているが変数名が食い違っている。

inner catch の `settledByReport && !abortController.signal.aborted` はタイミング依存のクリティカルパスであり、保守時に両変数の意味を混同するリスクがある。

**修正案**: `graceFired` → `graceArmed` に改名。

---

### 観察事項 (non-blocking)

**O-001: report retry で `delete retryOptions["mcpServers"]` が欠落 (pre-existing)**

`src/adapter/claude-code/agent-runner.ts` line 1009–1015 のコメント:
> "Remove MCP server from retry options to avoid re-registering"

と記されているが、`delete retryOptions["mcpServers"]` が存在しない。
postWork セクション (line 1036) は `delete followUpOptions["mcpServers"]` を正しく実行しており、
report retry セクションのみ欠落している。

本変更の diff 外 (pre-existing) のため今回の finding には含まない。フォローアップを推奨する。
