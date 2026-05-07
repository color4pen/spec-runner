# Spec Review Result — jobstate-lifecycle-status

- **change**: jobstate-lifecycle-status
- **type**: spec-change
- **iteration**: 1
- **verdict**: approved

## Summary

仕様は request.md の全 21 要件を網羅し、設計判断（D1–D8）の根拠が明確。delta spec のシナリオカバレッジが高く、既存 spec との参照関係も正確。tasks.md は Phase 順序が依存関係に沿っており、コードスニペット付きで implementer の迷いが少ない構成。

CRITICAL/HIGH の findings なし。以下 MEDIUM 1 件、LOW 2 件を記録する。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | tasks.md (Task 2.4) | `handlePostPipelineState` の先頭にある `SPEC_REVIEW_RESULT_NOT_FOUND` guard が `awaiting-resume` check より先に発火する。新設計では SPEC_REVIEW_RESULT_NOT_FOUND は non-fatal（awaiting-resume に遷移）だが、既存 guard が `onFailure()` を呼び error メッセージを表示して return 1 する。worktree は Task 3.2 で保護されるが、ユーザーに resume 可能である旨が表示されない | Task 2.4 で `awaiting-resume` status check を `SPEC_REVIEW_RESULT_NOT_FOUND` guard **より前**に配置する。または SPEC_REVIEW_RESULT_NOT_FOUND guard 内で `status === "awaiting-resume"` を分岐し resume メッセージを出す |
| 2 | LOW | consistency | design.md (D8) / request.md (Req 9) | request.md Req 9 が `AGENT_STEP_FAILED` を fatal error の例示に含めるが、design.md D8 の `FATAL_ERROR_CODES` には含まれていない。design の「明示リストで意識的に判断」方針は妥当だが、request との乖離が未説明 | design.md D8 の Rationale に `AGENT_STEP_FAILED` を除外した理由を 1 文追記する（例: agent step failure は retry 可能なため non-fatal とする） |
| 3 | LOW | maintainability | tasks.md (Task 2.4) | `(finalState as any).resumePoint` の any cast。Phase 1 (Task 1.3) で `JobState` に `resumePoint` を追加済みのため不要 | `finalState.resumePoint` に変更。Phase 1 完了後は型が通る |

## Detailed Assessment

### Completeness (request ↔ spec)

全 21 要件が proposal.md / design.md / tasks.md / delta specs のいずれかでカバーされている。

- Req 1–3 (JobStatus 拡張): delta spec `job-state-store.delta.md` MODIFIED Requirement
- Req 4–6 (ResumePoint): delta spec `job-state-store.delta.md` NEW Requirement
- Req 7–9 (Pipeline escalation): delta spec `step-execution-architecture.delta.md` MODIFIED Requirement + design D3/D4/D8
- Req 10–12 (SIGINT): delta spec `step-execution-architecture.delta.md` NEW Requirement + design D5
- Req 13–14 (ps): delta spec `job-state-store.delta.md` MODIFIED Requirement (stale + ACTIVE_STATUSES)
- Req 15–16 (assertJobFinishable): tasks.md Task 4.3 exhaustive switch
- Req 17 (validateJobState): delta spec `job-state-store.delta.md` NEW Requirement + tasks.md Task 1.4–1.5
- Req 18–19 (backward compat): design D7 + delta spec stale scenario
- Req 20–21 (delta spec 存在): 2 ファイル確認済み

### Consistency (spec ↔ existing codebase)

- 既存 `job-state-store/spec.md` の JobStatus は `"running" | "success" | "failed" | "terminated" | "archived"` だが、実コードは既に `success` → `awaiting-merge` に on-read remap 済み。delta spec は実コードに合わせた `awaiting-merge` を使用しており正しい。`success` → `awaiting-merge` のリネームは本 change の scope 外（既存 spec debt）
- `SPEC_REVIEW_RETRIES_EXHAUSTED` scenario の既存 spec は `state.status は success` と記述するが、実コードは `failed`。delta spec が `awaiting-resume` に置き換えるのは既存 spec / code 両方からの deviation だが、design D4 の根拠が妥当
- `StepName` 型は `src/state/schema.ts` L14 で定義済み。`ResumePoint.step: StepName` は型安全

### Feasibility

- Phase 1 (schema) → Phase 2 (pipeline) → Phase 3 (SIGINT) → Phase 4 (ps/finish) → Phase 5 (tests) の順序は依存グラフに沿っており実行可能
- FATAL_ERROR_CODES の明示リスト方式は、新 error code 追加時に意識的な判断を強制する良い設計
- SIGINT handler での best-effort persist は signal handler の制約下で妥当

### Scenarios Coverage (delta specs)

`job-state-store.delta.md`: 11 scenarios（status persistence 2、resumePoint 設定 4、legacy compat 2、validation 2、stale detection + active filter 3）
`step-execution-architecture.delta.md`: 5 scenarios（escalation 3、SIGINT 2）

カバレッジは十分。境界条件（fatal vs non-fatal、legacy state、concurrent signal）も含まれている。
