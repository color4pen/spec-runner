# Design: timeout-enforcement

## Overview

ADR-0013 で撤廃された wall-clock timeout を「デフォルト null（無制限）、ユーザー設定時のみ有効」として再有効化する。
併せて StepRun の startedAt / endedAt が同一タイムスタンプになるバグを修正する。

## D1: StepRun の実行時間記録修正

### 現状（バグ）

`executor.ts` L140 で `completedAt` を `runner.run()` の **前** に取得し、
`helpers.ts` の `pushStepResult()` L92-93 で `startedAt` と `endedAt` の両方にこの同一タイムスタンプを代入している。
結果、全 StepRun の実行時間が 0ms として記録される。

CLI ステップ (`runCliStep()` L314) も同じパターンで `completedAt` を `step.run()` の前に取得している。

### 修正方針

1. `StepResultInput` に `startedAt?: string` フィールドを追加
2. `pushStepResult()` で `partial.startedAt` を `startedAt` に、`partial.completedAt` を `endedAt` に使用
3. `executor.ts` の `runAgentStep()`:
   - `runner.run()` の **前** に `startedAt = new Date().toISOString()` を取得
   - 現在の `completedAt` 取得位置（L140）を `runner.run()` の **後** に移動
   - `finalizeStep()` と `recordFailedStepResult()` の全呼び出しに `startedAt` を追加
4. `executor.ts` の `runCliStep()`:
   - `step.run()` の前に `startedAt`、後に `completedAt` を取得
5. `recordFailedStepResult()` は `partial` を透過的に渡すため、呼び出し元が `startedAt` を含めれば動作する（シグネチャ変更不要）
6. `finalizeStep()` のシグネチャに `startedAt` を追加し、`pushStepResult()` に渡す

### 影響範囲

| File | Change |
|------|--------|
| `src/state/helpers.ts` | `StepResultInput` に `startedAt` 追加、`pushStepResult()` で使用 |
| `src/core/step/executor.ts` | `runAgentStep()` と `runCliStep()` のタイムスタンプ取得位置修正、`finalizeStep()` シグネチャ変更 |

型定義（`StepRun` in `schema.ts`）は変更しない。

## D2: timeoutMs の再有効化

### 現状

ADR-0013 により timeoutMs は「silently ignore」の方針。
ただし adapter のコード上は AbortController / timeoutMs パラメータの配線が **既に存在** しており、
config の 4-level resolution chain も timeoutMs を解決する。
したがって、コード変更なしで config 設定が adapter に到達する状態にある。

### Adapter 別の既存配線と本 request での変更

| Adapter | メカニズム | 既存配線 | 本 request での変更 |
|---------|-----------|---------|-------------------|
| Claude Code | AbortController + setTimeout → `abortController` を `query()` に渡す | ✅ 完備（L115-119） | **なし** |
| Codex | AbortController + setTimeout → `signal` を `thread.run()` に渡す | ✅ 完備（L121-125） | **なし** |
| Managed Agent | `pollUntilComplete()` の `timeoutMs` パラメータ | ⚠️ 配線あり、ただし poll timeout と step timeout が混在 | **分離が必要**（D3） |

### デフォルト動作

- config に timeoutMs 未設定 → `null`（無制限）。従来通り無制限で実行
- config に timeoutMs を設定 → adapter が自身の SDK メカニズムで実施
- タイムアウト発生 → `completionReason: "timeout"` → executor が `awaiting-resume` に遷移（既存ハンドリング）

## D3: Managed Agent の poll timeout と step timeout の分離

### 現状

`agent-runner.ts` の SSE polling fallback (L193-196) と polling-style (L438-441) で
`DEFAULT_POLL_TIMEOUT_MS` (15 min) を `getStepExecutionConfig()` の step default として渡している:

```typescript
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
  timeoutMs: DEFAULT_POLL_TIMEOUT_MS,  // ← poll timeout を step default に混入
});
```

これにより config 未設定時でも timeoutMs が 15 分に解決され、
「デフォルト null（無制限）」の方針と矛盾する。

### 修正方針

step default から `timeoutMs: DEFAULT_POLL_TIMEOUT_MS` を除去し、config resolution のデフォルトを null にする。
`pollUntilComplete()` への引数は `resolvedConfig.timeoutMs > 0` のガードを使い、
user config が正の値で設定されていればそれを使い、未設定（null）または 0 の場合は poll timeout のフォールバック（15 min）を維持する。

`??` (nullish coalescing) は `0` をそのまま返すため使用しない。
config validator は `timeoutMs >= 0` を許可しており（`0 = disable timeout` のコメントあり）、
`0` を渡すと `pollUntilComplete()` が即時 `PollTimeoutError` を返すため、Claude Code / Codex adapter の
`resolvedConfig.timeoutMs > 0` ガードと一致する挙動にするため `> 0` チェックを採用する。

```typescript
// Before
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
  timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
});
const timeoutMs = resolvedConfig.timeoutMs === 0 ? null : resolvedConfig.timeoutMs;

// After
const resolvedConfig = getStepExecutionConfig(config, step.name, {
  model: step.agent.model,
});
const effectiveTimeoutMs =
  resolvedConfig.timeoutMs && resolvedConfig.timeoutMs > 0
    ? resolvedConfig.timeoutMs
    : DEFAULT_POLL_TIMEOUT_MS;
```

### 影響範囲

| File | Change |
|------|--------|
| `src/adapter/managed-agent/agent-runner.ts` | SSE polling fallback (L193-196) と polling-style (L438-442) の 2 箇所 |

`DEFAULT_POLL_TIMEOUT_MS` の値（900,000ms = 15 min）は変更しない。
`pollUntilComplete()` / `completion.ts` のコードも変更しない。

## D3b: store.ts の legacy timeoutMs stripping 除去

ADR-0013 supersede に伴い、`src/config/store.ts` L99-109 の `specReview` / `specFixer` から
`timeoutMs` を write 時に strip するコードを削除する。

このコードは ADR-0013 の「silently ignore」方針のもとで追加されたもの。
本 request で方針を撤廃するため、strip コードも撤廃して認知矛盾を解消する。

`steps` 配下の `timeoutMs` は元から strip 対象外（config resolution で活用される）。

| File | Change |
|------|--------|
| `src/config/store.ts` | L99-109 の specReview / specFixer 用 timeoutMs strip ブロックを削除 |

## D4: ADR-0013 の Supersede と新 ADR

- ADR-0013 の status を `superseded` に変更し、後継 ADR への参照を追加
- 新 ADR（ADR-0014）で「timeoutMs をデフォルト null で再有効化した」旨を記録

## Non-Goals

- timeoutMs のデフォルト値の変更（null のまま）
- cancel コマンドの実装（#61）
- ps コマンドへの経過時間表示
- AbortController の共有ヘルパー抽出（`src/adapter/shared/`）
- DEFAULT_POLL_TIMEOUT_MS の値変更
