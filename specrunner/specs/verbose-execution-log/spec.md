## Purpose

TBD
## Requirements

### Requirement: `--verbose` フラグおよび環境変数による詳細実行ログ出力

- `specrunner run --verbose <slug>` で詳細実行ログをファイルに書き出す
- `specrunner resume --verbose <slug>` でも同一 jobId のログファイルに追記する
- `SPECRUNNER_LOG_LEVEL=verbose` 環境変数でも `--verbose` と同じ動作になる
- CLI flag と環境変数の判定は `resolveVerboseFlag()` で 1 箇所に集約する
- verbose 未指定時はログファイルを生成しない（既存 stderr 出力は変更なし）

### Requirement: ログファイルの配置と形式

verbose 有効時、ログファイルの保存先は MUST `<repo-root>/.specrunner/logs/<jobId>.log` でなければならない。

ログディレクトリは初回書き込み時に自動作成しなければならない（`mkdirSync({ recursive: true })`）。同一 jobId の retry / resume でログファイルは追記モードで 1 ファイルに集約されなければならない（SHALL）。

パス解決は `src/util/xdg.ts` の `getVerboseLogDir(repoRoot)` が担当しなければならない（MUST）。`repoRoot` は CLI entry point が解決し、`initVerboseLog(repoRoot, jobId)` の引数として渡す。module-level state (`setJobsLocation`) は廃止された。

#### Scenario: デフォルト（project mode）

- **WHEN** `repoRoot = "~/myrepo"` で `initVerboseLog(repoRoot, jobId)` を呼ぶ
- **THEN** ログファイルは `~/myrepo/.specrunner/logs/<jobId>.log` に作成される

### Requirement: ログ記録対象イベント

- SSE event 種別（`session.status_idle` / `session.error` 等）と payload
- ポーリング試行回数・間隔・セッション status
- セッション作成・削除タイミング（managed / local 両 runtime）
- step 遷移タイムスタンプ

### Requirement: logger 層の抽象化

`src/logger/stdout.ts` は `logVerbose(message)` 関数を公開し、verbose 有効時のみファイル出力しなければならない（MUST）。既存の `stderrWrite` / `info` / `warn` / `error` 関数の振る舞いは変更してはならない（MUST NOT）。verbose ログの初期化は `initVerboseLog(repoRoot: string, jobId: string)` で行わなければならず（SHALL）、`repoRoot` は CLI entry point が解決して渡す。`resolveXdgStateDir()` は verbose log パス解決に使用してはならない（MUST NOT）。テストでは DI 経由で verbose ON/OFF を切替可能にしなければならない（SHALL）。

#### Scenario: verbose 無効時はファイル出力しない

- **WHEN** verbose が無効の状態で `logVerbose("test message")` を呼ぶ
- **THEN** ファイルへの書き込みは発生しない
