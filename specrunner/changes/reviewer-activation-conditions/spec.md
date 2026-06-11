# Spec: カスタムレビューワーの起動条件を宣言的に指定できるようにする

## Requirements

### Requirement: 起動条件の宣言形式

The system SHALL allow a custom reviewer definition (`specrunner/reviewers/<name>.md`)
to declare optional frontmatter keys `paths` (an array of glob strings) and `requestTypes`
(an array of request type strings). When neither key is present, the reviewer MUST be treated
as unconstrained (always activated). The frontmatter parser SHALL accept both inline flow
arrays (`paths: [a, b]`) and block sequences (`- item`).

#### Scenario: paths と requestTypes をパースする

**Given** `specrunner/reviewers/security.md` の frontmatter が `paths: ["src/auth/**"]` と `requestTypes: [new-feature]` を持つ
**When** `parseReviewerDefinition` が定義を読む
**Then** `ReviewerDefinition` の `paths` が `["src/auth/**"]`、`requestTypes` が `["new-feature"]` になる

#### Scenario: block sequence 記法をパースする

**Given** frontmatter が `paths:` の次行に `  - "src/**"` と `  - "lib/**"` をインデントで持つ
**When** `parseReviewerDefinition` が定義を読む
**Then** `paths` が `["src/**", "lib/**"]` になる

#### Scenario: 条件無指定は制約なし

**Given** `specrunner/reviewers/style.md` が `paths` も `requestTypes` も持たない
**When** 定義がパースされる
**Then** `paths` / `requestTypes` はともに不在で、起動判定上「制約なし」として扱われる

### Requirement: 起動条件の validation

The system SHALL validate `paths` and `requestTypes` at load time when present: each MUST be a
non-empty array of non-empty strings. The scaffold output of `reviewers new` MUST pass the
existing #622 load-time validation without modification.

#### Scenario: 空配列は拒否される

**Given** `specrunner/reviewers/api.md` が `paths: []` を持つ
**When** `validateReviewerDefinitions` が検証する
**Then** 「present 時は非空配列」違反で throw する

#### Scenario: scaffold 出力が validation を通る

**Given** `reviewers new security` が生成した `specrunner/reviewers/security.md`
**When** `parseReviewerDefinition` → `validateReviewerDefinitions` を通す
**Then** throw せず、有効な `ReviewerDefinition` として受理される

### Requirement: CLI 決定論による起動判定

The system SHALL decide reviewer activation deterministically in the CLI, without invoking an LLM.
A reviewer with `paths` SHALL activate only if at least one changed file matches at least one glob.
A reviewer with `requestTypes` SHALL activate only if the request type is in the list. When both are
declared, the reviewer SHALL activate only if ALL declared conditions are satisfied (AND).

#### Scenario: paths 一致で起動する

**Given** reviewer `security` が `paths: ["src/auth/**"]` を持ち、変更ファイルに `src/auth/login.ts` が含まれる
**When** executor が起動ゲートを評価する
**Then** `evaluateActivation` が `activated: true` を返し、reviewer agent が起動する

#### Scenario: requestTypes 一致で起動・不一致で skip

**Given** reviewer `heavy` が `requestTypes: [new-feature, spec-change]` を持つ
**When** request type が `new-feature` の job で評価される
**Then** reviewer が起動する
**And** request type が `bug-fix` の job では skip される（理由 `request type "bug-fix" not in [...]`）

#### Scenario: AND セマンティクス

**Given** reviewer が `paths: ["src/auth/**"]` と `requestTypes: [new-feature]` の両方を持つ
**When** request type が `new-feature` だが変更ファイルが `src/auth/**` に一致しない
**Then** paths 条件が満たされず skip される

### Requirement: 変更ファイルの fresh な観測

The system SHALL observe the changed-file list at the moment the reviewer step executes
(against the implementer-committed HEAD), via a runtime-neutral seam, and MUST NOT rely on the
stale `dynamicContext` collected once at run start. The observation MUST NOT throw.

#### Scenario: reviewer 実行時点の diff を観測する

**Given** implementer が `src/auth/login.ts` を commit 済で、reviewer step に到達した
**When** executor が paths 条件を持つ reviewer のゲートを評価する
**Then** `listChangedFiles(baseBranch, cwd, branch)` が `src/auth/login.ts` を含む一覧を返し、それを照合に使う

#### Scenario: 観測失敗でも pipeline を止めない

**Given** `listChangedFiles` が内部エラーになる
**When** ゲートが観測する
**Then** 空配列が返り、例外は伝播せず pipeline は継続する

### Requirement: skip を approved と区別して記録する

The system SHALL skip a reviewer whose activation conditions are not satisfied without starting its
agent session and without committing/pushing, and SHALL record a step outcome with verdict `skipped`
and a `skipReason`, distinct from `approved`, in both state (`state.steps[<reviewer>]`) and the
journal (`events.jsonl`).

#### Scenario: paths 不一致 reviewer が理由付きで journal に記録される

**Given** reviewer `security` の `paths` が変更ファイルに一致しない
**When** executor がゲートを評価して skip する
**Then** `state.steps["security"]` に `verdict: "skipped"` + `skipReason` の StepRun が残る
**And** `events.jsonl` に該当 step-attempt record と `security skipped: <reason>` の transition record が現れる

#### Scenario: skip ≠ approved が state に残る

**Given** 同一 job で reviewer A は skip され、reviewer B は approved した
**When** state を読む
**Then** A の最新 verdict は `skipped`、B の最新 verdict は `approved` で、両者が機械的に区別できる

#### Scenario: skip した reviewer の agent は起動しない

**Given** reviewer が skip 対象である
**When** executor がゲートを評価する
**Then** agent session は起動されず、commit/push と output template 配置も行われない

### Requirement: skip の transition は次へ進む

The system SHALL route a `skipped` verdict from a reviewer to the next reviewer in the chain (or to
conformance when it is the last), and MUST NOT route a `skipped` verdict to the code-fixer.

#### Scenario: skip は次の reviewer へ進む

**Given** chain が `[code-review, A, B]` で A が skip された
**When** pipeline が transition を引く
**Then** A → B へ進み、A は code-fixer に入らない

#### Scenario: 末尾 reviewer の skip は conformance へ進む

**Given** chain が `[code-review, A]` で A が skip された
**When** pipeline が transition を引く
**Then** A → conformance へ進む

### Requirement: 無条件 reviewer / reviewers 不存在の完全一致

The system SHALL preserve the current pipeline composition, behavior, and output exactly when a
reviewer declares no activation conditions, and when `specrunner/reviewers/` is empty or absent.

#### Scenario: 条件無指定 reviewer は常時起動する

**Given** reviewer が `paths` も `requestTypes` も持たない
**When** pipeline が当該 reviewer に到達する
**Then** ゲートを通らず（`activation` 未付与）、現行どおり毎回 agent が起動する

#### Scenario: reviewers/ 不存在で既存挙動と一致

**Given** `specrunner/reviewers/` が空または不存在
**When** pipeline が合成・実行される
**Then** base descriptor がそのまま使われ、既存 pipeline テストが無変更で green

### Requirement: reviewers new scaffold コマンド

The system SHALL provide `specrunner reviewers new <name>` that scaffolds
`specrunner/reviewers/<name>.md` from an embedded template (the same shape as `rules new`),
validating `<name>` against the reviewer name charset and failing on collision with an existing file.

#### Scenario: scaffold が雛形を生成する

**Given** `specrunner/reviewers/security.md` が存在しない
**When** `specrunner reviewers new security` を実行する
**Then** `specrunner/reviewers/security.md` が frontmatter（name / maxIterations）+ 必須セクション + 起動条件のコメント例とともに生成される

#### Scenario: 不正な name を拒否する

**Given** `<name>` が `../etc` のように charset 制約に違反する
**When** `specrunner reviewers new ../etc` を実行する
**Then** エラーで exit 2 になり、ファイルは生成されない

#### Scenario: 既存ファイルとの衝突を拒否する

**Given** `specrunner/reviewers/security.md` が既に存在する
**When** `specrunner reviewers new security` を実行する
**Then** 衝突エラーで exit 1 になり、既存ファイルは上書きされない
