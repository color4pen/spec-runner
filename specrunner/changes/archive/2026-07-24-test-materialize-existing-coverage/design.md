# Design: 既存テストによる must TC 充足をトレーサビリティコメントで正規化する

## Context

test-coverage gate は must TC が test file 群にリテラルとして出現するかを機械走査する
（`src/core/verification/test-coverage.ts`）。走査は出現形式（コメント / 文字列 / identifier）を
区別せず、加えて found TC ごとに「その TC-ID を含むいずれかのファイルに assertion
（`expect(` / `assert(` / `assert.`）が存在するか」を per-file で確認する。

ある must TC が、この変更より前からリポジトリに存在するテストで既に検証されている場合、
その TC-ID はどのテストコードにもリテラルとして現れないため、coverage 走査は当該 TC を
missing 扱いで fail させる。test-materialize agent はこの状況で正規の充足手段を持たず、
新規テストを重複作成するか、充足不能として停止するかの二択になる（実測: issue #921）。

実運用では operator が「既存テストファイルに `// TC-0XX: <説明>` を 1 行追記する」ことで
coverage を通しており、これが機能する回避策として確立している。本変更はこの回避策を
正式な規約へ昇格し、test-materialize が自律的に実行できるようにする。

**現状コードの確認済み事実**:

- `src/core/verification/test-coverage.ts` — TC-ID リテラル走査（出現形式を区別しない）+
  found TC の per-file assertion 存在確認。コメント形式の TC-ID でも、同一ファイルに assertion が
  あれば passed になる（＝回避策が機能する機構的根拠）。
- `src/core/step/test-materialize.ts:47-50` — `outputContracts()` が must TC ごとに test file entry を
  要求する test-coverage 契約を宣言。
- `src/prompts/test-materialize-system.ts` — 既存テスト参照は配置パターン確認の文脈のみ（Method step 3 / 初期メッセージ）。
  既存テスト充足時の指示は存在しない。
- `src/core/step/write-scope.ts:33` — test-materialize は `GUARDED_WRITE_STEPS` に含まれ、
  test code file（write-set 内）の編集は write-scope 上許可されている。
- `docs/` — test-coverage の走査規約・トレーサビリティ規約はどの doc にも記載がない。

## Goals / Non-Goals

**Goals**:

- test-materialize の system prompt に、既存テストが must TC を充足している場合の正規手順を明記する:
  該当既存テストの近傍に `// TC-0XX: <TC 名>` トレーサビリティコメントを 1 行追記することが
  充足の正式手段であり、新規テストの重複作成も充足不能としての停止もしない。
- 既存テスト充足の場合も test-cases.md 側の扱いは新規 materialize と同一に保つ（新フィールド追加なし）。
- 規約（test-coverage は TC-ID リテラルを走査する / トレーサビリティコメントが既存カバレッジの表明手段）を
  docs に明文化する。
- コメント形式のみで TC-ID が出現する既存 test file（assertion を含む）で coverage が passed になる
  現行挙動を、回帰テストで固定する。

**Non-Goals**:

- test-coverage の検査ロジック変更（機械的リテラル走査 + per-file assertion 判定を維持）。
  `src/core/verification/test-coverage.ts` は無変更。
- test-cases.md への `covered-by` 等の新フィールド追加（却下した代替案）。
- 既存テストが「本当に当該 TC を検証しているか」の意味的検証（コメント追記の妥当性は
  conformance / レビュー gate の管轄）。
- write-scope の変更（test-materialize は既に GUARDED で test file 編集が可能）。

## Decisions

### D1: トレーサビリティコメントを正規手順として prompt に明記する

test-materialize の system prompt（`TEST_MATERIALIZE_BASE` の `## Method` 節）に、既存テスト充足時の
分岐手順を追加する。手順は「must TC ごとに、変更前から存在するテストで当該振る舞いが既に検証されて
いるかを確認し、既に充足されている場合は新規テストを作らず、その既存テストの該当箇所
（describe / it の近傍）に `// TC-0XX: <TC 名>` トレーサビリティコメントを 1 行追記する。
充足不能として停止しない」とする。

**Rationale**: 「このテストがこの TC を検証する」という主張がテストファイル自体に残り、将来の読者に
可視化される。coverage 検査は機械的リテラル走査のまま単純に保たれ、新規機構を増やさない。実運用で
機能した回避策の正式化である。

**Alternatives considered**:

- **test-cases.md への `covered-by` フィールド追加**（却下）: 充足の主張がテストファイルから分離した
  第二の正本になり、coverage 検査側に file 存在 + green 確認の機構追加が必要になる。ドリフト面と
  検査の複雑さが増す。
- **coverage 検査の意味的判定化**（却下）: 機械検証を agent 判断に置き換えるのは検証可能性の方向に
  逆行する。

### D2: test-coverage.ts は無変更。回帰テストで現行挙動を固定する

コメント形式のみで出現する TC-ID の充足は、現行の test-coverage 実装で既に成立する
（リテラル走査は形式非依存、assertion 判定は per-file）。したがって検査ロジックは変更せず、
「コメント形式のみで TC-ID が出現し、かつ同一ファイルに assertion がある fixture で passed になる」
ことを固定する characterization（回帰）テストを新規追加する。

**Rationale**: 要件は「検査ロジックを変えない」であり、既存挙動が要件を既に満たす。テストを足すことで
将来の test-coverage リファクタリングが回避策の前提を壊さないことを保証する。

**重要な前提**: fixture のファイルは、TC-ID コメントに加えて実在の assertion（`expect(` 等）を
含まなければならない。assertion の存在確認は per-file であり、コメントのみで assertion 皆無の
ファイルは assertionless で failed になる（既存テスト `TC-TMB-11` / faithfulness gate が既に固定済み）。
これは実シナリオ（assertion を持つ既存テストにコメントを追記する）と一致する。

**Alternatives considered**:

- **test-coverage にコメント形式専用の分岐を追加**（却下）: 現行実装が既に正しく扱うため不要。
  分岐追加は複雑さを増やし、要件「検査ロジック不変」に反する。

### D3: prompt 追記は `## Method` 節内に置き、骨格と no-project-local-refs を保つ

追記は新しい `##`（h2）見出しを作らず、`## Method` 節内の手順として挿入する。また
`architecture/` 等のリポジトリ固有パスを参照せず、「既存テスト」という汎用語で記述する。

**Rationale**: prompt-skeleton drift-guard（`prompt-skeleton-drift-guard.test.ts` TC-001）が
Question/Contract/Method/Evidence/Completion の 5 節構成と順序を固定している。新規 h2 見出しや
`architecture/` 参照（TC-007 が禁止）は既存テストを壊す。CLI 組み込み prompt に repo 固有資源を
名指しさせない方針とも一致する。

### D4: 規約 doc は新規 focused doc に置く

規約は新規 doc `docs/test-coverage.md` に記述し、`docs/README.md` のファイル一覧に 1 行追加する。
内容は (a) test-coverage が must TC を TC-ID リテラル走査で検証すること、(b) 既に別テストが充足している
場合はトレーサビリティコメント（`// TC-0XX`）でその表明を行うこと、の 2 点。

**Rationale**: 当該事実は現状どの doc にも住んでいない（docs 原則「各事実は一箇所に住む」）。
最も意味的に近い `guarantees.md` は版号付きの保証集合であり、項目追加は版号 bump + 全 G1-N の
renumber を要求する。トレーサビリティコメントという狭いスコープの変更に対して保証集合全体を
renumber するのは churn が過大で、変更の可視スコープを歪める。focused doc は事実を隔離でき、
docs/README のファイル一覧更新は doc 追加の正規手続きである。

**Alternatives considered**:

- **`guarantees.md` に新保証として追記（版号 G1→G2）**（却下）: G1-1〜G1-6 の renumber を伴い、
  狭いスコープの変更に不釣り合いな churn を生む。トレーサビリティコメントは agent 行動規約であり、
  ハードな機械的保証とは性質が異なる。
- **`operations.md` / `request-authoring.md` に節追加**（却下）: 前者は無人運用、後者は request 記法で、
  test-coverage gate 機構の説明としては意味的適合が低い。

### D5: 既存テスト充足でも test-cases.md の扱いは新規 materialize と同一

test-cases.md は test-case-gen が生成し、test-materialize では変更禁止のまま。既存テスト充足かどうかで
test-cases.md のフィールドや形式は変えない（新フィールドを足さない）。

**Rationale**: 要件 2 の明示。充足手段の差異をテストコード側（トレーサビリティコメント）に閉じ込め、
正典（test-cases.md）を単純に保つ。

## Risks / Trade-offs

- [Risk] agent がトレーサビリティコメントを、実際には当該 TC を検証していない無関係なテストに付けて
  coverage を通す（意味と機械検証の乖離）
  → Mitigation: 意味的妥当性は conformance / レビュー gate の管轄（本変更のスコープ外として明示）。
  prompt は「当該 TC の振る舞いを既に検証している既存テスト」に限定して追記するよう指示する。

- [Risk] prompt 追記が skeleton drift-guard / no-project-local-refs テストを壊す
  → Mitigation: D3 に従い `## Method` 節内へ挿入、新規 h2 見出し禁止・`architecture/` 参照禁止を
  tasks.md の受け入れ基準に明記する。

- [Risk] coverage fixture テストを assertion 無しで書き、assertionless で failed になり誤って
  「回避策が壊れている」と読める
  → Mitigation: D2 のとおり fixture は assertion を含む前提を spec Scenario / tasks で明示する。

## Open Questions

なし。
