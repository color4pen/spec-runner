# spec-review に全量列挙の規律を課し、finding の後出しを機械検出する

## Meta

- **type**: spec-change
- **slug**: spec-review-full-enumeration
- **base-branch**: main
- **adr**: true

## 背景

spec-review が同一 revision に対して見えているはずの finding を round ごとに 1 件ずつ小出しにし、有限のループ予算（1 起動あたり review 2 回)を食い潰して exhaustion 停止を繰り返す事例が実運用で確認された。実測では 6 finding が 5 round に分散し、operator resume を 2 回要した。journal と git 履歴の突合により、全 finding の対象記述は初回 round の revision に既に存在していたこと（fixer 編集による「動く標的」ではないこと)、および同一 round で同型の欠落（fetch ハンドラと install/activate ハンドラの同種の未言及)の片方だけを報告し次 round でもう片方を報告するパターンが確認されている。

原因は reviewer の完了契約に網羅性の要求が無いこと: finding 1 件でも有効な needs-fix 結果として成立するため、agent は満足化する。severity 不問の fixer routing とループ予算有界は健全であり、修正対象は網羅性のみである。

semantic な網羅性そのものは機械検証できないが、検証可能な近似として**後出し検出**が成立する: round N+1 の finding の対象記述が round N がレビューした revision に既に存在していた場合、それは round N の見逃しであり、機械判定できる。

## 現状コードの前提

- src/prompts/spec-review-system.ts:34-49 — Method 節はレビュー観点の列挙のみで、「見えている finding を全量列挙する」規律が存在しない。Evidence 規律（EVIDENCE_DISCIPLINE)は checked / skipped の件数を要求するが、finding 列挙の網羅性には言及しない
- src/kernel/report-result.ts — Finding は file / line を持つ（line は optional)
- src/core/step/step-completion.ts:232-250 — judge step の finding に対し runtimeStrategy.verifyFindingRefs で file:line の実在検証を行う下地が既にある（runtimeStrategy へのアクセスと finding 走査がこの位置で可能)
- src/state/helpers.ts:106 — StepRun は run ごとの `commitOid`（exit commit)を記録する。spec-review は canon を書かない judge step のため、run N の commitOid における canon 内容は run N がレビューした内容と一致する
- src/store/event-journal.ts:32 — journal（events.jsonl)への step-attempt 記録機構が存在する
- 前 round の revision 解決に必要な iteration 履歴は state.steps["spec-review"] に StepRun 配列として保持されている

## 要件

1. spec-review の system prompt（Method 節)に全量列挙の規律を追記する: 「この round の revision で確認できる finding は、severity を問わずすべて今回の findings に含める。1 件ずつ小出しにしない。前 round から存在した記述への新規 finding は後出しとして機械記録される」
2. 後出し判定の純関数を導入する: finding（file / line / 対象行の内容)と前 round がレビューした revision の当該 file 内容を入力に、`late`（対象記述が前 revision に既に存在)/ `not-late`（前 revision に存在しない = 新規記述への指摘)/ `indeterminate`（line 欠落・前 revision 解決不能・file が前 revision に不在等)の 3 値を返す。行番号ずれに頑健な内容一致で判定し、判定不能はすべて indeterminate に倒す
3. spec-review の完了処理で、iteration が 2 以上のとき各 finding に後出し判定を実行し、結果（per-finding の late / not-late / indeterminate)を journal に記録する。前 round の revision は state.steps["spec-review"] の直前 StepRun の commitOid から解決する
4. **後出し検出は verdict を変更しない**（観測信号であり gate ではない)。既存の verdict 導出・escalationReason 計算・finding-ref 実在検証は無変更
5. 検出結果は operator が run 後に確認できる形にする（journal 記録に加え、後出しが 1 件以上ある round では stderr に要約 1 行を出す)

## スコープ外

- 後出し率に基づく gate / halt / verdict 変更（信号の蓄積を見てから別 request で判断)
- code-review・conformance 等、spec-review 以外の judge step への配線（判定関数は汎用に作るが配線は spec-review のみ)
- maxIterations（ループ予算)の変更
- finding-ref 実在検証と欠落指摘 finding の衝突（issue #916)

## 受け入れ基準

- [ ] spec-review prompt の Method 節に全量列挙規律が含まれることを prompt contract テストで固定する（節抽出に対する assert、全文 grep ではない)
- [ ] 後出し判定純関数の 3 値（late / not-late / indeterminate)をテストで固定する: 前 revision に存在した記述 → late、fixer が書き足した記述への指摘 → not-late、line 欠落・前 revision 解決不能 → indeterminate
- [ ] iteration 2 の spec-review 完了で per-finding の後出し判定が journal に記録されることをテストで固定する
- [ ] 後出し検出が verdict / escalationReason を変更しないことをテストで固定する（late な finding を含む round でも verdict は既存導出と同一)
- [ ] iteration 1 では後出し検出が実行されない（前 round が無い)ことをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: prompt 規律（行動を変える)+ 後出し検出（遵守を測る)の二層。semantic な網羅性は直接機械検証できないため、検証可能な近似（前 revision に存在した記述への後出し指摘の検出)を歯にする
- **採用**: 観測信号に留め verdict を変えない。後出しを即 gate 化すると、判定の偽陽性（内容一致の限界)が新たな不当停止を生む。まず信号を蓄積し、gate 化は実測を見て別 request で判断する
- **却下**: severity 閾値の復活（low / medium は記録のみで前進)— 実測で clone() 欠落等の実装を壊しうる仕様穴が low / medium で報告されており、素通りに戻すと #913 が解決した問題が再発する
- **却下**: maxIterations の引き上げ — 小出しの根因を放置して予算で吸収する対症療法であり、round 数（= コストと時間)が線形に増えるだけで収束性は改善しない
- **却下**: prompt 規律のみ（検出なし)— 遵守が測定不能になり、規律が効いているかを次の実運用で判定できない。「agent 自己申告は信頼できない」原則に反する
