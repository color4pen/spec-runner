# 公開 CLI の体裁: --version コマンドの追加と bin パスの正規化

## Meta

- **type**: new-feature
- **slug**: cli-version-and-bin-path
- **base-branch**: main
- **adr**: false

## 背景

npm 公開（0.3.1、2026-06-12）で判明した公開 CLI としての体裁 2 件。`specrunner --version` が `Unknown command: --version`（exit 2）になり、インストール済みバージョンを確認する手段がない。また npm 11.17 が publish 時に package.json の bin 値 `"./dist/specrunner.js"` へ warning を出す（`./` prefix が trigger、npm 10 では出ない — 切り分け済み。registry には正規化されて bin が残るため実害はないが、publish ログに「invalid and removed」という誤解を招く警告が毎回出る）。

## 現状コードの前提

- `bin/specrunner.ts:23-26` — `--help` / `-h` のみ特別扱い。`:34-38` — 未知 command は `Unknown command` + USAGE で exit 2。dispatch は `src/cli/command-registry.ts` の COMMANDS registry 駆動（version エントリなし、grep 確認済み）
- `package.json` の bin は `{"specrunner": "./dist/specrunner.js"}`
- 配布は tsup 単一バンドル（`dist/specrunner.js`）。version 文字列の取得は build 時埋め込み（tsup define 等)か、npm が常に同梱する package.json の実行時読み取りか — design で判断
- グローバル install（`npm i -g` / `bunx`）を主経路とする方針のため、ユーザーがバージョン起因の挙動差を報告する際の確認手段として必要

## 要件

1. `specrunner --version`（および `version` command として登録するかは design 判断）で package version を stdout に出力し exit 0 とする
2. package.json の bin 値から `./` prefix を外し `"dist/specrunner.js"` にする
3. version 文字列は単一バンドル配布で正しく解決されること（リポジトリ内実行と npm install 実行の両方）

## スコープ外

- `--help` / USAGE の再構成
- doctor コマンドへの統合（doctor は別用途）

## 受け入れ基準

- [ ] `--version` が package.json の version と一致する文字列を出力し exit 0 となることをテストで固定する
- [ ] 未知 command の従来挙動（exit 2）が退行しないことをテストで固定する
- [ ] package.json の bin 値が `dist/specrunner.js`（`./` なし）であることを確認する
- [ ] `typecheck && test` が green

## 関連

- 発端: 0.3.1 publish ログの npm warning と、npm install 実証時の `Unknown command: --version`（2026-06-12）
