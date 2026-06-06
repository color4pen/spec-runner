# Tasks: job 終端処理を slug 正本に一本化する

## T-01: pipeline 終端 phase の commit seam を追加する（D5）

- [x] `src/core/step/commit-push.ts` に終端用 helper を追加する。worktree cwd で `git add -A` → staged 変更（または HEAD 進行）があれば `git commit -m "finalize: <slug>"` → branch へ push（1 回 retry）。push が恒久失敗した場合は throw せず `stderrWrite` で警告し best-effort で続行する（PR は既に作成済みのため run 全体を失敗させない）。staged 変更が無く HEAD も進んでいない場合は何もしない（冪等）。
- [x] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に `commitFinalState(deps, state)` を追加する（domain 型は既存方針どおり `unknown` 受けで宣言）。
- [x] `src/core/runtime/local.ts` に `commitFinalState` を実装する。`deps`（`PipelineDeps`）から worktree cwd / branch / slug を取り、T-01 の helper を呼ぶ。
- [x] `src/core/runtime/managed.ts` に `commitFinalState` を no-op で実装する（他の B-8 seam no-op と同列）。
- [x] `src/core/pipeline/pipeline.ts` の `runInternal` 終端分岐（`nextStep === "end" && state.status === "running"` で `awaiting-archive` へ遷移し `endStore.persist(state)` した直後）に `await deps.runtimeStrategy?.commitFinalState(deps, state)` を追加する。`deps.runtimeStrategy` 未注入のテストでは呼ばれないこと（`?.` ガード）。

**Acceptance Criteria**:
- local runtime で pipeline 完走後、feature branch の最新 commit に `changes/<slug>/state.json`（`status=awaiting-archive`）と `events.jsonl`（終端 transition record）が含まれる。
- managed runtime では `commitFinalState` がローカル git 操作を行わない。
- 終端 commit の push 失敗時に run が exit 0 のまま警告を出す（throw しない）。
- `deps.runtimeStrategy` 未注入の既存 pipeline テストが回帰しない。

## T-02: slug 正本 location を解決する resolver を追加する（D2）

- [x] `src/core/finish/` に `resolveCanonicalStateDir(slug, repoRoot): Promise<string | null>` を追加する。
  - [x] `repoRoot/specrunner/changes/<slug>/state.json` が存在すれば active dir の絶対パスを返す（`changeFolderPath` 利用）。
  - [x] なければ `repoRoot/specrunner/changes/archive/*` を走査し、`parseArchiveDirName(name).slug === slug` かつ `state.json` を持つ最初の dir の絶対パスを返す（`archivedChangesDirRel` / `parseArchiveDirName` 利用）。
  - [x] どちらも無ければ `null` を返す。
- [x] active を archive より優先する。archive 走査対象は `state.json` を持つ dir に限る。

**Acceptance Criteria**:
- active `changes/<slug>/state.json` がある場合は active dir を返す。
- active が無く `changes/archive/<dated>-<slug>/state.json` がある場合は archive dir を返す（日付 prefix に依存しない）。
- どちらも無い場合は `null` を返す（throw しない）。

## T-03: JobStateStore に明示 changeDir seam を追加する（D3）

- [x] `src/store/job-state-store.ts` の slug-mode opts に「state ディレクトリ絶対パス」を明示注入する optional フィールドを追加する。
- [x] 指定時は `getStateJsonPath()` / `getEventsPath()` をその dir 直下（`state.json` / `events.jsonl`）に解決し、slug 規約（`slugStateJsonPath` / `slugEventsPath`）を上書きする。未指定時は従来の slug 規約に完全一致させる。
- [x] `load()`（fold + crash recovery）/ `persist()`（delta-append）/ `slugInject` がその dir 指定下でも従来どおり動くこと。

**Acceptance Criteria**:
- changeDir を指定した store の `load()` がその dir の `state.json` + `events.jsonl` を fold して `NormalizedJobState` 等価を返す。
- changeDir を指定した store の `persist()` が `events.jsonl` に delta を append し `state.json` を overwrite する。
- changeDir 未指定の slug-mode 経路（run 中の worktree 書き込み）の挙動が不変。

## T-04: markJobArchived を slug 正本一本化に作り替える（D1）

- [x] `src/core/finish/job-state-update.ts` の `markJobArchived` を `markJobArchived(slug, repoRoot)` に変更する。
  - [x] `resolveCanonicalStateDir(slug, repoRoot)`（T-02）で正本 dir を解決する。`null` なら明示エラー（slug に対応する正本が無い旨）。
  - [x] changeDir seam（T-03）の `JobStateStore` で `load()` → `transitionJob(state, "archived", { trigger: "archive", reason: "change archived" })` → noop なら現状返し、そうでなければ `persist()`。
  - [x] jobId-only の `new JobStateStore(jobId, repoRoot)` 直読みを廃止する。
- [x] `assertJobFinishable` は不変（slug 正本 state を受け取る gate のまま）。

**Acceptance Criteria**:
- `awaiting-archive` の slug 正本に対し status が `archived` になり、archive-location に persist される。
- `events.jsonl` に `awaiting-archive → archived` transition record が 1 件 append される。
- 既に `archived` の正本に対しては no-op で現状を返す（冪等）。
- jobId ストア（`.specrunner/jobs/<jobId>/`）を read/write しない。

## T-05: archive orchestrator を並べ替える（D4 / D7）

- [x] `src/core/archive/orchestrator.ts` の Phase 1 を「checkout → pull → derive usage → `archiveChangeFolder`（mv／skip）→ `markJobArchived(slug, cwd)` → `git add specrunner/changes/` → `commitArchive` → push」に並べ替える。
- [x] 旧 Phase 3（commit/push 後の `markJobArchived`）を撤去し、最終遷移を commit の **前** に移す。
- [x] 旧 Phase 2（worktree teardown + branch 削除）は commit/push の後（best-effort）に置く。
- [x] `markJobArchived` 呼び出しを `(jobId, cwd)` から `(slug, cwd)` に更新する（slug は `input.slug`）。
- [x] Phase 0（`JobStateStore.list` による正本解決 + terminal no-op + finishable gate）は不変。

**Acceptance Criteria**:
- 正常系: `awaiting-archive` の job を archive すると、mv → archived 化 → 1 つの archive commit（mv と status 変更を同梱）→ push の順で完了し exit 0。
- 冪等再実行: folder 移動済みで `awaiting-archive` の job を再実行すると、`archiveChangeFolder` が skip し `markJobArchived` が archive-location を `archived` に遷移して commit/push する。
- terminal（`archived` / `canceled`）の job は Phase 0 で no-op exit 0（git 操作なし）。

## T-06: job ls 既定除外を確認・固定する（D6）

- [x] `src/cli/ps.ts` の既定フィルタ（`!isTerminal(j.status)`）が archived を除外することを確認する（変更不要の想定。必要時のみ修正）。
- [x] `JobStateStore.list()` の dedup（newest `updatedAt` 勝ち）で、archive-location の `archived` が legacy jobId ストアの `running` に勝つことを回帰テストで固定する。

**Acceptance Criteria**:
- archived の job が `job ls`（既定）に出ず、`job ls --all` に出る。
- 同一 jobId が複数 location に存在しても archived（最新 updatedAt）が既定一覧の判定に採用される。

## T-07: テストを更新・追加する

- [x] `tests/finish-job-state.test.ts`: `markJobArchived` の呼び出しを `(slug, repoRoot)` に更新し、slug 正本（`changes/<slug>/`）から `awaiting-archive → archived` 遷移する形に直す。idempotent（既に archived → no-op）と transition record 追記を検証する。
- [x] `tests/unit/core/archive/orchestrator.test.ts`: `markJobArchived` 期待引数を `(slug, cwd)` に更新し、Phase 順序変更（mv → mark → commit → push）と冪等再実行（mv skip → mark → commit）を検証する。
- [x] `resolveCanonicalStateDir`（T-02）の unit test を追加する（active / archive / 不在）。
- [x] changeDir seam（T-03）の load/persist unit test を追加する（archive-location read-modify-write）。
- [x] 終端 commit seam（T-01）の test を追加する（local が `state.json`/`events.jsonl` を commit、managed が no-op）。

**Acceptance Criteria**:
- 更新・追加した test が green。
- spec.md の各 Scenario に対応する検証が存在する。

## T-08: 検証を green にする

- [x] `bun run typecheck` が pass。
- [x] `bun run test` が pass。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
