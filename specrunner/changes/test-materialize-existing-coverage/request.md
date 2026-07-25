# 既存テストによる must TC 充足の正規表明と、manual TC の coverage 集計除外

## Meta

- **type**: spec-change
- **slug**: test-materialize-existing-coverage
- **base-branch**: main
- **adr**: true

## 背景

must の test case が変更前からリポジトリに存在するテストで既に検証されている場合、coverage 検査（test file 内の TC-ID リテラル走査）は当該 TC を未カバー扱いで fail する。test-materialize の agent はこの状況で正規の充足手段を持たず、新規テストを重複作成するか、充足不能として停止するかの二択になる。

実運用では「既存テストファイルに `// TC-0XX: <説明>` のトレーサビリティコメントを 1 行追記する」ことで coverage 検査が通ることが確認されており、operator の手動回避として機能した。この回避策を正式な規約に昇格し、test-materialize が自律的に実行できるようにする。

もう一つの充足不能ケースが Category: manual の must TC である。must TC の抽出は Priority のみを見て Category を参照しないため、手動検証しかできない TC にもテストファイル中の TC-ID 出現が要求される。手動 TC は定義上自動テストを書けないので、agent は検証実体のないコメントをテストファイルに置いて検査を通すか（gate を騙る作法の常態化)、充足不能として停止するかの二択になる。外部 repo の実運用（specrunner 0.4.x)で、過去 job が通っていたのは agent が偶然コメントに ID を書いていたためであることが確認されている。manual の must TC は coverage 集計から除外し、その検証は conformance / レビュー gate の管轄とする。

## 現状コードの前提

- src/core/verification/test-coverage.ts:1-11 — must TC ID を test file 群（*.test.ts 等、node_modules / dist / .git 除外の project 全域）のリテラル出現で検査する。出現形式（コメント / 文字列 / identifier）は区別しない
- src/core/verification/test-coverage.ts:95-135 — extractMustTcIds は TC section 内の `**Priority**: must` のみで must を判定し、`**Category**: manual` を参照しない。manual の must TC も coverage 集計に含まれる
- test-cases.md のテンプレート（src/templates/step-output-templates.ts）は TC ごとに **Category**: unit | integration | manual を必須フィールドとして定めている（section-scan で機械抽出可能）
- src/core/step/test-materialize.ts:47-50 — `outputContracts()` が test-coverage 契約を宣言し、must TC ごとに test file entry を要求する
- src/prompts/test-materialize-system.ts — 既存テストが TC を充足している場合の指示が存在しない（既存テストの参照は配置パターン確認の文脈のみ: :61 / :117）
- src/core/step/write-scope.ts:33 — test-materialize は GUARDED_WRITE_STEPS に含まれ、既存 test file の編集は write-scope 上可能
- 実測（0.4.4）: 既存 architecture test が must TC を満たすケースで test-materialize が output contract 不満足で停止し、operator のコメント追記で回避した（issue #921）

## 要件

1. test-materialize の system prompt に、must TC が既存テストで既に検証されている場合の正規手順を明記する: 当該既存テストの該当箇所（describe / it の近傍）に TC-ID トレーサビリティコメント（`// TC-0XX: <TC 名>`）を 1 行追記することが充足の正式手段であり、新規テストの重複作成も充足不能としての停止もしない
2. 既存テストによる充足の場合も test-cases.md 側の更新は新規 materialize と同一の扱いとする（新フィールドは追加しない）
3. この規約を docs に明文化する: test-coverage は TC-ID リテラルを走査すること、トレーサビリティコメントが既存カバレッジの表明手段であること、manual TC が集計対象外であること
4. coverage 検査の方式は機械的リテラル走査を維持する（意味的判定は導入しない）
5. extractMustTcIds（または evaluateTestCoverage）は `**Category**: manual` の TC を must coverage 集計から除外する。判定は既存の section-scan と同型の機械的抽出とする
6. test-materialize の system prompt に、manual TC は自動テスト化・コメント記載の対象外であることを明記する（検証実体のないトレーサビリティコメントの偽装を防ぐ）

## スコープ外

- test-cases.md への `covered-by` 等の新フィールド追加（却下した代替案）
- test-coverage の走査方式・assertionless 判定の変更（manual 除外は must 集計対象の絞り込みであり走査方式の変更ではない）
- 既存テストが「本当に当該 TC を検証しているか」の意味的検証（コメント追記の妥当性は conformance / レビュー gate の管轄）
- manual TC の検証手段そのものの設計（conformance / レビュー gate の管轄のまま変更しない）
- 契約違反時の TC-ID 表示・follow-up 化（別 request: test-coverage-violation-detail）

## 受け入れ基準

- [ ] test-materialize の system prompt に既存テスト充足時のトレーサビリティコメント手順が含まれることを prompt contract テストで固定する
- [ ] TC-ID がコメント形式でのみ既存 test file に出現する fixture で test-coverage が passed になることをテストで固定する
- [ ] `**Category**: manual` かつ `**Priority**: must` の TC がテストファイルに ID 出現なしでも missingTcIds に入らないことを fixture テストで固定する
- [ ] manual 以外（unit / integration）の must TC の判定が従来と同一であることをテストで固定する
- [ ] test-materialize の system prompt に manual TC が対象外であることが含まれることを prompt contract テストで固定する
- [ ] docs に規約（リテラル走査 + トレーサビリティコメント + manual 除外）が明文化される
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: トレーサビリティコメントの正式規約化 + prompt での手順明示。「このテストがこの TC を検証する」という主張がテストファイル自体に残って将来の読者に見え、coverage 検査は機械的リテラル走査のまま単純に保たれる。実運用で機能した回避策の正式化であり、新規機構を増やさない
- **採用**: manual TC の must 集計除外。自動テストを書けない TC にテストファイル出現を要求するのは充足不能要求であり、検証実体のないコメント偽装（gate を割ったフリ）を構造的に誘発する。除外により「coverage 検査が要求するものはすべて自動テストで充足可能」という契約に揃う
- **却下**: manual TC にもトレーサビリティコメントを義務付ける — コメントの先に検証実体（テストコード）が存在しないため、「コメント = 検証あり」という規約の意味を破壊し、偽装を正式作法に昇格させてしまう
- **却下**: test-cases.md への covered-by フィールド — 充足の主張がテストファイルから分離した第二の正本になり、coverage 検査側に file 存在 + green 確認の機構追加が必要になる。ドリフト面と検査の複雑さが増す
- **却下**: coverage 検査の意味的判定化（agent が充足を判断）— 機械検証を agent 判断に置き換えるのは検証可能性の方向に逆行する
