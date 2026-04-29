## MODIFIED Requirements

### Requirement: 状態ファイルは固定スキーマに従う

各状態ファイルは MUST 以下の必須フィールドを持つ JSON オブジェクトである: `version` (number)、`jobId` (string, uuid v4)、`createdAt` (ISO8601)、`updatedAt` (ISO8601)、`request` (`{ path, title, type }`)、`repository` (`{ owner, name }`)、`session` (`{ id, agentId, environmentId } | null`)、`step` (string、現在実行中の step。`"propose" | "spec-review" | "spec-fixer"`)、`status` (`"running"` | `"success"` | `"failed"`)、`branch` (string | null)、`history` (Array<HistoryEntry>)、`error` (`{ code, hint, message }` | null)、`steps` (`Record<StepName, StepResult[]>`)。`steps[stepName]` は SHALL 配列であり、各要素は `{ iteration: number (1-origin), session: SessionInfo, verdict: "approved" | "needs-fix" | "escalation" | null, findingsPath: string | null, completedAt: ISO8601 | null, error: ErrorInfo | null }` を保持する。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。読み込み時に `steps` フィールドが欠落している場合、空オブジェクト `{}` で補う（version: 1 状態ファイルとの後方互換）。`steps[stepName]` がオブジェクト（旧形式）だった場合、SHALL 長さ 1 の配列 `[{ ...obj, iteration: 1 }]` に正規化してから読み込み結果として返す（読み込み層での migrate-on-read）。書き込みは常に新形式（配列）で行う。

#### Scenario: 必須フィールド検証

- **WHEN** 状態ファイルを読み書きする
- **THEN** 必須フィールドのいずれかが欠ける場合、読み込み時に `STATE_FILE_INVALID` エラーを発生させ、当該ファイルをスキップする。ただし `steps` フィールドの欠落は SHALL `STATE_FILE_INVALID` を発生させず、空オブジェクトで補う

#### Scenario: steps フィールドの記録（新形式・配列）

- **WHEN** propose step が完了し iter=1 の spec-review step が完了した
- **THEN** state.steps["propose"] が長さ 1 の配列、state.steps["spec-review"] が長さ 1 の配列であり、それぞれの要素は `{ iteration: 1, session: { id, agentId, environmentId }, verdict, findingsPath, completedAt, error }` の形式である

#### Scenario: spec-review verdict の記録（新形式）

- **WHEN** iter=1 の spec-review step が完了した
- **THEN** state.steps["spec-review"][0].verdict が `approved` / `needs-fix` / `escalation` のいずれかであり、findingsPath には `openspec/changes/<slug>/spec-review-result-001.md` が記録されている

#### Scenario: 旧形式の状態ファイル（オブジェクト）の読み込み

- **WHEN** 既存の状態ファイル `state.steps["spec-review"]` がオブジェクト `{ session, verdict, findingsPath, completedAt, error }` で書かれている
- **THEN** 読み込み層は SHALL `[{ ...obj, iteration: 1 }]` に正規化し、呼び出し側は新形式（配列）として state を扱う。正規化は in-memory のみで行われ、次回書き込み時（`writeJobState` 呼び出し時）に初めて配列形式でファイルに永続化される

#### Scenario: `specrunner ps` 経由での旧形式読み込み（書き込みなし経路）

- **WHEN** `specrunner ps` が旧形式（`steps[stepName]` がオブジェクト）の状態ファイルを読み込む
- **THEN** 読み込み層は in-memory で配列に正規化して ps コマンドに返す。`specrunner ps` は状態ファイルへの書き込みを行わないため、ファイル自体は旧形式のまま残る。次回 `specrunner run` 等が `writeJobState` を呼ぶまで永続化されない。`specrunner ps` は旧形式ファイルを観測した場合 `stderr` に `Warning: state file uses legacy format; run 'specrunner run' to migrate.` を出力する

### Requirement: 状態ファイルの step フィールドは実行中 step を指す

`state.step` は MUST 現在実行中の step 名を保持する。propose step 実行中は `"propose"`、spec-review step 実行中は `"spec-review"`、spec-fixer step 実行中は `"spec-fixer"` である。step 完了後に runPipeline が次 step を起動する直前に SHALL `state.step` を更新する。loop body 内での spec-fixer → spec-review 切り替えにおいても同様に更新する。

#### Scenario: step 遷移（loop 内含む）

- **WHEN** iter=1 の spec-review が `needs-fix` で完了し iter=2 の spec-fixer 起動直前
- **THEN** state.step が `"spec-review"` から `"spec-fixer"` に更新され、history に `step-transition` entry が append される

## ADDED Requirements

### Requirement: `getLatestStepResult` は最新 iteration の StepResult を返す

CLI は MUST `getLatestStepResult(state, stepName): StepResult | undefined` ヘルパを提供する。`state.steps[stepName]` が配列の場合は SHALL 末尾要素を返し、配列が空または stepName が未登録の場合は `undefined` を返す。読み込み層で旧形式が配列に正規化されているため、ヘルパ内部での場合分けは不要である。

#### Scenario: 配列の末尾を返す

- **WHEN** `state.steps["spec-review"]` が長さ 2 の配列で末尾要素の verdict が `approved`
- **THEN** `getLatestStepResult(state, "spec-review")` は末尾要素を返し `result.verdict === "approved"` である

#### Scenario: 未登録 step

- **WHEN** `state.steps["implementer"]` が存在しない
- **THEN** `getLatestStepResult(state, "implementer")` は `undefined` を返す

### Requirement: StepResult への push は iteration 番号を自動採番する

CLI は MUST `pushStepResult(state, stepName, partial): StepResult` ヘルパを提供する。`partial` には `session, verdict, findingsPath, completedAt, error` を渡す。ヘルパは SHALL 現在の `state.steps[stepName].length + 1` を `iteration` として補完し、新 StepResult を配列末尾に push して返す。`state.steps[stepName]` が未登録の場合、SHALL 空配列を初期化してから push する。

既存の merge-style `appendStepResult`（`src/state/schema.ts` 由来）は SHALL 本 delta 適用時に削除し、全呼び出し元（`propose.ts` / `spec-review.ts` 等）を `pushStepResult` 経由に置換する。`pushStepResult` と `getLatestStepResult` は pair ヘルパとして `src/state/helpers.ts` に同居させる。

#### Scenario: 1 件目の push

- **WHEN** `state.steps["spec-review"]` が未登録で `pushStepResult(state, "spec-review", partial)` を呼ぶ
- **THEN** `state.steps["spec-review"]` が長さ 1 の配列で末尾要素の `iteration === 1`

#### Scenario: 2 件目の push

- **WHEN** `state.steps["spec-review"]` が長さ 1 の配列で `pushStepResult(state, "spec-review", partial)` を呼ぶ
- **THEN** `state.steps["spec-review"]` が長さ 2 の配列で末尾要素の `iteration === 2`

### Requirement: `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` は retry 上限到達を示す

`runPipeline` の loop プリミティブが `onExceeded` 経由で書き込む `state.error` は MUST `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` の形式である。ここで `<NNN>` は 3 桁ゼロ埋めの iteration 番号（例: `001`）を示す。`state.steps["spec-review"]` の末尾要素の verdict は SHALL `escalation` に書き換えられている。

#### Scenario: retries exhausted の状態

- **WHEN** maxRetries=2 で iter=1 needs-fix → iter=2 needs-fix が起きる
- **THEN** state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` で、state.steps["spec-review"][1].verdict が `escalation` に書き換えられている。state.status は `success`（pipeline 自体は完走）
