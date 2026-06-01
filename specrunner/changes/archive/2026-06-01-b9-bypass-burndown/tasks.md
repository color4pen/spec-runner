# Tasks: b9-bypass-burndown

## T-01: grep scan で bypass 全件を確定する

- [x] `grep -rEn 'status:\s*"(running|failed|awaiting-resume|awaiting-merge|terminated|archived|canceled)"' src/store/ src/core/` を実行し、`arch-allowlist.ts` の B-9 エントリ 3 件（B9-store-fail / B9-exit-guard / B9-signal-handler）と照合する
- [x] テストファイル・コメント行・`core/verification/`・`create()` の初期化行を除外した上で、allowlist 外の新規 bypass がないことを確認する
- [x] 追加の bypass が見つかった場合は本タスクの scope に含め、design に遷移合法性を追記する

**Acceptance Criteria**:
- bypass 全件リストが確定し、3 件（または scan で発見された追加分）が列挙されている

**Scan 結果**: 3 件確定。`job-state-update.ts:4` はコメント行（`isCommentLine()` で除外）。追加 bypass なし。全 fail() 呼び出しは running → failed（VALID_TRANSITIONS で合法）。

## T-02: `JobStateStore.fail()` を `transitionJob` 経由に書き換える

- [x] `src/store/job-state-store.ts` に `transitionJob` を `../state/lifecycle.js` から import する
- [x] `fail()` メソッドの本体を以下のように書き換える:
  - `transitionJob(state, "failed", { trigger: "store-fail", reason: errorInfo.message, patch: { error: errorInfo, step: step ?? state.step } })` を呼ぶ
  - 戻り値 `{ state: updated }` を受け取り `this.persist(updated)` で保存
  - 既存の spread `{ ...state, status: "failed" as JobStatus, ... }` による直書きを削除
- [x] `fail()` の戻り値の型（`Promise<JobState>`）は変更しない

**Acceptance Criteria**:
- `fail()` が `transitionJob` 経由で status を変更している
- `"failed" as JobStatus` の直書きが消えている
- `bun run typecheck` が green

## T-03: `exit-guard.ts` を `transitionJob` 経由に書き換える

- [x] `src/core/lifecycle/exit-guard.ts` に `transitionJob` を `../../state/lifecycle.js` から import する
- [x] `store.persist({ ...state, status: "awaiting-resume", updatedAt: ... })` を以下に置換:
  - `const { state: updated } = transitionJob(state, "awaiting-resume", { trigger: "exit-guard", reason: \`process exiting with running job ${state.jobId}\` })`
  - `await store.persist(updated)`
- [x] `new Date().toISOString()` の手動 `updatedAt` 設定を削除（`transitionJob` が自動付与）

**Acceptance Criteria**:
- exit-guard が `transitionJob` 経由で status を変更している
- `status: "awaiting-resume"` の直書きが消えている
- `bun run typecheck` が green

## T-04: `local.ts` signal-handler を `transitionJob` 経由に書き換える

- [x] `src/core/runtime/local.ts` に `transitionJob` を `../../state/lifecycle.js` から import する
- [x] `signalCleanup` 内の `store.persist({ ...current, status: "awaiting-resume" as const, ... })` を以下に置換:
  - `const { state: updated } = transitionJob(current as JobState, "awaiting-resume", { trigger: "signal-handler", reason: "Interrupted by signal", patch: { pid: null, resumePoint: { step: startStep as StepName, reason: "Interrupted by signal", iterationsExhausted: 0 } } })`
  - `await store.persist(updated)`
- [x] `managed.ts` の signal-handler（line 238）と同パターンであることを目視確認

**Acceptance Criteria**:
- signal-handler が `transitionJob` 経由で status を変更している
- `"awaiting-resume" as const` の直書きが消えている
- `managed.ts` の signal-handler と同じパターン
- `bun run typecheck` が green

## T-05: `arch-allowlist.ts` の B-9 エントリを全件削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から `invariant: "B-9"` のエントリ 3 件を削除する
- [x] B-9 セクションのコメントブロック（`// ── B-9: ...`）も削除する
- [x] B-1 / B-3 のエントリとコメントは変更しない

**Acceptance Criteria**:
- `ARCH_ALLOWLIST.filter(e => e.invariant === "B-9")` が空配列を返す
- B-1 エントリは残存
- TypeScript としてコンパイル可能

## T-06: B-9 suppression test を削除する

- [x] `tests/unit/architecture/core-invariants.test.ts` の `"does not flag status writes that are correctly allowlisted (B-9 allowlist suppression)"` テスト（line 685-700）を削除する
- [x] B-9 regression guard テスト（`"detects new direct status write not in allowlist (B-9 regression guard)"`）は残す
- [x] live B-9 scan test（`"grep finds no direct JobState.status writes ..."` in describe B-9）は残す

**Acceptance Criteria**:
- suppression test が削除されている
- regression guard テストが存在し green（空 allowlist でも synthetic violation を検出）
- live B-9 scan test が green（bypass 解消済みのため violation ゼロ）

## T-07: verification green 確認

- [x] `bun run build` が成功すること
- [x] `bun run typecheck` が成功すること
- [x] `bun run lint` が成功すること
- [x] `bun run test` が成功すること（B-9 arch test 含む）

**Acceptance Criteria**:
- プロジェクト標準 verification 4 コマンドすべてが exit 0
- B-9 live scan test が green（実違反ゼロ）
- B-9 regression guard が green（新規直書き検出が機能）
