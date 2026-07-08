# 事後監査で検出した小粒不具合の一括修正

## Meta

- **type**: bug-fix
- **slug**: audit-cleanup-bundle
- **base-branch**: main
- **adr**: false

## 背景

merged 済み PR の事後監査で検出された小粒の不具合 5 件を一括修正する。いずれも数行規模・相互独立で、個別 request にする overhead が本体を上回るため束ねる。対象は verification（coverage gate）の実行環境と失敗メッセージ、ADR の無効な例、doctor の誤案内 hint、検証能力のないテスト 2 件。

## 現状コードの前提

- `src/core/verification/changed-line-coverage.ts:210-214` — coverage.command の `spawnCommand` に第 4 引数 root を渡していない。一方 `verification.commands` は `src/core/verification/runner.ts:373` で root を渡し、PATH に `<root>/node_modules/.bin` が前置される。同じ config block 内の 2 種のコマンドで実行環境が不一致（monorepo で coverage コマンドだけ command-not-found になり得る）
- `src/core/verification/changed-line-coverage.ts:119-130,145-151` — `minChangedLineCoverage` 未達と全行未実行が同じ reason `"unexecuted"`・同じメッセージ「changed DA lines were not executed」になる。一部実行済み（例: 1/3 実行で閾値 0.8 未達）でも「未実行」と表示され誤解を招く
- `specrunner/adr/2026-07-08-lcov-changed-line-gate.md:57,130` — 例 config が `"minChangedLineCoverage": 0`、D10 の本文が「指定時（0〜1）」だが、schema（`src/config/schema.ts:885-890`）は gt(0) で 0 を拒否する。ADR の例のとおり書くと validation エラーになる
- `src/core/doctor/checks/config/file-exists.ts:18-23` — config の loadError 時、hint が常に user-global パス（`~/.config/specrunner/config.json`）の修復を案内する。project-local config が malformed の場合も user-global を直せと誤案内する（doctor が project-local を読むようになった 2026-07-06 以降、実際に到達可能）
- `tests/unit/cli/ps-filter.test.ts:359-393` — TC-032 は module 自身を `vi.mock` するが `runPs` は module 内部束縛を呼ぶため mock が介在せず、assertion も `not.toContain` の消極形のみで検証能力がない（コメントで自認している）
- `src/core/archive/__tests__/merge-then-archive.test.ts` — T-PMI-01 に `expect(FAKE_ESCALATION).toContain("MERGED")` という、テスト内で定義した定数を自ら assert する同語反復がある（実装出力を検証していない。実装側の検証は post-merge-integrity.test.ts に存在する）

## 要件

1. coverage gate の command 実行を `verification.commands` と同じ実行環境（root による PATH 前置）に揃える
2. `minChangedLineCoverage` 未達（一部実行済み）と全行未実行を区別し、閾値未達時は実行率と閾値がわかる失敗メッセージにする
3. ADR `2026-07-08-lcov-changed-line-gate.md` の例 config と D10 の表記を schema 準拠（0 は不可、>0〜1）に修正する
4. doctor の config loadError 時の hint を、実際に load に失敗したファイル（project-local / user-global）を案内する形にする
5. 検証能力のないテスト 2 件を修正する: TC-032 は実装の挙動を実際に検証できる形に書き直す（合理的に不可能なら削除し、理由をコメントで残す）。T-PMI-01 の同語反復 assertion は実装出力の検証に置き換えるか削除する

## スコープ外

- coverage gate の判定ロジック・fail-closed 方針の変更
- doctor の check 構成の再設計（config-file-exists が user-global のみ stat する既知の非対称は別件）
- `spawnCommand` 本体の仕様変更
- 要件 5 の対象 2 件以外のテストの書き直し

## 受け入れ基準

- [ ] coverage command の spawn に root が渡されることをテストで固定する
- [ ] `minChangedLineCoverage` 未達時の失敗出力に実行率と閾値が含まれ、全行未実行時のメッセージと区別されることをテストで固定する
- [ ] ADR の例 config の `minChangedLineCoverage` 値が schema の制約（gt(0), lte(1)）に適合している
- [ ] project-local config が malformed の fixture で、doctor の hint が project-local ファイルを案内することをテストで固定する
- [ ] TC-032 と T-PMI-01 が実装の観測可能な挙動を assert する形になっている（または削除され理由がコメントに残っている）
- [ ] 既存テスト無変更で green（要件 5 の対象 2 テストを除く）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 5 件を 1 request に束ねる。各修正は数行規模・相互独立で、1 レビュー収束ループに収まる
- **却下**: doctor hint の修正を config degradation の再設計まで広げる案 — 再設計は別件のスコープ外宣言済みで、hint の誤案内は単体で修正可能
- **却下**: TC-032 を「そのまま残す」案 — 検証能力のないテストは coverage を過大申告し、同種の回帰を見逃す。書き直すか削除して事実に合わせる
