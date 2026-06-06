# Tasks: `.specrunner/jobs/` を完全撤去する

> 各タスクは design.md の Decisions（D1–D7）に対応する。順序は依存を反映：
> job-access の安全網撤去（D2）→ store の layout 撤去（D1）→ runtime / cancel（D3）→ doctor（D4）→ rules（D5）→ docs（D7）→ test 移行（D6）→ 検証。
> store の helper を消す前に、helper を使う caller（job-access / local.ts / cancel）を slug/changeDir 化しておくこと（typecheck を壊さない順序）。

## T-01: job-access の no-sidecar 安全網を撤去する（D2）

- [ ] `src/core/job-access/load-by-job-id.ts`: 末尾の `return new JobStateStore(jobId, repoRoot).load();`（step 4）を削除し、代わりに `SpecRunnerError(ERROR_CODES.JOB_NOT_FOUND, ...)` を throw する（hint は `specrunner ps` を案内、`SpecRunnerError` / `ERROR_CODES` を `../../errors.js` から import）。
- [ ] docstring の「step 4: No sidecar entry: fallback to jobs-dir + legacy readFile」記述を「解決不能時はエラー」に更新する。
- [ ] `src/core/job-access/resolve-state-store.ts`: 末尾の `return new JobStateStore(jobId, repoRoot);`（step 3）を `return null;` に変更する。docstring の「Step 3: no sidecar entry — fallback to jobId-based store」を「解決不能時は null（degraded skip）」に更新する。
- [ ] `src/cli/job-show.ts`: `loadStateByJobId` の catch に JOB_NOT_FOUND 分岐を補い、「Error: Job not found: <input>」相当のメッセージで exit 1 にする（既存 ENOENT 分岐と同等の出力に揃える）。`// falling back to jobs-dir (T-05 D4)` コメントを更新する。

**Acceptance Criteria**:
- `loadStateByJobId` は sidecar 解決失敗時に jobs-dir を読まず JOB_NOT_FOUND を throw する。
- `resolveStateStoreByJobId` は解決失敗時に `null` を返す。
- `job show <未知 jobId>` が exit 1 で「Job not found」相当を出す。

## T-02: `local.ts` の no-worktree fallback を撤去する（D3 / LR1 / LR2）

- [ ] `src/core/runtime/local.ts` `buildDeps()` の `storeFactory`: `if (wtp) { return new JobStateStore(id, this.cwd, { slug, stateRoot: wtp }); } return new JobStateStore(id, this.cwd);` を、`wtp` 不在時に `SpecRunnerError`（不変条件違反：`buildDeps` は setupWorkspace 後に呼ばれ worktreePath は常に在る）を throw する形へ変更する。jobs-dir ストア構築を残さない。
- [ ] `src/core/runtime/local.ts` `registerCleanup()` の `makeStore`: `slugOpts ? new JobStateStore(jobId, cwd, slugOpts) : new JobStateStore(jobId, cwd)` を、`slugOpts` 不在時に throw する形へ変更する（`makeStore()` は best-effort try/catch 内で使われるため throw は cleanup の skip になる）。jobs-dir ストア構築を残さない。

**Acceptance Criteria**:
- `local.ts` に slug / changeDir を伴わない `new JobStateStore(...)` 構築が残らない。
- `bun run typecheck` が通る。

## T-03: `JobStateStore` の jobs-dir layout を撤去する（D1 / L1 / L2 / L3 / L4）

- [ ] `src/store/job-state-store.ts`: import から `getJobStatePath` / `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath`（`../util/xdg.js`）を削除する。
- [ ] `load()`: 「slug/changeDir 分岐 → ENOENT で jobId path へ fall-through → legacy flat readFile」を撤去する。`this.changeDir || this.isSlugMode()` を前提とし、いずれでもない場合は `SpecRunnerError`（内部不変条件違反）を throw する。slug/changeDir 経路の `loadSplitLayout(...)` の `ENOENT` は catch せずそのまま伝播させる（`slugInject` は `isSlugMode()` の時のみ渡す、現状維持）。
- [ ] `getEventsPath()` / `getStateJsonPath()`: `changeDir` / `isSlugMode()` 分岐のみ残し、末尾の `getJobEventsPath` / `getJobStateJsonPath` 返却を削除する。両モード不在時は throw する。
- [ ] `create()` static method を**メソッドごと削除**する（production caller なし）。`buildInitialJobState`（export 純粋 factory）は残す。`create()` 内の jobs-dir 書き込み（`getJobEventsPath` / `getJobStateJsonPath`）も同時に消える。
- [ ] `delete()` static method を**メソッドごと削除**する（caller は T-04 で除去 / 置換）。
- [ ] class header docstring / `load()` docstring / `list()` docstring から「Split layout」「Legacy `.specrunner/jobs/<jobId>.json`」「split-layout subdirectories」「legacy flat files」等の jobs-dir layout 記述を削除し、実 section 構成（slug current / archive / worktrees、sidecar supplement、managed markers）に合わせる。

**Acceptance Criteria**:
- `src/store/job-state-store.ts` に jobs-dir helper の import / 使用が無い。
- `JobStateStore.create` / `JobStateStore.delete` が存在しない。
- `load()` は slug / changeDir 専用で、ENOENT を呼び出し側に伝播する。
- `bun run typecheck` が通る。

## T-04: cancel の purge を slug 起点に統一する（D3 / L4）

- [ ] `src/core/cancel/runner.ts` `cancelSingleJob` の `--purge` ブロック: `await JobStateStore.delete(deps.repoRoot, jobId);` を削除する。既存の `.specrunner/local/<slug>/` 削除（`fs.rm(path.join(deps.repoRoot, localSidecarDir(slugForMarker)), { recursive: true, force: true })`）を唯一の物理削除として残す。
- [ ] `src/core/cancel/runner.ts` `cancelAllTerminated`: ループ内の `await JobStateStore.delete(repoRoot, state.jobId);` を、`getJobSlug(state)` を解決し空でなければ `fs.rm(path.join(repoRoot, localSidecarDir(slug)), { recursive: true, force: true })` する best-effort 削除へ置換する（slug 空なら removed カウントから除外 or skip し、warnings 方針は既存に合わせる）。`getJobSlug` を import に追加（未 import なら）。
- [ ] `JobStateStore` の import が `list()` 用途で残ることを確認する（`delete` 専用 import になっていないか）。

**Acceptance Criteria**:
- cancel から `JobStateStore.delete` 参照が消える。
- `--purge` / `cancelAllTerminated` が `.specrunner/local/<slug>/` を削除し、`.specrunner/jobs/` には触れない。
- local の slug 正本（commit 済 change folder）は purge で削除されない。

## T-05: `xdg.ts` の jobId-store path helper を撤去する（D1 / X1）

- [ ] `src/util/xdg.ts`: `getJobsDir` / `getJobStatePath` / `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath` の 5 関数を削除する。
- [ ] `getConfigPath` / `getCredentialsPath` / `resolveXdgConfigDir` / `resolveXdgStateDir` / `getVerboseLogDir` / `getVerboseLogPath` / `getAgentLogDir`（logs 系・config 系）は**残す**（jobs-dir とは無関係）。
- [ ] 削除後、`src/` 全体で 5 helper の参照が無いことを grep で確認する（T-01〜T-04 完了が前提）。

**Acceptance Criteria**:
- `getJobsDir` / `getJobStatePath` / `getJobStateJsonPath` / `getJobEventsPath` / `getJobDir` が `src/` で定義も使用も無い。
- `bun run typecheck` が通る。

## T-06: doctor の storage check を sidecar 起点 + legacy 検出に置換する（D4 / 要件 4・6）

- [ ] `jobs-writable` を machine-local sidecar root の writable チェックへ転用する：検査対象を `.specrunner/local/` に変更し、check `name` / ファイル名を新 target に合わせて改名する（例 `local-state-writable` / `local-state-writable.ts`）。「存在 + writable → pass / 不在 + 祖先 writable → warn / 不在 or not writable → fail」のロジックと `required: true`、メッセージの dir 表示を新 target に合わせて維持する。
- [ ] `old-state-files` を legacy `.specrunner/jobs/` 検出チェックへ転用する：GC カウント（100 件閾値）をやめ、`.specrunner/jobs/`（`ctx.cwd` 基準）が存在すれば `warn`（message: 旧 job state ディレクトリ検出 / hint: `rm -rf .specrunner/jobs` 等で手動削除）、不在なら `pass` を返す。check `name` / ファイル名を改名する（例 `legacy-jobs-dir` / `legacy-jobs-dir.ts`）。`required: false` を維持。`ctx.fs.existsSync` / `readdirSync` 等の注入 fs を使う。
- [ ] `src/core/doctor/checks/index.ts`: 旧 import（`jobsWritableCheck` / `oldStateFilesCheck`）を新 check の import に差し替え、`commonChecks` 配列と末尾の re-export を更新する。

**Acceptance Criteria**:
- doctor の writable チェックが `.specrunner/local/` を対象にし、`.specrunner/jobs/` を対象にしない。
- `.specrunner/jobs/` が存在すると doctor が `warn` を返し手動削除を促す。不在なら `pass`。
- `doctor/checks/index.ts` が新 check のみを参照する。

## T-07: `prompts/rules.ts` の job state path を更新する（D5 / 要件 5）

- [ ] `src/prompts/rules.ts` `RULES_MD_CONTENT` の `- **Job state**: \`.specrunner/jobs/<jobId>.json\`` を、新しい置き場（slug 正本 `specrunner/changes/<slug>/state.json` + machine-local sidecar `.specrunner/local/<slug>/`）を表す記述へ更新する。jobs-dir への言及を残さない。

**Acceptance Criteria**:
- `RULES_MD_CONTENT` に `.specrunner/jobs/` への言及が無い。
- Job state path 記述が新 layout を正しく示す。

## T-08: 残存 docstring / コメントの整合（D7 / 要件 7）

- [ ] `src/core/command/pipeline-run.ts`: `// Bootstrap job state (local: no I/O; managed: persists to jobs-dir)` 等の stale コメントを実態（managed も jobs-dir に書かない）に更新する。
- [ ] `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts`: 「Does NOT write to .specrunner/jobs/<jobId>/」等の記述を簡潔化 or 削除する（撤去後は自明）。
- [ ] `src/` 全体を `\.specrunner/jobs` で grep し、コメント / docstring を含め jobs-dir への参照が残らないことを確認する（テストは T-09 で扱う）。

**Acceptance Criteria**:
- `src/`（テストを除く）に `.specrunner/jobs` への参照（コード・コメント・docstring）が残らない。

## T-09: jobs-dir を seed / assert する既存テストを slug 起点へ移行する（D6）

> 撤去対象の挙動そのものを検証するテストは削除し、新挙動の検証へ置き換える。新規シナリオの test 追加は test-case-gen / implementer が担当。ここでは本変更で破綻する既存テストの移行方針を列挙する。

- [ ] `JobStateStore.create()` を setup に使うテスト（`tests/state-store.test.ts` / `tests/resolve-job-id.test.ts` / `tests/finish-job-state.test.ts` / `tests/pipeline.test.ts` / `tests/pipeline-integration.test.ts` / `tests/multi-layer-defense.test.ts` / `tests/spec-review-step.test.ts` / `tests/core/steps/spec-review.test.ts` / `tests/unit/cli/resume.test.ts` / `tests/unit/core/cancel/runner.test.ts` / `tests/unit/core/runtime/local.test.ts` / `tests/unit/core/command/runner.test.ts` / `tests/unit/core/step/executor.test.ts` / `tests/unit/core/step/executor-verdict.test.ts` / `tests/unit/core/resume/resolve-job.test.ts` / `tests/unit/step/executor-helpers.test.ts` ほか）を、slug 起点 seeding（`buildInitialJobState` + slug-mode / `changeDir` ストアでの seed、または既存 slug seed パターン）へ移行する。共通の test seeding helper を 1 つ用意して `JobStateStore.create()` 呼び出しを置換する。
- [ ] jobs-dir に直接 flat file / split layout を書くテスト（`src/core/lifecycle/__tests__/exit-guard.test.ts` / `tests/jobs-dir-no-readdir.test.ts` / `tests/local-no-jobs-dir-writes.test.ts` / `tests/load-by-job-id.test.ts` / `tests/store/job-state-store.test.ts` / `tests/state/session-timeout-migration.test.ts` ほか）を、撤去後の挙動に合わせて移行 or 削除する。
- [ ] 撤去対象を直接検証するテストの置換：
  - `tests/unit/util/xdg.test.ts` の 5 helper 検証を削除する（helper 撤去に伴い不要）。
  - `tests/unit/core/job-access/resolve-state-store.test.ts` の no-sidecar → jobId ストア期待を、`null` 期待へ更新する。
  - `loadStateByJobId` の no-sidecar → jobs-dir load 期待を、JOB_NOT_FOUND throw 期待へ更新する。
- [ ] doctor テスト：旧 `jobs-writable` / `old-state-files` のテストを、新 `local-state-writable`（`.specrunner/local/` の pass/warn/fail）/ `legacy-jobs-dir`（存在 → warn / 不在 → pass）の検証へ更新する。

**Acceptance Criteria**:
- 撤去された API（`JobStateStore.create` / `delete`、5 helper）を参照する test が残らない。
- 移行後の test が新挙動（解決不能 → エラー / null、doctor の legacy 検出、purge の slug 起点削除）を検証する。

## T-10: 検証（受け入れ基準）

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green。
- [ ] `getJobsDir` / `getJobStatePath` / `getJobStateJsonPath` / `getJobEventsPath` / `getJobDir` が `src/` で定義も使用も無い（grep）。
- [ ] `src/`（テスト除く）に `.specrunner/jobs` への読み書き・コメント参照が無い（grep）。
- [ ] 旧 `.specrunner/jobs/` データが存在しても `job ls` / `show` / `cancel` / `resume` / `archive` が local / managed 両 runtime で壊れない。
- [ ] `specrunner doctor` が `.specrunner/jobs/` 存在時に warn（手動削除促し）、不在時に pass を返す。

**Acceptance Criteria**:
- 上記すべてを満たす。

## T-11: ADR 起票（後続ステップ）

- [ ] 本変更の設計判断（jobs-dir layout の全廃 / `JobStateStore` の jobId-only モード廃止 / job-access 安全網の除去 / doctor チェックの目的転用）を ADR 化する（`adr: true`）。

**Acceptance Criteria**:
- ADR が後続 adr-gen ステップで起票される（具体 path は adr-gen に委ねる）。
