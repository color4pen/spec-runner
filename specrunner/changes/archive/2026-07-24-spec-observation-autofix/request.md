# spec フェーズに observation auto-fix を導入する — minor 指摘は fixer 消化後に再レビューなしで前進する

## Meta

- **type**: spec-change
- **slug**: spec-observation-autofix
- **base-branch**: main
- **adr**: true

## 背景

impl フェーズの reviewer chain には observation auto-fix が存在する: reviewer が approved + fixable（low / medium)の finding を返した場合、verdict は approved のまま code-fixer が finding を消化し、**再レビューなしで次の step へ直行**する。fixer の自己申告は即時の再レビューではなく、findings ledger 経由で後段の regression-gate が機械検証する。

spec フェーズにはこの形が無い。fixable canon finding は severity 不問で needs-fix となり、spec-fixer → spec-review 再レビューの往復が必ず発生する。再レビューは新規の minor finding を出しうるため（全量列挙規律の導入後も、修正で変化した canon への指摘は正当に発生する)、minor 指摘だけでも往復が積み重なり、ループ予算の消費と収束遅延を招く。実運用では minor の転記型 finding 6 件で 5 往復・operator resume 2 回を要した run が確認されている。

blocking な指摘（critical / high / decision-needed / 書込不能 canon)は従来どおり再レビュー・escalation で守りつつ、minor の fixable finding を impl 側と同型の「fixer 消化 → 直行 + 後段機械検証」に移行する。

## 現状コードの前提

- src/core/pipeline/reviewer-chain.ts:142-148 — impl 側の observation auto-fix 遷移生成: `R_i → approved + fixable findings → code-fixer`（findingsRouting)、`code-fixer → next(R_i) when active_reviewer == R_i AND R_i last verdict approved`。fixable 数の判定は collectFixableFindings（reviewer-chain.ts:135)
- src/core/step/judge-verdict.ts — `deriveSpecReviewVerdict` の 4b: routable canon fixable finding ≥ 1 → needs-fix（severity 不問、#913)。4a: unroutable → escalation。`collectFixableFindings` は同ファイルに存在し「approved 到達時点で残るのは low/medium fixable のみ」という前提がコメントに明記されている
- src/core/pipeline/types.ts:233-242 — spec-review の遷移: `approved → TEST_CASE_GEN` / `needs-fix → SPEC_FIXER` / `SPEC_FIXER approved → SPEC_REVIEW`。spec-fixer の戻り先は無条件に spec-review
- src/core/pipeline/types.ts:266 — conformance の `needs-fix:spec-fixer → SPEC_FIXER`。この経路の spec-fixer も完了後は `SPEC_FIXER approved → SPEC_REVIEW` で spec-review 再検証に入る（reverification 経路の一部)
- src/core/pipeline/findings-ledger.ts:42 — collectFindingsLedger の走査対象は impl reviewer chain（deriveImplReviewerChain)のみ。spec-review は台帳源ではない
- src/core/step/regression-gate.ts — ledger の finding を機械検証する gate が impl フェーズに存在する
- src/core/step/spec-fixer.ts — spec-fixer の書込集合は {spec.md, design.md, tasks.md}（#923)
- src/prompts/spec-review-system.ts — Method 節に全量列挙規律（#925)。finding-recency 検出（後出しの機械記録)は iteration ≥ 2 の spec-review 完了時に発火する

## 要件

1. **verdict 導出の変更**: `deriveSpecReviewVerdict` において、routable canon fixable finding が **low / medium のみ**の場合は needs-fix でなく **approved** を返す（finding は記録される)。routable であっても **critical / high** を含む場合は従来どおり needs-fix（再レビュー往復)。unroutable canon fixable → escalation、decision-needed → escalation、ok=false / vacuous → escalation は不変
2. **observation pass の遷移**: spec-review が approved かつ routable fixable finding ≥ 1 のとき spec-fixer に遷移し、spec-fixer がそれらを消化した後、**spec-review の再レビューなしで test-case-gen に直行**する（impl 側の `code-fixer → next(R_i)` と同型)
3. **経路の分離（越境ハザード)**: 直行遷移は「直前の spec フェーズ判定が spec-review の approved だった場合」に限定する。**conformance の needs-fix:spec-fixer 起点の spec-fixer は従来どおり spec-review 再検証に戻る**（reverification 経路の破壊禁止)。needs-fix 起点の spec-fixer → spec-review 再レビューも不変
4. **後段機械検証**: spec-review の fixable finding（observation pass で消化されたもの)を findings ledger に載せ、regression-gate が impl フェーズで機械検証する。台帳の走査対象に spec-review を追加する
5. **予算**: observation pass の spec-fixer 実行は spec-review のループ予算（review 反復回数)を消費しない
6. spec-review prompt の全量列挙規律・finding-recency 検出（#925)は無変更。impl 側（code-review / custom reviewers)の observation auto-fix も無変更

## スコープ外

- unroutable canon fixable（request.md / test-cases.md / attestation)の minor finding の扱い変更（現行どおり escalation を維持)
- FAST pipeline（spec-review 自体が無い)
- conformance の fixTarget routing の変更
- observation pass で消化した修正の即時 LLM 再レビュー（後段の regression-gate 機械検証で代替するのが本 request の主旨)

## 受け入れ基準

- [ ] spec.md への medium fixable finding のみで spec-review verdict が approved になり、spec-fixer 消化後に test-case-gen へ直行する（spec-review が再実行されない)ことを遷移テストで固定する
- [ ] spec.md への high fixable finding で従来どおり needs-fix → spec-fixer → spec-review 再レビューの往復になることをテストで固定する
- [ ] conformance の needs-fix:spec-fixer 起点の spec-fixer が従来どおり spec-review 再検証に戻る（test-case-gen に直行しない)ことをテストで固定する
- [ ] observation pass で消化された spec-review の fixable finding が findings ledger に載り、regression-gate の入力に含まれることをテストで固定する
- [ ] request.md への fixable finding（unroutable)が従来どおり escalation + escalationReason であることを既存テスト無変更で維持する
- [ ] observation pass が spec-review のループ予算を消費しないことをテストで固定する
- [ ] 期待値を更新した既存テスト（#913 の severity 不問 needs-fix を期待するもの等)を implementation-notes に列挙する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: impl 側の observation auto-fix（#407)と同型への統一。新機構の発明ではなく既存パターンの spec フェーズへの移植であり、「minor は fixer 消化 + 後段機械検証、blocking のみ即時再レビュー」という基準が両フェーズで一貫する
- **採用**: 検証の置換先は regression-gate（ledger 機械検証)。「agent の自己申告を信頼しない」を、コストの高い即時 LLM 再レビューでなく後段の機械 gate で満たす。impl 側で実績のある構成
- **却下**: 全 fixable を再レビューなし直行にする（severity 閾値なし)— critical / high の仕様欠陥は修正の正しさ自体に判断が要り、機械検証で代替できない。blocking の再レビュー維持は必須
- **却下**: 現状維持（severity 不問で needs-fix ループ)— minor 指摘のたびに再レビュー往復が発生し、再レビューが新 minor を出すと往復が連鎖する。予算枯渇と収束遅延の実測があり、修正の質に対して検証コストが不釣り合い
- **却下**: spec-fixer 完了時に spec-review でなく軽量 diff 検証 step を新設する — step の新設は pipeline 形状の複雑化であり、regression-gate という既存の検証座席がある以上不要
