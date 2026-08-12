# chore type のテスト生成免除: TYPE_CONFIG によるテスト生成工程の宣言的 skip

## Meta

- **type**: new-feature
- **slug**: test-generation-type-gate
- **base-branch**: main
- **adr**: true

## 背景

docs 修正・CI 設定・依存更新のような振る舞い変更を伴わない作業(chore)でも、現在はテスト設計(test-case-gen)→ テスト生成(test-materialize)→ 見張り確認(bite-evidence)の全工程が走る。テスト生成は pipeline で最も出力の重い工程であり(直近 55 job で約 7 万行のテストコードを生成)、振る舞い変更が無い request ではこの消費が成果に結びつかない。

`TYPE_CONFIG` には既に type 別免除の前例がある: `specRequired: false` により chore は spec 免除(design が Requirements 無しで通る)。同じ型でテスト生成免除を導入する。

原則: **免除するのは「テストの生成」のみ。既存テストの「実行」(build / typecheck / lint / test suite)は全 type で維持する** — 「壊していない」ことの床は全 request に残る。免除は type で宣言的に決まり、走行中の agent 判断を挟まない。

## 現状コードの前提

- `src/config/type-config.ts:28` — `TYPE_CONFIG` が request type 定義の単一正典。5 type(new-feature / spec-change / refactoring / bug-fix / chore)。chore の description は「CI、依存更新、ドキュメントなど」
- `src/config/type-config.ts:105` — `isSpecRequired()`: chore は `specRequired: false`、unknown type は fail-closed で true。type 別免除の既存パターン
- `src/core/pipeline/types.ts:236` — `SPEC_REVIEW approved → TEST_CASE_GEN`。`:239` `TEST_CASE_GEN success → TEST_MATERIALIZE`、`:241` `TEST_MATERIALIZE success → IMPLEMENTER`、`:248` `IMPLEMENTER success → BITE_EVIDENCE`、`:251-252` `BITE_EVIDENCE passed|strategy-deferred → VERIFICATION`
- `src/core/pipeline/types.ts:244` — `SPEC_FIXER approved → TEST_CASE_GEN when specFixerForwardsToTestGen`。transitions には `when` guard の前例がある(`:255` `conformanceApprovedForVerifiedRevision` も同様)
- `src/core/step/implementer.ts:157-159` — implementer の test-cases.md 入力は既に `required: false`(欠如耐性あり)
- `src/core/verification/test-coverage.ts:305-317` — test-cases.md 欠如時は `status: "skipped"` を返す(欠如耐性あり)
- `src/core/verification/runner.ts:360` — changed-line coverage gate は `verification.coverage` 未設定時に skip される(config gate)。type による gate は無い

## 要件

1. **TYPE_CONFIG へのフラグ追加** — `TypeConfigEntry` にテスト生成要否のフラグ(名称は design で確定)を追加する。chore: false、他の 4 type: true。参照関数は `isSpecRequired` と同型とし、**unknown type は fail-closed で true**(免除されない)。

2. **遷移の分岐** — テスト生成免除 type では pipeline が test-case-gen / test-materialize / bite-evidence を通らない:
   - `SPEC_REVIEW approved` → (免除時) `IMPLEMENTER` 直行
   - `IMPLEMENTER success` → (免除時) `VERIFICATION` 直行(bite-evidence を通らない)
   - `SPEC_FIXER approved → TEST_CASE_GEN`(`specFixerForwardsToTestGen`)の再入経路も同じ分岐に従う
   分岐は既存の `when` guard パターンで実装し、非免除 type の遷移は無変更とする。

3. **changed-line coverage の type 連動** — 免除 type では changed-line coverage gate を skip する(生成を免除して coverage で fail する矛盾を防ぐ)。skip はログ・result に明示し、黙って通さない。TC-ID 走査(test-coverage phase)は test-cases.md 欠如で既に skip されるため変更不要だが、skip 理由が結果に残ることを確認する。

4. **既存テスト実行の維持** — 免除 type でも verification の build / typecheck / lint / test suite 実行は無変更で走る。

## スコープ外

- profile 概念・新しい設定キーの導入
- config レベルの対応(プロジェクト自体にテスト基盤が無い場合の topology 導出)
- chore 以外の type の免除、docs 専用 type の新設
- テスト実行(既存 suite)の免除
- conformance / regression-gate の挙動変更(test-cases.md 参照経路の欠如耐性は現状確認の範囲で担保されており、不足が見つかった場合のみ最小追加)

## 受け入れ基準

- [ ] chore type の request で遷移が `SPEC_REVIEW → IMPLEMENTER → VERIFICATION` となり、test-case-gen / test-materialize / bite-evidence を通らないことをテストで固定する
- [ ] unknown type が fail-closed(テスト生成免除されない)であることをテストで固定する
- [ ] 免除 type で changed-line coverage gate が skip され、skip が結果に明示されることをテストで固定する
- [ ] 免除 type でも verification の command 実行(build / typecheck / lint / test)が走ることをテストで固定する
- [ ] 既存テストが無変更で green(非免除 type の遷移・挙動の無変更をこれで担保する)
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **profile ではなく TYPE_CONFIG のフラグ** — `specRequired` の前例に従う。type は起票時に必須選択されるため追加の宣言・設定・概念が不要で、走行中の agent 判断も挟まない。却下した代替案: assurance profile(ADR-20260716 R6。宣言の間接層が増え、既存の type 選択と二重管理になる)、workflow options による request 単位 opt-out(request ごとに繰り返し書く運用になり、契約として一貫しない)。
- **免除は生成のみ、実行は維持** — 既存テスト green の床を外すと「壊していない」ことの機械確認が消える。トークン消費の主因は生成側(最重量工程)であり、実行の維持はコスト面でも許容できる。
- **chore のみを免除** — chore の description(CI、依存更新、ドキュメントなど)が対象作業を既に包含する。docs 専用 type の新設は却下(語彙の重複)。refactoring は「既存テスト無変更で green」が主要な歯であり、テスト生成の省略対象にしない。
- **unknown type は fail-closed** — `isSpecRequired` と同じ方針。未知の type で黙って免除される事故を防ぐ。
