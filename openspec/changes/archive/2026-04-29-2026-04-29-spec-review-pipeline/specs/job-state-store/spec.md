## MODIFIED Requirements

### Requirement: 状態ファイルは固定スキーマに従う

各状態ファイルは MUST 以下の必須フィールドを持つ JSON オブジェクトである: `version` (number)、`jobId` (string, uuid v4)、`createdAt` (ISO8601)、`updatedAt` (ISO8601)、`request` (`{ path, title, type }`)、`repository` (`{ owner, name }`)、`session` (`{ id, agentId, environmentId } | null`)、`step` (string、現在実行中の step。`"propose" | "spec-review"`)、`status` (`"running"` | `"success"` | `"failed"`)、`branch` (string | null)、`history` (Array<HistoryEntry>)、`error` (`{ code, hint, message }` | null)、`steps` (`Record<StepName, StepResult>`)。`steps` は SHALL 各 step ごとに `{ session: SessionInfo, verdict: "approved" | "needs-fix" | "escalation" | null, findingsPath: string | null, completedAt: ISO8601 | null, error: ErrorInfo | null }` を保持する。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。読み込み時に `steps` フィールドが欠落している場合、空オブジェクト `{}` で補う（既存の version: 1 状態ファイルとの後方互換）。

#### Scenario: 必須フィールド検証

- **WHEN** 状態ファイルを読み書きする
- **THEN** 必須フィールドのいずれかが欠ける場合、読み込み時に `STATE_FILE_INVALID` エラーを発生させ、当該ファイルをスキップする。ただし `steps` フィールドの欠落は SHALL `STATE_FILE_INVALID` を発生させず、空オブジェクトで補う

#### Scenario: steps フィールドの記録

- **WHEN** propose step が完了し spec-review step が完了した
- **THEN** state.steps に `propose` キーと `spec-review` キーが両方存在し、それぞれ session.id と completedAt が記録されている

#### Scenario: spec-review verdict の記録

- **WHEN** spec-review step が完了した
- **THEN** state.steps["spec-review"].verdict が `approved` / `needs-fix` / `escalation` のいずれかであり、findingsPath には `openspec/changes/<slug>/spec-review-result.md` が記録されている

## ADDED Requirements

### Requirement: 状態ファイルの step フィールドは実行中 step を指す

`state.step` は MUST 現在実行中の step 名を保持する。propose step 実行中は `"propose"`、spec-review step 実行中は `"spec-review"` である。step 完了後に runPipeline が次 step を起動する直前に SHALL `state.step` を更新する。

#### Scenario: step 遷移

- **WHEN** propose step が完了し spec-review step が起動された
- **THEN** state.step が `"propose"` から `"spec-review"` に更新され、history に `step-transition` entry が append される
