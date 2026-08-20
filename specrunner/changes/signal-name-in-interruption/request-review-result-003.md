# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. `src/core/runtime/local.ts:1683-1721` — `signalCleanup`

- 1683 行目: `const signalCleanup = async (): Promise<void> => {` — 引数なしの非同期関数として定義 ✓
- 1695-1699 行目: `store.appendInterruption({ type: "interruption", reason: "signal", ts: ... })` — `reason: "signal"` 固定 ✓
- 1701-1702 行目: `trigger: "signal-handler"`, `reason: "Interrupted by signal"` — message 固定 ✓
- 1717 行目: `process.exit(130)` — exit code 固定 ✓
- 1720-1721 行目: `process.on("SIGINT", signalCleanup)` / `process.on("SIGTERM", signalCleanup)` — SIGHUP 未登録 ✓

### 2. `src/core/runtime/managed.ts:741-776` — managed `signalCleanup`

- 741 行目: `const signalCleanup = async (): Promise<void> => {` — 引数なし ✓
- 746-757 行目: `transitionJob(... { trigger: "signal-handler", reason: "Interrupted by signal", ... resumePoint: { reason: "Interrupted by signal" } })` — message 固定 ✓
- 762 行目: `process.exit(130)` ✓
- 765-766 行目: `process.on("SIGINT", signalCleanup)` / `process.on("SIGTERM", signalCleanup)` — SIGHUP 未登録 ✓
- `teardown()` 772-783 行目: `process.off("SIGINT", internals.signalCleanup)` / `process.off("SIGTERM", internals.signalCleanup)` — 775-776 行 ✓
- 補足: managed.ts は `appendInterruption` を呼ばず `managedLocalStore` 経由の persist のみ行う（request の "journal へ追記" は local.ts に関する記述として正確）

### 3. `src/core/lifecycle/exit-guard.ts:65,71,134,140,164`

- L65: `handleNoWorktreeExit` 内の `appendInterruption({ reason: "signal" })` ✓
- L71: `resumePoint: { reason: "signal" }` ✓
- L134: `handlePerJobExit` 内の `appendInterruption({ reason: "signal" })` ✓
- L140: `resumePoint: { reason: "signal" }` ✓
- L164: `handleGlobalExit` 内の `resumePoint: { reason: "signal" }` ✓（global 経路は `appendInterruption` なし）

### 4. `src/core/resume/canon-provenance.ts:27-32` — `INTERRUPTION_REASONS`

- L27-32: `INTERRUPTION_REASONS = new Set(["signal", "timeout", "failure", "exhaustion"])` — `reason` 値のみを照合する Set として定義 ✓
- L53: `INTERRUPTION_REASONS.has(resumePoint.reason)` — フィールド追加は判定に影響しない ✓

### 5. SIGHUP 未登録の確認

`src/` 全体を grep した結果、SIGHUP への言及はゼロ。要件通りに未登録 ✓

### 6. `InterruptionRecord` 型定義の確認

`src/store/event-journal.ts:90-98`:
```typescript
export interface InterruptionRecord {
  type: "interruption";
  reason: "timeout" | "signal" | "failure" | "exhaustion";
  errorCode?: string;
  exhaustionPhase?: string;
  ts: string;
}
```
現状 `signal` フィールドなし。要件1の実装では `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` 追加が必要（request は "フィールドを追加" と明示しており、型更新が含意される）。

### 7. Node.js signal handler の引数仕様

`process.on("SIGINT", handler)` の handler は `(signal: NodeJS.Signals) => void` シグネチャで呼ばれる。現状 `signalCleanup = async (): Promise<void> => {}` と引数なし宣言で捨てている。要件の記述は正確 ✓

## 検証できなかった項目

None — すべての主要な code assertion を直接確認した。

## Findings 詳細

None — すべてのコードアサーションが正確であり、要件・受け入れ基準・スコープ外の記述に矛盾なし。exit-guard が `beforeExit` 起点であるため signal 名を持てない点は、`signal` フィールドをオプショナルとして定義することで自然に解決可能であり、acceptance criteria も exit-guard の signal 名記録を明示的に要求していない。実装上の考慮事項であり request の欠陥ではない。
