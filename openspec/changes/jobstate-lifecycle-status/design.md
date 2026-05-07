## Context

spec-runner の Pipeline は table-driven state machine で、各 step の outcome を transition table から引いて次 step を決定する。terminal は `end`（正常完了）と `escalate`（異常停止）の 2 つ。

現状の問題:

- `escalate` terminal は `break` するだけで status を更新しない → `running` のまま残る
- `handleExhausted` は `status: "failed"` に遷移するが、loop exhaustion は手動修正で再開可能
- SIGINT handler は worktree を即削除する → resume 不可能

`JobStatus` は現在 `"running" | "awaiting-merge" | "failed" | "terminated" | "archived"` の 5 値。resume コマンドの前提として、resumable な halt 状態を明示する新 status が必要。

architect 評価済み: `awaiting-resume` 独立 status が `failed` + `resumable` flag より妥当（exhaustiveness check、ps 表示の自然さ）。

## Goals / Non-Goals

**Goals:**

- escalation / loop exhaustion / SIGINT で halt した job を `awaiting-resume` status に遷移させる
- `ResumePoint` schema で halt 位置を記録し、将来の resume コマンドの入力とする
- `failed` を本当に fatal なケースのみに限定する
- `canceled` を schema に先行追加し、cancel コマンド実装時の schema 変更を不要にする
- `ps` / `assertJobFinishable` / `validateJobState` を新 status に対応させる
- 既存テスト green を維持する

**Non-Goals:**

- resume コマンドの実装（別 request）
- cancel コマンドの実装（別 request。schema のみ先行追加）
- 既存 stale job の on-read migration（`ps` の `(stale?)` 表示で対応）
- state machine のフル抽象化（Issue #75 の scope）

## Decisions

### D1. `awaiting-resume` を独立 status として追加

**Decision**: `JobStatus` に `"awaiting-resume"` を追加。`failed` + `resumable: boolean` flag ではなく独立値。

```typescript
type JobStatus = "running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled";
```

**Rationale**:

- TypeScript の exhaustive switch で `awaiting-resume` を明示的にハンドルできる（`failed` + flag だと flag の確認漏れが型で検出できない）
- `ps` 表示が自然: `awaiting-resume` vs `failed (resumable)`
- `awaiting-merge` との命名の一貫性

### D2. ResumePoint は JobState 直下に埋め込み

**Decision**: `JobState` に `resumePoint?: ResumePoint | null` を追加。

```typescript
interface ResumePoint {
  step: StepName;
  reason: string;
  iterationsExhausted: number;
}
```

- `status === "awaiting-resume"` のときのみ非 null
- `status` と `resumePoint` は同一 JSON ファイル内で atomic write される

**Rationale**: `ErrorInfo` と同形のパターン（`error` フィールドも JobState 直下）。別ファイルにすると atomic write の保証が崩れる。

**Alternatives considered**:

- **A. `error` フィールドを使い回す**: `error.code` で resume 可能かを判定 → error は「障害情報」、resumePoint は「再開地点」で意味が異なる。同居させると error がない resumable halt（SIGINT）を表現できない
- **B. 別 JSON ファイルに分離**: atomic write が 2 ファイルに分散し、状態の不整合リスク

### D3. Pipeline escalate terminal で `awaiting-resume` に遷移

**Decision**: `Pipeline.runInternal` の `nextStep === "escalate"` ブロックで:

- `state.status` がまだ `"running"` の場合: `awaiting-resume` + `resumePoint` を書き込む
- `state.status` が既に `"failed"` かつ fatal error code の場合: `failed` のまま保持

fatal error code の判定: `SESSION_CREATE_FAILED` / `AGENT_STEP_FAILED` のように、session/agent 基盤が壊れていて再試行しても回復しないケース。

**Rationale**: escalation verdict は「人間の判断が必要」を意味し、修正後に同じ step から再開可能。一方 SESSION_CREATE_FAILED は API key 不正など基盤問題であり、pipeline 再開ではなく設定修正が必要。

### D4. handleExhausted は `awaiting-resume` に遷移

**Decision**: `handleExhausted` の `status: "failed"` を `status: "awaiting-resume"` に変更。`resumePoint` にはexhausted loop の step 名と iteration 数を記録。

**Rationale**: loop exhaustion は「N 回試したが approved にならなかった」であり、人間が手動修正すれば再開可能。`failed` は本来の意味（回復不能）に限定する。

### D5. SIGINT で worktree を保持し `awaiting-resume` に遷移

**Decision**: SIGINT handler を以下に変更:

1. `status: "awaiting-resume"` + `resumePoint` を persist
2. worktree は削除しない（resume 時に再利用）
3. `process.exit(130)` で終了

orphan worktree は `specrunner rm --all-terminated` や `git worktree prune` で回収。

**Rationale**: SIGINT は「一時中断」の意図が多い（ユーザーが意図的に止めた）。worktree を消すと resume 不可能。保持しておけば resume コマンドでそのまま再開できる。

**Trade-off**: worktree が残るため disk 消費。ただし orphan cleanup の手段は既に存在する。

### D6. `canceled` は schema 先行追加のみ

**Decision**: `JobStatus` に `"canceled"` を含めるが、cancel コマンドは実装しない。`assertJobFinishable` で `canceled` を「既に終結」として処理する。

**Rationale**: cancel コマンド（Issue #61）は別 request。schema だけ先に入れておけば、cancel 実装時に JobStatus の型変更が不要になる。`assertJobFinishable` の exhaustive switch が compile error を出さないためにも今入れる必要がある。

### D7. 既存 stale job は on-read migration しない

**Decision**: 既存の `status: "running"` だが実際は放置されている job は migration しない。`specrunner ps` で `updatedAt` が一定時間（1 時間）以上前の `running` job に `(stale?)` を表示する。

**Rationale**: on-read migration は「いつ stale か」の判定が曖昧。ユーザーが目視で判断するのが最も安全。1 時間は pipeline の最長実行時間（~30 分）の 2 倍を基準とした閾値。

### D8. fatal error code の明示的リスト

**Decision**: `awaiting-resume` に遷移しない fatal error code を明示的に定義:

```typescript
const FATAL_ERROR_CODES: Set<string> = new Set([
  "SESSION_CREATE_FAILED",
  "CONFIG_MISSING",
  "CONFIG_INCOMPLETE",
  "CONFIG_INVALID",
]);
```

Pipeline の escalate handler で `state.error?.code` がこのセットに含まれる場合は `failed` を維持。

**Rationale**: 暗黙の判定（「error があったら failed」）は false positive が多い。明示リストにすることで、新 error code 追加時に「fatal か resumable か」を意識的に判断させる。

## Risks / Trade-offs

- **[Risk] `awaiting-resume` の追加で既存の exhaustive switch がコンパイルエラーになる** → これは意図通り。未対応箇所を型で検出できる。tasks.md で全箇所を洗い出す
- **[Risk] SIGINT で worktree を残すと disk が溜まる** → orphan cleanup は既存（`git worktree prune`）。将来の `specrunner gc` で対応
- **[Risk] `handleExhausted` が `awaiting-resume` になると、既存の error.code ベースの判定ロジックに影響** → `error` フィールド自体は残す（exhaustion 情報として有用）。`status` と `error` は独立した情報
- **[Trade-off] stale? 表示の閾値 1 時間はハードコード** → config 化は過剰。将来変更が必要なら定数として抽出済みなので容易
