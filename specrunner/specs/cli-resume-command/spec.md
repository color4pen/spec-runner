## Purpose

TBD
## Requirements

### Requirement: resume の既定動作は state の最終 step + verdict に基づき決定する

`--from` 未指定時、resume は state に記録された `resumePoint` と `steps` journal を分析して再開ステップを決定する MUST。

#### Scenario: fixer-empty mismatch (loop step needs-fix で中断)

- **GIVEN** `resumePoint.step` が fixer step (code-fixer / spec-fixer / build-fixer) である
- **AND** `state.steps[fixer]` が空（fixer が未実行）
- **AND** 対応する loop step の最終 verdict が `needs-fix` または `failed`
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** 対応する loop step (code-review / spec-review / verification) から再開する

#### Scenario: fixer が実際に実行済み (crash restart)

- **GIVEN** `resumePoint.step` が fixer step である
- **AND** `state.steps[fixer]` が非空（fixer が 1 回以上実行済み）
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** fixer step から再開する（= crash restart、既存挙動維持）

#### Scenario: reviewer step で exhaustion (iterationsExhausted > 0)

- **GIVEN** `resumePoint.step` が reviewer step (spec-review / code-review) である
- **AND** `resumePoint.iterationsExhausted > 0`
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** 対応する fixer step から再開する（= review exhaustion、既存挙動維持）

#### Scenario: crash (iterationsExhausted = 0)

- **GIVEN** `resumePoint.step` が任意の step で `iterationsExhausted = 0`
- **AND** fixer-empty mismatch に該当しない
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** `resumePoint.step` から再開する（= crash restart、既存挙動維持）

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

### Requirement: resumePoint が null かつ --from 未指定のとき resume を拒否する

`resumePoint` が null で `--from` も未指定の場合、resume は MUST エラーを返す。

#### Scenario: resumePoint null + from undefined

- **WHEN** `resumePoint` が null の状態で `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** stderr に「再開位置が不明です」を出力し exit code 1 で終了する
