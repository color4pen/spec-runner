## Requirements

### Requirement: ジョブ状態ファイルは固定パスに保存される

ジョブ状態ファイルの保存先は常に `<repo-root>/.specrunner/jobs/<jobId>.json` である。

`jobId` は SHALL uuid v4 形式の文字列である。

パス解決は `src/util/xdg.ts` の `getJobsDir(repoRoot)` が担当する。`repoRoot` は CLI entry point が `git rev-parse --show-toplevel` 等で解決し、引数として渡す。module-level state (`setJobsLocation` / `resetJobsLocation`) は廃止された。

#### Scenario: デフォルト（project mode）

- **WHEN** `getJobsDir("~/myrepo")` を呼ぶ
- **THEN** `~/myrepo/.specrunner/jobs` を返す

#### Scenario: JobStateStore は repoRoot を constructor で受け取る

- **WHEN** `new JobStateStore(jobId, "~/myrepo")` を生成する
- **THEN** 内部ファイルパスが `~/myrepo/.specrunner/jobs/<jobId>.json` に解決される
