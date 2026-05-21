## Requirements

### Requirement: `--verbose` フラグによる詳細ログファイル出力

- `specrunner run --verbose <slug>` で詳細実行ログをファイルに書き出す
- `specrunner resume --verbose <slug>` でも同一 jobId のログファイルに追記する
- `SPECRUNNER_LOG_LEVEL=verbose` 環境変数でも `--verbose` と同じ動作になる
- CLI flag と環境変数の判定は `resolveVerboseFlag()` で 1 箇所に集約する
- verbose 有効時、`~/.local/state/specrunner/logs/<jobId>.log` に JSON Lines 形式でログを書き出す
  - `$XDG_STATE_HOME` が設定されている場合はそちらを使用する
  - ログディレクトリは初回書き込み時に自動作成する（`mkdirSync({ recursive: true })`）
- verbose 未指定時はログファイルを生成しない（既存 stderr 出力は変更なし）
- 同一 jobId の retry / resume でログファイルは追記モードで 1 ファイルに集約される
- ログ対象:
  - SSE event 種別（`session.status_idle` / `session.error` 等）と payload
  - ポーリング試行回数・間隔・セッション status
  - セッション作成・削除タイミング（managed / local 両 runtime）
  - step 遷移タイムスタンプ
