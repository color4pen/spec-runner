# Design: runFinishOrchestrator をフェーズ関数に分割する

## 設計方針

純粋な Extract Method リファクタリング。振る舞い不変。同ファイル内の module-private 関数として抽出し、`runFinishOrchestrator` を Phase 呼び出しのディスパッチャに縮小する。

## 関数設計

### runPhase1Archive

**責務**: feature branch の checkout（worktree なし時のみ）→ openspec archive → requests dir move

```typescript
async function runPhase1Archive(params: {
  target: ResolvedTarget;
  operationCwd: string | null;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  stdoutWrite: (msg: string) => void;
}): Promise<PhaseResult>
```

**内部フロー**:
1. `!operationCwd` → `checkoutFeatureBranch()` 呼び出し
2. `archiveCwd = operationCwd ?? cwd`
3. `archiveOpenspec({ slug, cwd: archiveCwd, spawn, fs })`
4. `moveRequestsDir({ slug, cwd: archiveCwd, spawn, fs })`

既存 L142-183 のコードを移動。

### runPhase2Push

**責務**: git push → post-push polling → DIRTY guard

```typescript
type Phase2Result =
  | { ok: true; mergeStateAfterPush: string }
  | { ok: false; escalation: string; exitCode: 1 };

async function runPhase2Push(params: {
  target: ResolvedTarget;
  operationCwd: string | null;
  cwd: string;
  spawn: SpawnFn;
  baseBranch: string;
  prViewData: PrViewData;
  stdoutWrite: (msg: string) => void;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<Phase2Result>
```

**内部フロー**:
1. `pushFeatureBranch()` 呼び出し（既存ヘルパー）
2. `pollMergeStateAfterPush()` で mergeState 取得
3. DIRTY → escalation を返す
4. 成功時は `{ ok: true, mergeStateAfterPush }` を返す

既存 L185-219 のコードを移動。Phase 3 が `mergeStateAfterPush` を必要とするため、返り値の型を `PhaseResult` から拡張した `Phase2Result` にする。

### runPhase4Finalize

**責務**: worktree cleanup / checkout main+pull / branch 削除 / markJobArchived

```typescript
async function runPhase4Finalize(params: {
  target: ResolvedTarget;
  operationCwd: string | null;
  cwd: string;
  spawn: SpawnFn;
  baseBranch: string;
  worktreeManagerFn?: () => WorktreeManager;
  stdoutWrite: (msg: string) => void;
}): Promise<PhaseResult>
```

**内部フロー**:
1. `operationCwd` あり → worktree remove + prune + updateJobState
2. `operationCwd` なし → rev-parse で currentBranch 取得
   - isOnMain → checkout baseBranch + pull --ff-only
   - !isOnMain → warning 出力（skip）
3. branch 削除（local + remote、best-effort）
4. `markJobArchived(target.jobId)`

既存 L239-310 のコードを移動。

## ディスパッチャ構造（目標 80 行以下）

```
runFinishOrchestrator:
  destructure input
  resolveTarget          → exit 2 on fail
  loadJobState           → exit 2 on fail
  isFullyFinished        → exit 0 (no-op)
  assertJobFinishable    → exit 1 on fail
  Phase 0: runPreflight  → exit 1 on fail
  dry-run guard          → exit 0
  if (!prAlreadyMerged):
    Phase 1: runPhase1Archive     → exit 1 on fail
    Phase 2: runPhase2Push        → exit 1 on fail
    Phase 3: mergeFeaturePrPhase3 → exit 1 on fail
  Phase 4: runPhase4Finalize      → exit 1 on fail
  return exit 0
```

## 設計判断

### D1: Phase 2 に post-push polling を含める

polling と DIRTY guard を dispatcher に残すと 80 行目標を超過する。Phase 2 の責務は「push して merge 可能な状態を確認する」と定義し、polling を含める。

### D2: Phase2Result の専用型

Phase 2 だけ `mergeStateAfterPush` を返す必要がある。既存の `PhaseResult` を拡張せず、`Phase2Result` を別型として定義する（他の Phase に不要なフィールドを混入させない）。

### D3: Phase 3 はラッパーを追加しない

`mergeFeaturePrPhase3` は既に完結したヘルパー。ラッパーで包むと層が増えるだけで価値がない。dispatcher が直接呼ぶ。

### D4: markJobArchived は Phase 4 に包含

現在のコードで markJobArchived は Phase 4 コメントブロックの外（L308-310）にあるが、論理的には finalize の最終ステップ。`runPhase4Finalize` に含める。
