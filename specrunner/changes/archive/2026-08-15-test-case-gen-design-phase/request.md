# test-case-gen を design phase の最終工程へ移動: TC を spec-review の照合対象にする

## Meta

- **type**: spec-change
- **slug**: test-case-gen-design-phase
- **base-branch**: main
- **adr**: true

## 背景

現行の順序は design → spec-review → test-case-gen で、test-cases.md は spec-review の承認**後**に生成される。test-cases.md は下流(実装・検証・整合確認)を拘束する重要な成果物であるにもかかわらず、どのレビューの照合対象にもならないまま canon として確定している。

この歪みの実害が観測されている: 設計文書に対する承認だけを通過した TC が、実装前に決められない詳細(API 呼び出し手順・内部状態)まで GIVEN/WHEN/THEN に書き込み、実装と矛盾する。直近の merge 済み change(agent-inactivity-timeout)では、TC の GIVEN「bump() を一切呼ばない」が実装上成立せず、実装が正しく canon 側を operator が修正した。TC の解像度が実装の形に踏み込むと、正しい実装との不整合が canon の権威側に残る。

対策は 2 つの組で行う:

1. **位置**: test-case-gen を design phase の最終工程に移す(design → test-case-gen → spec-review)。テストケース設計まで含めて「設計」と見なし、spec-review が spec / tasks / test-cases の三者を照合してから下流へ渡す
2. **抽象度**: test-cases.md は「何を確認できればよいか」(振る舞いレベル)に留め、「どう確認するか」(API・内部構造・assertion の形)は実装側の裁量に返す。spec-review の照合観点に抽象度の逸脱検査を含め、後退を防ぐ歯にする

## 現状コードの前提

- `src/core/pipeline/types.ts:232` — `DESIGN success → SPEC_REVIEW`。`:239` — `SPEC_REVIEW approved → TEST_CASE_GEN`(無条件行)。`:242` — `TEST_CASE_GEN success → TEST_MATERIALIZE`
- `src/core/pipeline/types.ts:236` — `SPEC_REVIEW approved → SPEC_FIXER when specReviewHasRoutableFixables`(観察 pass)。`:249` — `SPEC_FIXER approved → TEST_CASE_GEN when specFixerForwardsToTestGen`(観察 pass 後の下流継続、再レビューに回さない)。`:251` — `SPEC_FIXER approved → SPEC_REVIEW`(needs-fix 後の再レビュー)
- `src/core/pipeline/types.ts:238` / `:247` — chore 等のテスト生成免除 type の bypass(`isTestGenExempt` / `specFixerForwardsToImplementer`、#987)
- `src/core/step/spec-review.ts:81-83` — 入力は spec.md / design.md / tasks.md。test-cases.md は読まない
- `src/core/step/test-case-gen.ts:69-76` — 入力 design.md / tasks.md、出力 test-cases.md のみ(writes 宣言で出力検証あり)。tasks.md への書き込みは無い
- `src/prompts/test-case-gen-system.ts` — GIVEN/WHEN/THEN の記述要求はあるが、抽象度(実装構造へ踏み込まない)の指示は無い
- `src/prompts/spec-review-system.ts` — 照合観点に test-cases.md は含まれない

## 要件

1. **遷移の組み替え** — 通常経路を design → test-case-gen → spec-review → (現行の下流) に変更する:
   - `DESIGN success → TEST_CASE_GEN`(免除 type は `DESIGN success → SPEC_REVIEW` 直行)
   - `TEST_CASE_GEN success → SPEC_REVIEW`
   - `SPEC_REVIEW approved →`(免除 type 以外の無条件行)は test-case-gen を経由せず現行の下流(test-materialize)へ直接進む
   - needs-fix ループ: `SPEC_FIXER approved → TEST_CASE_GEN`(spec/design の修正後は TC を**常に再生成**してから再レビュー)。再生成の要否を判断で分岐させない
   - 観察 pass(approve + routable fixables → spec-fixer)は現行どおり**再レビューに回さない**。観察 pass 後は TC 再生成なしで下流継続(approve は stop gate、観察は非ブロッキング指摘のみという現行の意味論を維持)
2. **spec-review の照合拡張** — 入力に test-cases.md を追加し、照合観点に次を加える: (a) TC が spec の Scenario / Requirement を過不足なく検証しているか、(b) tasks と TC の間に実装計画の穴がないか、(c) **TC が実装の API・内部構造・assertion の形式に踏み込んでいないか**(振る舞いレベルからの逸脱検査)
3. **test-case-gen の振る舞いレベル化** — system prompt に追加する: TC は「何を確認できればよいか」を記述し、特定の関数呼び出し手順・内部状態の具体値・assertion の形式を GIVEN/WHEN/THEN に書かない。検証手段の選択は実装側の裁量。
4. **test-case-gen の責務固定** — test-case-gen は tasks.md を編集しない(現状の writes 宣言を維持)。tasks と TC の不整合に気づいた場合は test-cases.md 内の申し送りとして記録し、判定は spec-review に委ねる。
5. **TC finding の修正経路** — spec-review が test-cases.md に対して出した fixable finding は、escalation(operator-only)にせず **test-case-gen の再生成で解消する**:
   - spec/design/tasks への finding と混在する場合: spec-fixer による修正 → test-case-gen 再生成(要件 1 の既存ループ)の再生成時に、TC への finding を入力として渡し解消させる
   - TC への finding のみの場合: spec-fixer を経由せず test-case-gen の再生成に直接入り、再生成後 spec-review に戻る
   - 現行の canon routing は test-cases.md への finding を operator-only と判定する。この判定を、**spec-review 承認前(design phase 内)の test-cases.md には適用しない**よう変更する。承認後(実装工程以降)の test-cases.md 保護は従来どおり維持する
   - 新しい reviewer step は作らない。routing の具体形(FixTarget の追加等)は design で確定する

## スコープ外

- test-materialize の挙動・存廃(別 request で扱う)
- bite-evidence の baseline 変更(別 request: Evidence Base)
- spec-review の verdict 種別・ループ上限・escalation 経路の変更
- 既存の免除 type(#987)の対象拡大
- conformance からの spec-fixer 再入経路の意味論変更(組み替えに伴う機械的追随のみ)

## 受け入れ基準

- [ ] 通常 type の遷移が design → test-case-gen → spec-review → test-materialize となることをテストで固定する
- [ ] needs-fix ループで spec-fixer 後に test-case-gen が再実行され、その後 spec-review に戻ることをテストで固定する
- [ ] 観察 pass(approve + routable fixables)後に spec-review が再実行されないこと(現行の stop gate 意味論の維持)をテストで固定する
- [ ] 免除 type が design → spec-review 直行となり、test-case-gen を通らないことをテストで固定する
- [ ] spec-review の入力に test-cases.md が含まれることをテストで固定する
- [ ] spec-review prompt に TC↔spec / TC↔tasks / TC 抽象度の照合観点が含まれることをテストで固定する
- [ ] test-case-gen prompt に振る舞いレベルの記述指示(実装構造へ踏み込まない)が含まれることをテストで固定する
- [ ] spec-review の test-cases.md への fixable finding が escalation にならず、test-case-gen の再生成に渡されて解消経路に乗ることをテストで固定する
- [ ] TC への finding のみの needs-fix で、spec-fixer を経由せず test-case-gen 再生成 → spec-review となることをテストで固定する
- [ ] spec-review 承認後の test-cases.md への finding は従来どおり保護(operator 経路)されることをテストで固定する
- [ ] 遷移表の既存 pin テストの更新対象を design で全列挙し根拠を明示する。列挙外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **テストケース設計は design の一部** — test-cases.md が下流を拘束する成果物である以上、レビューを経ずに canon 化するのは設計成果物の扱いとして一貫しない。spec-review を「設計フェーズ全体の出口」に位置付け、spec / tasks / test-cases の三者照合をそこで行う。却下した代替案: TC 専用レビュー step の新設(step 追加はトークンコストで既定 NG、spec-review の照合拡張で足りる)。
- **TC 再生成は常時、判断で分岐させない** — spec-fixer の修正が TC に影響するかを走行中に判定させると agent の判断場面が増える。test-case-gen は軽量な工程であり、常時再生成のコストは判断の不確実性より安い。
- **観察 pass の意味論は変えない** — approve 後の再レビュー禁止(stop gate)は非ブロッキング指摘によるループを防ぐ既存の規律であり、TC の位置変更はこれに影響させない。観察修正は spec の意味を変えない前提(非ブロッキングの定義)のため TC 再生成も不要。
- **抽象度の歯は spec-review に置く** — prompt の指示だけでは後退する(生成側の自己申告)。照合側に「実装構造への踏み込み」を検査させることで、TC が新しい手錠になる後退を構造的に検出する。
- **TC を裁く場を作る以上、直す手も機械経路で持つ** — TC への finding を operator-only のまま残すと、「レビューは指摘できるが機械は直せない」状態になり、TC レビューの導入が escalation の量産装置になる。生成物(test-cases.md)の修正手段は生成者(test-case-gen)の再生成であり、fixer に書かせる必要はない。承認前の test-cases.md は「レビュー中の設計成果物」であって凍結済み canon ではない、という位置付けの変更が routing 変更の根拠。
