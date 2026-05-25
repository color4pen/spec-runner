## Requirements

### Requirement: ログファイルの配置と形式

verbose 有効時、ログファイルの保存先は MUST `<repo-root>/.specrunner/logs/<jobId>.log` でなければならない。

ログディレクトリは初回書き込み時に自動作成しなければならない（`mkdirSync({ recursive: true })`）。同一 jobId の retry / resume でログファイルは追記モードで 1 ファイルに集約されなければならない（SHALL）。

パス解決は `src/util/xdg.ts` の `getVerboseLogDir(repoRoot)` が担当しなければならない（MUST）。`repoRoot` は CLI entry point が解決し、`initVerboseLog(repoRoot, jobId)` の引数として渡す。module-level state (`setJobsLocation`) は廃止された。

#### Scenario: デフォルト（project mode）

- **WHEN** `repoRoot = "~/myrepo"` で `initVerboseLog(repoRoot, jobId)` を呼ぶ
- **THEN** ログファイルは `~/myrepo/.specrunner/logs/<jobId>.log` に作成される

### Requirement: logger 層の抽象化

`src/logger/stdout.ts` は `logVerbose(message)` 関数を公開し、verbose 有効時のみファイル出力しなければならない（MUST）。既存の `stderrWrite` / `info` / `warn` / `error` 関数の振る舞いは変更してはならない（MUST NOT）。verbose ログの初期化は `initVerboseLog(repoRoot: string, jobId: string)` で行わなければならず（SHALL）、`repoRoot` は CLI entry point が解決して渡す。`resolveXdgStateDir()` は verbose log パス解決に使用してはならない（MUST NOT）。テストでは DI 経由で verbose ON/OFF を切替可能にしなければならない（SHALL）。

#### Scenario: verbose 無効時はファイル出力しない

- **WHEN** verbose が無効の状態で `logVerbose("test message")` を呼ぶ
- **THEN** ファイルへの書き込みは発生しない
