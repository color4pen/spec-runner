# 既存テストによる must TC 充足をトレーサビリティコメントで正規に表明できるようにする

## Meta

- **type**: spec-change
- **slug**: test-materialize-existing-coverage
- **base-branch**: main
- **adr**: true

## 背景

must の test case が変更前からリポジトリに存在するテストで既に検証されている場合、coverage 検査（test file 内の TC-ID リテラル走査）は当該 TC を未カバー扱いで fail する。test-materialize の agent はこの状況で正規の充足手段を持たず、新規テストを重複作成するか、充足不能として停止するかの二択になる。

実運用では「既存テストファイルに `// TC-0XX: <説明>` のトレーサビリティコメントを 1 行追記する」ことで coverage 検査が通ることが確認されており、operator の手動回避として機能した。この回避策を正式な規約に昇格し、test-materialize が自律的に実行できるようにする。coverage 検査自体は機械的リテラル走査のまま変更しない。

## 現状コードの前提

- src/core/verification/test-coverage.ts:1-11 — must TC ID を test file 群（*.test.ts 等、node_modules / dist / .git 除外の project 全域）のリテラル出現で検査する。出現形式（コメント / 文字列 / identifier）は区別しない
- src/core/step/test-materialize.ts:47-50 — `outputContracts()` が test-coverage 契約を宣言し、must TC ごとに test file entry を要求する
- src/prompts/test-materialize-system.ts — 既存テストが TC を充足している場合の指示が存在しない（既存テストの参照は配置パターン確認の文脈のみ: :61 / :117）
- src/core/step/write-scope.ts:33 — test-materialize は GUARDED_WRITE_STEPS に含まれ、既存 test file の編集は write-scope 上可能
- 実測（0.4.4）: 既存 architecture test が must TC を満たすケースで test-materialize が output contract 不満足で停止し、operator のコメント追記で回避した（issue #921）

## 要件

1. test-materialize の system prompt に、must TC が既存テストで既に検証されている場合の正規手順を明記する: 当該既存テストの該当箇所（describe / it の近傍）に TC-ID トレーサビリティコメント（`// TC-0XX: <TC 名>`）を 1 行追記することが充足の正式手段であり、新規テストの重複作成も充足不能としての停止もしない
2. 既存テストによる充足の場合も test-cases.md 側の更新は新規 materialize と同一の扱いとする（新フィールドは追加しない）
3. この規約を docs に明文化する: test-coverage は TC-ID リテラルを走査すること、トレーサビリティコメントが既存カバレッジの表明手段であること
4. test-coverage.ts の検査ロジックは変更しない（機械的リテラル走査を維持）

## スコープ外

- test-cases.md への `covered-by` 等の新フィールド追加（却下した代替案）
- test-coverage の検査方式・assertionless 判定の変更
- 既存テストが「本当に当該 TC を検証しているか」の意味的検証（コメント追記の妥当性は conformance / レビュー gate の管轄）

## 受け入れ基準

- [ ] test-materialize の system prompt に既存テスト充足時のトレーサビリティコメント手順が含まれることを prompt contract テストで固定する
- [ ] TC-ID がコメント形式でのみ既存 test file に出現する fixture で test-coverage が passed になることをテストで固定する
- [ ] docs に規約（リテラル走査 + トレーサビリティコメント）が明文化される
- [ ] test-coverage.ts の既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: トレーサビリティコメントの正式規約化 + prompt での手順明示。「このテストがこの TC を検証する」という主張がテストファイル自体に残って将来の読者に見え、coverage 検査は機械的リテラル走査のまま単純に保たれる。実運用で機能した回避策の正式化であり、新規機構を増やさない
- **却下**: test-cases.md への covered-by フィールド — 充足の主張がテストファイルから分離した第二の正本になり、coverage 検査側に file 存在 + green 確認の機構追加が必要になる。ドリフト面と検査の複雑さが増す
- **却下**: coverage 検査の意味的判定化（agent が充足を判断）— 機械検証を agent 判断に置き換えるのは検証可能性の方向に逆行する
