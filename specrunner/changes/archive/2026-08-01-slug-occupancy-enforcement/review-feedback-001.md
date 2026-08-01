# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat`（44 files, +6,228 / −101 lines）を確認
- `specrunner/changes/slug-occupancy-enforcement/design.md`, `tasks.md`, `spec.md`, `test-cases.md` を通読
- `src/core/occupancy/scan.ts`, `guard.ts`, `claim.ts`, `repair.ts` を全文精読
- `src/errors.ts`（新規 error code/factory 追加分）を精読
- `src/core/cancel/runner.ts`（sidecar teardown 変更箇所 400–504 行）を精読
- `src/core/resume/resolve-job.ts` を全文精読
- `src/cli/progress.ts` を全文精読
- `src/core/doctor/checks/storage/slug-occupancy.ts` を全文精読
- `src/core/inbox/run-inbox.ts`（全文）を精読し、`executeStart` catch ロジックと default `startJob` effect の接続を追跡
- `src/cli/run.ts:42–106`（`runRunCore` の error swallow 実装）を確認
- `src/cli/resume.ts` と `src/cli/reopen.ts` の `resolveJobStateBySlug` 呼び出し位置を確認
- `src/core/command/resume.ts:104–144`（同 resolver の try/catch 有無）を確認
- `src/core/runtime/local.ts:1423–1435`（`writeLivenessSidecar` — unconditional overwrite）を確認
- `src/core/runtime/workspace-materializer.ts`（materializer 側の write sites）を grep で確認
- `src/cli/command-registry.ts:908–926`（`doctor` コマンド登録、`repair` サブコマンド不在）を確認
- `src/core/runtime/duplicate-slug-guard.ts`（変更後の状態）を全文精読
- `src/core/runtime/local.ts`, `managed.ts`（`assertNoDuplicateLiveJob` 委譲先）を grep で確認
- テスト群: `tests/occupancy-e2e.test.ts`, `tests/unit/core/occupancy/guard.test.ts`, `tests/unit/core/cancel/sidecar-teardown.test.ts`, `tests/unit/inbox/occupancy-propagation.test.ts`, `tests/unit/core/resume/state-based-resolve.test.ts`, `tests/unit/cli/progress-halt-guidance.test.ts`, `tests/unit/core/doctor/checks/storage/slug-occupancy.test.ts`, `tests/unit/core/occupancy/repair.test.ts`, `tests/unit/core/runtime/duplicate-slug-guard.test.ts`, `tests/unit/core/runtime/local-duplicate-guard.test.ts` を精読
- verification-result.md（669 ファイル / 9,952 tests all pass; typecheck clean）を確認

## 検証できなかった項目

None — 主要な実装ファイルと接続をすべて追跡した。

## Findings 詳細

### B-001: `claimLivenessSidecar` 未接続（T-04 / R2）

`src/core/occupancy/claim.ts` は実装済みで TC-023〜TC-026 のユニットテストも green。ただし `src/core/runtime/local.ts:1423–1435` の `writeLivenessSidecar` は従来どおりの無条件 `fs.writeFile` のまま：

```typescript
async writeLivenessSidecar(slug, jobId, worktreePath, pid = process.pid) {
  try {
    const sidecarAbsPath = path.join(this.cwd, livenessJsonPath(slug));
    await fs.mkdir(path.dirname(sidecarAbsPath), { recursive: true });
    await fs.writeFile(sidecarAbsPath, JSON.stringify({...}), "utf-8");
  } catch { /* swallow */ }
}
```

`workspace-materializer.ts` の 4 箇所（lines 91, 117, 149, 177）はすべて `host.writeLivenessSidecar` に委譲するため、本番では `claimLivenessSidecar` が呼ばれることがない。D6 の "second line" が dead code。

---

### B-002: Inbox 拒否コメントが本番経路で投稿されない（T-10 / R7）

`runInboxOrchestrator` は `executeStart` から投げられる `SLUG_OCCUPIED` を catch するが、default `startJob` は `runRunCore` を呼ぶ。`runRunCore:100–105` は：

```typescript
try {
  return await new PipelineRunCommand(...).execute();
} catch (err) {
  logError((err as Error).message);
  return 1;  // ← never re-throws
}
```

`SlugOccupiedError` を含むすべてのエラーを catch して return 1 するため、`startJob` は throw せず void を返す。inbox catch ブロックは到達しない。

テストは `startJob` を mock して直接 `SlugOccupiedError` を throw させているため green。本番経路は未テスト。

Design D10 は "inbox start path performs its own occupancy pre-check" と述べているが、その pre-check は実装されていない。

---

### B-003: `specrunner doctor repair <slug>` CLI 未登録（T-08 / R5）

`src/core/occupancy/repair.ts` の `repairSlugOccupancySidecar` はユニットテスト green。`src/core/doctor/checks/storage/slug-occupancy.ts:136` は：

```
"Run 'specrunner doctor repair <slug>' to re-point the sidecar to the correct job."
```

と hint するが、`src/cli/command-registry.ts` に `repair` サブコマンドはなく、`repair.ts` はテスト以外からインポートされていない。ユーザーが hint に従うと unknown command になる。

---

### W-001: `cli/resume.ts:47`・`cli/reopen.ts:58` に try/catch なし（T-06 / D5）

`resolveJobStateBySlug` が `SLUG_OCCUPANCY_AMBIGUOUS` を throw した場合、`runResumeCore` の 47 行目（try/catch の外側）で unhandled rejection になる。`src/core/command/resume.ts:104–144` は try/catch 済みだが、外側の CLI 層のみ未対応。

---

### W-002: `--purge` skip 時に warning なし＋terminal sidecar でも skip する（T-05 / R3）

`runner.ts:461–487`：

```typescript
if (sidecarObj["jobId"] !== undefined && sidecarObj["jobId"] !== state.jobId) {
  skipPurge = true;
  // ← warnings.push() がない
}
```

TC-031 は "a warning is emitted" を要求するが、テストは directory presence しか検証しないため gap が検出されていない。また foreign jobId が terminal かどうかを確認せず skip するため、stale terminal sidecar の場合も purge を止める（over-cautious）。

---

### W-003: running+alive の guard メッセージが "resume" になっている（T-03 / spec.md）

`guard.ts` は `AssertSlugUnoccupiedDeps.isAlive` を宣言するが実装内では呼ばない。`slugOccupiedError` factory は `awaiting-archive` 以外すべてに "job resume" の hint を返す。

spec.md: "prior job is `running` with a live `pid` → advise waiting for completion or cancel." TC-015 が `/cancel|wait/i` を検証しており "cancel" で pass するが、`resume` と `wait` は意味が異なる（resume = halt から再入、wait = 実行完了を待つ）。

---

### I-001: `scan.ts` が worktrees dir の非 ENOENT エラーを swallow（マイナー）

`scan.ts:88–110`:
```typescript
} catch {
  // No worktrees dir → fine
}
```
D4 は "enumeration I/O fails (non-ENOENT)" を `unreadable` にするよう要求するが、worktrees dir の EPERM 等が swallow される。実運用上のリスクは低い。

---

### I-002: `checkDuplicateLiveJob` 残置（dead code）

production 呼び出し元なし（local.ts・managed.ts は `assertSlugUnoccupied` に委譲済み）。D8 は "MAY be removed" と述べており明示的な残置許容。テストは更新済みで fail-closed 動作を固定している。
