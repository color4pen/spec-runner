## Purpose

`specrunner` CLI が管理するジョブ状態ファイルの保存先・スキーマ・書き込みアトミシティ・履歴管理・破損耐性を定義する。

## Requirements

### Requirement: ジョブ状態ファイルは固定パスに保存される

ジョブ状態ファイルの保存先は `config.jobs.location` 設定で決定される。

- `"project"` (デフォルト): `<repo-root>/.specrunner/jobs/<jobId>.json`
- `"xdg"`: `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/<jobId>.json`

`config.jobs` section が未設定、または `config.jobs.location` が未設定の場合は SHALL `"project"` として扱う。

`jobId` は SHALL uuid v4 形式の文字列である。

パス解決は `src/util/xdg.ts` の `getJobsDir()` が担当し、CLI entry point が `setJobsLocation()` で module state を設定した後に呼び出される。`setJobsLocation()` 未呼び出し時は SHALL XDG パスを返す（後方互換・テスト安全）。

#### Scenario: デフォルト（project mode）

- **WHEN** `config.jobs.location` が未設定で、`setJobsLocation("project", "~/myrepo")` が呼ばれた後
- **THEN** `getJobsDir()` は `~/myrepo/.specrunner/jobs` を返す

#### Scenario: XDG mode

- **WHEN** `config.jobs.location` が `"xdg"` で、`setJobsLocation("xdg")` が呼ばれた後、`XDG_DATA_HOME` が未設定で `HOME=~`
- **THEN** `getJobsDir()` は `~/.local/share/specrunner/jobs` を返す（従来動作と同一）

#### Scenario: setJobsLocation 未呼び出し（テスト環境）

- **WHEN** `setJobsLocation()` が一度も呼ばれていない
- **THEN** `getJobsDir()` は XDG パスを返す（後方互換）
