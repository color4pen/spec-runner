# ADR: TC 分類に gate カテゴリを追加し coverage 集計から除外する

- **Date**: 2026-08-06
- **Status**: Accepted
- **Slug**: gate-ac-classification

## Context

specrunner の test-case-gen が生成する TC の Category は `unit | integration | manual` の 3 値のみだった。しかし request 雛形・起票規律が推奨する「`typecheck && test` が green」のような **gate 型 AC**（充足基準がプロジェクト全体の検証 command の結果である基準）には対応する分類が存在しなかった。

この欠落により gate 型 AC が `unit` / `integration` の must TC として導出され、test-materialize がテストファイル化し、coverage gate がその存在を要求する。gate 型 AC の充足は verification phase（build / typecheck / test / lint 等）の結果そのものであるため、テストファイルとして再実装した瞬間に「検証 phase の再実行」というテストが生まれる。adopter のツールチェーン（cargo 等）ではこれが CI 破壊に直結することが実運用で確認された。

`Category: manual` の除外機構（ADR `2026-07-25-test-coverage-manual-tc-exclusion`）が同型の前例として存在する。分類 1 値を 3 箇所（test-case-gen prompt / test-materialize prompt / `extractMustTcIds` の単一判定点）で連動して尊重する構造である。gate はその第 2 適用として同じ構造で封じる。

## Decision

TC Category の第 4 値として `gate` を追加し、以下の 3 箇所で連動して尊重する。

1. **test-case-gen prompt**（`src/prompts/test-case-gen-system.ts`）に gate の定義と分類規則を追加する。「THEN がプロジェクト全体の command の成功（exit 0 / green）である TC は unit / integration ではなく gate に分類する」。gate TC には GWT のテスト手順を書かず、充足を検証する verification phase 名を本文に記録する。
2. **test-materialize prompt**（`src/prompts/test-materialize-system.ts`）の `## Method` 節に gate TC の実体化スキップを明記する（manual と同型）。`## Contract` 節にプロジェクト全体の検証 command の再実行をテスト本体として書くことの禁止を明記する。
3. **`extractMustTcIds`**（`src/core/verification/test-coverage.ts`）に `categoryGateRe = /\*\*Category\*\*:\s*gate/` と `currentIsGate` フラグを追加する。`flushCurrent` は `currentTcId && currentIsMust && !currentIsManual && !currentIsGate` のときのみ `mustTcIds` に push する。判定点はこの 1 箇所のままとする。

gate TC は `totalMustTcs` に数えられず、`foundTcIds` / `missingTcIds` / `assertionlessTcIds` のいずれにも現れない。gate TC の充足は verification phase の管轄であり、coverage gate はその判定を担わない。

gate TC が担う phase 名は TC 本文の散文注記として記録し（例: 「検証 phase: `typecheck`, `test`」）、pipeline 処理は machine-parse しない。

## Design Decisions

### D1: `extractMustTcIds` の section-scan に gate 除外を manual と並列で追加する

`categoryManualRe` / `currentIsManual` と同型の `categoryGateRe` / `currentIsGate` を追加し、`flushCurrent` 条件を `!currentIsManual && !currentIsGate` に拡張する。manual の判定パスは一切変更しない。

**採用理由**: must 集合の定義は抽出関数に属し、ここ 1 箇所で除外すれば verification gate と test-materialize output gate（`evaluateTestCoverage`）の双方が整合する（ADR 2026-07-25 の「単一判定点」構造の第 2 適用）。manual と並列の boolean にすることで manual の既存判定ロジックを byte 単位で不変に保てる。

**却下した代替案**:
- `manual` / `gate` を除外集合に一般化する — 抽象度は上がるが manual の既存判定パスを書き換えることになり、既存テスト無改変の証明が難しい。将来 3 値目の除外が必要になった時点で一般化を検討する。
- `evaluateTestCoverage` 側で抽出後にフィルタする — ADR 2026-07-25 が却下済み（第二の判定点・ロジック重複）。

### D2: gate TC の phase 記録は本文の散文注記とし、機械 parse 対象の新フィールドは追加しない

要件が明示する phase 名の記録は TC 本文の散文に留め、`**Phase**: typecheck` のような構造化フィールドは追加しない。

**採用理由**: 充足判定は分類値（Category: gate）1 つで完結しており、phase 名は traceability 注記に過ぎない。これを機械 parse する第二フィールドにすると ADR 2026-07-25 が却下した `Covered-by` と同型の「充足主張の第二正本」を生む。「各事実は一箇所に住む」原則に従い、充足判定は分類値に、phase 名は散文注記に留める。

**却下した代替案**:
- `**Phase**: typecheck` の構造化フィールド追加 — 機械 parse 可能に見え、将来 coverage 判定に誤って配線される（第二判定点化）リスクがある。却下。

### D3: test-case-gen prompt の分類規則を 5 節骨格の内側に追記する

既存の Category 列挙を `unit | integration | manual | gate` に更新し、gate の定義・分類規則・GWT 省略規則を各カテゴリ定義行と同体裁で追記する。新規 h2 を追加しない。

**採用理由**: 分類は発生源（test-case-gen）で決まる。ここで gate に正しく振り分けられれば下流の test-materialize / coverage gate は分類値を尊重するだけでよい。

### D4: test-materialize の gate スキップを Method に、ツールチェーン再実行禁止を Contract に置く

「gate TC を実体化しない」は Method レベルの手順、「ツールチェーン再実行をテスト本体に書かない」は write-set レベルの禁止規則として区分する。対象挙動の検証として必要な subprocess 実行（CLI 自身の起動等）は禁止しない。

**採用理由**: 要件が「contract に明記」と指定し、禁止の性質も書き場所の別を裏付けている。subprocess の全面禁止は CLI 自身の起動テスト等を巻き込むため、禁止対象を「プロジェクト全体の検証 command の再実行」に限定する。

**却下した代替案**:
- 生成テスト側の環境 guard（ツールチェーンが無ければ skip）— skip して green になるテストは fail-open であり「歯があるフリ」になる。分類で発生源を断つ方針に反するため却下。
- 両記述を Method にまとめる — 要件が Contract への配置を明示指定しているため分離。

## Alternatives Considered

### Alternative 1: gate 型 AC の起票禁止

gate 型 AC を request 雛形・起票規律から削除し、生成されなくする案。

- **Pros**: 下流の分類問題が根本的に消える
- **Cons**: gate 型 AC 自体は正当な受け入れ基準（機械検証可能で conformance が照合できる）。起票側の正当性を下流の分類欠落で禁じるのは責務の逆転である
- **Why not**: 問題は下流に分類の受け皿が無いことにあり、起票規律を変えるのは根本解でない

### Alternative 2: 生成テスト側の環境 guard（ツールチェーンが無ければ skip）

生成された cargo build 等のテストに環境 guard を付け、ツールチェーンが無い場合は skip させる案。

- **Pros**: 既存の分類体系を変えずに CI 破壊を回避できる
- **Cons**: skip して green になるテストは fail-open であり「歯があるフリ」になる。根本原因（gate 型 AC の分類欠落）は残り、別の形で同じ問題が再発する
- **Why not**: 分類で発生源を断つ方針に反する。応急処置を構造的に固定することになる

### Alternative 3: `Covered-by` フィールドによる coverage 除外

gate TC に `**Covered-by**: <phase>` のような構造化フィールドを追加し、そのフィールドの有無で coverage gate が除外判定を行う案。ADR 2026-07-25 が `manual` 除外の設計時に検討・却下した案の gate 向け再適用。

- **Pros**: gate TC が担う verification phase を test-cases.md に明示できる。充足の根拠が spec と同じ場所に記録され、traceability が構造化される
- **Cons**: test-cases.md の `Covered-by` とソースコード上の verification phase 定義の二箇所が「gate TC の充足主張」という同じ事実を保持する第二正本になる。test-cases.md を更新したが phase 名が実態とずれる等のドリフトが発生する。coverage gate 側に `Covered-by` フィールドを参照・検証する追加機構が必要で、判定点が `extractMustTcIds` 以外に生まれる
- **Why not**: 「各事実は一箇所に住む」原則に反する。ADR 2026-07-25 が確定した「単一判定点（`extractMustTcIds`）」を破る第二判定点を生む。Category 値 1 つの機械判定で同じ除外が実現できる以上、複雑化は不要

### Alternative 4: coverage 除外の agent 判定化

`extractMustTcIds` の判定を LLM に委ね、「この TC は verification phase で充足されるか」を agent が意味的に判断して除外する案。ADR 2026-07-25 が検討・却下した案の gate 向け再適用。

- **Pros**: Category 値の機械的リテラル判定より柔軟で、分類が曖昧な TC でも正しく除外できる可能性がある
- **Cons**: agent の自己申告は observable な事実で二重検証できない（`feedback_verify_dont_trust`）。pipeline の終了条件が agent の判断に依存し不安定になる。coverage gate の価値は「コードが機械的に検証可能な形で存在するか」にあり、agent 判断に委ねるとその意味論が崩れる
- **Why not**: 判断の入る余地を消し、分類値 1 つで機械判定する設計原則に反する。ADR 2026-07-25 の決定を踏襲する

### Alternative 5: conformance への verification 連関の同時導入

gate AC の充足を conformance が verification-result.md と機械照合する連関を本変更と同時に導入する案。

- **Pros**: gate AC の充足判定が end-to-end で機械化される
- **Cons**: 1 つのレビュー収束ループに収まらない。分類の確立が先であり、連関は必要になった時に別 request で積む
- **Why not**: スコープが大きすぎ、本 request の受け入れ基準に対して過剰。分類の確立を土台とし連関は後続 request で行う

## Consequences

- `extractMustTcIds` の返す集合の定義が変わる：「Category が manual でも gate でもない must TC の ID 集合」になる。消費者（verification gate / output gate）はこの変更を自動的に受け取る。
- test-case-gen が gate 型 AC から gate TC を正しく生成すれば、test-materialize はテストファイルを作成せず、coverage gate はその TC を要求しない。CI 破壊の発生源が構造的に封じられる。
- gate TC が test file に TC-ID コメントなしで存在しても coverage は failed にならない。gate TC の充足は verification phase の管轄のまま変わらない。
- `Category` 列挙が 4 値になったことで、将来の第 3 除外カテゴリが必要になった場合の一般化（除外カテゴリの集合化）を再検討できる。現時点では manual の既存テスト無改変を優先し並列 boolean 設計を採用した。
- enum 行 `**Category**: unit | integration | manual | gate` はコロン直後が `unit` のため `categoryGateRe` / `categoryManualRe` のいずれにもマッチしない（TC section 外での誤除外なし）。この境界条件は回帰テストで固定済み。

## References

- Request: `specrunner/changes/gate-ac-classification/request.md`
- Design: `specrunner/changes/gate-ac-classification/design.md`
- Spec: `specrunner/changes/gate-ac-classification/spec.md`
- Related ADR: `specrunner/adr/2026-07-25-test-coverage-manual-tc-exclusion.md`（manual 除外パターンの確立・本 ADR の第 1 適用）
- Related ADR: `specrunner/adr/2026-05-19-verification-tc-coverage.md`（test-coverage gate の確立）
- Related ADR: `specrunner/adr/2026-06-02-test-coverage-assertion-faithfulness-gate.md`（faithfulness gate）
- Related ADR: `specrunner/adr/2026-06-03-conformance-review-acceptance-gate.md`（manual TC の検証管轄）
