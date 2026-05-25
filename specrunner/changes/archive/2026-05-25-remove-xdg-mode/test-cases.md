# Test Cases: remove-xdg-mode

## Metadata

- **source**: request.md + design.md + tasks.md
- **generated**: 2026-05-24

---

## Category: CONFIG — config.jobs.location 廃止

### TC-CFG-01

- **priority**: must
- **source**: request.md 受け入れ基準 #2 / Task 2

**GIVEN** ユーザーの `~/.config/specrunner/config.yaml` に `jobs: { location: "xdg" }` が残っている  
**WHEN** `specrunner run` を実行する  
**THEN** エラーにならず、jobs state は `<repo-root>/.specrunner/jobs/` に書き込まれる

---

### TC-CFG-02

- **priority**: must
- **source**: request.md 受け入れ基準 #1 / Task 2

**GIVEN** `~/.config/specrunner/config.yaml` に `jobs` セクションが存在しない  
**WHEN** `specrunner run` を実行する  
**THEN** エラーにならず、jobs state は `<repo-root>/.specrunner/jobs/` に書き込まれる

---

### TC-CFG-03

- **priority**: must
- **source**: Task 2 / design.md D5

**GIVEN** `SpecRunnerConfig` の型定義  
**WHEN** コードを参照する  
**THEN** `JobsConfig` interface が存在せず、`SpecRunnerConfig.jobs` field が存在しない

---

### TC-CFG-04

- **priority**: must
- **source**: Task 2

**GIVEN** `validateConfig()` 関数  
**WHEN** `{ jobs: { location: "xdg" } }` を渡す  
**THEN** validation error が発生せず、`jobs` フィールドは未知 field として無視される

---

### TC-CFG-05

- **priority**: must
- **source**: Task 2

**GIVEN** `validateConfig()` 関数  
**WHEN** `{ jobs: { location: "project" } }` を渡す  
**THEN** validation error が発生せず、`jobs` フィールドは未知 field として無視される

---

## Category: XDG_API — xdg.ts module-level state 削除

### TC-XDG-01

- **priority**: must
- **source**: request.md 受け入れ基準 #3 / Task 1

**GIVEN** `src/util/xdg.ts` のエクスポート一覧  
**WHEN** モジュールを import する  
**THEN** `setJobsLocation`, `resetJobsLocation`, `jobsLocation`, `projectRoot` がエクスポートされていない

---

### TC-XDG-02

- **priority**: must
- **source**: Task 1 / design.md D1

**GIVEN** `getJobsDir` 関数  
**WHEN** `repoRoot = "/path/to/repo"` を渡す  
**THEN** `"/path/to/repo/.specrunner/jobs"` を返す

---

### TC-XDG-03

- **priority**: must
- **source**: Task 1 / design.md D1

**GIVEN** `getVerboseLogDir` 関数  
**WHEN** `repoRoot = "/path/to/repo"` を渡す  
**THEN** `"/path/to/repo/.specrunner/logs"` を返す

---

### TC-XDG-04

- **priority**: must
- **source**: Task 1

**GIVEN** `getJobStatePath` 関数  
**WHEN** `repoRoot = "/path/to/repo"`, `jobId = "abc123"` を渡す  
**THEN** `"/path/to/repo/.specrunner/jobs/abc123.json"` を返す

---

### TC-XDG-05

- **priority**: must
- **source**: Task 1

**GIVEN** `getVerboseLogPath` 関数  
**WHEN** `repoRoot = "/path/to/repo"`, `jobId = "abc123"` を渡す  
**THEN** `"/path/to/repo/.specrunner/logs/abc123.log"` を返す

---

### TC-XDG-06

- **priority**: must
- **source**: Task 1

**GIVEN** `getJobsDir` / `getVerboseLogDir` を同一プロセス内で複数回呼ぶ  
**WHEN** 異なる `repoRoot` 値を渡す  
**THEN** 各呼び出しが渡された `repoRoot` に基づいたパスを返す（module-level state に依存しない）

---

### TC-XDG-07

- **priority**: should
- **source**: Task 1

**GIVEN** `src/util/xdg.ts`  
**WHEN** `resolveXdgDataDir` の export を確認する  
**THEN** `resolveXdgDataDir` がエクスポートされていない（他に consumer なし）

---

## Category: JOB_STATE — JobStateStore の repoRoot 引数対応

### TC-JSS-01

- **priority**: must
- **source**: Task 3 / design.md D2

**GIVEN** `new JobStateStore(jobId, repoRoot)` コンストラクタ  
**WHEN** `jobId = "abc123"`, `repoRoot = "/path/to/repo"` で生成する  
**THEN** 内部の `filePath` が `"/path/to/repo/.specrunner/jobs/abc123.json"` になる

---

### TC-JSS-02

- **priority**: must
- **source**: Task 3

**GIVEN** `JobStateStore.create(repoRoot, params)` static method  
**WHEN** `repoRoot = "/path/to/repo"` で呼び出す  
**THEN** job state file が `"/path/to/repo/.specrunner/jobs/<jobId>.json"` に作成される

---

### TC-JSS-03

- **priority**: must
- **source**: Task 3

**GIVEN** `/path/to/repo/.specrunner/jobs/` に複数の job state file が存在する  
**WHEN** `JobStateStore.list("/path/to/repo")` を呼び出す  
**THEN** そのディレクトリ内の job 一覧が返される

---

### TC-JSS-04

- **priority**: must
- **source**: Task 3

**GIVEN** `/path/to/repo/.specrunner/jobs/abc123.json` が存在する  
**WHEN** `JobStateStore.delete("/path/to/repo", "abc123")` を呼び出す  
**THEN** 該当 file が削除される

---

### TC-JSS-05

- **priority**: must
- **source**: Task 3

**GIVEN** `JobStateStore.resolveId(repoRoot, prefix)` static method  
**WHEN** `repoRoot` と job ID の prefix を渡す  
**THEN** `list(repoRoot)` 経由でマッチする job ID を返す

---

### TC-JSS-06

- **priority**: should
- **source**: Task 3 / design.md D2

**GIVEN** `storeFactory` closure を使う runtime (local.ts / managed.ts)  
**WHEN** `(id: string) => new JobStateStore(id, repoRoot)` として生成する  
**THEN** `StoreFactory` 型 `(jobId: string) => JobStateStore` の signature が変わっていない（closure capture で解決）

---

## Category: VERBOSE_LOG — initVerboseLog の repoRoot 対応

### TC-VL-01

- **priority**: must
- **source**: Task 4

**GIVEN** `initVerboseLog(repoRoot, jobId)` 関数  
**WHEN** `repoRoot = "/path/to/repo"`, `jobId = "abc123"` で呼び出す  
**THEN** verbose log file が `"/path/to/repo/.specrunner/logs/abc123.log"` に作成される

---

### TC-VL-02

- **priority**: must
- **source**: Task 5

**GIVEN** `CommandRunner.execute()` の内部処理  
**WHEN** `PrepareResult.repoRoot` を `initVerboseLog` に渡す  
**THEN** log file が正しい repo 内パスに書き込まれる

---

### TC-VL-03

- **priority**: must
- **source**: Task 5

**GIVEN** `PrepareResult` interface  
**WHEN** 型定義を参照する  
**THEN** `repoRoot: string` field が存在する

---

## Category: CLI — setJobsLocation 呼び出し削除

### TC-CLI-01

- **priority**: must
- **source**: request.md 受け入れ基準 #4 / Task 6

**GIVEN** `src/cli/run.ts`, `src/cli/resume.ts`, `src/cli/cancel.ts`, `src/cli/finish.ts`, `src/cli/ps.ts`, `src/cli/job-show.ts`  
**WHEN** 各ファイルのソースコードを参照する  
**THEN** `setJobsLocation` の import も呼び出しも存在しない

---

### TC-CLI-02

- **priority**: must
- **source**: Task 6

**GIVEN** Git リポジトリのルートで `specrunner ps` を実行する  
**WHEN** コマンドを実行する  
**THEN** `<repo-root>/.specrunner/jobs/` 内の job 一覧が表示される（XDG path ではない）

---

### TC-CLI-03

- **priority**: must
- **source**: Task 6 / design.md D4

**GIVEN** Git リポジトリ外のディレクトリで `specrunner ps` を実行する  
**WHEN** `git rev-parse --show-toplevel` が失敗する  
**THEN** エラーが発生するか空リストを返す（XDG path にフォールバックしない）

---

### TC-CLI-04

- **priority**: must
- **source**: Task 6

**GIVEN** Git リポジトリのルートで `specrunner cancel <jobId>` を実行する  
**WHEN** コマンドを実行する  
**THEN** `repoRoot` を `git rev-parse` で解決し、`JobStateStore.resolveId(repoRoot, ...)` で job を検索する

---

### TC-CLI-05

- **priority**: should
- **source**: Task 6

**GIVEN** CLI entry point (run.ts) のソースコード  
**WHEN** 参照する  
**THEN** `config.jobs?.location` への参照が存在しない

---

## Category: E2E — エンドツーエンドの job 書き込み検証

### TC-E2E-01

- **priority**: must
- **source**: request.md 受け入れ基準 #1

**GIVEN** `config.jobs` セクションが設定されていない状態のリポジトリ  
**WHEN** `specrunner run` でジョブを開始する  
**THEN** job state file が `<repo-root>/.specrunner/jobs/<jobId>.json` に作成される

---

### TC-E2E-02

- **priority**: must
- **source**: request.md 受け入れ基準 #2

**GIVEN** `config.yaml` に `jobs: { location: "xdg" }` が残っているリポジトリ  
**WHEN** `specrunner run` でジョブを開始する  
**THEN** job state file が `<repo-root>/.specrunner/jobs/<jobId>.json` に作成される（XDG path ではない）

---

### TC-E2E-03

- **priority**: must
- **source**: request.md 受け入れ基準 #7

**GIVEN** `~/.local/share/specrunner/jobs/` に残った旧 XDG job state file  
**WHEN** その job ID で `specrunner resume <jobId>` を実行する  
**THEN** resume 不可（自動移行しない）— ENOENT または "job not found" エラー

---

### TC-E2E-04

- **priority**: must
- **source**: request.md 受け入れ基準 #6

**GIVEN** 変更後のコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーがゼロで終了する

---

### TC-E2E-05

- **priority**: must
- **source**: request.md 受け入れ基準 #6

**GIVEN** 変更後のコードベース  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが green で終了する

---

### TC-E2E-06

- **priority**: should
- **source**: design.md D4

**GIVEN** `~/.config/specrunner/` (per-user config / credentials)  
**WHEN** 変更後のコードを実行する  
**THEN** config / credentials は引き続き `XDG_CONFIG_HOME` 配下に読み書きされる（スコープ外変更なし）

---

## Category: RUNTIME — Runtime composition root

### TC-RT-01

- **priority**: must
- **source**: Task 7

**GIVEN** `src/core/runtime/local.ts` の `buildDeps()`  
**WHEN** ソースを参照する  
**THEN** `storeFactory` が `(id: string) => new JobStateStore(id, this.cwd)` として定義されている

---

### TC-RT-02

- **priority**: must
- **source**: Task 7

**GIVEN** `src/core/runtime/managed.ts`  
**WHEN** ソースを参照する  
**THEN** `storeFactory` が `(id: string) => new JobStateStore(id, this.cwd)` として定義されている

---

### TC-RT-03

- **priority**: must
- **source**: Task 8

**GIVEN** `src/core/finish/orchestrator.ts` の `new JobStateStore(id)` 呼び出し  
**WHEN** ソースを参照する  
**THEN** `new JobStateStore(id, repoRoot)` に更新されている

---

### TC-RT-04

- **priority**: must
- **source**: Task 8

**GIVEN** `src/state/store.ts` の deprecated wrappers  
**WHEN** ソースを参照する  
**THEN** deprecated wrappers が削除され、`managed.ts` から `JobStateStore` を直接使用している

---

## Category: DOC — ドキュメント・rules.ts の XDG 言及削除

### TC-DOC-01

- **priority**: must
- **source**: request.md 受け入れ基準 #5 / Task 9

**GIVEN** `src/prompts/rules.ts`  
**WHEN** ファイルの内容を参照する  
**THEN** `"xdg"` の文字列が存在しない

---

### TC-DOC-02

- **priority**: must
- **source**: request.md 受け入れ基準 #5 / Task 10

**GIVEN** `specrunner/project.md`  
**WHEN** ファイルの内容を参照する  
**THEN** `"xdg"` の文字列が存在しない

---

### TC-DOC-03

- **priority**: should
- **source**: Task 9

**GIVEN** `src/prompts/rules.ts` の job state path 記述  
**WHEN** 参照する  
**THEN** `.specrunner/jobs/<jobId>.json` / `.specrunner/logs/<jobId>.log` のみ記載されている

---

## Category: TEST_CLEANUP — テストファイルの整理

### TC-TC-01

- **priority**: must
- **source**: Task 11

**GIVEN** `tests/unit/util/xdg.test.ts`  
**WHEN** ファイルを参照する  
**THEN** `setJobsLocation` / `resetJobsLocation` の import と使用箇所が存在しない

---

### TC-TC-02

- **priority**: must
- **source**: Task 11

**GIVEN** `tests/unit/util/xdg.test.ts`  
**WHEN** ファイルを参照する  
**THEN** `afterEach` 内に `resetJobsLocation()` 呼び出しが存在しない

---

### TC-TC-03

- **priority**: must
- **source**: Task 11

**GIVEN** `tests/unit/config/schema.test.ts`  
**WHEN** ファイルを参照する  
**THEN** TC-JOBS-01〜08（`jobs.location` validation テスト）が存在しない（ファイル削除またはテスト削除）

---

### TC-TC-04

- **priority**: must
- **source**: Task 11

**GIVEN** `tests/finish-ps-integration.test.ts`  
**WHEN** ファイルを参照する  
**THEN** `resetJobsLocation` の import と `setJobsLocation("xdg")` の呼び出しが存在しない

---

### TC-TC-05

- **priority**: must
- **source**: Task 11

**GIVEN** `tests/unit/util/xdg.test.ts`  
**WHEN** `getJobsDir` のテストを実行する  
**THEN** `getJobsDir(repoRoot)` が正しいパスを返すことを検証するテストが存在する

---

### TC-TC-06

- **priority**: should
- **source**: Task 11

**GIVEN** テスト全体を `grep -r "jobs.location"` または `grep -r "setJobsLocation"` する  
**WHEN** 検索を実行する  
**THEN** ヒットするファイルが存在しない
