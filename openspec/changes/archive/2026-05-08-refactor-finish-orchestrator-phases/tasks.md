# Tasks: runFinishOrchestrator をフェーズ関数に分割する

## [x] T1: runPhase1Archive の抽出

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. 既存の `PhaseResult` 型定義の後に `runPhase1Archive` 関数を追加
2. L142-183 のロジック（`if (!prAlreadyMerged)` ブロック内の Phase 1 部分）を移動

**関数シグネチャ**:
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

**移動対象コード** (現在の L142-183):
- L147-151: `!operationCwd` 時の `checkoutFeatureBranch()` 呼び出し
- L155: `archiveCwd = operationCwd ?? cwd`
- L157-169: `archiveOpenspec()` 呼び出し + skipped 判定 + stdout
- L171-183: `moveRequestsDir()` 呼び出し + skipped 判定 + stdout
- 各ステップで `!result.ok` → `{ ok: false, escalation, exitCode: 1 }` を返す
- 全成功時 → `{ ok: true }` を返す

**注意**: `stdoutWrite` の呼び出し（Phase 1 のヘッダメッセージ `Phase 1: archive on feature branch...`）は dispatcher 側に残す。関数内では archiveOpenspec/moveRequestsDir の結果メッセージのみ出力する。

## [x] T2: runPhase2Push の抽出

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. `Phase2Result` 型を定義
2. `runPhase2Push` 関数を追加
3. L185-219 のロジックを移動

**型定義**:
```typescript
type Phase2Result =
  | { ok: true; mergeStateAfterPush: string }
  | { ok: false; escalation: string; exitCode: 1 };
```

**関数シグネチャ**:
```typescript
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

**移動対象コード** (現在の L185-219):
- L187-193: `pushFeatureBranch()` 呼び出し + skipped/成功の stdout
- L198-206: `pollMergeStateAfterPush()` 呼び出し + mergeState 計算
- L209-219: DIRTY guard → `formatEscalation` で escalation 生成
- 成功時 → `{ ok: true, mergeStateAfterPush }` を返す

**注意**: dispatcher 側に Phase 2 のヘッダメッセージを残す。`baseBranch` は DIRTY guard の escalation メッセージで使用する。

## [x] T3: runPhase4Finalize の抽出

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. `runPhase4Finalize` 関数を追加
2. L239-310 のロジックを移動（Phase 4 コメント以降 + branch 削除 + markJobArchived）

**関数シグネチャ**:
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

**import 追加**: `WorktreeManager` 型を import に追加（`createWorktreeManager` は既に import 済み）。

**移動対象コード** (現在の L239-310):
- L242-254: `operationCwd` あり → `manager.remove()` + `manager.prune()` + `updateJobState(worktreePath: null)`
- L256-295: `operationCwd` なし → `rev-parse` で currentBranch 取得
  - `isOnMain` → `spawnOrEscalate` で checkout + pull
  - `!isOnMain` → warning 出力
- L298-306: branch 削除（local `git branch -D` + remote `git push origin --delete`、best-effort）
- L308-310: `markJobArchived(target.jobId)` + stdout メッセージ
- checkout/pull の `spawnOrEscalate` が失敗時 → `{ ok: false, escalation, exitCode: 1 }` を返す
- 全成功時 → `{ ok: true }` を返す

**注意**: dispatcher 側に Phase 4 のヘッダメッセージ `"Phase 4: finalizing..."` を残す。

## [x] T4: runFinishOrchestrator のディスパッチャ化

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. `runFinishOrchestrator` の Phase 1-4 インラインコードを各 Phase 関数の呼び出しに置き換え
2. 目標: 80 行以下

**置き換え後の構造**:
```typescript
export async function runFinishOrchestrator(
  input: FinishInput,
  stdoutWrite: (msg: string) => void = (m) => process.stdout.write(m + "\n"),
): Promise<FinishResult> {
  const { slug, prNumber, jobId, baseBranch, flags, cwd, spawn, fs, sleepFn, worktreeManagerFn } = input;

  // resolveTarget (既存コードそのまま)
  // loadJobState (既存コードそのまま)
  // isFullyFinished (既存コードそのまま)
  // assertJobFinishable (既存コードそのまま)
  // Phase 0: runPreflight (既存コードそのまま)
  // dry-run guard (既存コードそのまま)

  const prAlreadyMerged = prViewData.state === "MERGED";
  const operationCwd = target.worktreePath ?? null;

  if (!prAlreadyMerged) {
    stdoutWrite(`Phase 1: archive on feature branch ${target.branch}...`);
    const p1 = await runPhase1Archive({ target, operationCwd, cwd, spawn, fs, stdoutWrite });
    if (!p1.ok) return { exitCode: 1, escalation: p1.escalation };

    stdoutWrite(`Phase 2: git push origin ${target.branch}...`);
    const p2 = await runPhase2Push({ target, operationCwd, cwd, spawn, baseBranch, prViewData, stdoutWrite, sleepFn });
    if (!p2.ok) return { exitCode: 1, escalation: p2.escalation };

    stdoutWrite(`Phase 3: merging PR #${target.prNumber}...`);
    const mergeResult = await mergeFeaturePrPhase3({
      prNumber: target.prNumber, mergeStateStatus: p2.mergeStateAfterPush,
      force: flags.force ?? false, cwd, spawn, slug: target.slug,
    });
    if (!mergeResult.ok) return { exitCode: 1, escalation: mergeResult.escalation };
    stdoutWrite(`PR #${target.prNumber} merged successfully.`);
  } else {
    stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
  }

  stdoutWrite("Phase 4: finalizing...");
  const p4 = await runPhase4Finalize({ target, operationCwd, cwd, spawn, baseBranch, worktreeManagerFn, stdoutWrite });
  if (!p4.ok) return { exitCode: 1, escalation: p4.escalation };

  return { exitCode: 0 };
}
```

## [x] T5: typecheck + test の確認

**Command**: `bun run typecheck && bun run test`

**期待**: 全 green。振る舞い不変のリファクタリングのため、テスト変更は不要。

## 実行順序

T1 → T2 → T3 → T4 → T5（T1-T3 は独立だが T4 が全てを統合するため順序実行）
