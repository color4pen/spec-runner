# test-coverage 契約違反で欠落 TC-ID を agent と operator に伝え、同一セッションで修復可能にする

## Meta

- **type**: spec-change
- **slug**: test-coverage-violation-detail
- **base-branch**: main
- **adr**: true

## 背景

test-materialize の test-coverage 契約（must TC の TC-ID がテストファイルに出現し assertion を伴うこと)に違反すると、pipeline は STEP_OUTPUT_MISSING で halt する。このとき評価器は欠落 TC-ID の一覧を既に算出しているにもかかわらず、halt メッセージには test-cases.md の path しか表示されない。

実運用（外部 repo、specrunner 0.4.x)で以下が観測された: materialize agent は「test-cases.md が契約不満足」としか知らされず、65 TC 中どれが欠けているか分からないまま再走し、同じ 2 件（TC-064 / TC-065)を欠落させて同じ halt を繰り返す自己修復不能ループに陥った。operator が coverage 検査ロジック（extractMustTcIds + TC-ID 境界正規表現)を手元で再現して欠落 TC を特定するまで脱出できなかった。

同種の契約である tasks-complete（未完チェックボックス)は、violation の detail をメッセージに列挙し、かつ follow-up policy による同一セッション内の修復ループを持つ。test-coverage だけが「detail を捨てる + halt 直行」の組み合わせになっており、機械が答えを知っているのに誰にも伝えない状態である。

## 現状コードの前提

- src/core/runtime/local.ts:1317-1333 — test-coverage 契約の評価は evaluateTestCoverage を呼び、失敗時に `[...missingTcIds, ...assertionlessTcIds]` を violation の detail に格納している（データは既に存在する)
- src/core/step/step-halt.ts:257-292 — makeOutputGateHalt は violation の kind が tasks-complete / content-format の場合のみ detail を描画し、test-coverage は素の path に fall through する（:263-269)
- src/core/step/output-verify.ts:134-189 — buildOutputFollowUpPrompt は tasks-complete / produced / content-format の 3 節のみで、test-coverage の節が存在しない
- src/core/step/step-context-builder.ts:108-122 — policy "follow-up" の契約には in-session 修復ループ（detect → buildOutputFollowUpPrompt → 再検証、最大 OUTPUT_FOLLOWUP_MAX_ATTEMPTS 回)が既に実装されている
- src/core/step/executor.ts:406-422 — follow-up 修復を使い切っても violation が残る場合は halt に合流する（makeOutputGateHalt)
- src/core/step/test-materialize.ts:87-97 — test-coverage 契約は policy "halt" で宣言されている
- src/core/verification/test-coverage.ts — evaluateTestCoverage は missingTcIds と assertionlessTcIds を区別して返す

## 要件

1. **halt メッセージの detail 描画**: makeOutputGateHalt で test-coverage kind の violation は detail（欠落 TC-ID / assertionless TC-ID)を列挙する。tasks-complete の既存表示と同型
2. **follow-up prompt の test-coverage 節**: buildOutputFollowUpPrompt に test-coverage 節を追加する。欠落 TC-ID には「該当 TC のテストを書き TC-ID をテストファイルに記載する」、assertionless TC-ID には「該当テストに assertion を追加する」という修復指示を、ID を明示して出す
3. **policy の follow-up 化**: test-materialize の test-coverage 契約を policy "halt" から "follow-up" に変更する。違反時は同一セッション内で ID 明示の修復指示を受けて再試行し、試行上限まで解消しない場合は従来どおり halt する（このとき要件 1 により halt メッセージにも ID が載る)
4. **missing / assertionless の区別**: detail 上で欠落と assertionless が区別できる形式にする（修復指示が異なるため)

## スコープ外

- coverage 判定ロジック（extractMustTcIds / tcIdBoundaryRe / assertion 判定)の変更
- OUTPUT_FOLLOWUP_MAX_ATTEMPTS（修復試行上限)の変更
- 他 step の契約 policy の変更
- Category: manual の must TC の集計上の扱い（別 request: test-materialize-existing-coverage)

## 受け入れ基準

- [ ] test-coverage violation の halt メッセージに欠落 TC-ID が列挙されることをテストで固定する
- [ ] buildOutputFollowUpPrompt が test-coverage violation から TC-ID 明示の修復指示を生成することをテストで固定する
- [ ] test-materialize の test-coverage 契約が follow-up policy であり、violation 検出 → 修復 → 再検証 pass の経路が成立することをテストで固定する
- [ ] 修復試行上限まで解消しない場合に halt へ合流し、そのメッセージにも TC-ID が含まれることをテストで固定する
- [ ] missing と assertionless が halt メッセージ / follow-up prompt 上で区別されることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: follow-up 化 + 全経路での ID 列挙。tasks-complete と同型の in-session 自己修復であり、機構（step-context-builder の修復ループ)は既存で新設なし。「機械が算出済みの答えを agent に渡して修復させ、無理なら halt」という段階制は既存契約と一貫する
- **却下**: halt メッセージの改善のみ（policy は halt のまま)— agent への情報伝達が operator の resume 操作経由の人手依存のままで、実測された自己修復不能ループの根が残る
- **却下**: coverage 判定への LLM 関与（agent に充足可否を判断させる)— 機械検証を agent 判断に置き換えるのは検証可能性に逆行する
