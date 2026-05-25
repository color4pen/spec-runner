# Tasks: remove-xdg-mode

## Task 1: `src/util/xdg.ts` — module state 削除 + 関数 signature 変更

- [x] module-level 変数 `jobsLocation`, `projectRoot` を削除
- [x] `setJobsLocation()` export を削除
- [x] `resetJobsLocation()` export を削除
- [x] `getJobsDir(repoRoot: string): string` に変更 — `path.join(repoRoot, ".specrunner", "jobs")` を返す
- [x] `getJobStatePath(repoRoot: string, jobId: string): string` に変更
- [x] `getVerboseLogDir(repoRoot: string): string` に変更 — `path.join(repoRoot, ".specrunner", "logs")` を返す
- [x] `getVerboseLogPath(repoRoot: string, jobId: string): string` に変更
- [x] XDG data/state path への分岐コード（`resolveXdgDataDir`, `resolveXdgStateDir`）は config/credentials 以外の用途がなくなるため、`getJobsDir` / `getVerboseLogDir` 内の XDG 分岐を削除
- [x] `resolveXdgDataDir()` は export 自体を削除（他に consumer がない）
- [x] `resolveXdgStateDir()` は test で使っているため、export は残す（config path 系で使わないが verbose-log テストで参照がないか確認して不要なら削除）

## Task 2: `src/config/schema.ts` — `JobsConfig` 型・validation 削除

- [x] `JobsConfig` interface 削除
- [x] `SpecRunnerConfig.jobs` field 削除
- [x] `RawConfig.jobs` field 削除
- [x] `validateConfig()` 内の jobs validation block (L325-L343) を削除
- [x] `SpecRunnerConfig` 上の `jobs` フィールドの JSDoc コメント削除

## Task 3: `src/store/job-state-store.ts` — `repoRoot` parameter 追加

- [x] constructor: `constructor(jobId: string, repoRoot: string)` — `this.filePath = getJobStatePath(repoRoot, jobId)` に変更
- [x] `static create(repoRoot: string, params: {...})` — 内部で `getJobStatePath(repoRoot, jobId)` を使用
- [x] `static list(repoRoot: string)` — 内部で `getJobsDir(repoRoot)` を使用
- [x] `static delete(repoRoot: string, jobId: string)` — 内部で `getJobStatePath(repoRoot, jobId)` を使用
- [x] `static resolveId(repoRoot: string, prefix: string)` — 内部で `list(repoRoot)` を呼ぶ
- [x] import 文から `getJobsDir`, `getJobStatePath` の旧 signature 対応を確認

## Task 4: `src/logger/stdout.ts` — `initVerboseLog` に `repoRoot` 追加

- [x] `initVerboseLog(repoRoot: string, jobId: string): void` に signature 変更
- [x] 内部で `getVerboseLogDir(repoRoot)` / `getVerboseLogPath(repoRoot, jobId)` を呼ぶ

## Task 5: `src/core/command/runner.ts` — `PrepareResult` に `repoRoot` 追加

- [x] `PrepareResult` interface に `repoRoot: string` field 追加
- [x] `execute()` 内の `initVerboseLog` 呼び出しを `initVerboseLog(prepared.repoRoot, jobState.jobId)` に変更
- [x] `execute()` 内の直接 `new JobStateStore(jobState.jobId)` 呼び出しを `new JobStateStore(jobState.jobId, prepared.repoRoot)` に変更

## Task 6: CLI entry points から `setJobsLocation` 削除 + `repoRoot` 伝搬

- [x] `src/cli/run.ts`: `setJobsLocation` import + 呼び出し削除。`config.jobs?.location` 参照削除。`.gitignore` ensure は `repoRoot` 参照のまま維持
- [x] `src/cli/resume.ts`: early config load の `setJobsLocation` ブロック削除。`prepare()` が `repoRoot` を返すようにする
- [x] `src/cli/cancel.ts`: `setJobsLocation` fallback ブロック全体を、`repoRoot` を `git rev-parse` で解決する単純なパターンに置換。`JobStateStore.resolveId(repoRoot, ...)` / `new JobStateStore(id, repoRoot)` / `JobStateStore.list(repoRoot)` / `JobStateStore.delete(repoRoot, id)` に更新
- [x] `src/cli/finish.ts`: 同様に `setJobsLocation` 削除 + `repoRoot` 伝搬
- [x] `src/cli/ps.ts`: 同様に `setJobsLocation` 削除 + `repoRoot` 伝搬。`listJobStates()` 呼び出しを `JobStateStore.list(repoRoot)` に
- [x] `src/cli/job-show.ts`: 同様に `setJobsLocation` 削除 + `repoRoot` 伝搬

## Task 7: Runtime composition root 更新

- [x] `src/core/runtime/local.ts`: `buildDeps()` 内の `storeFactory` を `(id: string) => new JobStateStore(id, this.cwd)` に変更
- [x] `src/core/runtime/managed.ts`: managed runtime は `this.cwd` を持ち job state を書く（`updateJobState()` を lines 149/192 で呼び出す）ため、`storeFactory` を `(id: string) => new JobStateStore(id, this.cwd)` に変更する

## Task 8: 残りの `new JobStateStore(jobId)` 呼び出しを更新

- [x] `src/core/command/resume.ts`: `prepare()` が `repoRoot` を返す + 直接 constructor 呼び出しに `repoRoot` 追加
- [x] `src/core/finish/orchestrator.ts`: 内部の `new JobStateStore(id)` に `repoRoot` 追加（finish command は repoRoot を持つ）
- [x] `src/core/cancel/runner.ts`: 内部の `new JobStateStore(id)` に `repoRoot` 追加
- [x] `src/state/store.ts`: deprecated wrappers を削除する。呼び出し元は managed.ts のみで、managed.ts は `this.cwd` を持つため `JobStateStore` を直接使用するよう managed.ts 側を更新する

## Task 9: `src/prompts/rules.ts` — XDG 言及削除

- [x] L80: Job state path から `（デフォルト。...）` の XDG 代替説明を削除
- [x] L81: Verbose log path から同上を削除
- [x] 結果: `.specrunner/jobs/<jobId>.json` / `.specrunner/logs/<jobId>.log` のみ記載

## Task 10: `specrunner/project.md` — XDG 言及削除

- [x] L41: `（デフォルト。`config.jobs.location: "xdg"` 設定時は...）` を削除
- [x] 結果: `ジョブ状態: .specrunner/jobs/ に JSON で永続化` のみ

## Task 11: テスト更新

- [x] `tests/unit/util/xdg.test.ts`:
  - `setJobsLocation` / `resetJobsLocation` の import と全使用箇所を削除
  - TC-XDG-10〜14（project mode via setJobsLocation）を `getJobsDir(repoRoot)` / `getVerboseLogDir(repoRoot)` の直接呼び出しテストに書き換え
  - TC-XDG-03（XDG mode verbose log dir）を `getVerboseLogDir(repoRoot)` テストに書き換え
  - `afterEach` の `resetJobsLocation()` 呼び出しを削除（module state がないため不要）
- [x] `tests/unit/config/schema.test.ts`:
  - TC-JOBS-01〜08 を全削除（`jobs` section の validation 自体がなくなるため）
  - ファイルが空になる場合はファイル自体を削除
- [x] `tests/finish-ps-integration.test.ts`:
  - `resetJobsLocation` import 削除
  - `setJobsLocation("xdg")` への言及を削除
  - `JobStateStore.list(repoRoot)` / `new JobStateStore(id, repoRoot)` に更新
- [x] 他テストで `jobs.location` を mock / setup している箇所を grep して整理

## Task 12: 型チェック + テスト green 確認

- [x] `bun run typecheck` pass
- [x] `bun run test` pass
