# Spec: resume の再開位置解決を resumePoint の記録から素直に決定する

## Requirements

### Requirement: resolveResumeStep は記録された resumePoint.step を再推理せず返す

`--from` が未指定で `resumePoint` が存在する場合、`resolveResumeStep` は `resumePoint.step` をそのまま再開 step として返さ MUST。過去の `state.steps` 履歴や `iterationsExhausted` を読んで再開 step を別の step へ作り変える re-inference を行ってはなら MUST NOT。

#### Scenario: crash で記録された step から再開する

**Given** `resumePoint = { step: "implementer", iterationsExhausted: 0 }` で `--from` 未指定
**When** `resolveResumeStep` を呼ぶ
**Then** `"implementer"` を返す

#### Scenario: reviewer が記録されていればその reviewer を返す

**Given** `resumePoint = { step: "code-review", iterationsExhausted: 0 }` で `--from` 未指定
**When** `resolveResumeStep` を呼ぶ
**Then** `"code-review"` を返す（fixer への作り変えをしない）

#### Scenario: fixer が記録されていればその fixer を返す（fixer-empty 推理なし）

**Given** `resumePoint = { step: "code-fixer", iterationsExhausted: 0 }`、`state.steps["code-fixer"]` が空、`state.steps["code-review"]` の最終 verdict が `needs-fix`、`--from` 未指定
**When** `resolveResumeStep` を呼ぶ
**Then** `"code-fixer"` を返す（対の loop step へ戻す推理をしない）

### Requirement: --from <step-name> は記録より優先して任意 step から再開する

`--from` に登録済みの step 名が与えられた場合、`resolveResumeStep` は `resumePoint` の内容に関わらずその step 名を返さ MUST。

#### Scenario: --from が resumePoint を上書きする

**Given** `resumePoint = { step: "code-fixer", iterationsExhausted: 0 }`
**When** `--from code-review` を指定して `resolveResumeStep` を呼ぶ
**Then** `"code-review"` を返す

#### Scenario: --from に未登録の値を与えるとエラーになる

**Given** 任意の `resumePoint`
**When** `--from bogus-step`（未登録の値）を指定して `resolveResumeStep` を呼ぶ
**Then** 有効な step 名を列挙したエラーを throw する（legacy alias は列挙に含めない）

### Requirement: legacy alias を撤去する

`resolveResumeStep` および CLI の `--from` は legacy alias（`critic` / `fixer` / `creator`）を受け付けてはなら MUST NOT。これらの値は未登録値として扱われ MUST。

#### Scenario: --from fixer は受け付けられない

**Given** 任意の `resumePoint`
**When** `--from fixer` を指定して `resolveResumeStep` を呼ぶ
**Then** 未登録値としてエラーを throw する（spec-fixer / code-fixer 等の step へ解決しない）

### Requirement: resumePoint が null かつ --from 未指定なら推測せずエラーにする

`resumePoint` が null で `--from` も未指定の場合、`specrunner resume` は再開 step を推測してはなら MUST NOT。利用者に `--from` での明示指定を促すエラーを出し、非ゼロ終了し MUST。

#### Scenario: 再開位置不明エラー

**Given** `resumePoint` が null の job 状態
**When** `--from` を付けずに `specrunner resume <slug>` を実行する
**Then** stderr に「再開位置が不明です。`--from` で再開 step を指定してください」を出力し、exit code 1 で終了する

#### Scenario: null resumePoint でも --from があれば再開する

**Given** `resumePoint` が null の job 状態
**When** `--from spec-fixer` を付けて `specrunner resume <slug>` を実行する
**Then** `spec-fixer` から pipeline を再開する

### Requirement: 枯渇後は対の fixer step を resumePoint に記録する

reviewer の loop が反復上限に達して枯渇したとき、`handleExhausted` は `resumePoint.step` に「枯渇した reviewer の対の fixer step」を記録し MUST。これにより resume は枯渇した reviewer ではなく fixer から再開し、reviewer 再実行による再枯渇を避け MUST。

#### Scenario: code-review 枯渇 → code-fixer から再開

**Given** code-review が反復上限に達して枯渇する
**When** pipeline が `handleExhausted` で `awaiting-resume` へ遷移する
**Then** `resumePoint.step` は `"code-fixer"` になる

#### Scenario: spec-review 枯渇 → spec-fixer から再開

**Given** spec-review が反復上限に達して枯渇する
**When** pipeline が `handleExhausted` で `awaiting-resume` へ遷移する
**Then** `resumePoint.step` は `"spec-fixer"` になる

#### Scenario: 枯渇の診断情報は維持される

**Given** いずれかの reviewer loop が枯渇する
**When** `handleExhausted` が `resumePoint` を記録する
**Then** error code（例: `CODE_REVIEW_RETRIES_EXHAUSTED`）と `exhaustionPhase` は従来通り記録される（`resumePoint.step` のみが fixer へ変わる）
