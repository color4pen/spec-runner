# TC 分類に gate カテゴリを導入 — 検証 phase の再実行をテスト化する冗長 TC と外部ツールチェーン実行 TC を構造で封じる

## Meta

- **type**: spec-change
- **slug**: gate-ac-classification
- **base-branch**: main
- **adr**: true

## 背景

採用プロジェクトの実運用で、生成されたテストに「プロジェクト全体の外部ツールチェーン（build / テストスイート）を無条件に再実行する」ものが混入して CI を破壊した。また typecheck / build の再実行にすぎない冗長 TC が恒常的に生成されている。

根本原因は受け入れ基準（AC）の分類の欠落である。起票規律は「`typecheck && test` が green」のような **gate 型 AC**（充足基準がプロジェクト全体の検証 command の結果である基準）を推奨し、雛形にも seed されている。これは起票側では正当だが、下流の TC 分類には unit | integration | manual の 3 値しか存在しないため、gate 型 AC が unit / integration の must TC として導出され、test-materialize がテストファイル化し、coverage gate がその存在を要求する。gate 型 AC の充足は verification phase（build / typecheck / test / lint）の結果そのものであり、テストファイルとして再実装した瞬間に「検証 phase の再実行」というテストが生まれる。adopter のツールチェーン（cargo 等）ではこれが CI 破壊に直結する。

`Category: manual` の除外機構が完成した前例として存在する: 分類 1 値を 3 箇所（test-case-gen prompt / test-materialize prompt / coverage gate の単一判定点）で連動して尊重する構造。gate も同型で封じる。

## 現状コードの前提

- request 雛形は gate 型 AC を seed する（`src/core/command/request.ts:72-80` の「`typecheck && test` が green」）。起票規律も同形を推奨する（`src/core/command/request-prompt.ts:44-49`、`docs/request-authoring.md:75-82`）
- TC Category は unit | integration | manual の 3 値のみ（`src/prompts/test-case-gen-system.ts:65-69`、template `src/templates/step-output-templates.ts:127`）。gate 相当の分類は無い
- manual 除外の前例: test-materialize は manual の must TC を実体化せずトレーサビリティコメントも書かない（`src/prompts/test-materialize-system.ts:75-79`）。coverage gate は `extractMustTcIds` が manual を must 集合から除外する（`src/core/verification/test-coverage.ts:99-147`）。除外判定点を `extractMustTcIds` に単一化する設計は ADR `specrunner/adr/2026-07-25-test-coverage-manual-tc-exclusion.md` が確定済み（`Covered-by` field 案・agent 判定案は却下済み）
- 生成テストによる外部ツールチェーン実行を禁じる規則は prompt のどこにも無い。`src/prompts/test-materialize-system.ts:93` が「実装不可能な TC（CI パイプライン依存等）は理由とともに明示列挙」と触れるのみで、構造的な受け皿が無い
- verification phase は build → typecheck → test → lint → security → test-coverage を fail-fast で実行する（`src/core/verification/phases.ts:11-44`）。adopter 固有の検証 command は `.specrunner/config.json` の `verification.commands`（`src/config/schema/types.ts:142-173`）
- conformance は request の受け入れ基準を LLM 判定するが、test-cases.md も verification-result.md も入力に持たない（`src/core/step/conformance.ts:63-71`、`src/prompts/conformance-system.ts:36-49`）

## 要件

1. **Category に `gate` を追加する**。定義: 充足基準が「プロジェクト全体の検証 command の結果」（build / typecheck / lint / テストスイート全体の green、CI green 等）である AC / TC。gate TC は対応する verification phase 名（または `verification.commands` の command 名）を本文に記録する（記録形式は設計判断）
2. **test-case-gen prompt に分類規則を追加する**: 「THEN がプロジェクト全体の command の成功（exit 0 / green）である TC は unit / integration ではなく gate に分類する」。gate TC には GWT のテスト手順を書かず、充足を検証する phase を指す
3. **test-materialize は gate TC を実体化しない**。manual スキップ block（`test-materialize-system.ts:75-79`）と同型: テストファイルを書かず、トレーサビリティコメントも書かない（coverage 偽装 pass の禁止も同文で明記）
4. **coverage gate は gate TC を must 集合から除外する**。`extractMustTcIds` の manual 除外と同一判定点に gate 除外を追加する。判定点はこの 1 箇所のままとする
5. **ツールチェーン再実行の禁止規則**: test-materialize の contract に「プロジェクト全体の検証 command（build / typecheck / lint / テストスイート起動）の再実行をテスト本体として書かない。それは gate TC として分類され verification phase が担う」を明記する。対象挙動の検証として必要な subprocess 実行（CLI 自身の起動等）は禁止しない
6. **template / docs の追随**: `src/templates/step-output-templates.ts:127` の Category 行、`docs/test-coverage.md` の分類記述を gate を含む形に更新する

## スコープ外

- conformance に verification-result.md / test-cases.md を読ませる形式的連関（gate AC 充足判定の機械化は別 request。分類の確立が先）
- request 雛形・起票規律の変更（gate 型 AC は起票側では正当。分類は下流の責務）
- 既存 manual 分類の挙動変更
- verification phase 自体の変更

## 受け入れ基準

- [ ] `Category: gate` の must TC が coverage gate の must 集合から除外されることをテストで固定する（`extractMustTcIds` の単体）。破壊確認込み
- [ ] `Category: manual` の除外挙動が無変更であることをテストで固定する
- [ ] test-case-gen prompt の gate 定義・分類規則の文言存在をテストで固定する（prompt contract テストの様式）
- [ ] test-materialize prompt の gate 実体化スキップとツールチェーン再実行禁止の文言存在をテストで固定する
- [ ] template の Category 行が gate を含むことをテストで固定する
- [ ] 既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: manual 除外前例の同型拡張** — 分類 1 値を 3 箇所連動（test-case-gen / test-materialize / `extractMustTcIds` の単一判定点）で尊重する構造は ADR 2026-07-25 で確定済み。gate はその第 2 適用
- **却下: 生成テスト側の環境 guard（ツールチェーンが無ければ skip）** — skip して green になるテストは fail-open であり「歯があるフリ」になる。分類で発生源を断つ
- **却下: gate 型 AC の起票禁止** — gate AC 自体は正当な受け入れ基準（機械検証可能で conformance が照合できる）。問題は下流に分類の受け皿が無いこと
- **却下: `Covered-by` field / agent 判定による除外** — ADR 2026-07-25 が却下済み。判断の入る余地を消し、分類値 1 つで機械判定する
- **却下: conformance への verification 連関の同時導入** — 1 つのレビュー収束ループに収まらない。分類の確立（本 request）を土台とし、連関は必要になった時に別 request で積む
