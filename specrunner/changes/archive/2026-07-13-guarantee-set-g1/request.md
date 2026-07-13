# 保証集合 G1 の明文化と版号付け

## Meta

- **type**: chore
- **slug**: guarantee-set-g1
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

spec-runner の差別化の芯は個別機構ではなく「全 run が例外なく同じ保証群を通過する」こと。現状この保証は README / `docs/design-philosophy.md` に散在し、版号を持たない主張として存在する。これを **G1 という版号付きの保証集合**として一箇所に明文化し、以後の保証の変更を版号更新として管理できるようにする。保証を enforce する機構は既存であり、本 request は docs のみを追加する（挙動・機構は変更しない）。

## 現状コードの前提

- verdict は agent の自己申告でなく findings からの機械導出（`src/core/step/judge-verdict.ts`, `src/core/step/report-tool.ts`）。
- findings の file:line 実在は runtime seam で検証される（`src/core/port/runtime-strategy.ts` の `verifyFindingRefs`、構造根拠は `architecture/adr/2026-06-10-findings-verification-seam.md`）。
- 収束ループは予算有界（`src/core/pipeline/pipeline.ts` の `resolveMaxIterations` / `tryExhaust`）。
- credential / secret は seam 経由で封じ込められる（`architecture/model.md` §4 の B-6 / B-7 / B-10 / B-12）。
- conformance gate が受け入れ基準との照合を行う（`src/core/step/conformance.ts`）。
- gate 列（pipeline profile）は `src/core/pipeline/registry.ts` に定義される。

## 要件

1. `docs/guarantees.md` を新設し、**保証集合 G1** を列挙する。各保証は「何を保証するか」と「それを enforce する機構（test / gate / 構造不変条件 / seam）」を file 参照付きで対にして書く。少なくとも次を含める:
   - verdict は findings からの機械導出であること（agent の自己申告に依らない）
   - findings の file:line 実在検証
   - review / conformance gate は skip 不能であること
   - 収束ループは予算有界であること（無限ループしない）
   - credential / secret の seam 経由封じ込め
   - conformance による受け入れ基準の照合通過
2. G1 に**版号**を付ける。保証の追加・削除・意味変更は版号を上げる（G2…）という運用規約を同ページに明記し、「どの版で何が変わったか」の変更履歴節を設ける。
3. `docs/README.md`（docs 目次）から `guarantees.md` へリンクする。

**最重量部の名指し**: 本 request の重心は prose の分量ではなく「G1 に含める保証集合の確定」である。各保証は主張でなく enforce 機構の実在に裏打ちされていること ― 対応する機構が現存しない保証を G1 に載せない。

## スコープ外

- A-2（PR ごとの attestation 添付）。G1 の機械可読サマリ・出力先の設計は本 request に含めない。
- A-3（`specrunner verify <PR>` コマンド）。
- 保証を enforce する機構そのものの追加・変更。本 request は既存機構の文書化のみ。
- 保証集合の自動生成（test からの抽出等）。G1 は手動列挙とする。

## 受け入れ基準

- [ ] `docs/guarantees.md` が存在し、保証集合 G1 を列挙する。
- [ ] 各保証が enforce 機構（test / gate / 構造不変条件 / seam）への file 参照を伴う。
- [ ] G1 の版号と、版を上げる運用規約（追加・削除・意味変更＝版号更新）がページ内に明記される。
- [ ] `docs/README.md` から `guarantees.md` へのリンクがある。
- [ ] `typecheck && test` が green（既存テスト無変更）。

## architect 評価済みの設計判断

- 保証を README 内の一節として置く案は却下。版号付きで独立管理する対象なので専用ページ（`docs/guarantees.md`）にする。
- test から保証を自動抽出して生成する案は却下（本 request のスコープ外）。まず手動で G1 を確定し、自動化は attestation（A-2）以降で検討する。
- 版号を付けず機構一覧だけ載せる案は却下。版号付けが本 request の主目的（以後の変更を版更新として管理するため）。
