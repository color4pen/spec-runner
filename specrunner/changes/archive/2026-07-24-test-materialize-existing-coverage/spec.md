# Spec: 既存テストによる must TC 充足のトレーサビリティコメント規約

## Requirements

### Requirement: test-materialize prompt は既存テスト充足時のトレーサビリティコメント手順を規定する

test-materialize の system prompt（`TEST_MATERIALIZE_SYSTEM_PROMPT`）は、ある must TC が
変更前から存在するテストで既に検証されている場合の正規手順を MUST 記述する。手順は、その既存テストの
該当箇所（describe / it の近傍）に `// TC-0XX: <TC 名>` 形式のトレーサビリティコメントを 1 行追記する
ことを充足の正式手段とし、新規テストの重複作成も、充足不能としての停止も SHALL NOT 行わないことを
含む。手順は汎用語で記述され、リポジトリ固有のテスト配置パス（例: `architecture/`）を参照しない。

#### Scenario: prompt が既存テスト充足の正規手順を含む

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** その内容を検査する
**Then** 既存テストによる充足時にトレーサビリティコメントを追記する手順が含まれ、コメント形式
（`// TC-` リテラル）が示され、新規テストの重複作成と充足不能停止をしない旨が含まれる

#### Scenario: prompt がリポジトリ固有のテストパスを名指ししない

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** その内容を検査する
**Then** トレーサビリティコメント手順は `architecture/` などのリポジトリ固有パスを含まず、
「既存テスト」という汎用語で記述されている

#### Scenario: prompt の 5 節骨格が維持される

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** 節見出しを検査する
**Then** Question / Contract / Method / Evidence / Completion の 5 節がこの順序で存在し、
トレーサビリティコメント手順は `## Method` 節の内側に置かれている（新規の h2 見出しを追加しない）

### Requirement: test-coverage はコメント形式のみで出現する TC-ID を充足として扱う

test-coverage は must TC-ID を test file 群のリテラル出現で走査し、出現形式（コメント / 文字列 /
identifier）を区別 SHALL NOT する。ある must TC-ID が `// TC-0XX` コメント形式でのみ test file に出現し、
かつ同一ファイルに assertion（`expect(` / `assert(` / `assert.`）が存在する場合、その TC は covered
（status passed）として扱われる MUST。検査ロジックは本変更で改変されない。

#### Scenario: コメント形式のみの TC-ID + 同一ファイルに assertion → passed

**Given** ある must TC を宣言した test-cases.md がある
**And** 当該 TC-ID が `// TC-0XX: ...` コメントとしてのみ出現し、かつ pre-existing な振る舞いに対する
`expect(...)` assertion を含む test file がある
**When** test-coverage を評価する
**Then** status は passed であり、当該 TC は foundTcIds に含まれ、missingTcIds と assertionlessTcIds は空である

#### Scenario: コメント形式のみの TC-ID で assertion が皆無 → failed（境界の明示）

**Given** ある must TC を宣言した test-cases.md がある
**And** 当該 TC-ID が `// TC-0XX: ...` コメントとしてのみ出現し、ファイル内に assertion が一切ない test file がある
**When** test-coverage を評価する
**Then** status は failed であり、当該 TC は assertionlessTcIds に含まれる

### Requirement: docs に走査規約とトレーサビリティ規約を明文化する

docs は、test-coverage が must TC のカバレッジを test file 内の TC-ID リテラル走査で検証すること、
および既存テストが既に充足している場合は `// TC-0XX` トレーサビリティコメントの追記がその充足を
表明する正式手段であることを MUST 記述する。

#### Scenario: docs が走査規約とトレーサビリティ規約を含む

**Given** docs のカバレッジ規約ドキュメント
**When** その内容を読む
**Then** test-coverage が TC-ID リテラルを走査する旨と、トレーサビリティコメントが既存カバレッジの
表明手段である旨の双方が記述されている
