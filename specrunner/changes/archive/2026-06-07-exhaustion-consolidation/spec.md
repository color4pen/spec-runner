# Spec: ループ枯渇判定を1箇所に集約する

## Requirements

### Requirement: 枯渇判定は単一メソッドに集約される

`Pipeline` のメインループ（`runInternal`）は、loop / fixer の iteration が `maxIterations` に達したかの判定を単一の private メソッドを通して行わなければならない（SHALL）。メインループ本体には `maxIterations` との比較がインラインで残ってはならない（MUST NOT）。集約後も、3種の枯渇条件それぞれが現行と同一の結果（`pipeline:iteration:exhausted` event payload、escalation verdict 上書き、`awaiting-resume` 遷移、`resumePoint` 記録、iteration 回数）を生成しなければならない（MUST）。

#### Scenario: 対の fixer を持たない loop step が枯渇する

**Given** `loopFixerPairs` に対の fixer を持たない loop step（例: spec-review、`loopFixerPairs` が空）が `maxIterations` 回すべて needs-fix を返す
**When** メインループが各 iteration 完了後に枯渇判定メソッドを呼ぶ
**Then** ちょうど `maxIterations` 回で枯渇し、`error.code` は当該 step の `LOOP_ERROR_CODES`（例: `SPEC_REVIEW_RETRIES_EXHAUSTED`）、`status` は `awaiting-resume`、`resumePoint.exhaustionPhase` は `review-exhausted` になる
**And** `pipeline:iteration:exhausted` が `{ step: <その loop step>, iteration: <到達した iteration>, maxIterations }` で emit される

#### Scenario: reviewer/fixer ペアで fixer 上限到達後の +1 review が needs-fix を返す

**Given** reviewer（例: code-review）と対の fixer（例: code-fixer）が組まれ、fixer が `maxIterations` 回実行されてもなお reviewer が +1 bypass review で needs-fix を返す
**When** メインループが fixer step へ再入する前に枯渇判定メソッドを呼ぶ
**Then** reviewer を枯渇 step として `error.code` が当該 reviewer の `LOOP_ERROR_CODES`（例: `CODE_REVIEW_RETRIES_EXHAUSTED`）、`resumePoint.exhaustionPhase` は `review-after-final-fix` になる
**And** reviewer の iteration は合計 `maxIterations + 1`（bypass 1 回分を含む）記録される

#### Scenario: fixer 上限到達済みなら bypass で +1 review が許可される

**Given** reviewer が `maxIterations` 回 needs-fix を返したが、対の fixer も `maxIterations` 回実行済みである
**When** メインループが reviewer step へ再入する前に枯渇判定メソッドを呼ぶ
**Then** 枯渇とはみなされず（bypass）、reviewer がもう一度（+1 回目）実行される

#### Scenario: メインループにインラインの maxIterations 比較が存在しない

**Given** リファクタ後の `Pipeline.runInternal` の本体
**When** ソースを検査する
**Then** 枯渇判定の `>= maxIterations` 比較（bypass 比較を含む）は枯渇判定メソッド内にのみ存在し、メインループ本体には存在しない
