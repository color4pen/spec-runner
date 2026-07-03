# chore（spec 対象外の変更）が design step を通過できるようにする — spec.md output contract を型の spec 免除に整合させる

## Meta

- **type**: spec-change
- **slug**: spec-exempt-design-contract
- **base-branch**: main
- **adr**: true

## 背景

docs / CI / 依存更新のような **振る舞い spec を持たない chore** を実行すると、design step が決定的に halt する。`type-config` は chore を「spec 対象外」と宣言しているのに、design step の output contract は型に関係なく非空の `spec.md`（Requirement/Scenario/SHALL を含む本文）を必須にしているため、両者が矛盾している。結果として **自己ホスティングなこのツールが、自分の docs-only PR を自前パイプラインで生成できない**。

実地確認: docs のみの chore request（README にインストール依存サイズを追記）で design agent は書くべき Requirement が無く spec.md を雛形のまま残し、`STEP_OUTPUT_MISSING: ... spec.md` で halt した。

## 現状コードの前提

<!-- 未検証の前提。design / request-review が実コードと突き合わせる。書く直前に grep で再検証済み。 -->

- design step は `writes()` で `spec.md` を宣言し（`src/core/step/design.ts:83-90`）、これが executor の `buildAllOutputContracts`（`src/core/step/executor.ts:460`）経由で `kind: "produced"` の output contract になる
- `produced` contract は content が (a) 欠落 / (b) trim 後 空 / (c) `scaffold` と完全一致 のいずれかで violation（`src/core/runtime/local.ts:721-724`、および **managed 側にも同一ロジック** `src/core/runtime/managed.ts:419-426`）。この判定は runtime 実装に重複している
- spec.md の scaffold は design 前に `writeOutputTemplates` が設置する「SPEC WRITING GUIDANCE … `## Requirements`（空）」の雛形（`src/templates/step-output-templates.ts:300-338` 付近）。振る舞い spec の無い変更では agent がこれを未編集で残すため (c) に該当して halt する
- contract gate は commit の**前**に走り、halt すると STEP_OUTPUT_MISSING で awaiting-resume 化する（`src/core/step/executor.ts:455-495`）
- `type-config` の `specImpact` は spec-review プロンプトに注入される**文字列ガイダンス**にすぎず（`src/config/type-config.ts:17`）、design contract を型ごとに緩める機構が無い。chore は `specImpact: "通常不要（CI/依存更新等は spec 対象外）"`（`type-config.ts:51-54`）
- 下流の spec-review（`src/core/step/spec-review.ts:83`）/ conformance（`src/core/step/conformance.ts:68,94`）/ spec-fixer（`src/core/step/spec-fixer.ts:103`）も spec.md を読む。chore の spec-review は既に `specReviewMode: "lightweight"`

## 要件

1. **型が spec 免除なら design step を spec.md 無し（振る舞い spec ゼロ）で通過できる**こと。免除は request 作成時に決まる**宣言的な型属性**で駆動し、agent の実行時判断（「この変更に spec は要るか」）に依存しない
2. **spec 必須型（new-feature / bug-fix / spec-change / refactoring）の contract は現状維持**。spec.md を雛形のまま放置した場合は従来どおり halt する（怠慢に対する fail-closed を弱めない）
3. 免除は**明示的で成果物に残る**こと。spec 免除の変更でも change folder / PR に「振る舞い spec なし（理由: 型が spec 対象外）」が可読な形で残り、silent fail-open にしない
4. 下流（spec-review lightweight / conformance / spec-fixer）が **Requirement ゼロの spec 免除 spec.md でエラーせず、findings を捏造しない**こと
5. 修正は **runtime 非依存**であること（local / managed の validateStepOutputs 重複ロジックの片方だけを直さない）

## スコープ外

- verdict 導出規則・他 step の output contract の変更
- spec-exemption 以外の `type-config` 再設計
- refactoring 型の免除化（現状 refactoring は振る舞い保存 spec を書ける前提で通過しており、本 request では既定を変えない。免除対象は chore に限定する）
- docs-install-dependency-size（#707）本体の docs 作業（本修正 merge 後に resume して別途処理する）

## 受け入れ基準

- [ ] chore 型で design が Requirement を 1 つも生成しなくても design step が STEP_OUTPUT_MISSING で halt しないことを再現テストで固定する
- [ ] 非 chore 型（例 bug-fix）で spec.md を scaffold のまま残すと従来どおり halt することを回帰テストで固定する
- [ ] local / managed 両 runtime で spec 免除が同じ結果になることをテストで固定する（または contract 構築層で免除を適用し runtime 検証コードを不変に保つ）
- [ ] spec-review（lightweight）と conformance が Requirement ゼロの spec 免除 spec.md でエラーせず通過することをテストで固定する
- [ ] 既存テスト無変更で green / `typecheck` green / `lint` green / `build` 成功

## architect 評価済みの設計判断

- **採用（推奨）**: spec 免除を `type-config` の宣言的属性（例 `specRequired: boolean`、chore=false / 他=true）として持ち、**contract 構築層**（design の `writes()`/`outputContracts()` もしくは `buildAllOutputContracts`）で免除型の spec.md contract を halt policy から外す。あわせて免除型では scaffold を「振る舞い spec なし」の明示ノートに差し替え、commit される spec.md が雛形の残骸でなく意味のある宣言になるようにする。利点: runtime 実装（local/managed の重複検証）を触らず single-source で免除でき、要件 5 を満たす
- **却下**: 実行時に agent が「spec が要るか」を判断して sentinel を書く方式 → contract が排除しようとしている LLM 判断を復活させる。型は request 作成時に既に宣言されているので型で駆動する
- **却下**: runtime の `validateStepOutputs` 側で例外扱いを足す → local / managed 双方に分岐が増え、判定ロジックの重複を悪化させる
