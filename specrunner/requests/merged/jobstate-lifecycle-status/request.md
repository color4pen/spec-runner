# JobState lifecycle status の再設計 + awaiting-resume 追加

## Meta

- **type**: spec-change
- **slug**: jobstate-lifecycle-status

## 背景

Pipeline が escalation で停止した job の status が `running` のまま残る。resume 対象かどうか判別できず、ps の表示も不正確。loop exhaustion は `failed` になるが、手動修正すれば再開可能なケースも含まれている。

resume コマンドの前提として、lifecycle status と ResumePoint の schema 定義が必要。

## 要件

### 1. JobStatus の拡張

1. `awaiting-resume` を追加: escalation / loop exhaustion で halt した job
2. `canceled` を追加: 将来の cancel コマンド用（command 未実装でも schema に先行追加）
3. `failed` は本当に再開不能なケースのみ（SESSION_CREATE_FAILED 等）

最終的な JobStatus:
```typescript
type JobStatus = "running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled";
```

### 2. ResumePoint の追加

4. `JobState` に `resumePoint?: ResumePoint | null` を追加
5. ResumePoint の定義:
```typescript
interface ResumePoint {
  step: StepName;           // 失敗した step
  reason: string;           // human-readable な理由
  iterationsExhausted: number;
}
```
6. `status === "awaiting-resume"` の時のみ非 null

### 3. Pipeline の escalation 遷移

7. `Pipeline.runInternal` の `escalate` 分岐で `status: "awaiting-resume"` + `resumePoint` を書き込む
8. `handleExhausted` の `status: "failed"` を `status: "awaiting-resume"` に変更（loop exhaustion は resumable）
9. `failed` は SESSION_CREATE_FAILED / AGENT_STEP_FAILED 等の本当に fatal なケースのみ

### 4. SIGINT の挙動変更

10. SIGINT handler で worktree を即削除するのではなく、`status: "awaiting-resume"` に遷移して state を persist してから exit
11. worktree は残す（resume 時に再利用）
12. orphan worktree は `specrunner rm --all-terminated` や `git worktree prune` で回収

### 5. ps の更新

13. `ACTIVE_STATUSES` に `awaiting-resume` を追加
14. ps の STATUS 列に `awaiting-resume` を表示

### 6. assertJobFinishable の更新

15. `awaiting-resume` を exhaustive switch に追加（finish 不可、resume を案内）
16. `canceled` も追加（既に終結、操作不要）

### 7. validateJobState の更新

17. `VALID_STATUSES` set を追加し、unknown status を reject する

### 8. backward compat

18. 既存の escalation-halted job（`status: "running"` だが実際は放置）は on-read migration しない
19. `specrunner ps` で `running` かつ `updatedAt` が一定時間以上前の job に `(stale?)` 表示

### 9. delta spec

20. `job-state-store` spec に `awaiting-resume` / `canceled` / `ResumePoint` を追加
21. `step-execution-architecture` spec に Pipeline の escalation 遷移を追加

## 受け入れ基準

- [ ] escalation で halt した job の status が `awaiting-resume` になる
- [ ] loop exhaustion で halt した job の status が `awaiting-resume` になる
- [ ] `specrunner ps` に `awaiting-resume` が表示される
- [ ] SIGINT で worktree が残り status が `awaiting-resume` になる
- [ ] `assertJobFinishable` が `awaiting-resume` / `canceled` を正しく処理する
- [ ] `validateJobState` が unknown status を reject する
- [ ] delta spec が存在し `openspec validate` が pass する
- [ ] `bun run typecheck && bun run test` が green

## 補足

### architect 評価済み

- `awaiting-resume` 独立 status が `failed` + `resumable` flag より妥当（exhaustiveness check、ps 表示の自然さ）
- ResumePoint は JobState 直下に埋め込み（atomic write、error field と同形パターン）
- `role` フィールドは不要（step name から導出可能）
- Pipeline 内での直接実装が初手として妥当（Issue #75 で state machine に集約は別途）

### 関連 issue

- Issue #75: JobStatus state machine 化（本 request の上位）
- Issue #76: assertJobFinishable exhaustive switch（本 request に含む）
- Issue #73: cancel hint 文言（本 request で `awaiting-resume` → resume 案内に修正）
- Issue #61: cancel 設計（schema 先行追加のみ、command は別 request）
