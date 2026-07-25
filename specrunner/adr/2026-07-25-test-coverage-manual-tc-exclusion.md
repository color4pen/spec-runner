# ADR: Category: manual の must TC を coverage 集計から除外する

- **Date**: 2026-07-25
- **Status**: Accepted
- **Slug**: test-materialize-existing-coverage

## Context

`2026-05-19-verification-tc-coverage` で確立した test-coverage gate は、must TC-ID が test ファイルにリテラルとして出現するかを機械的に検査する。`extractMustTcIds` は `**Priority**: must` のみで must を判定し、`**Category**` は参照しない。

この設計は `**Category**: manual` の must TC に対して充足不能要求を生じさせる。manual TC は定義上自動テストを書けないため、agent は:

- 検証実体のないトレーサビリティコメントをテストファイルに置いて検査を通す（gate を騙る作法の常態化）
- 充足不能として停止する

の二択に追い込まれる。specrunner 0.4.x の実運用で「過去 job が通っていたのは agent が偶然コメントに ID を書いていたため」であることが確認された（issue #921 の調査）。

## Decision

`extractMustTcIds`（`src/core/verification/test-coverage.ts`）に `**Category**: manual` の検出を追加し、Priority が must であっても Category が manual の TC は must coverage 集計から除外する。

1. `categoryManualRe = /\*\*Category\*\*:\s*manual/` を追加し、`currentIsManual` フラグを per-section で管理する。
2. `flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ `mustTcIds` に push する。
3. 除外された TC は `totalMustTcs` / `foundTcIds` / `missingTcIds` / `assertionlessTcIds` のいずれにも現れない。
4. `extractMustTcIds` が「must 集合の唯一の決定点」であるため、この変更 1 箇所で verification gate と test-materialize output gate（`evaluateTestCoverage`）の双方が整合する。

これにより「coverage gate が要求するものはすべて自動テストで充足可能」という契約が成立する。manual TC の検証は conformance / レビュー gate の管轄のままとする。

あわせて test-materialize の system prompt（`## Method` 節）に、manual TC が自動テスト化・トレーサビリティコメント追記のいずれの対象でもないことを明記し、検証実体を伴わないコメント偽装を prompt レベルで防ぐ。

## Design Decisions

### D1: Category: manual の除外を extractMustTcIds の section-scan に組み込む

既存の `currentIsMust` / `priorityMustRe` と同型の `currentIsManual` / `categoryManualRe` を追加する。`flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ `mustTcIds` に push する。

**採用理由**: must 集合の定義は抽出関数に属する。ここ 1 箇所で除外すれば verification gate と test-materialize output gate（`evaluateTestCoverage`）の双方が自動的に整合する。走査は機械的リテラル判定のまま意味的判定を導入しない。

**却下した実装代替案**:
- `evaluateTestCoverage` 側で抽出後にフィルタする — `extractMustTcIds` が返す集合が「must 集合」という語義とずれる。除外責務を抽出の外に置くのは概念的に不自然
- 各消費者（`runTestCoveragePhase` / `local.ts`）で個別にフィルタする — ロジック重複とドリフトを生む

**境界注意**: test-cases.md テンプレートの `**Category**: unit | integration | manual` という enum 行はコロン直後が `unit` のため `categoryManualRe` にマッチしない。TC section 外の `**Category**: manual` 行（HTML コメント等）は `currentTcId == null` のため無視される。

## Alternatives Considered

### Alternative 1: manual TC にもトレーサビリティコメントを義務付ける

coverage gate は通過させたうえで、manual TC についても `// TC-0XX: <TC 名>` のトレーサビリティコメントをテストファイルに記載することを義務付ける案。

- **Pros**: coverage gate の pass 基準を全 TC に統一でき、TC-ID の出現という単一の機械的ルールが維持される
- **Cons**: コメントの先に検証実体（テストコード・assertion）が存在しない。「コメント = 検証あり」という規約の意味を破壊し、偽装を正式作法に昇格させる。`2026-06-02-test-coverage-assertion-faithfulness-gate` が確立した「TC-ID が存在するファイルには少なくとも 1 つの assertion がある」という faithfulness gate と矛盾する（manual TC に対するコメント専用ファイルは assertion を持てない）
- **Why not**: coverage gate の信頼性の根拠が「テストコードの存在」から「コメントの存在」に変わる。gate を割ったフリの作法を構造的に誘発し、pipeline の機械的検証としての意味論が崩れる

### Alternative 2: test-cases.md への covered-by フィールド追加

各 TC に `**Covered-by**: <テストファイルパス>` のようなフィールドを追加し、coverage 検査をそのフィールドの存在と参照先ファイルの green で判定する案。

- **Pros**: 充足の主張が spec と同じ場所（test-cases.md）に明示される。テストファイルにコメントを追記する作業が不要
- **Cons**: 充足の主張がテストファイルから分離した第二の正本になり、ドリフト（test-cases.md は更新したが実ファイルが消えた等）が発生する。coverage 検査側に file 存在確認 + test green 確認の機構追加が必要で検査の複雑さが増す。TC-ID を走査するシンプルなリテラル検査から大きく外れる
- **Why not**: 「各事実は一箇所に住む」原則に反する第二正本を生む。検査機構の複雑化で依存極小の北極星から遠ざかる

### Alternative 3: coverage 検査の意味的判定化（agent が充足を判断）

manual TC の充足確認を agent（LLM）に委ね、「この TC はすでに手動テストで確認済みか」を agent が判断する案。

- **Pros**: 自動テストで表現できない検証も pipeline 内で扱えるように見える
- **Cons**: 機械検証を agent 判断に置き換えるのは検証可能性の方向に逆行する（`feedback_verify_dont_trust` 原則）。agent の自己申告は信頼できず、observable な事実での二重検証ができない。pipeline が agent の判断に依存するとループ終了条件が不安定になる
- **Why not**: coverage gate の価値は「agent が実装したと主張するかどうか」でなく「コードが機械的に検証可能な形で存在するか」にある。この基準を agent 判断に委ねることは gate の存在意義を破壊する

## Consequences

- `extractMustTcIds` の返す集合の定義が変わる：「Category が manual でない must TC の ID 集合」になる。消費者（verification gate / output gate）はこの変更を自動的に受け取る。
- manual TC が test file に TC-ID コメントなしで存在しても coverage は failed にならない。manual TC の検証は conformance / レビュー gate の管轄のまま変わらない。
- 将来 TC を manual で書いた場合、coverage gate はその TC を集計しない。この挙動は docs/test-coverage.md に明文化される。
- `2026-06-02-test-coverage-assertion-faithfulness-gate` が追加した `assertionlessTcIds` の対象も manual TC は除外される（`extractMustTcIds` が返す集合に入らないため）。

## References

- Request: `specrunner/changes/test-materialize-existing-coverage/request.md`
- Design: `specrunner/changes/test-materialize-existing-coverage/design.md`
- Related ADR: `specrunner/adr/2026-05-19-verification-tc-coverage.md`（test-coverage gate の確立）
- Related ADR: `specrunner/adr/2026-06-02-test-coverage-assertion-faithfulness-gate.md`（faithfulness gate の追加）
- Related ADR: `specrunner/adr/2026-06-03-conformance-review-acceptance-gate.md`（manual TC の検証管轄）
