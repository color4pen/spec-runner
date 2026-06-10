# README の存在しないコマンド表記 specrunner resume を修正する

## Meta

- **type**: chore
- **slug**: readme-resume-command-fix
- **base-branch**: main
- **adr**: false

## 背景

README の Troubleshooting 節が `specrunner resume` という存在しないコマンドを案内している。正しいコマンドは `specrunner job resume <slug>` である。

## 現状コードの前提

- 誤記は `README.md:411` と `README.md:418` の 2 箇所
- CLI の実コマンドは `job resume <slug>`（`specrunner --help` の Job commands 節）。`resume` という top-level コマンドおよび alias は存在しない（alias は `run` のみ）

## 要件

1. `README.md:411` と `:418` の `specrunner resume` を `specrunner job resume` に修正する（`:418` は `<slug>` 引数つきの表記を保つ）

## スコープ外

- README のその他の節の変更
- CLI への `resume` alias の追加

## 受け入れ基準

- [ ] README に `specrunner resume` という表記が残っていない（`specrunner job resume` のみ）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（2 行の docs 修正）
