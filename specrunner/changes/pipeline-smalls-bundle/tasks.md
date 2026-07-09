# Tasks: pipeline 運用の小粒不具合 3 件の一括修正

## T-01: build-fixer prompt を lcov 変更行 gate 手順に書き直す

**対象ファイル**: `src/prompts/build-fixer-system.ts`

- [ ] `## 修正手順` の step 4 全体（`**Phase: test-coverage が failed の場合**:` ブロック）を削除し、以下に差し替える:
  - `verification-result.md` の `## Phase: test-coverage` セクションに記録された未実行の変更行（file:line）と実行率を確認する
  - **その行を実際に実行する実テストを追加する** ことが唯一の正当な修正であることを明記する
  - 正当な修正で解消できない場合は修正せず失敗のまま終える旨（escalation は pipeline iteration 上限が担う）を明記する
- [ ] `## 禁止事項` に coverage gate 回避の禁止項目を追加する（テストの削除・移設 / カバレッジ目的の dead code / dead export 追加 / coverage 設定（include / exclude / threshold）の編集）

**Acceptance Criteria**:
- BUILD_FIXER_SYSTEM_PROMPT に `verification-result.md` 参照と変更行確認の旨が含まれる
- BUILD_FIXER_SYSTEM_PROMPT に `"missing TC ID"` が含まれない
- BUILD_FIXER_SYSTEM_PROMPT に `"test-cases.md"` が含まれない
- BUILD_FIXER_SYSTEM_PROMPT に `"TC ID を必ず記載"` が含まれない
- BUILD_FIXER_SYSTEM_PROMPT に gate 回避禁止（テスト削除・移設 / dead code 追加 / coverage 設定編集）のキーワードが含まれる

---

## T-02: code-fixer prompt に coverage gate 回避禁止規律を追加する

**対象ファイル**: `src/prompts/code-fixer-system.ts`

- [ ] `## 禁止事項` に coverage gate 回避の禁止項目を追加する（テストの削除・移設 / カバレッジ目的の dead code / dead export 追加 / coverage 設定（include / exclude / threshold）の編集）

**Acceptance Criteria**:
- CODE_FIXER_SYSTEM_PROMPT に gate 回避禁止のキーワードが含まれる

---

## T-03: prompt 変更を検証するテストを追加する

**対象ファイル**: `src/prompts/__tests__/coverage-gate-prohibition.test.ts`（新規作成）

- [ ] `BUILD_FIXER_SYSTEM_PROMPT` に lcov 変更行 gate 手順のキーワードが含まれることを確認するテストを書く
- [ ] `BUILD_FIXER_SYSTEM_PROMPT` に旧 TC-ID 手順のテキスト（`"missing TC ID"`, `"test-cases.md"`, `"TC ID を必ず記載"`）が含まれないことを確認するテストを書く
- [ ] `BUILD_FIXER_SYSTEM_PROMPT` に gate 回避禁止のキーワードが含まれることを確認するテストを書く
- [ ] `CODE_FIXER_SYSTEM_PROMPT` に gate 回避禁止のキーワードが含まれることを確認するテストを書く

**Acceptance Criteria**:
- 新規テストファイルが `bun run test` で全件 pass する
- T-01 実施前の状態では新規テストが fail し、T-01 実施後に pass する（回帰防止）

---

## T-04: exit-guard の 3 経路で resumePoint を書き込む

**対象ファイル**: `src/core/lifecycle/exit-guard.ts`

- [ ] `handleNoWorktreeExit` 内の `transitionJob` 呼び出しに `patch` を追加する:
  - `state.step` が truthy のとき: `patch: { resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 } }`
  - `state.step` が falsy のとき: `patch` なし（既存挙動を維持）
- [ ] `handlePerJobExit` 内の `transitionJob` 呼び出しに同様の `patch` を追加する
- [ ] `handleGlobalExit` 内の `transitionJob` 呼び出しに同様の `patch` を追加する（ループ内各 job で `state.step` を確認）

**Acceptance Criteria**:
- no-worktree 経路: 遷移後 state に `resumePoint.step === state.step` かつ `resumePoint.reason === "signal"` が書かれる
- per-job 経路: 同上
- global scan 経路: 同上
- `state.step` が falsy の job: `resumePoint` が null / undefined のまま

---

## T-05: exit-guard の resumePoint 書き込みをテストで固定する

**対象ファイル**: `src/core/lifecycle/__tests__/exit-guard.test.ts`（既存ファイルに追記）

- [ ] `state.step` に有効な値（例: `"implementer"`）を持つ running job で global scan を実行し、遷移後 state の `resumePoint.step` と `resumePoint.reason` を検証するテストを追加する
- [ ] `state.step` が空文字の running job で global scan を実行し、遷移後 state に `resumePoint` が存在しないことを検証するテストを追加する
- [ ] no-worktree モード（`createExitGuardHandler(repoRoot, jobId, { noWorktree: true, slug })` を使う）で `resumePoint` が書かれることを検証するテストを追加する（既存の helper 関数を参照し、no-worktree 向けのフォルダ構成で state を用意する）

  > ヒント: no-worktree exit guard は `handleNoWorktreeExit` を直接呼ぶ。tempDir に直接 `specrunner/changes/<slug>/state.json` と `events.jsonl` を配置すれば `JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir })` でロードできる。

**Acceptance Criteria**:
- 追加テストが `bun run test` で全件 pass する
- T-04 実施前は追加テストが fail し、T-04 実施後に pass する

---

## T-06: view コマンド（job ls / job stats / job show）に worktree cwd guard を追加する

**対象ファイル**:
- `src/cli/ps.ts` — `runPs` 関数
- `src/core/command/job-stats.ts` — `runJobStats` 関数
- `src/cli/job-show.ts` — `runJobShow` 関数

各ファイルの変更要領:

- [ ] `runPs`: `opts.repoRoot` の解決より前（関数冒頭）に以下のガードブロックを挿入する:
  - `detectSpecrunnerWorktree(process.cwd())` を呼ぶ
  - `isSpecrunnerWorktree === true` のとき `worktreeGuardError("job ls", mainPath)` を構築し、`stderrWrite(err.message)` を出力して `return 2` で終了
  - 必要な import（`detectSpecrunnerWorktree`, `worktreeGuardError`）を追加する
- [ ] `runJobStats`: `JobStateStore.list(cwd, ...)` の前に同様のガードブロックを挿入する（cwd は引数 `opts.cwd`）
- [ ] `runJobShow`: `resolveRepoRoot()` の前（または後・`JobStateStore.list` より前）に同様のガードブロックを挿入する（cwd は `process.cwd()`）
  - ガードが発火したら `return 2` で終了

**Acceptance Criteria**:
- `detectSpecrunnerWorktree` が `{ isSpecrunnerWorktree: true, mainCheckoutPath: "/some/path" }` を返す条件下で `runPs` / `runJobStats` / `runJobShow` を呼ぶと、`JobStateStore.list` が呼ばれず exit code 2 が返る
- `detectSpecrunnerWorktree` が `{ isSpecrunnerWorktree: false }` を返す条件下では従来どおり動作する

---

## T-07: view コマンドの worktree guard をテストで固定する

**対象ファイル**: `src/cli/__tests__/view-commands-worktree-guard.test.ts`（新規作成）

- [ ] `detectSpecrunnerWorktree` をモックし `{ isSpecrunnerWorktree: true, mainCheckoutPath: "/repo" }` を返す条件下で:
  - `runPs({})` が 2 を返すことをテストする
  - `runJobStats({ cwd: process.cwd(), json: false })` が 2 を返すことをテストする
  - `runJobShow("some-slug")` が 2 を返すことをテストする
  - いずれも `JobStateStore.list` が呼ばれないことをテストする（vi.spyOn でスパイ）
  - stderr に main checkout パスへの案内が含まれることをテストする
- [ ] `detectSpecrunnerWorktree` をモックし `{ isSpecrunnerWorktree: false }` を返す条件下で:
  - `runPs` が通常の flow（`JobStateStore.list` 呼び出し）に進むことをテストする（ENOENT 等の IO エラーは許容）

**Acceptance Criteria**:
- 新規テストファイルが `bun run test` で全件 pass する
- T-06 実施前は worktree guard 発火のテストが fail し、T-06 実施後に pass する

---

## T-08: typecheck と全テストが green であることを確認する

- [ ] `bun run typecheck` が error なしで通過する
- [ ] `bun run test` が全件 pass する

**Acceptance Criteria**:
- `typecheck && test` が green
