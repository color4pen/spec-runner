# Code Review Feedback — detached-run-lifecycle iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `design.md` / `tasks.md` / `test-cases.md` を精読し、受け入れ基準・設計判断を確認
- `src/core/command/detach.ts` — DETACH_MARKER_ENV, isDetachedChild, stripDetachFlag, buildDetachGuidance, detachSelf の実装確認
- `src/core/command/operational-guidance.ts` — FOREGROUND_NOTICE, emitForegroundNotice の実装確認
- `src/util/spawn.ts` — spawnBackground detach 拡張確認（detached / logFilePath / rawEnv フィールド）
- `src/util/xdg.ts` — getDetachLogPath の実装確認
- `src/cli/job-wait.ts` — process-death gate 実装確認（pid 解決順 / isProcessAlive / isStaleRunning fallback / settle 報告 / 終了コード）
- `src/cli/job-show.ts` — Detach log 行追加確認
- `src/cli/command-registry.ts` — --detach flag 登録・detach 経路配線・job wait 登録・USAGE 更新確認
- 各テストファイル（TC-001〜TC-031）と対応する実装の整合確認
- `docs/operations.md` — detach + wait 標準フロー記載確認
- `verification-result.md` — typecheck / test / lint / coverage すべて green 確認
- grep で `emitForegroundNotice` / `operational-guidance` の全インポートを検索し、本番配線の有無を確認
- `JobStateStore.list` の signature を確認し、`includeArchived` オプションのデフォルト挙動を確認

## 検証できなかった項目

None — すべての受け入れ基準を実装レベルで確認済み。

## Findings 詳細

### F-001 HIGH — emitForegroundNotice が本番コードから呼ばれていない

`src/core/command/operational-guidance.ts` に `emitForegroundNotice` が定義されているが、本番コード（`runner.ts` / `pipeline-run.ts` / CommandRunner / CLI ハンドラ）からは一切 import / 呼び出しされていない。grep 結果:

```
Found 2 files:
  src/core/command/operational-guidance.ts   (定義)
  src/cli/__tests__/detach-output-contract.test.ts  (テストのみ)
```

TC-026/TC-027/TC-028 は関数の単体動作（logInfo を呼ぶ・marker で skip する）を検証するが、「run/resume 起動時に実際に stderr へ出る」という統合レベルの歯はない。T-04 AC「foreground（マーカー非設定）の run / resume で案内が stderr に出る」は充足されていない。

**Fix**: `CommandRunner.execute`（または `pipeline-run.ts` の起動点）で `emitForegroundNotice(process.env)` を呼ぶ。

### F-002 MEDIUM — job wait に worktree guard なし

T-05 AC: "worktree guard は `job show` / `job ls` と同じ様式（main checkout 外なら拒否）"。`job wait` ハンドラ（command-registry.ts）および `runJobWait`（job-wait.ts）のいずれも `detectSpecrunnerWorktree` を呼んでいない。`job show` は内部で guard を実装しているが `job wait` は持っていない。

**Fix**: `runJobWait` 冒頭（または wait ハンドラ）で `detectSpecrunnerWorktree(repoRoot)` を呼び、worktree 内なら exit 2。

### F-003 MEDIUM — makeDefaultDeps が includeArchived: true なしで list する

D7 は `archived → exit 0` を規定し、TC-029 が code logic を DI で検証している。しかし `makeDefaultDeps` の `loadState` は:

```typescript
const all = await JobStateStore.list(root);  // includeArchived: true なし
```

archived job は `list()` のデフォルトでは返らない（`job show` は `{ includeArchived: true }` を渡している）。既に archived になった slug に対して `job wait` を呼ぶと、本番では exit 2 になる（5 回リトライ後）。

**Fix**: `makeDefaultDeps` の `loadState` を `JobStateStore.list(root, { includeArchived: true })` に変更する。

### F-004 LOW — SpawnBackgroundOptions に index signature

`SpawnBackgroundOptions` に `[key: string]: unknown` が付いているため、TypeScript の構造型チェックが弱まる。コメントにはテストの型アサーション向けと書かれているが、テスト側で `opts as Record<string, unknown>` とキャストするだけで十分。

**Fix**: インターフェースから index signature を削除し、テストの cast を `as Record<string, unknown>` のままにする。

## TC Coverage Summary

| TC | 結果 | 備考 |
|----|------|------|
| TC-001 | ✓ | spawn 形式 |
| TC-002 | ✓ | 親の案内・exit 0 |
| TC-003 | ✓ | 破壊確認 |
| TC-004 | ✓ | --detach --json → exit 2 |
| TC-005 | ✓ | marker 付き子は spawn しない |
| TC-006 | ✓ | getDetachLogPath |
| TC-007 | ✓ | job show detach log |
| TC-008 | ✓ | spawnBackground 既存挙動 |
| TC-009 | ✓ | credential + marker passthrough |
| TC-010 | ✓ | pid 生存中は待ち続ける（gate） |
| TC-011 | ✓ | 破壊確認 status-first |
| TC-012 | ✓ | 死亡後 status 確定 |
| TC-013 | ✓ | running → awaiting-resume on crash |
| TC-014 | ✓ | no-pid fallback |
| TC-015 | ✓ | awaiting-archive → exit 0 |
| TC-016 | ✓ | awaiting-resume → exit 1 |
| TC-017 | ✓ | failed/terminated/canceled → exit 1 |
| TC-018 | ✓ | slug 不在 5 回リトライ → exit 2 |
| TC-019 | ✓ | 文言存在 |
| TC-020 | ✓ | 10262 existing tests green |
| TC-021 | ✓ | 0o600 |
| TC-022 | ✓ | append mode |
| TC-023 | ✓ | --detach flag 登録 |
| TC-024 | ✓ | SLUG_REGEX 検証 |
| TC-025 | ✓ | detach log 不在で行なし |
| TC-026 | △ | 単体 pass、本番配線なし（F-001） |
| TC-027 | △ | 単体 pass、本番配線なし（F-001） |
| TC-028 | △ | 単体 pass、本番配線なし（F-001） |
| TC-029 | △ | 単体 pass、本番 default deps は archived を解決できない（F-003） |
| TC-030 | ✓ | typecheck && test green |
| TC-031 | ✓ | docs/operations.md 更新済み |
