# Spec: test-materialize step の廃止 — テスト実体化を implementer に統合する

## Requirements

### Requirement: spec-phase 承認は全 type で implementer へ収束する

パイプラインは、spec-review approved（および spec-fixer の観測 auto-fix forward）から、request type によらず implementer へ直行 SHALL する。遷移表に `test-materialize` を step とする行、および `test-materialize` へ遷移する行は存在してはならない（MUST NOT）。

#### Scenario: 非免除 type は spec-review 承認から implementer へ直行する

**Given** request type が `new-feature` / `spec-change` / `refactoring` / `bug-fix` のいずれかの job state
**When** 遷移解決器が `spec-review` の `approved` に対する次 step を求める（routable fixable なし）
**Then** 次 step は `implementer` であり、`test-materialize` ではない

#### Scenario: 免除 type も spec-review 承認から implementer へ直行する

**Given** request type が `chore`（test-gen-exempt）の job state
**When** 遷移解決器が `spec-review` の `approved` に対する次 step を求める
**Then** 次 step は `implementer` である

#### Scenario: 遷移表に test-materialize 行が存在しない

**Given** `STANDARD_TRANSITIONS`
**When** 全 transition 行を走査する
**Then** `step` が `test-materialize` の行も、`to` が `test-materialize` の行も 1 つも存在しない

#### Scenario: spec-fixer の観測 auto-fix は implementer へ forward する

**Given** spec-review が approved 済みで、spec-fixer が観測 auto-fix pass として approved を返した job state（conformance 起点ではない）
**When** 遷移解決器が `spec-fixer` の `approved` に対する次 step を求める
**Then** 次 step は `implementer` である（request type の免除有無によらない）

### Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う

implementer は、test-cases.md が存在する（standard・非免除）とき、その全 must TC をテストコードへ実体化し、実装と整合させる責務を負う SHALL。implementer の system prompt はこの実体化責務を明示 MUST し、`test-materialize 済み / 未 materialize` の mode 分岐を持ってはならない（MUST NOT）。

#### Scenario: implementer prompt が全 must TC の実体化責務を明示する

**Given** implementer の system prompt 文字列
**When** その内容を検査する
**Then** 「test-cases.md の（全）must TC をテストコードに実体化し、実装と整合させる」旨の責務記述を含み、`test-materialize 済み` を前提とする implement-only mode の分岐記述を含まない

#### Scenario: implementer message は test-materialize 実行歴に依存しない

**Given** 任意の job state（test-materialize 実行歴の有無を問わない）
**When** implementer の initial message を構築する
**Then** message は `state.steps["test-materialize"]` の有無で分岐せず、単一 mode の内容になる

### Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う

bite-evidence gate と archive floor は、materialized test file 集合を、test-materialize commit の changed files ではなく、Evidence Base 参照（fork point = `synthesizedCommits[0]^`）と candidate の diff にテストパターンフィルタ（`selectMaterializedTestFiles`）を適用して同定 SHALL する。gate / floor は `test-materialize` run の commitOid（baseOid）に依存してはならない（MUST NOT）。

#### Scenario: gate は test-materialize run 無しで red→green 判定に到達する

**Given** forward type の job state で、`test-materialize` step の run が state に存在せず、implementer が test を含む変更を commit 済み、`synthesizedCommits` が存在する
**When** bite-evidence gate を実行する
**Then** file 集合は Evidence Base 参照↔candidate の diff から同定され、baseOid 不在を理由とする strategy-deferred を発生させず、per-file の red→green 判定（passed / failed）に到達する

#### Scenario: archive floor は baseOid 無しで判定に到達する

**Given** forward type の job state で `test-materialize` run が存在せず、`synthesizedCommits` と `finalHeadOid` が存在し、runtime が必要メソッドを提供する
**When** archive floor が biteEvidence を評価する
**Then** file 集合は Evidence Base 参照↔`finalHeadOid` の diff から同定され、baseOid 不在を理由に early-return せず、base-red / HEAD-green の評価に到達する

### Requirement: testDerivation は scenario 凍結として判定される

archive floor は `testDerivation = "frozen"` を、test-cases.md が test-case-gen 確定 commit から final HEAD まで content 不変であること（scenario revision binding）のみに基づいて導出 SHALL する。工程境界 blob freeze（materialized test blob が baseOid→finalHeadOid で不変）は判定条件から除外 MUST する。`STANDARD_PROFILE` の testDerivation floor は `"frozen"` のまま変更してはならない（MUST NOT）。

#### Scenario: scenario 凍結が intact なら testDerivation は frozen

**Given** test-cases.md@testCaseGenOid の content hash が test-cases.md@finalHeadOid と一致し、`test-materialize` run が state に存在しない forward-type job
**When** archive floor が testDerivation を導出する
**Then** achieved の testDerivation は `"frozen"` になる（baseOid や test blob の不変性は要求されない）

#### Scenario: scenario がすり替えられたら testDerivation は absent

**Given** test-cases.md@testCaseGenOid の content hash が test-cases.md@finalHeadOid と一致しない job
**When** archive floor が testDerivation を導出する
**Then** achieved の testDerivation は absent（fail-closed）になる

### Requirement: test-materialize の resume 互換は legacy alias で担保される

resume 解決は、`--from test-materialize` および `resumePoint.step = "test-materialize"` を implementer に写す legacy alias を提供 SHALL する。test-materialize 実行歴を含む既存 state の読み込み・fold・resume が壊れてはならない（MUST NOT）。

#### Scenario: --from test-materialize は implementer に解決される

**Given** `--from test-materialize` 指定
**When** resume step を解決する
**Then** 解決結果は `implementer` になる

#### Scenario: resumePoint.step が test-materialize でも implementer に解決される

**Given** `resumePoint.step = "test-materialize"` を持つ resume
**When** resume step を解決する
**Then** 解決結果は `implementer` になる

#### Scenario: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない

**Given** `state.steps` に `test-materialize` の run 履歴を含む legacy job state
**When** 当該 state を読み込み・fold する
**Then** 例外なく読み込め、test-materialize 実行歴は passthrough で保持される

### Requirement: test-gen 免除の制御対象は 2 箇所に縮退する

`isTestGenExempt` が制御するバイパスは、test-case-gen バイパス（`design → spec-review`）と bite-evidence バイパス（`implementer → verification`）の 2 箇所に縮退 SHALL する。免除 type の観測可能挙動（test-case-gen を通らない・bite-evidence を通らない）は不変でなければならない（MUST）。

#### Scenario: 免除 type は test-case-gen と bite-evidence を通らない

**Given** request type が `chore`（test-gen-exempt）の job state
**When** 遷移解決器が `design` の `success` と `implementer` の `success` の次 step を求める
**Then** `design` は `spec-review` へ（test-case-gen をバイパス）、`implementer` は `verification` へ（bite-evidence をバイパス）遷移する
