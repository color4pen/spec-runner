## Purpose

verbose 有効時の実行ログファイルの保存先・命名・追記モード動作を定義する。

## Requirements

### Requirement: ログファイルの配置と形式

verbose 有効時、ログファイルの保存先は `config.jobs.location` 設定で決定される:

- `"project"` (デフォルト): `<repo-root>/.specrunner/logs/<jobId>.log`
- `"xdg"`: `${XDG_STATE_HOME:-$HOME/.local/state}/specrunner/logs/<jobId>.log`

`config.jobs` section が未設定、または `config.jobs.location` が未設定の場合は SHALL `"project"` として扱う。

ログディレクトリは初回書き込み時に自動作成する（`mkdirSync({ recursive: true })`）。同一 jobId の retry / resume でログファイルは追記モードで 1 ファイルに集約される。

パス解決は `src/util/xdg.ts` の `getVerboseLogDir()` が担当し、`setJobsLocation()` で設定された module state に基づいて分岐する。

#### Scenario: デフォルト（project mode）

- **WHEN** `config.jobs.location` が未設定で、`setJobsLocation("project", "~/myrepo")` が呼ばれた後に verbose log を初期化する
- **THEN** ログファイルは `~/myrepo/.specrunner/logs/<jobId>.log` に作成される

#### Scenario: XDG mode

- **WHEN** `config.jobs.location` が `"xdg"` で `XDG_STATE_HOME` 未設定
- **THEN** ログファイルは `~/.local/state/specrunner/logs/<jobId>.log` に作成される（従来動作と同一）
