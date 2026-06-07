# Spec: validated step-name cast

## Requirements

### Requirement: 動的 step 名は `StepName` として扱う前に whitelist 検証する

システムは、文字列として動的に決まった step 名を `StepName` 型の値として扱う前に、登録済み step 名の
whitelist（`AGENT_STEP_NAMES` ∪ `CLI_STEP_NAMES`）と照合して妥当性を検証する `toStepName(name: string): StepName`
を提供 SHALL とする。`toStepName` は、与えられた名前が whitelist に存在する場合はその値を `StepName` として返し、
存在しない場合は MUST throw する。

#### Scenario: 登録済み step 名は検証を通過して返る

**Given** `"implementer"` は登録済みの step 名である
**When** `toStepName("implementer")` を呼ぶ
**Then** `"implementer"` が `StepName` として返る

#### Scenario: 未登録の step 名は実行時エラーになる

**Given** `"not-a-step"` は登録済み step 名のいずれにも一致しない
**When** `toStepName("not-a-step")` を呼ぶ
**Then** エラーが throw される

### Requirement: pipeline / runtime の resumePoint 記録は検証付き cast で行う

pipeline・runtime・executor が中断点（`resumePoint.step` 等）に動的 step 名を記録する箇所では、
force cast（`as StepName`）ではなく `toStepName()` による検証付き変換を使用 SHALL とする。登録済みの step 名が
記録される正常系では、検証付き変換は force cast と同じ値を返し、挙動を変えない MUST。

#### Scenario: 正常系で記録される step 名は force cast と同一

**Given** pipeline が登録済みの step（例: `code-review`）で中断点を記録する
**When** 該当箇所が `toStepName()` 経由で `resumePoint.step` を設定する
**Then** `resumePoint.step` は従来の force cast と同じ step 名になる

#### Scenario: resume の任意 step チェックは未確定 step を検証スキップする

**Given** resume 対象の state で `resumePoint` が無く `state.step` が未確定（falsy）である
**When** resume が開始 step チェック用の値を解決する
**Then** チェック対象は `undefined` となり、検証エラーを発生させずチェックがスキップされる
