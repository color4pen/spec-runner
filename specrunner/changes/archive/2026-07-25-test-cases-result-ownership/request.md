# test-cases.md の Result YAML の所有権を test-case-gen に固定し、materialize の完了状態と誤読される意味の欠落を解消する

## Meta

- **type**: spec-change
- **slug**: test-cases-result-ownership
- **base-branch**: main
- **adr**: true

## 背景

test-cases.md テンプレートは末尾に Result YAML ブロック（`result: completed | partial | failed` / `blocked_reasons` 等)を要求するが、この `result` が「何の」結果なのかをテンプレート・prompt のどこも定義していない。実態は test-case-gen による**テストケース生成の結果記録**であり、生成時に一度だけ書かれる確定値である。

意味が定義されていないため、`result: completed | partial | failed` という語彙は後続ステップから**ライフサイクルフィールド**（作業が進んだら更新すべき状態欄)に見える。実運用（外部 repo、specrunner 0.4.x)で、test-materialize の agent がテスト実装完了後に Result ブロックを `result: completed` へ更新しようとし、write-scope 検証（test-materialize は test-cases.md への合法な書込を持たない)で halt した。ガードは設計どおり働いたが、誤読を誘発する意味の欠落が canon 側に残っている。

test-materialize の prompt は「test-cases.md は変更禁止」(#880)を既に明記しているが、Result ブロックには言及がなく、「result 欄だけは更新が求められている」という読みを排除できていない。禁止の再掲ではなく、**Result YAML が生成時の記録であり materialize の完了状態を反映するフィールドではない**という意味の確定が必要である。

## 現状コードの前提

- src/templates/step-output-templates.ts:117-163 — TEST_CASES_TEMPLATE。Result YAML ブロック（result / total / automated / manual / must / should / could / blocked_reasons)を末尾に要求するが、所有者・書込時点・enum 値の意味は未定義
- src/templates/step-output-templates.ts:109-116 — テンプレート docstring が「Machine-parsed fields: … Result YAML block (all keys)」と主張するが、pipeline のいかなるコードも Result YAML を parse しない（下記)。実態と食い違う
- src/core/step/test-case-gen.ts:89-99 — test-case-gen は result file を parse しない（completion は session idle で検出)。test-cases.md への出力契約は produced（存在)のみで、Result ブロックの内容検査はない
- `blocked_reasons` の参照は src/prompts/test-case-gen-system.ts と src/templates/step-output-templates.ts のみ（src/ 全域 grep)。機械 parser は存在しない
- src/prompts/test-case-gen-system.ts:71,75 — blocked_reasons の記録形式と Result YAML の配置指示はあるが、`result` の enum 値（completed / partial / failed)の意味と確定時点の定義がない
- src/prompts/test-materialize-system.ts:43 — 「test-cases.md は変更禁止」(#880)。Result ブロック・result 欄への言及はない
- src/core/step/write-scope.ts — test-materialize は GUARDED_WRITE_STEPS に含まれ、protectedCanonPaths の test-cases.md への書込は宣言なしでは write-scope violation になる（実運用で halt を確認済み)

## 要件

1. **テンプレートでの所有権明記**: TEST_CASES_TEMPLATE の Result ブロック要求コメントに以下を明記する: Result YAML は test-case-gen によるテストケース生成の結果記録であり、生成時に一度だけ書かれる。後続ステップ（test-materialize を含む)はこれを更新しない。`result` の値の意味を定義する — completed = 全 TC の設計が完了し blocked_reasons が空 / partial = 一部 TC が設計不能で blocked_reasons に記録あり / failed = 生成自体が成立しなかった
2. **test-case-gen prompt での確定規則**: 要件 1 と同一の enum 意味と「生成完了時点で確定し、後続ステップは書き換えない」ことを test-case-gen の system prompt に明記する
3. **test-materialize prompt での誤読排除**: test-materialize の system prompt に、test-cases.md 末尾の Result YAML は生成時の記録であり、テスト実装の完了状態を反映するフィールドではないこと（実装完了後も更新しないこと)を明記する
4. **docstring の実態整合**: TEST_CASES_TEMPLATE の docstring から「Result YAML block (all keys) が machine-parsed」という不正確な記述を除去し、実態（pipeline は Result YAML を parse しない。TC-NNN heading と Priority / Category フィールドが test-coverage 検査の machine-parse 対象)に合わせる

## スコープ外

- Result YAML の機械 parser の新設（現状 parse する消費者がおらず、意味の確定が先)
- Result YAML の schema 変更（キーの追加・削除・rename。既存 repo の test-cases.md との互換を維持する)
- test-materialize への test-cases.md 書込許可（canon 保護の逆行。#880 を維持する)
- write-scope 検証の挙動変更（ガードは設計どおり機能した)
- Summary セクションの形式変更

## 受け入れ基準

- [ ] TEST_CASES_TEMPLATE の Result ブロックコメントに所有者（test-case-gen)・書込時点（生成時に一度)・enum 値の意味が含まれることをテンプレート文言テストで固定する
- [ ] test-case-gen の system prompt に result の enum 意味と確定規則が含まれることを prompt contract テストで固定する
- [ ] test-materialize の system prompt に Result YAML を実装完了後も更新しない旨が含まれることを prompt contract テストで固定する
- [ ] TEST_CASES_TEMPLATE の docstring に Result YAML が machine-parsed であるという記述が残っていないことをテストで固定する
- [ ] 既存の test-cases.md 関連テスト（テンプレート形式・coverage 検査)が無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 所有権と意味の明文化 3 点（テンプレート + gen prompt + materialize prompt)。write-scope ガードは正しく働いており、欠けているのは「result が何の結果か」という意味の定義のみ。agent が判断する場面（このフィールドは更新すべきか？)を canon の明文で消す
- **却下**: Result ブロックの削除 — blocked_reasons は設計不能 must TC の唯一の記録経路であり、削除すると生成の不完全性が無言化する。既存 repo の test-cases.md との互換も壊れる
- **却下**: test-materialize に Result 更新を許可 — 「test-cases.md は test-case-gen の正典」(#880)の逆行。materialize の完了状態は verification / coverage 検査が機械的に判定するものであり、canon への自己申告欄を作る必要がない
- **却下**: Result YAML の機械 parse 導入による整合検査 — 消費者のいない parser の新設は複雑化のみ。意味の確定と誤読排除で事故クラスは消える
