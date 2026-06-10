# Spec: pipeline error-path 契約の固定

このファイルは本 change が固定（テストで pin）する pipeline error-path の振る舞いを記述する。
src/ の実装は変更しない。各 Requirement は exhaustion-consolidation リファクタ後も保持されるべき
observable な契約であり、テストはこの契約を job state の遷移で検証する。

## Requirements

### Requirement: fixer ループ exhaustion は escalation で停止し再開可能にする

3 つの fixer ループ（spec-fixer / code-fixer / build-fixer）それぞれで、対応する reviewer が
`maxIterations` 到達後の +1 bypass review でも解消しなかった場合、pipeline は SHALL ループを
`escalation` で打ち切り、job state に observable な停止情報を記録する。最後の reviewer entry の
verdict は `escalation` に書き換えられ、`status` は `awaiting-resume`、`error.code` は当該ループの
`<LOOP>_RETRIES_EXHAUSTED`、`resumePoint.step` は対の fixer 名、`resumePoint.exhaustionPhase` は
`review-after-final-fix` でなければならない (MUST)。

#### Scenario: verification/build-fixer ループの exhaustion

**Given** `maxRetries=2` で pipeline を実行し、verification が 3 回（+1 bypass を含む）とも failed を返す
**When** pipeline が verification → build-fixer ループを規定回数実行する
**Then** `result.status` は `awaiting-resume`、`result.error.code` は `VERIFICATION_RETRIES_EXHAUSTED`、
`result.steps["verification"]` 末尾の `outcome.verdict` は `escalation`、
`result.resumePoint.step` は `build-fixer`、`result.resumePoint.exhaustionPhase` は `review-after-final-fix` である

#### Scenario: spec-fixer / code-fixer ループの exhaustion

**Given** `maxRetries=2` で spec-review もしくは code-review が全 iteration で needs-fix を返す
**When** pipeline が当該 review → fixer ループを規定回数実行する
**Then** `result.status` は `awaiting-resume`、`result.error.code` は当該ループの `<LOOP>_RETRIES_EXHAUSTED`、
末尾 reviewer entry の `outcome.verdict` は `escalation`、`resumePoint.exhaustionPhase` は
`review-after-final-fix` である

### Requirement: escalation で停止した job は resume で再入し完走できる

escalation で `awaiting-resume` に遷移した job は、阻害要因が解消された状態で再入されたとき、SHALL
`resumePoint.step` が指す step から pipeline を再開し、後続 step を経て完了状態へ到達する。再入は
中断前に完了済みの step を起点に戻すことなく、escalation を起こした地点から行われなければならない (MUST)。

#### Scenario: exhaustion 停止からの resume 往復

**Given** ループ exhaustion により `awaiting-resume` で停止し `resumePoint.step` が対の fixer を指す job
**When** mock を解消側に組み替え `resumePoint.step` を起点に pipeline を再入する
**Then** pipeline は `resumePoint.step` から再開し、`status` が `awaiting-archive` まで進む

### Requirement: follow-up retry 枯渇時は step クラス別にフォールバックする

agent が report_result tool を呼ばずに follow-up retry が `maxAttempts`（2 回）を超えた場合、CLI は
SHALL toolResult を null として扱い、step クラスに応じてフォールバックする。judge 系 step は
`escalation` verdict となり job を `awaiting-resume` で停止させ、producer 系 step は step の
`completionVerdict`（既定 `success`）を採り pipeline を続行させなければならない (MUST)。

#### Scenario: judge 系の no-tool-call フォールバック

**Given** judge 系 step（spec-review 等）が toolResult を返さない
**When** executor が当該 step の verdict を導出する
**Then** 当該 StepRun の `outcome.verdict` は `escalation` であり、pipeline は `awaiting-resume` に遷移する

#### Scenario: producer 系の no-tool-call フォールバック

**Given** producer 系 step が toolResult を返さない
**When** executor が当該 step の verdict を導出する
**Then** 当該 StepRun の verdict は step の `completionVerdict`（既定 `success`）であり、pipeline は後続 step に進む

### Requirement: findings 起因の escalation は job を停止させる

judge 系 step の findings に `resolution="decision-needed"` が含まれる場合、または実在しない file を
参照する blocking finding が含まれる場合、CLI は SHALL verdict を `escalation` に導出し、job を
`awaiting-resume` で停止させる。実在しない file 参照の検出は runtimeStrategy の finding 参照検証が
非空を返したときに発火しなければならない (MUST)。

#### Scenario: decision-needed finding による escalation

**Given** judge 系 step が `resolution="decision-needed"` の finding を含む結果を返す
**When** pipeline が当該 step を実行する
**Then** 当該 StepRun の `outcome.verdict` は `escalation` であり、`result.status` は `awaiting-resume` である

#### Scenario: 実在しない file 参照の blocking finding による escalation

**Given** blocking finding が実在しない file を参照し、runtimeStrategy の finding 参照検証が非空を返す
**When** executor が当該 step の verdict を導出する
**Then** findings 単体では needs-fix 相当でも、verdict は `escalation` に上書きされる

### Requirement: session 異常終了は SESSION_TERMINATED を記録し再開可能に停止する

agent session が terminated またはエラー終了したとき、CLI は SHALL エラーを正規化して
SESSION_TERMINATED 系の `error.code` を job state に記録し、job を再開可能な状態で停止させなければ
ならない (MUST)。エラー code は元エラーが code を持たない場合 `SESSION_TERMINATED` を既定とする。

#### Scenario: agent session の terminated 終了

**Given** ある step の agent session が terminated で終了する
**When** pipeline が当該 step を実行する
**Then** job state の `error.code` は SESSION_TERMINATED 系であり、停止後の状態は再開可能である

### Requirement: verification の部分失敗は failed verdict として build-fixer ループに入る

複数 phase のうち一部のみが失敗するケース（build 成功 + test 失敗等）でも、verification の verdict は
SHALL `failed` となり、pipeline は build-fixer ループへ遷移しなければならない (MUST)。

#### Scenario: build 成功・test 失敗の部分失敗

**Given** verification が build 成功・test 失敗の混在 phase 結果で verdict `failed` を返す
**When** pipeline が verification step を評価する
**Then** verification の StepRun verdict は failed 相当となり、build-fixer の StepRun が記録される
