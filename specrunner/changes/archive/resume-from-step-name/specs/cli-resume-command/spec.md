# Delta Spec: cli-resume-command

Baseline: `specrunner/specs/cli-resume-command/spec.md`

## MODIFIED Requirements

### Requirement: `--from` 指定時は既定を上書きして指定 role に対応する step から再開する

`--from` が受け付ける値を step 名 (`STEP_NAMES` の全 agent / CLI step) または legacy alias (`critic` / `fixer` / `creator`) に拡張する MUST。

#### Scenario: step 名を直接指定して再開

- **GIVEN** 任意の `resumePoint` 状態
- **WHEN** `specrunner resume <slug> --from <step-name>` を実行する（`<step-name>` は `AGENT_STEP_NAMES` または `CLI_STEP_NAMES` に含まれる値）
- **THEN** 指定された step から直接再開する（phase mapping なし）

#### Scenario: legacy alias `critic` を指定して再開（既存挙動維持）

- **GIVEN** 任意の `resumePoint` 状態
- **WHEN** `specrunner resume <slug> --from critic` を実行する
- **THEN** `resumePoint.step` の phase に応じて `spec-review`（spec phase）または `code-review`（code phase）から再開する

#### Scenario: legacy alias `fixer` を指定して再開（既存挙動維持）

- **GIVEN** 任意の `resumePoint` 状態
- **WHEN** `specrunner resume <slug> --from fixer` を実行する
- **THEN** `resumePoint.step` の phase に応じて `spec-fixer`（spec phase）または `code-fixer`（code phase）から再開する

#### Scenario: legacy alias `creator` を指定して再開（既存挙動維持）

- **GIVEN** 任意の `resumePoint` 状態
- **WHEN** `specrunner resume <slug> --from creator` を実行する
- **THEN** `resumePoint.step` の phase に応じて `design`（spec phase）または `implementer`（code phase）から再開する

#### Scenario: 不正値を指定した場合のエラー

- **WHEN** `specrunner resume <slug> --from <invalid>` を実行する（`<invalid>` は step 名にも legacy alias にも該当しない値）
- **THEN** 利用可能な step 名一覧と legacy alias 一覧を含むエラーメッセージを表示して終了する
