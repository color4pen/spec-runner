# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（現状コードの前提）

以下の全アサーションをソースコードで照合した。

| アサーション | 確認結果 |
|------------|---------|
| `src/cli/run.ts:108-113` — `process.exit(await runRunCore(...))` | ✓ line 112 に一致 |
| `src/core/pipeline/pipeline.ts:216` — `while (true)` | ✓ line 216 に一致 |
| `src/state/schema/types.ts:417-418` — `pid?: number \| null` | ✓ line 418 に一致 |
| `src/store/job-state-store.ts:78-79` — job 作成時 `pid: process.pid` | ✓ line 79 に一致 |
| `src/core/command/resume.ts:229` — resume patch で `pid: process.pid` | ✓ line 229 に一致 |
| `src/core/command/resume.ts:226-243` — `resolveStateStoreByJobId` 経由の persist、null skip | ✓ lines 241-242 に一致 |
| `src/core/runtime/local.ts:1432-1468` — `writeLivenessSidecar` に pid | ✓ line 1432-1468 に一致 |
| `src/core/resume/safety.ts:13-24` — `isProcessAlive`（EPERM→alive / ESRCH→dead） | ✓ 全実装確認 |
| `src/core/resume/safety.ts:40-67` — `isStaleRunning`（state.pid → sidecar pid → updatedAt 15分） | ✓ 全実装確認 |
| `src/cli/ps.ts:144-150` — `isStaleRunning` を使用 | ✓ line 147 に一致 |
| `src/core/job-list/operations-view.ts:326-337` — `running (stale?)` 表示 | ✓ line 328 に一致 |
| `src/util/xdg.ts:44-53` — `.specrunner/logs/<jobId>.log` | ✓ lines 44-53 に一致 |
| `src/cli/job-show.ts:115-122` — Log: 行で表示 | ✓ lines 115-122 に一致 |
| `src/util/spawn.ts:73-107` — `spawnBackground` 存在、`detached: true` なし、`stdio: "ignore"` | ✓ lines 73-107 に一致 |
| `src/state/lifecycle.ts:58-60` — `TERMINAL_STATUSES = {archived, canceled}`, `ACTIVE_STATUSES = {running, awaiting-resume}` | ✓ lines 58-60 に一致 |
| `src/core/command/runner.ts:325-369` — awaiting-archive→0、awaiting-resume→1 | ✓ lines 341-364 に一致 |
| `src/errors.ts:3-7` — `EXIT_CODE = { SUCCESS: 0, GENERAL_ERROR: 1, ARG_ERROR: 2 }` | ✓ lines 3-7 に一致 |
| `src/core/command/pipeline-run.ts:69,147` — Starting / Job ID 行のみ | ✓ lines 69, 147 に一致 |

### 既存実装の不在確認

- `job wait` コマンドは存在しない（src/cli/ 全ファイル grep で不在確認）
- `--detach` フラグは run/resume に存在しない（src/cli/ grep で不在確認）
- `spawnBackground` に `detached: true` オプションは渡されていない（src/util/spawn.ts:82-87 確認）

### スコープ・設計整合性の確認

- 要件 1-7 の実装対象はすべて新規追加または既存の最小限拡張に限定されており、foreground 既定の挙動を変えない制約が明示されている
- 受け入れ基準はすべて「テストで固定する」形式で書かれており、歯（mechanical enforcement）が明示されている
- architect 評価済みの却下案（on-disk poll / 環境検出 / 既定 detach 化）の根拠が具体的に記載されており、設計の一貫性を確認できる
- `job wait` の process-death gate 設計は `isStaleRunning` / `isProcessAlive` の既存実装を活用しており、実装コストと信頼性の両立が見込める
- `spawnBackground` 拡張の要件（既存呼び出し元の挙動を変えない）は受け入れ基準に明記されている

### docs 要件（要件 7）

- `docs/operations.md` に detach + wait の標準フロー記述が現時点で存在しないことを確認。要件 7 の追加対象として妥当。

## 検証できなかった項目

None — 現状コードの全アサーションを直接読んで確認した。

## Findings 詳細

None — 指摘なし。
