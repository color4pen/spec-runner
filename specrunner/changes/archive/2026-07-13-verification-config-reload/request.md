# build-fixer の config 編集が同一 job 内 verification に反映されず coverage self-heal できない問題を修正

## Meta

- **type**: spec-change
- **slug**: verification-config-reload
- **base-branch**: main
- **pipeline**: standard
- **adr**: true

## 背景

型定義のみのファイル（実行行なし）は coverage の lcov に現れず、changed-line-coverage gate が fail-closed で「未 load」と誤検出して verification を失敗させる。build-fixer はこれを `.specrunner/config.json` の `verification.coverage.exclude` に追加して正しく修正するが、config は job 開始時に一度 load され call chain を通じて verification へ渡されるため、build-fixer の disk 編集が同一 job 内の後続 verification に反映されない。結果、正しい fix でも self-heal できず verification retry が枯渇して escalation する（resume＝新プロセスで config 再 load すると解消する）。

## 現状コードの前提

- coverage config は verification runner に引数で渡される（`src/core/verification/runner.ts:349, :457` の `coverage?: CoverageConfig`）。job 開始時に一度 load された config が call chain を下る。
- changed-line-coverage gate は渡された `coverage.exclude` を尊重する（`src/core/verification/changed-line-coverage.ts:11, :91`）。fail-closed: include 対象が lcov に無ければ fail（`:8, :98`）。
- build-fixer は verification 失敗後に呼ばれ `.specrunner/config.json` を編集・コミットできる（PR に含まれ人間レビュー可能）。

## 要件

1. build-fixer が `.specrunner/config.json` を編集した後、同一 job 内の後続 verification がその更新（少なくとも `verification.coverage`）を反映するようにする（例: verification 直前で coverage config を disk から再解決する、または build-fixer step 後に config を再 load する）。
2. この in-job 再 load が gate を弱める経路になり得る点を踏まえ、再 load 対象を verification 系 config に限定し、config 変更が従来どおり PR に含まれ人間レビュー可能であることを保つ。

**最重量部の名指し**: config-read の timing 変更（一度 load → 必要時 再 load）。どこまで再 load するか（coverage のみ / verification 系 / 全体）を設計で確定する。

## スコープ外

- changed-line-coverage の fail-closed 判定ロジック自体の変更。
- merge-wait / archive 系。
- 型のみファイルを lcov から自動判定する仕組み（lcov 上「未 load」は untested と区別できないため今回は扱わない）。

## 受け入れ基準

- [ ] coverage.exclude を追加した後、同一 job 内の後続 verification がその exclude を反映して pass することをテストで固定する。
- [ ] 再 load する config の対象範囲が明示され、verification 無関係の config が意図せず途中変更されないことを確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 型のみファイルを coverage から自動除外する案は却下（lcov 上「未 load」は untested と区別できず信頼できない）。既存の exclude 機構を使い、それが in-job で効くようにする。
- 全 config を毎 step 再 load する案は避け、verification（coverage）に限定する方向を推奨（gate 弱体化面を最小化）。最終範囲は design で確定する。
