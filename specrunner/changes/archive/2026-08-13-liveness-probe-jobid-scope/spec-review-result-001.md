# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### バグの実在確認

- **`src/core/resume/safety.ts:52-55`**: Priority 2 が `sidecar["pid"]` を `jobId` 照合なしで読んでいることを実コードで確認。`resolveJobPid` の呼び出しはなく、`isProcessAlive(pid)` を直接呼ぶ。request.md の前提と一致。
- **`src/cli/job-wait.ts:106-116`**: `realReadSidecarPid` が `sidecar["pid"]` の `number` のみを返し、`jobId` を読まないことを確認。`JobWaitDeps.readSidecarPid` の型も `(sidecarAbsPath: string) => number | null` であり照合なし。
- **`src/cli/job-wait.ts:212-217`**: poll ループの `sidecarPid = statePid === null ? deps.readSidecarPid(sidecarAbs) : null` が jobId 照合なしに `lastKnownPid` の蓄積を含む全経路へ流れることを確認。

### 再利用対象関数の確認

- **`src/core/liveness/resolve-pid.ts`**: `resolveJobPid` が純関数（I/O なし）として存在し、`sidecar.pid != null && sidecar.jobId === expectedJobId` の時のみ sidecar pid を採用する正しい規則を持つことを確認。
- **`SidecarContent` 型**: `{ pid: number | null; jobId: string | null }` として同ファイルに定義されており、design.md の型変換設計に使用可能であることを確認。

### 正典（architecture）との整合確認

- **`architecture/dynamic-model.md:54`**: 「sidecar の参照・解除は自 jobId と一致する記録に限る — establish（claim）・削除・kill 対象解決・worktreePath 解決・**生存判定**のすべてで」と明記されており、生存判定が jobId 照合を要求することが正典に記載済みであることを確認。
- **`architecture/divergence-status.md`**: stale-running 判定と `job wait` の sidecar 読みが jobId 照合なしであることが既知の未解消 divergence として記録されていることを確認。

### sidecar スキーマ確認

- **`src/core/runtime/local.ts:1445`**: sidecar record が `{ pid, session, worktreePath, jobId }` 形式で書かれており、`jobId` フィールドが既に存在することを確認。スキーマ変更不要という前提を裏付け。
- **`src/core/runtime/local.ts:258`**: worktreePath 解決が `sidecar["jobId"] === jobId` を既に照合しており、生存判定だけが取り残された構造であることを確認。

### `JobState.jobId` フィールド確認

- **`src/state/schema/types.ts:403`**: `JobState.jobId: string`（required、非 optional）であることを確認。`isStaleRunning(state, ...)` の中で `state.jobId` を `expectedJobId` として渡す設計（D1）が型安全であることを確認。

### 既存テストへの影響確認

- **`src/cli/__tests__/job-wait.test.ts:710`**: "sidecar pid resolution" describe 内のテストが `readSidecarPid: vi.fn((_path: string) => 54321)` と `number` を直接返している。D2（`readSidecarPid` の戻り型を `SidecarContent | null` に変更）後は型不一致になるため、tasks T-04 の更新対象として正しく特定されていることを確認。

### spec.md 品質確認

- 全 Requirement に normative keyword（MUST）が含まれることを確認。
- 全 Scenario が Given/When/Then 形式で記述されていることを確認。
- 3 つの Requirement（`isStaleRunning` jobId 照合・`job wait` jobId 照合・`resolveJobPid` への集約）が相互補完的に必要な振る舞いを網羅していることを確認。

### tasks.md 実装可能性確認

- T-01〜T-04 の各タスクが実コードの変更箇所と一致しており、実装者が追加情報なしに着手できる粒度であることを確認。
- T-03（新規テストファイル作成）が `src/core/resume/__tests__/` に既存の safety.ts テストが存在しないことを前提としており、実際に同ディレクトリに `safety.test.ts` が存在しないことを確認（他テストファイル 7 本は別のモジュールをカバー）。

### `realReadSidecarPid` の同期 I/O 設計確認

- `realReadSidecarPid` は `fs.readFileSync`（同期）を使用。`readLivenessSidecar`（`resolve-pid.ts`）は `fs.readFile`（非同期）を使用。tasks.md は `realReadSidecarPid` 内でインライン変換（`SidecarContent` 構築）を指定しており、`readLivenessSidecar` の流用を求めていない。同期 I/O コンテキストとして適切な設計を確認。

## 検証できなかった項目

- `bun run typecheck` および `bun run test` の実行（ビルド環境での実行検証）。T-05 の受け入れ基準に相当。実装フェーズで確認される。

## Findings 詳細

None
