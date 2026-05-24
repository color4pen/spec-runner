# Tasks: jobs-to-dotspecrunner

## 共通制約 (全 task に適用)

- **MUST NOT**: `specrunner/specs/<capability>/spec.md` (authority / baseline spec) を直接編集してはならない。spec 変更は `specrunner/changes/jobs-to-dotspecrunner/specs/<capability>/spec.md` (delta path) のみで表現する
- baseline は `specrunner finish` 時の spec-merge が delta から自動更新するため、本 PR 内で baseline を書き換える経路は存在しない
- review feedback / spec-review finding が baseline path を指している場合でも、修正は delta path に対して行う（line 番号が一致しなくても delta の該当箇所を編集する）
- 違反すると `commit-push.ts` の `authoritySpecEditViolationError` で pipeline が halt する

## Task 1: config schema に `jobs` section を追加

- [x] `src/config/schema.ts`: `JobsConfig` interface 追加（`location?: "project" | "xdg"`）
- [x] `src/config/schema.ts`: `SpecRunnerConfig` に `jobs?: JobsConfig` field 追加
- [x] `src/config/schema.ts`: `validateConfig()` 内に `jobs.location` validation 追加（`"project"` | `"xdg"` 以外は `CONFIG_INVALID`）
- [x] `src/config/store.ts`: `saveConfig()` で `jobs` を strip 対象に含めない（通常の field として永続化）

**対象ファイル**: `src/config/schema.ts`
**テスト**: `tests/unit/config/` 配下の既存 schema test に `jobs.location` validation case を追加

## Task 2: `xdg.ts` に module-level state + `setJobsLocation()` を追加

- [x] `src/util/xdg.ts`: module-level 変数 `jobsLocation` (default `"xdg"`) と `projectRoot` (default `null`) を追加
- [x] `src/util/xdg.ts`: `setJobsLocation(location: "project" | "xdg", repoRoot?: string)` export 関数を追加
- [x] `src/util/xdg.ts`: `getJobsDir()` を修正 — `jobsLocation === "project" && projectRoot` のとき `path.join(projectRoot, ".specrunner", "jobs")` を返す
- [x] `src/util/xdg.ts`: `getVerboseLogDir()` を修正 — `jobsLocation === "project" && projectRoot` のとき `path.join(projectRoot, ".specrunner", "logs")` を返す
- [x] `src/util/xdg.ts`: テスト用に `resetJobsLocation()` を export（module state を初期値に戻す）

**対象ファイル**: `src/util/xdg.ts`
**テスト**: `tests/unit/util/xdg.test.ts` に project mode のテストケースを追加（`setJobsLocation("project", "/repo")` → `getJobsDir()` が `/repo/.specrunner/jobs` を返す、等）。各テスト afterEach で `resetJobsLocation()` 呼び出し。

## Task 3: CLI entry point に `setJobsLocation()` 呼び出しを追加

- [x] `src/cli/run.ts` (`runRunCore`): preflight 後、`PipelineRunCommand` 生成前に `setJobsLocation(config.jobs?.location ?? "project", cwd)` を呼ぶ
- [x] `src/cli/resume.ts`: config load（early）+ `setJobsLocation()` を resolveJobStateBySlug より前に呼ぶ
- [x] `src/cli/ps.ts` (`runPs`): 冒頭で config load + repo root 解決 + `setJobsLocation()` を呼ぶ。config load / repo root 解決が失敗した場合は `setJobsLocation("xdg")` で fallback
- [x] `src/cli/cancel.ts`: 関数冒頭（arg validation の直後、`resolveId` より前）で config load + repo root 解決 + `setJobsLocation()` を呼ぶ。config load / repo root 解決が失敗した場合は `setJobsLocation("xdg")` で fallback。`--all-terminated` パスも含めて、関数冒頭で `setJobsLocation` を呼ぶこと（`cancelAllTerminated()` も内部で `listJobStates()` 等を呼ぶため）
- [x] `src/cli/finish.ts`: 既存の config / repo root 解決の後に `setJobsLocation()` を追加
- [x] `src/cli/job-show.ts`: config load + repo root 解決 + `setJobsLocation()` を追加

**対象ファイル**: `src/cli/run.ts`, `src/cli/resume.ts`, `src/cli/ps.ts`, `src/cli/cancel.ts`, `src/cli/finish.ts`, `src/cli/job-show.ts`

## Task 4: `.gitignore` 管理ユーティリティ

- [x] `src/util/gitignore.ts` を新規作成: `ensureDotSpecrunnerGitignore(repoRoot: string): Promise<void>` を export
  - `.gitignore` を read（ENOENT 時は空文字列）
  - `.specrunner/` が行として存在するかチェック（行頭一致、コメント行でない）
  - 未存在時のみ末尾に append（最終行が改行で終わっていなければ改行を補完してから追記）
  - 冪等

**対象ファイル**: `src/util/gitignore.ts`（新規）
**テスト**: `tests/unit/util/gitignore.test.ts`（新規）— 冪等性、追記、空ファイル、存在しないファイル、既に含まれている場合の各ケース

## Task 5: `specrunner init` で `.gitignore` に追記

- [x] `src/cli/init.ts` (`runInit`): config save 後に CWD が git repo か判定（`git rev-parse --show-toplevel`）
- [x] git repo の場合、`ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ
- [x] git repo でない場合はスキップ（warning 不要）

**対象ファイル**: `src/cli/init.ts`

## Task 6: `run.ts` preflight 後に `.gitignore` を確保

- [x] `src/cli/run.ts` (`runRunCore`): `setJobsLocation()` の直後に、location が `"project"` の場合のみ `ensureDotSpecrunnerGitignore(cwd)` を呼ぶ

**対象ファイル**: `src/cli/run.ts`

## Task 7: ドキュメント・プロンプト内の path 表記を更新

- [x] `src/prompts/rules.ts` L80-81: job state / verbose log の path 表記を更新
  - `~/.local/share/specrunner/jobs/<jobId>.json` → `.specrunner/jobs/<jobId>.json`（デフォルト）、`config.jobs.location: "xdg"` で従来パス
  - `~/.local/state/specrunner/logs/<jobId>.log` → `.specrunner/logs/<jobId>.log`（デフォルト）
- [x] `specrunner/project.md` の「状態管理」セクション: ジョブ状態パスを `.specrunner/jobs/` に更新
- [x] `specrunner/changes/jobs-to-dotspecrunner/rules.md` L74-75: 同上の path 表記更新

**対象ファイル**: `src/prompts/rules.ts`, `specrunner/project.md`, `specrunner/changes/jobs-to-dotspecrunner/rules.md`

## Task 8: repo `.gitignore` に `.specrunner/` を追加

- [x] `.gitignore`: `.specrunner/` エントリを追加

**対象ファイル**: `.gitignore`

## Task 9: テスト追加・更新

- [x] `tests/unit/config/schema.test.ts` (新規): `jobs.location` validation テスト追加
  - 有効値: `"project"`, `"xdg"`, `undefined`（section なし）
  - 無効値: `"local"`, `123`, `null` → `CONFIG_INVALID`
- [x] `tests/unit/util/xdg.test.ts` (既存): project mode テスト追加
  - `setJobsLocation("project", "/repo")` → `getJobsDir()` === `/repo/.specrunner/jobs`
  - `setJobsLocation("project", "/repo")` → `getJobStatePath("abc")` === `/repo/.specrunner/jobs/abc.json`
  - `setJobsLocation("project", "/repo")` → `getVerboseLogDir()` === `/repo/.specrunner/logs`
  - `setJobsLocation("xdg")` → 従来パスに戻る
  - `resetJobsLocation()` → XDG default に戻る
- [x] `tests/unit/util/gitignore.test.ts` (新規): Task 4 参照
- [x] `tests/unit/cli/resume.test.ts` (既存): loadConfig mock に `jobs: { location: "xdg" }` を追加（test job が XDG path に作成されるため）
- [x] `tests/finish-ps-integration.test.ts` (既存): `XDG_CONFIG_HOME = tempDir` を beforeEach に追加 + afterEach で `resetJobsLocation()` 呼び出し

## Task 10: typecheck + test green 確認

- [x] `bun run typecheck` pass
- [x] `bun run test` pass
