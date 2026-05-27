# CLI ログ永続化 + retention + agent durable log

## Meta

- **type**: new-feature
- **slug**: cli-log-persistence
- **base-branch**: main
- **adr**: true
- **close-issues**: 420

## 背景

Phase 1 (#418 / PR #433) で出力チャネル統一、Phase 2 (#419 / PR #434, #435) でログレベル + exit code を整備した。残る課題は「run が終わったら agent が何をしたかの詳細が消える」こと。

現状の問題:
- agent の入出力ログが揮発する（障害調査ができない）
- code-fixer の session ID が null で事後インタビューもできない（今日実際に発生）
- verbose log は `CommandRunner.execute()` 経由のみで初期化。finish / cancel / doctor では存在しない
- run 単位のログ永続化がない

業界調査の結果:
- Claude Code: `~/.claude/projects/{path}/{uuid}.jsonl` に session transcript を JSONL で保存。中央値 234 KB、最大 118 MB
- npm: `~/.npm/_logs/` に個数ベース retention (`--logs-max` デフォルト 10)
- Docker: JSON Lines + サイズベースローテーション + gzip 圧縮

## 要件

### 1. pipeline ログの全 run 自動保存

全ての `run` / `resume` で pipeline レベルのログを `.specrunner/logs/<jobId>.log` に JSONL で自動保存する。ログレベルに関わらず常時書き込む（pipeline-event 専用の emit）。verbose 以上では既存の `logVerbose` エントリも同一ファイルに追記する 2 層モデル。

記録内容（default レベル = pipeline-event のみ）:
- step 遷移（step 名、verdict、elapsed）
- verification 結果（pass/fail、コマンド出力）
- error 情報（code、message、hint）
- token 使用量（model 別、step 別）

verbose 以上で追加される内容:
- 既存の `logVerbose` が出力する全エントリ（session 詳細、query パラメータ等）

### 2. agent session log の保存

agent step の実行時に SDK から受け取る message を `.specrunner/logs/<jobId>/<step>-<attempt>.jsonl` に保存する。

記録内容:
- SDK message の type / content（assistant の text、tool_use、tool_result）
- session ID
- model 名、token 使用量

opt-in (`SPECRUNNER_LOG_LEVEL=debug` または `-vv`) で有効化する。default レベルでは pipeline ログのみ。

### 3. 個数ベース retention

`.specrunner/logs/` 配下の job ログを個数ベースで retention する。

- デフォルト: 最新 20 job を保持
- `config.json` の `logs.maxJobs` で変更可能
- 超過時は最古の job ログを削除（`<jobId>.log` と `<jobId>/` ディレクトリの両方）
- run 開始時に retention チェックを実行

### 4. finish / cancel でも pipeline ログを出力

`CommandRunner.execute()` 以外の job スコープコマンド（finish / cancel）でも pipeline ログを初期化する（ログレベル非依存）。finish は slug → jobId 解決後に初期化する。

doctor は job に紐づかない環境診断コマンドのため、pipeline ログの対象外とする。

### 5. job show でログパスを表示

`specrunner job show <slug>` の出力にログファイルのパスを含める。

## スコープ外

- **構造化 stdout (JSON Lines)** — Phase 4 (#421) で対応
- **ログの圧縮 (gzip)** — 将来的に検討。初期実装では個数ベース削除で十分
- **ログのリモート送信** — ローカル保存のみ
- **ログの検索 / フィルタ CLI** — 初期実装では `jq` で直接 JSONL を処理

## 受け入れ基準

- [ ] `run` / `resume` で pipeline ログが `.specrunner/logs/<jobId>.log` に JSONL で自動保存される（ログレベル問わず）
- [ ] `-vv` (debug) で agent session log が `.specrunner/logs/<jobId>/<step>-<attempt>.jsonl` に保存される
- [ ] agent session log に session ID / model 名 / token 使用量が記録される
- [ ] `config.json` の `logs.maxJobs` で retention 個数を設定できる（デフォルト 20）
- [ ] 超過時に最古の job ログが削除される（`<jobId>.log` と `<jobId>/` の両方）
- [ ] `job show` でログパスが表示される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **JSONL フォーマット**: 行単位ストリーミングで大きなファイルもメモリ載せ不要。Claude Code と同じ方式。事後に `jq` で検索可能
- **pipeline ログは全 run で保存、agent ログは debug のみ**: agent ログは 1 step 数 MB になりうるので default では保存しない。pipeline ログは軽量（数十 KB）なので常時保存
- **個数ベース retention**: npm 方式。起動時の 1 回スキャンで済む。サイズベースは agent ログのばらつきが大きくて閾値が決めにくい
- **ファイル構造の分離**: pipeline ログ（`<jobId>.log`）と agent ログ（`<jobId>/<step>.jsonl`）を分離。Bazel のデータ種別分割と同じ考え方
