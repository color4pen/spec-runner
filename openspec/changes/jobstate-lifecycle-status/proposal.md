## Why

Pipeline が escalation で停止した job の status が `running` のまま残る。`Pipeline.runInternal` の `escalate` 分岐は `break` するだけで status を更新しない。結果として:

1. `specrunner ps` が停止済み job を「実行中」と表示する
2. resume 対象かどうか外部から判別できない
3. `handleExhausted` は `failed` に遷移するが、loop exhaustion は手動修正で再開可能なケースを含む

resume コマンドの前提として、lifecycle status の整理と ResumePoint schema が必要。

## What Changes

- `JobStatus` に `awaiting-resume` と `canceled` を追加。`failed` は SESSION_CREATE_FAILED 等の本当に fatal なケースに限定
- `JobState` に `resumePoint?: ResumePoint | null` を追加。`awaiting-resume` 時のみ非 null
- `Pipeline.runInternal` の `escalate` 分岐で `status: "awaiting-resume"` + `resumePoint` を書き込む
- `handleExhausted` の `status: "failed"` を `status: "awaiting-resume"` に変更
- SIGINT handler で worktree を即削除せず `awaiting-resume` に遷移して state を persist してから exit
- `ACTIVE_STATUSES` に `awaiting-resume` を追加し `ps` に表示
- `assertJobFinishable` と `validateJobState` を exhaustive に更新

## Capabilities

### New Capabilities

- `awaiting-resume-status`: `JobStatus` の新値。escalation / loop exhaustion / SIGINT で halt した resumable な job を表す
- `canceled-status`: `JobStatus` の新値。将来の cancel コマンド用 schema 先行追加
- `resume-point`: `ResumePoint` interface。失敗した step・理由・exhausted iteration 数を記録

### Modified Capabilities

- `job-state-store`: JobStatus に `awaiting-resume` / `canceled` を追加、`ResumePoint` schema を追加、`validateJobState` に status validation を追加
- `step-execution-architecture`: Pipeline の `escalate` 分岐と `handleExhausted` の status 遷移ロジックを変更
- `ps-command`: `ACTIVE_STATUSES` に `awaiting-resume` を追加、stale running job の `(stale?)` 表示
- `finish-command`: `assertJobFinishable` を exhaustive switch に拡張（`awaiting-resume` → resume 案内、`canceled` → 操作不要）
- `sigint-handling`: worktree 即削除から `awaiting-resume` persist + worktree 保持に変更

## Impact

- **コード**: `src/state/schema.ts`、`src/core/pipeline/pipeline.ts`、`src/cli/run.ts`、`src/cli/ps.ts`、`src/core/finish/job-state-update.ts`
- **API / 動作変更**: escalation で halt した job の status が `running` → `awaiting-resume` に変わる（bugfix 性質）。loop exhaustion が `failed` → `awaiting-resume` に変わる
- **後方互換性**: 既存の `running` 状態の stale job は on-read migration しない。`ps` で `(stale?)` 表示で対応
- **テスト**: `bun run typecheck && bun run test` が green であること
