# Spec: レビュー収束後の退行ゲート

## Requirements

### Requirement: 退行ゲートは reviewer チェーン完走後・conformance 前に実行される

custom reviewer が 1 件以上宣言された job では、システムは退行ゲート step
（`regression-gate`）を reviewer チェーン（`code-review` + 全 custom reviewer）の完走後、
かつ `conformance` の実行前に実行する SHALL。チェーン最後の reviewer が approved を返した遷移先は
`regression-gate` であり、`regression-gate` の approved の遷移先が `conformance` である。

#### Scenario: custom reviewer 1 件の job でゲートがチェーン後に走る

**Given** custom reviewer を 1 件（例: `security`）宣言した job
**When** `code-review` と `security` がいずれも approved を返してチェーンが完走する
**Then** `conformance` の前に `regression-gate` step が 1 回以上実行され、
`regression-gate` の approved 後に `conformance` が実行される

#### Scenario: チェーン末尾の reviewer は conformance ではなくゲートへ遷移する

**Given** custom reviewer を 2 件（例: `security`, `perf`）宣言した job
**When** 合成された pipeline の遷移表を参照する
**Then** 末尾 reviewer（`perf`）の approved 遷移先は `regression-gate` であり、
`regression-gate` の approved 遷移先が `conformance` である

### Requirement: custom reviewer ゼロではゲートを構造的に skip する

custom reviewer が 0 件の job では、システムは `regression-gate` step を pipeline に含めない SHALL。
このとき pipeline 形状・遷移・出力は本変更導入前と完全一致しなければならない（MUST）。

#### Scenario: reviewer ゼロでゲートが現れない

**Given** custom reviewer を 1 件も宣言していない job
**When** pipeline を合成する
**Then** 合成結果は base descriptor と参照同一であり、step 集合・遷移表に `regression-gate` は現れない

### Requirement: ゲートの入力は累積 findings 台帳に限定される

システムは、reviewer チェーン（`code-review` + 全 custom reviewer、ゲート自身を除く）の全 step の
全 iteration から `resolution` が `fixable` の finding を収集し、構造的重複（同一 file + line + title）を
排除した集合を「累積 findings 台帳」としてゲートへ提示する SHALL。`resolution` が `decision-needed` の
finding は台帳に含めない（MUST NOT）。ゲートは台帳に列挙された項目の最終コードでの維持のみを照合し、
台帳に無い新規観点の開放的レビューを行わない（MUST NOT）。

#### Scenario: 途中で修正された fixable finding が台帳に含まれる

**Given** `code-review` が iteration 1 で fixable な finding を報告し、code-fixer 修正後に
iteration 2 で approved（findings 空）を返した state
**When** ゲートの入力台帳を構築する
**Then** 台帳には iteration 1 の fixable finding が 1 件含まれる

#### Scenario: decision-needed は台帳に含まれない

**Given** ある reviewer の StepRun に `resolution` が `decision-needed` の finding が記録された state
**When** ゲートの入力台帳を構築する
**Then** その `decision-needed` finding は台帳に含まれない

#### Scenario: 構造的重複が排除される

**Given** 複数の StepRun に同一 file + line + title の fixable finding が記録された state
**When** ゲートの入力台帳を構築する
**Then** 台帳にはその finding が 1 件だけ含まれる

### Requirement: ゲートは judge 契約に乗る

`regression-gate` step は judge step として `JUDGE_REPORT_TOOL` を `reportTool` とする SHALL。
これによりシステムは verdict を findings から導出し（critical|high → needs-fix、
decision-needed → escalation、それ以外 → approved）、verdict に影響する finding の file/line の実在を
検証し、実在しない参照があれば escalation とし、report_result 未呼び出し時は escalation とする SHALL。

#### Scenario: 退行なしで approved

**Given** ゲートが台帳の全項目を最終コードで維持と判定し findings 空で report_result を呼ぶ
**When** CLI が verdict を導出する
**Then** verdict は approved となり、次の step は `conformance` である

#### Scenario: 実在しない参照は escalation

**Given** ゲートが high severity の finding を報告するが、その file/line が最終コードに存在しない
**When** CLI が finding ref の実在を検証する
**Then** verdict は escalation に上書きされる

### Requirement: 退行検出時は code-fixer ループで修正する

ゲートが退行を検出した（needs-fix）とき、システムは共用 `code-fixer` step に遷移し、
`code-fixer` 完了後に `regression-gate` を再実行する SHALL。`code-fixer` はゲートが active reviewer の
とき、ゲートの退行 findings（`regression-gate-result-NNN.md` / state の toolResult）を入力として読む SHALL。

#### Scenario: 退行 → code-fixer → 再ゲート

**Given** ゲートが iteration 1 で退行 finding（high / fixable）を報告する
**When** pipeline が遷移する
**Then** 次に `code-fixer` が実行され、その後 `regression-gate` が再実行される

### Requirement: 台帳項目間の矛盾は escalation に落ちる

ある台帳項目の修正が別の台帳項目を必然的に再発させる矛盾をゲートが検出したとき、ゲートは
当該 finding を `resolution` = `decision-needed` として報告する SHALL。システムはこの verdict を
escalation に導出し、pipeline を `awaiting-resume` に遷移させる SHALL。

#### Scenario: 相互排他の矛盾で escalation

**Given** ゲートが「台帳項目 A を直すと台帳項目 B が再発する」と判定し `decision-needed` の finding を報告する
**When** CLI が verdict を導出する
**Then** verdict は escalation となり、pipeline は `awaiting-resume` に遷移する

### Requirement: ゲートは自身の iteration 予算と exhaustion を持つ

システムは `regression-gate` に固有の最大 iteration 予算（`maxIterationsByStep` 経由）を割り当てる SHALL。
ゲートと code-fixer のループが予算内で収束しないとき、システムは exhaustion を検出して
`REGRESSION_GATE_RETRIES_EXHAUSTED` を記録し、`awaiting-resume` に遷移する SHALL。

#### Scenario: 予算超過で exhaustion

**Given** ゲートが予算回数だけ needs-fix を返し続け、code-fixer が収束させられない
**When** ゲートの iteration が固有予算に達する
**Then** システムは `REGRESSION_GATE_RETRIES_EXHAUSTED` を記録し pipeline を `awaiting-resume` に遷移させる
