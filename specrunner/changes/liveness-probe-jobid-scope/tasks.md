# Tasks: liveness 生存判定の sidecar pid 採用に jobId 照合を追加する

<!-- FORMAT REQUIREMENTS:
Task heading format: `## T-NN: <task name>` (2-digit zero-padded, e.g. T-01)
Sub-task format:     `- [ ] <implementation detail>` (checkbox)

Each task MUST end with an **Acceptance Criteria** section listing verifiable conditions.
Tasks must be granular enough for the implementer to execute without additional clarification.
-->

## T-01: `isStaleRunning` に jobId 照合を追加する

対象ファイル: `src/core/resume/safety.ts`

- [ ] `resolveJobPid` と `SidecarContent` を `"../liveness/resolve-pid.js"` から import する
- [ ] Priority 2 ブロック（現在 `sidecar["pid"]` を直接読んでいる箇所）を以下の手順で書き換える:
  1. sidecar の raw JSON から `SidecarContent` を構築する（`pid: typeof obj["pid"] === "number" ? obj["pid"] : null`, `jobId: typeof obj["jobId"] === "string" ? obj["jobId"] : null`）
  2. `resolveJobPid({ statePid: null, sidecar: sidecarContent, expectedJobId: state.jobId })` を呼ぶ
  3. `resolved.pid != null` → `!isProcessAlive(resolved.pid)` を返す
  4. `resolved.pid == null` → `true`（stale）を返す（現行の「pid フィールドなし → stale」と同分岐）
- [ ] `catch` ブロック（sidecar 読み取り失敗）は現行のまま `return true`（stale）を維持する

**Acceptance Criteria**:
- `isStaleRunning` に `sidecarPath` を渡したとき、sidecar に `jobId` フィールドがあり `state.jobId` と一致する場合のみ pid が生存 probe に使われる
- sidecar の `jobId` が `state.jobId` と不一致の場合、`true`（stale）を返す
- sidecar に `jobId` フィールドが存在しない場合（null 扱い）、`true`（stale）を返す
- sidecar に `pid` フィールドが存在しない場合（従来通り）、`true`（stale）を返す
- jobId 一致かつ pid あり、プロセス生存の場合は `false` を返す（回帰なし）

## T-02: `job wait` の sidecar pid 読みに jobId 照合を追加する

対象ファイル: `src/cli/job-wait.ts`

- [ ] `SidecarContent` と `resolveJobPid` を `"../core/liveness/resolve-pid.js"` から import する
- [ ] `JobWaitDeps` インターフェースの `readSidecarPid` の型を `(sidecarAbsPath: string) => number | null` から `(sidecarAbsPath: string) => SidecarContent | null` に変更する
- [ ] `realReadSidecarPid` を書き換えて `{ pid: number | null, jobId: string | null }` を返すようにする（sidecar JSON から `pid` と `jobId` の両フィールドを取り出す。読み取り失敗時は `null` を返す）
- [ ] poll ループ内の sidecar pid 解決箇所を書き換える:
  - `deps.readSidecarPid(sidecarAbs)` の戻り値を `SidecarContent | null` として受け取る
  - `resolveJobPid({ statePid: null, sidecar: sidecarRecord, expectedJobId: currentState.jobId })` を呼ぶ
  - `resolved.pid` を `sidecarPid` として使う（null の場合は従来通り no-pid パスに進む）
- [ ] 型エラーが出ないことを確認する（`bun run typecheck`）

**Acceptance Criteria**:
- `realReadSidecarPid` は `{ pid, jobId }` を返す（number を直接返さない）
- poll ループで sidecar pid を採用する際に `resolveJobPid` による jobId 照合を経由している
- jobId 不一致の sidecar pid は `resolvedPid` に入らない（`lastKnownPid` にも蓄積されない）
- jobId 一致の sidecar pid は従来通り採用される（回帰なし）

## T-03: `isStaleRunning` jobId 照合の unit テストを追加する

対象ファイル: `src/core/resume/__tests__/safety.test.ts`（新規作成）

- [ ] `isStaleRunning` をテストする最小限のテストファイルを新規作成する
- [ ] 必要な mock: `fs.readFileSync`（sidecar JSON を制御する）と `isProcessAlive`（生存結果を制御する）
- [ ] 以下のケースを unit テストとして実装する:
  - **TC-S01**: jobId 一致の sidecar pid かつプロセス生存 → `false`（not stale）
  - **TC-S02**: jobId 一致の sidecar pid かつプロセス死亡 → `true`（stale）
  - **TC-S03**: jobId 不一致の sidecar → `true`（stale、pid の生死に関わらず）
  - **TC-S04**: sidecar に `jobId` フィールドなし（legacy sidecar）→ `true`（stale）
  - **TC-S05**: sidecar に `pid` フィールドなし → `true`（stale）
  - **TC-S06**: sidecar ファイル不在 → `true`（stale）
  - **TC-S07**: `state.pid` が存在する場合は sidecar を無視して Priority 1 が動く（回帰確認）

**Acceptance Criteria**:
- TC-S01〜TC-S07 がすべて通る
- `fs.readFileSync` の mock で sidecar の内容を制御できている（実 I/O なし）

## T-04: `job wait` sidecar jobId 照合の unit テストを追加する

対象ファイル: `src/cli/__tests__/job-wait.test.ts`（既存ファイルに追加）

- [ ] 既存の "sidecar pid resolution" describe ブロック内のテストを修正する:
  - `readSidecarPid: vi.fn((_path: string) => 54321)` を `readSidecarPid: vi.fn((_path: string) => ({ pid: 54321, jobId: "job-abc-0001" }))` に変更する（`makeJobState` の `jobId` は `"job-abc-0001"` なので一致させる）
- [ ] 同 describe ブロックに以下のテストケースを追加する:
  - **TC-W01**: sidecar の jobId が state.jobId と不一致 → sidecar pid は採用されない（`isProcessAlive` が sidecar pid で呼ばれない）
  - **TC-W02**: sidecar に jobId フィールドなし（legacy: `{ pid: 54321 }` のみ）→ sidecar pid は採用されない
  - **TC-W03**: sidecar の jobId が一致かつプロセス生存 → sidecar pid が採用されて待機し続ける（回帰テスト）

**Acceptance Criteria**:
- 既存の "sidecar pid resolution" テストが更新後もすべて通る
- TC-W01〜TC-W03 が追加され通る
- `bun run test` で全テスト green

## T-05: typecheck と全テスト通過を確認する

- [ ] `bun run typecheck` を実行してエラーなしを確認する
- [ ] `bun run test` を実行してすべて green を確認する
- [ ] 失敗があれば T-01〜T-04 に戻って修正する

**Acceptance Criteria**:
- `bun run typecheck` が exit code 0 で完了する
- `bun run test` が exit code 0 で完了する（既存テスト含む全テスト green）
