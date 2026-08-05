# Spec: TC 分類への gate カテゴリ導入

## Requirements

### Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する

test-coverage の must TC 抽出（`extractMustTcIds`）は、ある TC section が `**Priority**: must` を
宣言していても、同じ TC section が `**Category**: gate` を宣言している場合、その TC を must coverage
集計から除外 SHALL する。除外された TC は `totalMustTcs` に数えられ SHALL NOT、`foundTcIds` /
`missingTcIds` / `assertionlessTcIds` のいずれにも現れ MUST NOT。

判定は既存の Category: manual 除外と同型の機械的 section-scan（TC section 内の各行を走査し、
`**Category**: gate` リテラルの有無で判定する。bullet 有無の両形式を受理する）とし、意味的判定を
導入 SHALL NOT する。除外の判定点は `extractMustTcIds` の 1 箇所のままとし、他所に第二の判定点を
追加 SHALL NOT する。

`**Category**` が `manual` の must TC の除外挙動は本変更で改変 SHALL NOT する。`**Category**` が
`unit` または `integration` の must TC、および Category 欄を持たない must TC の判定も従来と同一である
MUST。走査方式・assertion 存在確認（assertionless 判定）・TC-ID 境界一致は本変更で改変 SHALL NOT する。

#### Scenario: gate かつ must の TC はテストファイルに ID 出現がなくても missing にならない

**Given** `**Priority**: must` かつ `**Category**: gate` を宣言する TC を含む test-cases.md がある
**And** その TC-ID がどのテストファイルにもリテラルとして出現しない
**When** test-coverage を評価する
**Then** 当該 TC は `missingTcIds` に含まれず、`totalMustTcs` にも数えられず、status は他の must TC の
充足状況のみで決まる

#### Scenario: gate must TC が foundTcIds / assertionlessTcIds にも現れない

**Given** `**Priority**: must` かつ `**Category**: gate` を宣言する TC があり、その TC-ID が
テストファイルにリテラルとして出現する
**When** test-coverage を評価する
**Then** 当該 TC は `foundTcIds` にも `assertionlessTcIds` にも含まれず、`totalMustTcs` にも数えられない

#### Scenario: unit / integration / manual / Category 欄なしの must TC の判定は従来と同一

**Given** `**Priority**: must` かつ `**Category**: unit`（または `integration`、`manual`、Category 欄なし）の
must TC を含む test-cases.md がある
**When** test-coverage を評価する
**Then** unit / integration / Category 欄なしの must TC は従来どおり must coverage 集計に含まれ、
未出現なら `missingTcIds` に入り status は failed になる。manual の must TC は従来どおり集計から除外され、
その判定は本変更で一切変化しない

#### Scenario: gate を含むテンプレート enum 行で誤除外が起きない

**Given** test-cases.md の TC section より前に `**Category**: unit | integration | manual | gate` という
テンプレート enum 行が存在し、TC section 内には `**Category**: unit` かつ `**Priority**: must` の TC がある
**When** `extractMustTcIds` を実行する
**Then** unit の must TC は除外されず返り値のリストに含まれる（enum 行はコロン直後が `unit` なので
gate 正規表現にも manual 正規表現にもマッチしない）

### Requirement: test-case-gen prompt は gate 分類規則を定義する

test-case-gen の system prompt（`TEST_CASE_GEN_SYSTEM_PROMPT`）は、Category の列挙に `gate` を含め、
gate の定義（充足基準がプロジェクト全体の検証 command の結果 — build / typecheck / lint / テストスイート
全体の green、CI green 等 — である TC）を MUST 記述する。prompt は、THEN がプロジェクト全体の command の
成功（exit 0 / green）である TC を unit / integration ではなく gate に分類する規則を MUST 含み、gate TC には
GWT のテスト手順を書かず、充足を検証する verification phase 名（または `verification.commands` の command
名）を本文に記録する旨を示す。当該記述は既存の 5 節骨格（Question / Contract / Method / Evidence /
Completion）の内側に置かれ、新規の h2 見出しを追加 SHALL NOT する。

#### Scenario: prompt に gate 定義と分類規則が含まれる

**Given** `TEST_CASE_GEN_SYSTEM_PROMPT` を文字列として取得する
**When** その内容を検査する
**Then** Category の列挙に `gate` が含まれ、gate の定義（プロジェクト全体の検証 command の結果が充足基準）と
分類規則（THEN がプロジェクト全体の command の成功である TC は gate に分類する）と、gate TC には GWT を
書かず検証 phase を指す旨が含まれる

### Requirement: test-materialize prompt は gate TC を実体化しない

test-materialize の system prompt（`TEST_MATERIALIZE_SYSTEM_PROMPT`）は、`**Category**: gate` の must TC が
自動テストコード化およびトレーサビリティコメント追記のいずれの対象でもないことを MUST 記述する。prompt は、
検証実体（テストコード）を伴わないトレーサビリティコメントを gate TC のために作成 SHALL NOT すべきこと
（coverage 偽装 pass の禁止）を明示し、gate TC の充足が verification phase の管轄であることを示す。当該記述は
既存の 5 節骨格の `## Method` 節の内側に置かれ、新規の h2 見出しを追加 SHALL NOT する。

#### Scenario: prompt に gate 実体化スキップの記述が含まれる

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Method` 節を検査する
**Then** gate カテゴリの TC が自動テスト化・トレーサビリティコメントの対象外である旨（コメントを作成しない旨
および coverage 偽装 pass の禁止を含む）と、その充足が verification phase の管轄である旨が含まれ、
Question / Contract / Method / Evidence / Completion の 5 節と順序が維持されている

### Requirement: test-materialize prompt はツールチェーン再実行をテスト本体として書くことを禁止する

test-materialize の system prompt の `## Contract` 節は、プロジェクト全体の検証 command（build / typecheck /
lint / テストスイート起動）の再実行をテスト本体として書くことを MUST 禁止し、それらは gate TC として分類され
verification phase が担う旨を示す。対象挙動の検証として必要な subprocess 実行（CLI 自身の起動等）は禁止 SHALL
NOT する。当該記述は既存の 5 節骨格の内側に置かれ、新規の h2 見出しを追加 SHALL NOT する。

#### Scenario: prompt にツールチェーン再実行禁止の記述が含まれる

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Contract` 節を検査する
**Then** プロジェクト全体の検証 command の再実行をテスト本体として書かない旨と、それが gate TC として
verification phase の管轄になる旨が含まれ、対象挙動の検証に必要な subprocess 実行を一律には禁止しない旨が
読み取れる

### Requirement: template / docs は gate 分類を明文化する

`src/templates/step-output-templates.ts` の `TEST_CASES_TEMPLATE` の Category 必須フィールド行は、`gate` を
含む列挙（`unit | integration | manual | gate`）である MUST。`docs/test-coverage.md` は、`**Category**: gate` の
must TC が test-coverage の must 集計から除外されること、およびその充足が verification phase の管轄である
ことを MUST 記述する。既存の「TC-ID リテラル走査」「トレーサビリティコメントによる既存カバレッジ表明」
「Category: manual の集計除外」の記述は維持される MUST。

#### Scenario: TEST_CASES_TEMPLATE の Category 行が gate を含む

**Given** `TEST_CASES_TEMPLATE` を文字列として取得する
**When** その内容を検査する
**Then** Category 必須フィールドの列挙に `gate` が含まれ、`unit | integration | manual` の既存列挙も部分文字列
として保持されている

#### Scenario: docs が gate 除外規約を含む

**Given** `docs/test-coverage.md`
**When** その内容を読む
**Then** `**Category**: gate` の must TC が coverage 集計から除外される旨と、その充足が verification phase の
管轄である旨が記述されており、既存の走査規約・トレーサビリティ規約・manual 除外規約の記述も残っている
