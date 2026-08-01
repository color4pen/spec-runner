# Code Review Feedback — iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat`（49 files, +6,555 / −115 lines）を確認
- `specrunner/changes/slug-occupancy-enforcement/design.md`, `spec.md`, `tasks.md`, `test-cases.md` を通読
- `src/core/occupancy/scan.ts`, `guard.ts`, `claim.ts`, `repair.ts` を全文精読
- `src/errors.ts`（新規 error code / factory / EXIT_CODE_MAP / SlugOccupiedError）を精読
- `src/core/cancel/runner.ts`（sidecar teardown 変更箇所 420–530 行・cancelAllTerminated）を精読
- `src/core/resume/resolve-job.ts` を全文精読
- `src/cli/progress.ts:163–172`（`onPipelineComplete` 分岐）を精読
- `src/core/doctor/checks/storage/slug-occupancy.ts` を全文精読
- `src/core/inbox/run-inbox.ts`（startJob pre-check 380–400 行・SLUG_OCCUPIED catch 220–255 行）を精読
- `src/core/runtime/local.ts:908–914`（`assertNoDuplicateLiveJob` / `assertSlugUnoccupied` 委譲）を精読
- `src/core/runtime/local.ts:1418–1465`（`writeLivenessSidecar` — claimLivenessSidecar 接続）を精読
- `src/core/runtime/managed.ts:596–602`（`assertNoDuplicateLiveJob` / `assertSlugUnoccupied` 委譲）を精読
- `src/core/runtime/workspace-materializer.ts`（`host.writeLivenessSidecar` 委譲箇所）を grep で確認
- `src/cli/command-registry.ts:915–934`（`doctor repair <slug>` サブコマンド登録）を精読
- `src/cli/resume.ts:47–53`・`src/cli/reopen.ts:58–64`（try/catch 追加）を精読
- `architecture/divergence-status.md`（2026-08-01 divergence の burn-down 登録）を確認
- テスト群: `tests/occupancy-e2e.test.ts`, `tests/unit/core/occupancy/guard.test.ts`, `tests/unit/core/cancel/sidecar-teardown.test.ts`, `tests/unit/inbox/occupancy-propagation.test.ts`, `tests/unit/core/resume/state-based-resolve.test.ts`, `tests/unit/cli/progress-halt-guidance.test.ts`, `tests/unit/core/doctor/checks/storage/slug-occupancy.test.ts`, `tests/unit/core/occupancy/repair.test.ts`, `tests/unit/core/runtime/duplicate-slug-guard.test.ts`, `tests/unit/core/runtime/local-duplicate-guard.test.ts` を精読
- verification-result.md（669 files / 9,952 tests all pass; typecheck / lint clean）を確認

### iteration 1 の Bug・Warning 修正確認

| 指摘 | 修正内容 | 確認結果 |
|------|----------|---------|
| B-001: `claimLivenessSidecar` 未接続 | `local.ts:1432` で `claimLivenessSidecar` を呼ぶよう変更 | ✓ |
| B-002: Inbox 拒否コメント経路 | `startJob` 冒頭に `JobStateStore.list` 基準の occupancy pre-check を追加 | ✓ |
| B-003: `doctor repair <slug>` 未登録 | `command-registry.ts:915–934` に repair サブコマンドを追加 | ✓ |
| W-001: `resume.ts`/`reopen.ts` try/catch なし | 両ファイルとも try/catch 追加済み | ✓ |
| W-002: purge skip 時 warning なし + terminal チェック欠落 | `runner.ts:473–493` で foreign job の terminal 判定 + `warnings.push` 追加済み | ✓ |
| W-003: running+alive guard メッセージが "resume" | `guard.ts` で live-pid 分岐を追加し「Wait for... or cancel」ヒントを実装 | ✓ |

## 検証できなかった項目

None

## Findings 詳細

### W-001: `isAlive` が本番経路でインジェクトされていない（spec "MUST reuse isProcessAlive"）

`guard.ts` は `deps?.isAlive` を使って live-pid 判定を行う設計だが、本番呼び出し元（`local.ts:913`・`managed.ts:601`）は `isAlive` を渡さずに `assertSlugUnoccupied(repoRoot, slug)` を呼ぶ。

```typescript
// local.ts:912–913 (生産経路)
async assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void> {
  await assertSlugUnoccupied(repoRoot, slug); // isAlive 未注入
}
```

結果として、`running` ステータスの先住 job に対して:
- pid が生存中でも `isAlive !== undefined` が false → `slugOccupiedError` へフォールスルー
- ユーザーが受け取るヒント: `"job resume S"` (誤)
- spec が要求するヒント: `"wait for completion or job cancel"` (正)

spec の明示的要件:
> The process-liveness decision MUST reuse the existing isProcessAlive from src/core/resume/safety.ts

TC-015 / TC-016 テストは injected deps で正しく動作するため green だが、本番ではその分岐が発火しない。コア不変条件（拒否動作）は正しい。UX メッセージが spec 要件を満たさない。

**修正案**: `local.ts:assertNoDuplicateLiveJob` で `isProcessAlive` をインジェクト:
```typescript
async assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void> {
  await assertSlugUnoccupied(repoRoot, slug, {
    scanOccupancy: (r, s) => scanSlugOccupancy(r, s),
    isAlive: (pid) => isProcessAlive(pid ?? 0),
  });
}
```
managed は pid 不在のため `isAlive` を渡さない（現状維持）。

---

## 観察事項

### I-001: `scan.ts` worktrees ディレクトリの非 ENOENT エラーを swallow（iteration 1 より継続）

`scan.ts:108–110`:
```typescript
} catch {
  // No worktrees dir → fine
}
```
`readdir` が EPERM 等で失敗した場合、`unreadable` が設定されないため fail-closed 保証が抜ける。実運用リスクは低い。

### I-002: `checkDuplicateLiveJob` 残置（iteration 1 より継続）

production 呼び出し元なし。設計 D8 の "MAY be removed" 範囲内。テストは fail-closed 動作を固定済み。

### I-003: TC-031 テストが warning 発行を検証しない

`sidecar-teardown.test.ts` の TC-031 は `.specrunner/local/<slug>/` ディレクトリの存在のみを assert する。`test-cases.md:TC-031` が THEN 条件に "a warning is emitted" を記載しているが、テストは `result.warnings` を検証しない。`runner.ts:489–490` では `warnings.push(...)` が実装済みのため挙動は正しい。テスト品質のギャップ。

### I-004: `cancelAllTerminated` は本 request スコープ外だが残置リスク継続

`runner.ts:542–600`: `failed`・`terminated` は non-terminal occupant だが、`cancelAllTerminated` は `.specrunner/local/<slug>/` を jobId チェックなしで削除する。`design.md` の Open Questions に明記された follow-up 候補。本 change の受け入れ基準外。
