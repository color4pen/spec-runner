# request-review の code 断定 fact-check を attestation として記録し design の再検証重複をなくす

## Meta

- **type**: new-feature
- **slug**: request-review-factcheck-attestation
- **base-branch**: main
- **pipeline**: standard
- **adr**: true

<!-- adr: request-review と design の間に新しいステップ間データ契約（attestation）を導入するため true。 -->

## 背景

design ステップは pipeline 全体の実行コストの大きな割合を占め、その主因はリポジトリ探索である。request-review は既に request 全体の現状コード断定（file:line / symbol / path）を Read/Grep で fact-check している。design も設計着手前に同じ断定を Read/Grep で再検証している。request が review 後に変更されていない限り、この design 側の再検証は重複であり、探索コストを二重に払っている。

request-review が「何を検証したか（request の content hash + 検証済み path/symbol）」を機械可読な attestation として残せば、design は request 無変更時に同一断定の再検証を省略でき、探索量を削減できる。

## 現状コードの前提

- `src/prompts/request-review-system.ts:38-53`（Step 2: Code Assertion Fact-Check）— request 全体から file:line / 具体シンボル / ファイルパスを伴う断定を抽出し Read/Grep で実コードと照合、不一致は severity high の finding にする。
- `src/prompts/design-system.ts:44-60`（現状コード断定の検証）— design も同じ対象（file:line / シンボル / パスを伴う断定）を Read/Grep で再検証し、不一致なら `ok:false` + reason で停止する。
- request-review は結果を findings 配列と result file に出力する（`src/prompts/request-review-system.ts:125-166`）が、検証した path/symbol の manifest は残していない。
- pipeline 上、request-review は design の直前に位置し、その間 change folder の request.md は変更されない（needs-discussion → 人が編集する場合を除く）。

## 要件

1. request-review が Step 2 の fact-check 完了時に attestation を change folder のファイル（例: `specrunner/changes/<slug>/request-review-attestation.json`）として出力する。内容は最低限: request.md の content hash、code assertions を検証済みであることを示すフラグ、検証した relevant path / symbol のリスト。
2. design が実行時に attestation を読み、request.md の現在の content hash が attestation の hash と一致する場合、attestation に記録済みの断定の再検証を省略する（未記録の新規断定があればそれのみ検証する）。
3. content hash が不一致（request が review 後に編集された）場合、design は従来どおり全断定を再検証する。
4. attestation は change folder の file artifact として扱い、state schema は変更しない。

## スコープ外

- design の model routing（Opus→Sonnet 等の type 別割り当て）— 別途判断。
- conformance ステップの条件化。
- full request と request.md の二重注入（design への request 本文注入経路）の削減。

## 受け入れ基準

- [ ] request-review 実行後に attestation ファイルが change folder に生成されることをテストで固定する。
- [ ] request.md の content hash が attestation と一致する場合、design が記録済み断定の再検証を省略する経路をテストで固定する。
- [ ] content hash 不一致の場合、design が全断定の再検証へ fallback する経路をテストで固定する。
- [ ] request-review / design の verdict・停止判定の観測挙動は不変（attestation は探索量の削減のみで、判定結果を変えない）。既存テストを無変更で green に保つ。
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: attestation は state ではなく change folder の file artifact とする。他の change folder artifact と同じ扱いで schema 変更・migration が不要になり、pipeline metrics 等の state 変更と衝突しない。
- **採用**: 省略は「content hash 一致時のみ」に限定する。hash gate により request 編集後の drift 検出能力を失わない。
- **却下**: design から fact-check を全廃する案。request が review 後に編集された場合の drift を検出できなくなる。hash 一致時の省略に限定する。
