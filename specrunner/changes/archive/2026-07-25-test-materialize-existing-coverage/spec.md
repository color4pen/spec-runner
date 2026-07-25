# Spec: manual カテゴリ must TC の coverage 集計除外

## Requirements

### Requirement: test-coverage は Category: manual の must TC を coverage 集計から除外する

test-coverage の must TC 抽出（`extractMustTcIds`）は、ある TC section が `**Priority**: must` を
宣言していても、同じ TC section が `**Category**: manual` を宣言している場合、その TC を must coverage
集計から除外 SHALL する。除外された TC は `totalMustTcs` に数えられ SHALL NOT、`foundTcIds` /
`missingTcIds` / `assertionlessTcIds` のいずれにも現れ MUST NOT。

判定は既存の Priority 走査と同型の機械的 section-scan（TC section 内の各行を走査し、
`**Category**: manual` リテラルの有無で判定する。bullet 有無の両形式を受理する）とし、意味的判定を
導入 SHALL NOT する。`**Category**` が `unit` または `integration` の must TC、および Category 欄を
持たない must TC の判定は従来と同一である MUST。走査方式・assertion 存在確認（assertionless 判定）・
TC-ID 境界一致は本変更で改変 SHALL NOT する。

#### Scenario: manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない

**Given** `**Priority**: must` かつ `**Category**: manual` を宣言する TC を含む test-cases.md がある
**And** その TC-ID がどのテストファイルにもリテラルとして出現しない
**When** test-coverage を評価する
**Then** 当該 TC は `missingTcIds` に含まれず、`totalMustTcs` にも数えられず、status は他の must TC の
充足状況のみで決まる

#### Scenario: unit / integration の must TC の判定は従来と同一

**Given** `**Priority**: must` かつ `**Category**: unit`（または `integration`、または Category 欄なし）の
must TC を含む test-cases.md がある
**And** その TC-ID がどのテストファイルにも出現しない
**When** test-coverage を評価する
**Then** 当該 TC は従来どおり must coverage 集計に含まれ、`missingTcIds` に入り status は failed になる

### Requirement: test-materialize prompt は manual TC を自動テスト化・トレーサビリティコメントの対象外とする

test-materialize の system prompt（`TEST_MATERIALIZE_SYSTEM_PROMPT`）は、`**Category**: manual` の
must TC が自動テストコード化およびトレーサビリティコメント追記のいずれの対象でもないことを MUST
記述する。prompt は、検証実体（テストコード）を伴わないトレーサビリティコメントを manual TC のために
作成 SHALL NOT すべきことを明示し、manual TC の検証が conformance / レビュー gate の管轄であることを
示す。当該記述は既存の 5 節骨格（Question / Contract / Method / Evidence / Completion）の `## Method`
節の内側に置かれ、新規の h2 見出しを追加 SHALL NOT する。記述は汎用語で書かれ、リポジトリ固有の
テスト配置パスを参照 SHALL NOT する。

#### Scenario: prompt が manual TC 対象外の記述を含む

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Method` 節を検査する
**Then** manual カテゴリの TC が自動テスト化・トレーサビリティコメントの対象外である旨（コメントを
作成しない旨を含む）が含まれ、Question / Contract / Method / Evidence / Completion の 5 節と順序が
維持されている

### Requirement: docs は manual TC の coverage 集計除外を明文化する

`docs/test-coverage.md` は、`**Category**: manual` の must TC が test-coverage の must 集計から除外される
こと、およびその検証が conformance / レビュー gate の管轄であることを MUST 記述する。既存の
「TC-ID リテラル走査」および「トレーサビリティコメントによる既存カバレッジ表明」の記述は維持される
MUST。

#### Scenario: docs が manual 除外規約を含む

**Given** `docs/test-coverage.md`
**When** その内容を読む
**Then** manual カテゴリの must TC が coverage 集計から除外される旨と、その検証が conformance /
レビュー gate の管轄である旨が記述されており、既存の走査規約・トレーサビリティ規約の記述も残っている
