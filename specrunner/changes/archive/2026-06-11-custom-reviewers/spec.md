# Spec: プロジェクト定義のカスタムレビューワー step

## Requirements

### Requirement: 宣言形式とパース

The system SHALL load custom reviewer definitions from `specrunner/reviewers/<name>.md`,
where the frontmatter declares `name` (matching the filename stem), `maxIterations`, and
an optional `model`, and the body MUST contain the required sections 目的 / 観点 / 判定基準
followed by an optional free-form section.

#### Scenario: 有効な定義をパースする

**Given** `specrunner/reviewers/security.md` が frontmatter（name: security, maxIterations: 3）と
必須セクション（目的 / 観点 / 判定基準）と自由欄を持つ
**When** `loadReviewerDefinitions` が reviewers/ を読み込む
**Then** `ReviewerDefinition { name: "security", maxIterations: 3, sections, freeform }` が 1 件返る

#### Scenario: reviewers/ が不存在

**Given** `specrunner/reviewers/` が存在しない
**When** `loadReviewerDefinitions` が呼ばれる
**Then** 空配列が返り、エラーにならない

### Requirement: load-time validation で job start 前に停止する

The system SHALL validate all reviewer definitions at job start, before the pipeline begins,
and MUST halt with an error (without starting the pipeline) when any definition has a missing
required frontmatter field, an out-of-range `maxIterations`, a missing required section, a name
colliding with a built-in step name, or a duplicate name.

#### Scenario: 必須セクション欠落で停止

**Given** `specrunner/reviewers/api.md` が `## 判定基準` セクションを欠く
**When** `run` の prepare が reviewer 定義を検証する
**Then** prepare がエラーで停止し、pipeline は開始されず exit code は非 0

#### Scenario: 組み込み step 名との衝突で停止

**Given** `specrunner/reviewers/code-review.md` が存在する（組み込み step 名と衝突）
**When** prepare が検証する
**Then** 衝突エラーで停止し pipeline は開始されない

#### Scenario: 有効な定義は通過する

**Given** すべての reviewer 定義が必須項目・範囲・セクションを満たし衝突がない
**When** prepare が検証する
**Then** 検証を通過し job state へ snapshot される

### Requirement: judge 契約での直列実行

The system SHALL execute custom reviewers serially after code-review in declaration order,
deriving each reviewer's verdict from its `report_result` findings via the same CLI logic as
built-in judges (findings-derived verdict, reference existence verification, fixer loop on
needs-fix, escalation on decision-needed).

#### Scenario: 単一 reviewer が code-review の後に走る

**Given** reviewers/ に 1 件の定義があり code-review が approved を返した
**When** pipeline が進行する
**Then** その reviewer が judge step として実行され、findings から verdict が CLI で導出される

#### Scenario: 複数 reviewer が宣言順に直列実行される

**Given** reviewers/ に 2 件（宣言順 A, B）の定義がある
**When** code-review が approved を返す
**Then** A → B の順で直列に実行され、両者の approved 後に conformance へ進む

#### Scenario: 実在しない参照は escalation

**Given** カスタムレビューワーが verdict 影響 findings に実在しない file/line 参照を返す
**When** executor が `verifyFindingRefs` を実行する
**Then** verdict は escalation になり、組み込み judge と同一に halt する

#### Scenario: ok=false は escalation

**Given** カスタムレビューワーが `ok: false` で report する
**When** executor が verdict を導出する
**Then** verdict は escalation になる

### Requirement: 共用 code-fixer の戻り先一般化

The system SHALL route a needs-fix verdict from any reviewer (built-in or custom) to the shared
code-fixer, and the code-fixer SHALL return to the reviewer that emitted the needs-fix, derived
from job state rather than a literal `"code-review"` reference.

#### Scenario: needs-fix を出した custom reviewer に戻る

**Given** custom reviewer B が needs-fix を出して code-fixer が走った
**When** code-fixer が完了する
**Then** pipeline は code-review ではなく B に戻って再レビューする

#### Scenario: zero reviewer 時は現行どおり code-review に戻る

**Given** reviewers/ が空で code-review が needs-fix を出した
**When** code-fixer が完了する
**Then** pipeline は code-review に戻る（現行挙動と一致）

### Requirement: reviewer ごとに独立した iteration 予算

The system SHALL count loop-exhaustion iteration budgets per reviewer independently even when
multiple reviewers share the same code-fixer, resolving the fixer→reviewer reverse lookup to the
reviewer currently converging (many-to-one).

#### Scenario: 共用 fixer の予算が reviewer ごとに独立

**Given** reviewer A と B が code-fixer を共用し、A は maxIterations 回 needs-fix を出して exhaust した
**When** A が exhaust して halt する
**Then** exhaustion は A に帰着し（B ではない）、resume step は A 起点の fixer に設定される

### Requirement: 定義 snapshot と resume

The system SHALL snapshot reviewer definitions into job state at job start, and during the job
lifecycle (including resume) the pipeline SHALL use the snapshot; changes to the definition files
mid-job MUST NOT affect the running pipeline's shape or prompts.

#### Scenario: resume は snapshot を使う

**Given** job start 時に reviewer 定義が snapshot され、その後ディスクの定義ファイルが変更された
**When** job が resume される
**Then** pipeline は変更後のファイルではなく job start 時の snapshot を使う

### Requirement: 既定ゼロ個の完全一致

The system SHALL produce a pipeline whose composition, behavior, and output are identical to the
current pipeline when `specrunner/reviewers/` is empty or absent.

#### Scenario: zero reviewer で既存テストが無変更 green

**Given** reviewers/ が空または不存在
**When** descriptor が合成される
**Then** base descriptor がそのまま返り、既存 pipeline テストが無変更で green

### Requirement: --from オプションの制限

The system SHALL NOT support `specrunner resume --from <custom-reviewer-name>` with an explicit
custom reviewer name; `resolveResumeStep` validates `--from` values against the standard step
name set only, so passing a custom reviewer name results in an 'Invalid --from value' error.
Automatic resume via `resumePoint` (derived from job state) SHALL work correctly for custom
reviewers.

#### Scenario: --from に custom reviewer 名を指定すると失敗する

**Given** job state に custom reviewer `security` が含まれる
**When** `specrunner resume --from security` を実行する
**Then** 'Invalid --from value' エラーが返り resume は開始されない

#### Scenario: --from なし（自動 resume）は動作する

**Given** job が custom reviewer `security` の途中で中断している
**When** `specrunner resume`（--from 指定なし）を実行する
**Then** `resumePoint` から正しく resume され pipeline が再開される

### Requirement: findings の出所識別

The system SHALL identify custom reviewer findings, result files, and state records by reviewer
name, and the code-fixer prompt SHALL distinguish which reviewer each finding came from.

#### Scenario: 結果ファイルが reviewer 名で識別される

**Given** custom reviewer `security` が結果を書き出す
**When** 結果ファイルが生成される
**Then** パスは `specrunner/changes/<slug>/security-result-NNN.md` で reviewer 名を含む

#### Scenario: code-fixer が受け取る findings に reviewer 名が含まれる

**Given** custom reviewer B が needs-fix findings を出した
**When** code-fixer の prompt が組み立てられる
**Then** findings ブロックに reviewer 名（B）のラベルが含まれる
