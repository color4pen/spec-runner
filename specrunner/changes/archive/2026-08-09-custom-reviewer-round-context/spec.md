# Spec: custom reviewer に周回知識(前周 findings・operator 裁定)を注入する

## Requirements

### Requirement: custom reviewer は iteration ≥ 2 で前周 context block を user message に注入する

custom reviewer step の user message は、iteration ≥ 2 のとき前周 context block を含めなければならない
(MUST)。block は「前周の自分自身の findings の projection(severity / resolution / file / title)」と
「前周 round 以降の code-fixer commit から machine-derived した変更 file 一覧」と「再指摘プロトコル
(対象 file を Read で読み直す / 再指摘には rationale を明示する / 指摘の全量列挙は維持する)」を含む。
iteration 1 では前周 context block を注入してはならない (SHALL NOT)。

#### Scenario: iteration ≥ 2 で前周 findings + 変更 file + 再指摘プロトコルが注入される

**Given** ある custom reviewer が前周(iteration 1)を実行済で、その StepRun に toolResult.findings が
記録されており、前周以降に code-fixer が commit を残している
**When** 同じ reviewer の iteration 2 の user message を組み立てる
**Then** user message は前周 findings の projection、code-fixer commit 由来の変更 file 一覧、
および再指摘プロトコル text を含む前周 context block を含む

#### Scenario: iteration 1 では前周 context block を注入しない

**Given** ある custom reviewer がまだ一度も実行されていない(iteration 1)
**When** その reviewer の user message を組み立てる
**Then** user message は前周 context block を含まない

### Requirement: 前周 context の導出失敗は block 全体を省略して続行する

前周 context の machine-derived 導出が失敗した場合(git 失敗 / listCommitChangedFiles unavailable /
前周 findings 欠落)、システムは前周 context block 全体を省略しなければならず (MUST)、例外を投げては
ならない (SHALL NOT throw)。部分的に導出できた field のみを注入することはしない(all-or-nothing)。

#### Scenario: 前周 findings が欠落しているとき block を省略する

**Given** ある custom reviewer が iteration 2 で、前周 StepRun に toolResult.findings が記録されていない
**When** その reviewer の前周 context を導出する
**Then** 導出は null を返し、user message に前周 context block は注入されず、例外は投げられない

#### Scenario: commit 変更 file の導出が失敗するとき block を省略する

**Given** ある custom reviewer が iteration 2 で、前周以降の code-fixer commit の
listCommitChangedFiles が unavailable(または throw)を返す
**When** その reviewer の前周 context を導出する
**Then** 導出は null を返し、user message に前周 context block は注入されず、step は続行する

### Requirement: job resume --prompt の内容を operator 裁定として JobState に永続化する

`job resume --prompt <text>` が非空の prompt を伴って実行された場合、システムはその内容を operator
裁定記録(自由記述 text + 対象 step + ISO 時刻)として JobState に永続化しなければならない (MUST)。
既存の one-shot deps 注入(最初の unit への `<resume-context>`)は変更しない。prompt が与えられない
resume では裁定記録を追加しない。

#### Scenario: --prompt 付き resume で裁定記録が state に追加される

**Given** awaiting-resume の job があり、operator が `job resume --prompt "<裁定文>"` を実行する
**When** resume が「running」へ遷移し state を永続化する
**Then** 永続化された JobState は、text=`<裁定文>`・step=再開 step・recordedAt=ISO 時刻を持つ
operator 裁定記録を 1 件含む

#### Scenario: --prompt 無しの resume では裁定記録を追加しない

**Given** awaiting-resume の job があり、operator が `job resume`(prompt 無し)を実行する
**When** resume が「running」へ遷移し state を永続化する
**Then** 永続化された JobState の operator 裁定記録は resume 前から増えない

### Requirement: operator 裁定と decisions ledger を custom reviewer round の prompt に注入する

custom reviewer step の user message は、永続化された operator 裁定記録または既存の decisions
ledger(issue-comment 由来)のいずれかが存在するとき、その内容を「operator 裁定」block として
含めなければならない (MUST)。block は「裁定済み事項を再指摘する場合は裁定 rationale への反論を
明示する」プロトコルを含む。裁定記録と decisions がいずれも存在しない場合は block を含めない
(SHALL NOT)。

#### Scenario: 裁定記録が存在するとき裁定 block が注入される

**Given** ある custom reviewer round で、JobState に operator 裁定記録または decisions ledger entry が
1 件以上存在する
**When** その reviewer の user message を組み立てる
**Then** user message は裁定内容(step ラベル付き)と反論プロトコルを含む operator 裁定 block を含む

#### Scenario: 裁定記録が無いとき裁定 block を注入しない

**Given** ある custom reviewer round で、JobState の operator 裁定記録と decisions ledger が共に空
**When** その reviewer の user message を組み立てる
**Then** user message は operator 裁定 block を含まない

#### Scenario: iteration 1 かつ decisions が存在するとき前周 context block は注入されないが裁定 block は注入される

**Given** ある custom reviewer がまだ一度も実行されていない(iteration 1)で、
JobState に decisions ledger entry が 1 件以上存在する
**When** その reviewer の user message を組み立てる
**Then** user message は前周 context block を含まず、かつ裁定内容(step ラベル付き)と反論プロトコルを含む
operator 裁定 block を含む
