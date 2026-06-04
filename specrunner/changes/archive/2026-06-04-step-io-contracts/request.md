# 各 step が入出力を宣言し、実行前に入力の存在を検証する

## Meta

- **type**: spec-change
- **slug**: step-io-contracts
- **base-branch**: main
- **adr**: true

## 背景

pipeline の制御フロー（遷移）は記述子で宣言済みだが、**データフロー（各 step がどのファイルを読み書きするか）は依然 step の prompt 散文・state 逆引き・path helper に散在**している。

例えば直し工程は、直前のレビュー結果の在処を `getLatestStepResult(...).findingsPath` で state から逆引きし、無ければ halt する。各 step に入出力を宣言させ、実行前に必須入力の存在を検証することで、この「探して見つからず halt」を消し、データ依存を明示にする。標準 pipeline の挙動は変えない。

## 要件

1. 各 step に `reads`（入力）/ `writes`（出力）をファイル名規則で宣言する。`{n}`（反復番号）は job state 由来の iteration に解決する（解決規則は下記 architect 判断）。
2. step 実行前に、宣言された必須入力が存在するか検証し、欠落時は明示エラーで停止する。
3. 現在「state 逆引き＋無ければ halt」している箇所（`code-fixer` のレビュー結果参照等）を、宣言入力＋事前検証に置換する。
4. 工程の宣言を「その工程が読む / 書くファイルの正典リスト」にする。`util/paths` の既存関数は残し、宣言はそれを参照 / そこから導出する（使い手の呼び出し箇所は変更しない）。
5. 標準 pipeline の挙動（実行・画面出力・PR）を変えない。

## スコープ外

- 副作用クラス（`sideEffect: pure / gitWrite / external`）の宣言と、それを使う cache / incremental・並列分岐（消費者がまだ無い）。
- 成果物の lineage / cost 可視化。
- 遷移内の `when` predicate に残る state 逆引き。
- `StepName` の string 化。
- `util/paths` の命名を宣言側へ全面移設し、全使い手（雛形・PR 本文・検証・プロンプト・実行土台の約12ファイル）を宣言経由に張り替えること。波及が広く、記述子が固まる記法導入段に一度で行う。

## 受け入れ基準

- [ ] 各 step が `reads` / `writes` を宣言している。
- [ ] `util/paths` の既存関数と使い手の呼び出し箇所が変更されていない（宣言はそれらを参照 / 導出する）。
- [ ] step 実行前に必須入力の存在が検証され、欠落時は明示エラーで停止する（「探して halt」クラスが消える）。
- [ ] 既存の挙動（標準 pipeline の実行・画面出力・PR）が不変。
- [ ] managed / local 両 runtime で artifact の扱いが整合する。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

- データフロー（誰が何を読み書きするか）を、prompt 散文・state 逆引き・path helper の散在から **step の宣言に集約**する。これがレビュー結果の散在（プロンプト／逆引き／遷移）を1点に寄せる。
- 本 request の集約は**最小範囲**：工程の宣言を「その工程の入出力の正典リスト」にしつつ、`util/paths` の関数と約12の使い手は据え置き、宣言はそれを参照する。命名を宣言側へ全面移設する形は波及が広く設計の大元の先行変更を伴うため、記述子が固まる記法導入段に一度で行う。
- `{n}` の解決規則：job state 由来の iteration 番号に解決する。step 自身の `writes` は現在の iteration（過去実行回数 + 1）、他 step の出力を読む `reads` はその step の最新 iteration。必要な iteration が state に無い場合は要件2の事前検証が明示エラーで停止する。既存の path helper（`conformanceResultPath(slug, iteration)` 等）の規約に一致させる。
- 「**中身が正しいか**」は本 request の責務外。framework が検証するのは入力の**存在（在処）**まで。中身は report tool schema / gate step / verification が担う。
- **副作用クラスと cache・並列は含めない**。それらの消費者がまだ無く、未宣言のまま解禁すると不正な skip / 状態分裂を招くため、宣言だけ先行させる投機を避ける。
- 成果物の種別はファイルが主対象。コード / 作業ツリー（git state）への依存も宣言対象だが、その存在検証は git 状態として扱う。
- adapter 層（managed / local の artifact lifecycle）まで波及するため、両 runtime での整合を受け入れ基準に含める。
- 本変更は層・DSM・不変条件を変えない（refactoring）。Step 契約への I/O 追加は components の契約記述の精緻化に留まり、architecture authority の先行変更は要さない。
- 挙動不変の回帰検証は、画面出力スナップショット ＋ 既存 step テストに委ねる。
