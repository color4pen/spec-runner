# Design: preflight.ts を 3 責務に分割し spawnOrEscalate ヘルパーを抽出する

## 設計方針

1. **責務ごとにファイルを分離**: preflight.ts に残すのは Phase 0 チェックの orchestration のみ
2. **共通パターンの関数化**: spawn → exitCode → escalation を spawnOrEscalate に集約
3. **テスト容易性の向上**: process.stderr.write を DI 化、ForTest re-export を廃止

## D1: ファイル分割設計

### preflight.ts（残存 — 推定 220 行）

```
runPreflight()              — Phase 0 orchestrator
runChecks5and6()            — Check 5+6 helper
checkBinaries()             — Check 7 helper
PreflightInput, PreflightResult, PrViewData, Checks5and6Result, BinaryCheckResult — 型
```

`fetchPrViewWithRetry` と `checkoutForValidation`/`restoreBranch` は import 経由で呼び出す。

### pr-status.ts（新設 — 推定 155 行）

```
fetchPrViewWithRetry()      — Check 3+4 (gh pr view + UNKNOWN retry)
pollMergeStateAfterPush()   — Phase 2 後のポーリング
sleep()                     — 内部ヘルパー
PrViewFetchResult           — 型
UNKNOWN_RETRY_COUNT, UNKNOWN_RETRY_DELAY_MS    — 定数
POST_PUSH_RETRY_COUNT, POST_PUSH_RETRY_DELAY_MS — 定数
```

両関数を直接 export する。ForTest suffix は不要。

### branch-checkout.ts（新設 — 推定 75 行）

```
checkoutForValidation()     — feature branch checkout
restoreBranch()             — 元ブランチ restore
CheckoutForValidationInput, CheckoutForValidationResult, RestoreBranchInput — 型
```

### spawn-helper.ts（新設 — 推定 35 行）

```
spawnOrEscalate()           — spawn + exitCode + escalation の共通化
SpawnOrEscalateResult       — 型
```

## D2: spawnOrEscalate ヘルパー設計

### インターフェース

```typescript
import type { SpawnFn } from "../../util/spawn.js";
import { formatEscalation } from "./escalation.js";

export type SpawnOrEscalateResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; escalation: string };

export async function spawnOrEscalate(params: {
  spawn: SpawnFn;
  cmd: string;
  args: string[];
  cwd: string;
  failedStep: string;
  resumeCommand: string;
  /** Override default recommended action (default: stderr + resumeCommand) */
  recommendedAction?: string;
}): Promise<SpawnOrEscalateResult>;
```

### 動作

1. `spawn(cmd, args, { cwd })` を実行
2. `exitCode === 0` → `{ ok: true, stdout, stderr }` を返す
3. `exitCode !== 0` → `formatEscalation` で escalation 文字列を構築し `{ ok: false, escalation }` を返す
   - `detectedState`: `${cmd} ${args.join(" ")} failed (exit ${exitCode})` を自動生成
   - `recommendedAction`: カスタム値があればそれを使用、なければ `Check error: ${stderr.trim()}. Then re-run: ${resumeCommand}` を生成

### 適用箇所（8 箇所）

**orchestrator.ts（6 箇所）**:

| 箇所 | 現在の行 | コマンド | 備考 |
|------|---------|---------|------|
| checkoutFeatureBranch | L339 | `git fetch origin <branch>` | |
| checkoutFeatureBranch | L354 | `git checkout -B <branch>` | |
| pushFeatureBranch | L387 | `git push origin <branch>` | |
| mergeFeaturePrPhase3 | L429 | `gh pr merge` | args 構築後に呼び出し |
| Phase 4 checkout | L264 | `git checkout <baseBranch>` | |
| Phase 4 pull | L278 | `git pull --ff-only` | |

**preflight.ts（2 箇所）**:

| 箇所 | 現在の行 | コマンド | 備考 |
|------|---------|---------|------|
| runChecks5and6 | L219 | `openspec validate <slug>` | recommendedAction カスタム |
| checkoutForValidation | L432 | `git rev-parse --abbrev-ref HEAD` | branch-checkout.ts に移動後に適用 |

### 非適用箇所

以下は spawnOrEscalate に置き換え**ない**:

- `checkBinaries` の `which` — 戻り値が `BinaryCheckResult` で構造が異なる
- `fetchPrViewWithRetry` の `gh pr view` — retry ループ内で JSON parse と分岐があり単純化不可
- `pollMergeStateAfterPush` の `gh pr view` — escalation ではなく空文字列を返す
- `restoreBranch` の `git checkout` — escalation ではなく warning
- Phase 4 の `git branch -D`, `git push origin --delete` — warning のみ
- `checkoutForValidation` の `git checkout` + `git checkout -b` — two-step fallback パターン

## D3: orchestrator.ts の import 変更

**Before**:
```typescript
import {
  runPreflight,
  fetchPrViewWithRetryForTest as fetchPrViewWithRetry,
  pollMergeStateAfterPushForTest as pollMergeStateAfterPush,
} from "./preflight.js";
```

**After**:
```typescript
import { runPreflight } from "./preflight.js";
import { fetchPrViewWithRetry, pollMergeStateAfterPush } from "./pr-status.js";
import { spawnOrEscalate } from "./spawn-helper.js";
```

ForTest suffix alias は完全に除去される。

## D4: warnFn DI 設計

### PreflightInput の拡張

```typescript
export interface PreflightInput {
  target: ResolvedTarget;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  dryRun: boolean;
  sleepFn?: (ms: number) => Promise<void>;
  /** Warning output function (defaults to process.stderr.write). */
  warnFn?: (msg: string) => void;
}
```

### 適用箇所

1. `runPreflight` L173: `process.stderr.write("Warning: feature branch has unpushed commits.\n")`
   → `warnFn("Warning: feature branch has unpushed commits.\n")`

2. `runChecks5and6` L209: `process.stderr.write("Warning: openspec/changes/...")`
   → `warnFn` を runChecks5and6 のパラメータに追加して受け渡す

### restoreBranch の process.stderr.write

`restoreBranch` は `branch-checkout.ts` に移動する。同ファイル内で `warnFn` パラメータを `RestoreBranchInput` に追加し、デフォルト値 `process.stderr.write` を使用する。

## D5: テスト import の更新

### tests/unit/core/finish/preflight.test.ts

**Before**:
```typescript
import {
  runPreflight,
  fetchPrViewWithRetryForTest,
  pollMergeStateAfterPushForTest,
} from "../../../../src/core/finish/preflight.js";
```

**After**:
```typescript
import { runPreflight } from "../../../../src/core/finish/preflight.js";
import {
  fetchPrViewWithRetry,
  pollMergeStateAfterPush,
} from "../../../../src/core/finish/pr-status.js";
```

`ForTest` suffix なしの直接 import。テスト内の変数名 `fetchPrViewWithRetryForTest` → `fetchPrViewWithRetry` に置換。

### tests/finish-orchestrator.test.ts

orchestrator test は `runFinishOrchestrator` のみ import しており、preflight からの直接 import はない。変更不要。

## データフロー（分割後）

```
runFinishOrchestrator (orchestrator.ts)
  ├── runPreflight (preflight.ts)
  │     ├── checkBinaries (preflight.ts)
  │     ├── fetchPrViewWithRetry (pr-status.ts)
  │     ├── runChecks5and6 (preflight.ts)
  │     ├── checkoutForValidation (branch-checkout.ts)  ← managed mode only
  │     └── restoreBranch (branch-checkout.ts)          ← managed mode only
  ├── checkoutFeatureBranch (orchestrator.ts) → spawnOrEscalate
  ├── pushFeatureBranch (orchestrator.ts)     → spawnOrEscalate
  ├── pollMergeStateAfterPush (pr-status.ts)
  ├── mergeFeaturePrPhase3 (orchestrator.ts)  → spawnOrEscalate
  └── Phase 4 cleanup                        → spawnOrEscalate
```

## リスク分析

| リスク | 影響度 | 対策 |
|--------|--------|------|
| import パス変更漏れ | 中 | typecheck で全検出可能 |
| spawnOrEscalate の detectedState 文字列変更 | 低 | テストが escalation 文字列を exact match していなければ影響なし。部分一致テストのみ |
| warnFn 未渡しによるランタイムエラー | 低 | デフォルト値 `process.stderr.write` を設定 |
| branch-checkout.ts の循環依存 | なし | escalation.ts のみ依存、一方向 |
