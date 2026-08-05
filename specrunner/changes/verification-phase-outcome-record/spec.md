# Spec: verification の失敗 phase を StepRun outcome に構造化記録する

## Requirements

### Requirement: verification は各 iteration の phase 結果を step-attempt outcome に構造化記録する

verification step の各実行（iteration）について、システムは実行された全 phase の
**phase 名・status（passed / failed / skipped）・exit code** を、`events.jsonl` の該当
`step-attempt` レコードの `outcome.verificationPhases` に機械可読な配列として記録 SHALL する。
この記録は `verification-result.md` の再パースを伴っては MUST NOT ならない
（in-memory の `VerificationResult.phases` から得る）。

各要素は次の形を MUST 満たす:

- `phase`: string — phase 名または command ラベル
- `status`: `"passed" | "failed" | "skipped"`
- `exitCode`: `number | null` — skipped / 非 spawn phase は `null`

#### Scenario: 失敗 iteration の phase が step-attempt から取得できる

**Given** verification が build phase で exit code 1 で失敗した iteration
**When** その iteration の `step-attempt` レコードを `events.jsonl` から読む
**Then** `outcome.verificationPhases` に `phase:"build", status:"failed", exitCode:1` を含む要素が存在し、markdown を一切パースせずに phase 名・status・exit code が取得できる

#### Scenario: passed iteration でも実行された全 phase の status が記録される

**Given** verification が passed し、build/typecheck/test は実行、security/test-coverage は skip された iteration
**When** その iteration の `step-attempt` レコードを読む
**Then** `outcome.verificationPhases` に実行 phase は `status:"passed"`、skip された phase は `status:"skipped"` として全 phase 分の要素が記録されている

### Requirement: 複数 iteration の phase 結果は独立に記録され上書きされない

同一 job 内で verification が複数 iteration 実行された場合、システムは各 iteration の phase 結果を
独立した `step-attempt` レコードとして append-only に記録 SHALL する。後続 iteration の記録が
先行 iteration の記録を上書きしては MUST NOT ならない。

#### Scenario: 失敗 → 修正 → 成功で両 iteration の phase が残る

**Given** iteration 1 が build 失敗、iteration 2 が全 phase passed で終わった job
**When** `events.jsonl` の verification `step-attempt` レコード群を fold で再構築する
**Then** iteration 1 のレコードは build failed を、iteration 2 のレコードは全 phase passed を保持し、iteration 2 が iteration 1 の phase 記録を上書きしていない

### Requirement: verification-result.md の出力・パス・書式は不変

システムは `verification-result.md` の生成先・書式・内容を変更しては MUST NOT ならない。
build-fixer が `verificationResultPath(slug)` を読む経路（reads 宣言・findingsPath）も変更しては
MUST NOT ならない。

#### Scenario: markdown の生成パスと書式が現状のまま

**Given** verification step が実行された
**When** `verification-result.md` の生成パスと書式を既存テストで検証する
**Then** 既存テストは無変更で green であり、パス（`specrunner/changes/<slug>/verification-result.md`）も書式も現状と同一

#### Scenario: build-fixer の読み取り経路が不変

**Given** build-fixer step の定義
**When** `reads()` 宣言と `enrichContext` / `buildMessage` の findingsPath を確認する
**Then** いずれも `verificationResultPath(deps.slug)` を参照しており、本 request で変更されていない

### Requirement: verdict 判定と routing は不変

システムは `parseResult` が返す verdict（passed / failed / null）と、それに基づく遷移・iteration
予算・verification 失敗 → build-fixer 遷移を、現状と同一に保つ SHALL。本 request は記録の追加であり
routing の変更では MUST NOT ない。

#### Scenario: verdict 経路が現状と同一

**Given** verification が failed verdict を返す iteration
**When** verdict 導出と後続遷移を既存テストで検証する
**Then** verdict は failed、遷移は build-fixer で、verdict 系の既存テストは無変更で green

### Requirement: VERIFICATION exhaustion hint は実在情報を案内する

verification loop 枯渇時のエラー hint（`LOOP_ERROR_CODES` の `VERIFICATION` エントリ）は、実在する
`verification-result.md`、または step-attempt outcome に記録された phase 情報を案内 SHALL する。
生成されない連番ファイル（`verification-result-${nnn}.md`）を案内しては MUST NOT ならない。
他 step（`spec-review` 等、連番ファイルが実在する）の hint は変更しては MUST NOT ならない。

#### Scenario: VERIFICATION hint が実在ファイルを案内する

**Given** verification が iteration 予算を使い切って枯渇した
**When** `LOOP_ERROR_CODES[VERIFICATION].hint` が生成する文言を検証する
**Then** 文言は `verification-result.md`（または outcome の phase 情報）を案内し、`verification-result-001.md` のような連番ファイルを案内しない

#### Scenario: 他 step の hint は無変更

**Given** `LOOP_ERROR_CODES` の spec-review / code-review / conformance / regression-gate エントリ
**When** それらの hint を検証する
**Then** いずれも連番付きの実在する result ファイルを案内したまま変更されていない
