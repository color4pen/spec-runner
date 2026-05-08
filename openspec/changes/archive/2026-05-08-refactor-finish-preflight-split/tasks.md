# Tasks: preflight.ts を 3 責務に分割し spawnOrEscalate ヘルパーを抽出する

## [x] T1: spawn-helper.ts の作成

**File**: `src/core/finish/spawn-helper.ts`（新規作成）

**内容**:
- `SpawnOrEscalateResult` 型を定義: `{ ok: true; stdout: string; stderr: string } | { ok: false; escalation: string }`
- `spawnOrEscalate` 関数を実装:
  - パラメータ: `spawn`, `cmd`, `args`, `cwd`, `failedStep`, `resumeCommand`, `recommendedAction?`
  - `spawn(cmd, args, { cwd })` 実行
  - `exitCode === 0` → `{ ok: true, stdout, stderr }`
  - `exitCode !== 0` → `formatEscalation` で `{ ok: false, escalation }` を生成
  - `detectedState` は `${cmd} ${args.join(" ")} failed (exit ${exitCode})` を自動構築
  - `recommendedAction` はカスタム値 or `Check error: ${stderr.trim()}. Then re-run: ${resumeCommand}`

**依存**: `escalation.ts`, `../../util/spawn.js`

---

## [x] T2: pr-status.ts の作成

**File**: `src/core/finish/pr-status.ts`（新規作成）

**移動元**: `preflight.ts` L252-406

**移動する要素**:
- `PrViewFetchResult` 型（L252-254）
- `fetchPrViewWithRetry` 関数（L256-343）
- `pollMergeStateAfterPush` 関数（L345-402）
- `sleep` ヘルパー（L404-406）
- 定数: `UNKNOWN_RETRY_COUNT`, `UNKNOWN_RETRY_DELAY_MS`, `POST_PUSH_RETRY_COUNT`, `POST_PUSH_RETRY_DELAY_MS`（L51-55）

**export**: `fetchPrViewWithRetry`, `pollMergeStateAfterPush`, `PrViewFetchResult` を直接 export（ForTest suffix なし）

**import**: `SpawnFn` from spawn, `PrViewData` from preflight（型のみ）, `formatEscalation` from escalation

**注意**: `PrViewData` は preflight.ts に残る型。pr-status.ts からは import する。

---

## [x] T3: branch-checkout.ts の作成

**File**: `src/core/finish/branch-checkout.ts`（新規作成）

**移動元**: `preflight.ts` L408-492

**移動する要素**:
- `CheckoutForValidationInput` interface（L412-416）
- `CheckoutForValidationResult` type（L418-420）
- `checkoutForValidation` 関数（L426-472）
- `RestoreBranchInput` interface（L474-478）— `warnFn` を追加
- `restoreBranch` 関数（L484-492）

**修正**:
- `RestoreBranchInput` に `warnFn?: (msg: string) => void` を追加
- `restoreBranch` 内の `process.stderr.write` を `warnFn ?? ((m) => process.stderr.write(m))` に置換
- `checkoutForValidation` 内の `git rev-parse`（L432）を `spawnOrEscalate` に置き換え

**export**: `checkoutForValidation`, `restoreBranch`, 型すべて

---

## [x] T4: preflight.ts の整理

**File**: `src/core/finish/preflight.ts`（既存修正）

**削除するコード**:
- L51-55: `UNKNOWN_RETRY_COUNT`, `UNKNOWN_RETRY_DELAY_MS`, `POST_PUSH_RETRY_COUNT`, `POST_PUSH_RETRY_DELAY_MS`
- L252-406: `PrViewFetchResult`, `fetchPrViewWithRetry`, `pollMergeStateAfterPush`, `sleep`
- L408-504: `CheckoutForValidationInput`, `CheckoutForValidationResult`, `checkoutForValidation`, `RestoreBranchInput`, `restoreBranch`, ForTest re-export 2 行

**追加する import**:
```typescript
import { fetchPrViewWithRetry } from "./pr-status.js";
import { checkoutForValidation, restoreBranch } from "./branch-checkout.js";
```

**PreflightInput の拡張**:
- `warnFn?: (msg: string) => void` を追加

**process.stderr.write の DI 化**:
1. `runPreflight` 冒頭で `const warn = input.warnFn ?? ((m: string) => process.stderr.write(m));` を定義
2. L173 の `process.stderr.write("Warning: feature branch has unpushed commits.\n")` → `warn("Warning: feature branch has unpushed commits.\n")`
3. `runChecks5and6` のパラメータに `warnFn` を追加し、L209 の `process.stderr.write(...)` → `warnFn(...)` に置換
4. `runPreflight` → `runChecks5and6` 呼び出し時に `warnFn: warn` を渡す

**spawnOrEscalate 適用**:
- `runChecks5and6` 内の `openspec validate` spawn（L219-230）を `spawnOrEscalate` に置き換え
  - `failedStep`: `"Phase 0 check 6 (openspec validate)"`
  - `recommendedAction`: カスタム（`Fix spec validation errors:\n${stderr}\nThen re-run: specrunner finish ${slug}`）

**結果**: preflight.ts は約 180-220 行に縮小（250 行以下の受け入れ基準を満たす）

---

## [x] T5: orchestrator.ts の更新

**File**: `src/core/finish/orchestrator.ts`（既存修正）

### 5a: import の変更

**Before** (L23-27):
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

### 5b: spawnOrEscalate 適用（6 箇所）

**checkoutFeatureBranch** (L339, L354):
- `git fetch origin <branch>` → `spawnOrEscalate({ ..., failedStep: "Phase 1 (git fetch)", resumeCommand: \`specrunner finish ${slug}\` })`
- `git checkout -B <branch> origin/<branch>` → `spawnOrEscalate({ ..., failedStep: "Phase 1 (git checkout -B)", ... })`
- `checkoutFeatureBranch` 関数全体が簡潔になる

**pushFeatureBranch** (L387):
- `git push origin <branch>` → `spawnOrEscalate({ ..., failedStep: "Phase 2 (git push)", ... })`

**mergeFeaturePrPhase3** (L429):
- `gh pr merge` → args 構築は既存のまま維持、spawn 部分のみ `spawnOrEscalate` に置換
- `failedStep: "Phase 3 (gh pr merge)"`

**Phase 4 checkout** (L264):
- `git checkout <baseBranch>` → `spawnOrEscalate({ ..., failedStep: \`Phase 4 (git checkout ${baseBranch})\`, ... })`

**Phase 4 pull** (L278):
- `git pull --ff-only` → `spawnOrEscalate({ ..., failedStep: "Phase 4 (git pull --ff-only)", ... })`

各置き換えで `if (!result.ok) return { exitCode: 1, escalation: result.escalation };` の共通パターンになる。

---

## [x] T6: テスト import の更新

**File**: `tests/unit/core/finish/preflight.test.ts`

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

テスト本体内の `fetchPrViewWithRetryForTest` → `fetchPrViewWithRetry`、`pollMergeStateAfterPushForTest` → `pollMergeStateAfterPush` に全置換。

**他のテストファイル**: `tests/finish-orchestrator.test.ts` は orchestrator のみ import しており変更不要。

---

## [x] T7: 検証

**Command**: `bun run typecheck && bun run test`

**チェックリスト**:
- [x] `bun run typecheck` — 型エラーなし
- [x] `bun run test` — 全テスト pass（133 files, 1294 tests）
- [x] preflight.ts が 250 行以下（248 行）
- [x] pr-status.ts に `fetchPrViewWithRetry`, `pollMergeStateAfterPush` が export されている
- [x] branch-checkout.ts に `checkoutForValidation`, `restoreBranch` が export されている
- [x] orchestrator.ts が `pr-status.js` から直接 import している（ForTest suffix なし）
- [x] `spawnOrEscalate` が orchestrator.ts (6) + branch-checkout.ts (1) で合計 7 箇所使用されている

---

## タスク依存関係

```
T1 (spawn-helper.ts)  ─┐
                        ├─→ T4 (preflight.ts 整理)  ─┐
T2 (pr-status.ts)    ──┤                              ├─→ T6 (テスト import) → T7 (検証)
                        ├─→ T5 (orchestrator.ts 更新) ─┘
T3 (branch-checkout.ts)┘
```

T1, T2, T3 は並行実施可能。T4, T5 は T1-T3 の完了後。T6 は T4, T5 の完了後。T7 は最後。
