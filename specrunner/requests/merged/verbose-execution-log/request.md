# 実行ログの詳細出力オプションを追加する

## Meta

- **type**: new-feature
- **slug**: verbose-execution-log
- **base-branch**: main
- **adr**: true

## 背景

パイプライン実行中に何が起きているか外から観測できない。現状 stderr に最低限の進捗 (= `[propose] running...` / `[propose] ✓ (179s)`) しか出力しておらず、SSE イベントやポーリング状態が見えないため stuck 判断が困難。

2026-05-09 の並列実行で implementer / code-fixer が stuck した際、外部から状態を判断する手段がなかった (= `ps` で `running` とだけ表示、SSE ストリームの受信内容やポーリング回数が不明)。

## 要件

1. **CLI flag + 環境変数で詳細ログを有効化** する:
   - `specrunner run --verbose <slug>` で詳細ログ ON
   - `SPECRUNNER_LOG_LEVEL=verbose` 環境変数でも ON
   - 未指定時は現状通り最低限の stderr 出力のみ (= backward compatibility)
2. **ログ出力先はファイル** (= stderr ではなく):
   - 配置: `~/.local/state/specrunner/logs/<jobId>.log` (= XDG_STATE_HOME 準拠)
   - jobId ごとに 1 ファイル
   - ファイルは追記モード (= 同一 jobId の retry / resume で 1 ファイルに集約)
3. **出力対象** (= verbose 時にファイルへ記録):
   - SSE event 種別 (= `session.status_idle` / `session.error` 等) と payload
   - ポーリング回数・間隔・レスポンス HTTP status
   - セッション作成・削除のタイミング (= managed runtime / local runtime いずれも)
   - step 遷移のタイムスタンプ
4. **logger 層の抽象化**:
   - `src/logger/stdout.ts` に `logVerbose(message)` 関数を追加し、verbose 有効時のみファイル出力 (= 既存のモジュールレベル変数 `verbose` と命名衝突しないよう `logVerbose` を使う、既存 `logInfo` / `logWarn` 命名規則と整合)
   - 既存の `stderrWrite` / `info` / `warn` / `error` 関数の振る舞いは変更しない
   - `src/util/xdg.ts` に `resolveXdgStateDir()` ヘルパーを追加して `~/.local/state/specrunner/logs/` パス解決を集約する
5. **設定の伝搬**:
   - CLI flag / 環境変数の有無を 1 箇所で判定し、global state または DI で各 module に渡す
   - test では DI 経由で verbose ON/OFF を切替可能にする
6. **resume コマンドも `--verbose` 対応**:
   - `specrunner resume --verbose <slug>` (= `src/cli/command-registry.ts` 周辺で既にフラグ定義済) で `run --verbose` と同じ動作になる
   - 同一 jobId の log ファイル (= `~/.local/state/specrunner/logs/<jobId>.log`) に追記される
7. `bun run typecheck && bun run test` が green

## スコープ外

- 通常 stderr 出力フォーマットの変更 (= 既存挙動維持)
- ログのローテーション / 削除 (= 別 issue で gc コマンド系として対応)
- log level の細分化 (= debug / trace 等、verbose ON/OFF の 2 値で開始)
- 外部ログ aggregator 連携 (= Datadog / Loki 等、別 issue)
- pipeline metrics の数値集計 (= cost / duration 等、本 request は event log のみ)

## 受け入れ基準

- [ ] `specrunner run --verbose <slug>` で `~/.local/state/specrunner/logs/<jobId>.log` にログが書き出される
- [ ] `SPECRUNNER_LOG_LEVEL=verbose` 環境変数でも同じ動作になる
- [ ] verbose 未指定時は log ファイル生成されず、stderr 出力は現状通り
- [ ] log ファイルに event type 文字列 (= 例: `session.status_idle`、`polling`、`step_transition`) が含まれる (= unit test、format 詳細は ADR で確定する前提で緩めの string contains assertion で記載)
- [ ] ポーリング回数 / 間隔 / レスポンス status がログに記録される (= unit test、ADR 確定後に format 詳細を test で固定)
- [ ] 同一 jobId の retry / resume で 1 ファイルに追記される (= integration test)
- [ ] `specrunner resume --verbose <slug>` でも同一 jobId の log ファイルに追記される (= integration test)
- [ ] `~/.local/state/specrunner/logs/` ディレクトリは初回書き込み時に自動作成される
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「verbose log の出力先 / 形式 (= JSON Lines vs plain text / timestamp 精度) / 設定経路」の判断が記録されている (= unit test の format assertion は ADR 確定後に詳細化する)

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
