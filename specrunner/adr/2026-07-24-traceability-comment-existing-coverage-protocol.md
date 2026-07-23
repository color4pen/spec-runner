# トレーサビリティコメントによる既存テストカバレッジ表明プロトコル

**Date**: 2026-07-24
**Status**: accepted

## Context

test-coverage gate は must TC の充足を test file 群の TC-ID リテラル走査で機械的に検証する
（`2026-05-19-verification-tc-coverage.md` で確立）。走査は出現形式（コメント / 文字列 /
identifier）を区別せず、found TC ごとに同一ファイル内に assertion（`expect(` / `assert(` /
`assert.`）が存在するかを per-file で確認する。

ある must TC が、変更より前からリポジトリに存在するテストで既に検証されている場合、その TC-ID は
どのテストコードにもリテラルとして現れないため、coverage 走査は当該 TC を missing 扱いで fail させる。
test-materialize agent はこの状況で正規の充足手段を持たず、新規テストを重複作成するか、充足不能として
停止するかの二択になっていた（実測: issue #921）。

実運用では operator が「既存テストファイルに `// TC-0XX: <TC 名>` を 1 行追記する」ことで coverage
を通しており、これが機能する回避策として確立されていた。本変更はこの回避策を正式なプロトコルへ昇格し、
test-materialize が自律的に実行できるようにすることで、設計上の空白を埋める。

coverage 検査ロジック（`src/core/verification/test-coverage.ts`）は形式非依存のリテラル走査であり、
コメント形式の TC-ID + 同一ファイルの assertion の組み合わせは既に passed として扱われる。
新規機構の追加は不要であり、欠けていたのはプロトコルの明文化と agent への伝達だった。

## Decisions

### D1: トレーサビリティコメントを既存カバレッジ表明の正式プロトコルとする

must TC が既存テストで既に検証されている場合、その既存テストの該当箇所（describe / it の近傍）に
`// TC-0XX: <TC 名>` トレーサビリティコメントを 1 行追記することを充足の正式手段とする。
新規テストの重複作成も充足不能としての停止もしない。

**根拠**: 「このテストがこの TC を検証する」という主張がテストファイル自体に残り、将来の読者に
可視化される。coverage 検査は機械的リテラル走査のまま単純に保たれ、新規機構を増やさない。
実運用で機能した回避策の正式化であり、検証方式の一貫性（機械リテラル走査）を保つ。

### D2: test-materialize system prompt に既存テスト充足時の手順を明記する

test-materialize の system prompt（`TEST_MATERIALIZE_BASE` の `## Method` 節）に、既存テスト充足時の
分岐手順を追加する。手順は汎用語で記述し、リポジトリ固有のテスト配置パスを名指しさせない。
prompt の 5 節骨格（Question / Contract / Method / Evidence / Completion）を維持し、新規 h2 見出しを
追加しない。

**根拠**: agent が正規手順を知らなければ実行できない。`## Method` 節への追記は骨格 drift-guard
（`prompt-skeleton-drift-guard.test.ts`）が固定する 5 節構成・節順序に違反しない最小変更点。
CLI 組み込み prompt にリポジトリ固有資源を名指しさせないグローバル規律（no-project-local-refs）と
整合する。

### D3: test-coverage.ts は無変更。コメント形式の充足を回帰テストで固定する

coverage 検査ロジック（`src/core/verification/test-coverage.ts`）は変更しない。「コメント形式のみで
TC-ID が出現し、かつ同一ファイルに assertion がある fixture で passed になる」現行挙動を
新規回帰テストで固定する。

assertion の存在確認は per-file であり、TC-ID コメントのみで assertion を持たないファイルは
assertionless 判定で failed になる（既存 TC-TMB-11 が固定済み）。この境界はトレーサビリティコメントの
実シナリオ（assertion を持つ既存テストにコメントを追記する）と一致する。

**根拠**: 要件は「検査ロジックを変えない」であり、現行実装が既に正しく動作する。回帰テストにより
将来の test-coverage リファクタリングが本プロトコルの前提を壊さないことを保証する。

### D4: test-cases.md の扱いは既存テスト充足でも新規 materialize と同一に保つ

test-cases.md は test-case-gen が生成し、test-materialize では変更禁止のまま。既存テスト充足かどうかで
test-cases.md のフィールドや形式を変えない（`covered-by` 等の新フィールドを追加しない）。

充足手段の差異はテストコード側（トレーサビリティコメント）に閉じ込め、正典（test-cases.md）を単純に保つ。

### D5: 規約 doc を新規 focused doc（docs/test-coverage.md）に明文化する

規約は新規 doc `docs/test-coverage.md` に記述し、`docs/README.md` のファイル一覧に追加する。
内容は (a) test-coverage が must TC を TC-ID リテラル走査で検証すること、(b) 既存テストが充足している
場合はトレーサビリティコメントがその表明手段であること、の 2 点。

**根拠**: 当該事実は現状どの doc にも記載がなかった（docs 原則「各事実は一箇所に住む」）。
新規 focused doc は事実を隔離でき、docs/README のファイル一覧更新は doc 追加の正規手続きである。

## Alternatives Considered

### Alternative 1: test-cases.md に covered-by フィールドを追加する

test-cases.md に `covered-by: <existing-test-file>` 等のフィールドを追加し、coverage 検査が
このフィールドを参照してファイル存在 + assertion を確認する案。

- **Pros**: 充足の根拠（既存テストファイルのパス）が正典に記録される。
- **Cons**: 充足の主張がテストファイルから分離した第二の正本になる。coverage 検査側に
  file 存在 + assertion 確認の機構追加が必要になり、検査が複雑化する。正典とテストファイルの
  ドリフト（covered-by が指すファイルが移動・削除されても正典が古い参照を保持し続ける）リスクがある。
- **Why not**: 主張はそれが関係するコード（テストファイル）に置くべきであり、
  分離した第二の正本は整合コストを生む。coverage 検査の機械的単純さを保つという要件に反する。

### Alternative 2: coverage 検査に意味的判定を追加する（agent が充足を判断する）

agent が「このテストがこの TC を実質的に検証しているか」を読解・判断し、coverage を充足とする案。

- **Pros**: トレーサビリティコメントの追記が不要。
- **Cons**: 機械検証を agent 判断に置き換えるのは検証可能性の方向に逆行する。
  agent の自己申告は信頼できず（`feedback_verify_dont_trust`）、
  「TC を充足したか」の判断を pipeline に委ねると機械的な保証が失われる。
- **Why not**: TC coverage gate の存在意義は機械的・客観的な検証にある。
  agent 判断への置き換えは TC 機構全体の根拠を掘り崩す。

## Consequences

### Positive

- test-materialize が既存テスト充足時に正規手順で自律的に動作できるようになり、
  operator の手動介入（コメント追記）が不要になる。
- 「このテストがこの TC を検証する」という主張がテストファイル自体に残り、
  コードベースの任意の読者に可視化される。
- coverage 検査は機械的リテラル走査のまま単純に保たれ、新規機構を増やさない。
- 規約 doc により、operators・contributors がトレーサビリティコメントの意味と必要条件を
  独立して参照できる。

### Negative

- トレーサビリティコメントの意味的妥当性（コメントを付けた既存テストが実際に TC を検証しているか）は
  機械的には保証されず、conformance / レビュー gate の管轄となる。
  coverage gate は「コメントが存在するか」を確認するのみで、コメントの正しさは検証しない。

### Known Debt / Deferred

- 既存テストが「本当に当該 TC を検証しているか」の意味的保証: 現状 conformance / レビュー gate に
  委ねている。将来の意味的 coverage 検証（静的解析等）が必要になった場合は別 request で対応する。

## References

- Request: `specrunner/changes/test-materialize-existing-coverage/request.md`
- Design: `specrunner/changes/test-materialize-existing-coverage/design.md`
- Spec: `specrunner/changes/test-materialize-existing-coverage/spec.md`
- Predecessor ADR: `specrunner/adr/2026-05-19-verification-tc-coverage.md`
  （TC coverage 機械走査ゲートの確立。本 ADR はその補完として「既存テストが充足する場合の表明プロトコル」を定める）
- Predecessor ADR: `specrunner/adr/2026-06-02-test-coverage-assertion-faithfulness-gate.md`
  （assertion faithfulness gate の確立。本 ADR の D3 の前提）
- Implementation: `src/prompts/test-materialize-system.ts`（既存テスト充足手順の追記）/
  `docs/test-coverage.md`（新規規約 doc）/ `docs/README.md`（ファイル一覧更新）/
  `tests/unit/core/verification/test-coverage-comment-form.test.ts`（回帰テスト）/
  `tests/unit/prompts/test-materialize-prompt-contract.test.ts`（prompt 契約テスト）/
  `tests/unit/docs/test-coverage-docs-contract.test.ts`（docs 契約テスト）
