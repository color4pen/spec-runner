# Proposal: Fix crash state and resume step resolution

**slug**: fix-crash-state-and-resume-step-resolution
**type**: bug-fix
**date**: 2026-05-08
**author**: color4pen

## Background

PR #116 の pipeline 実行中に 2 つの不具合が連鎖して発生した。implementer が「Branch does not exist after agent run」で失敗した際、(1) state が `running` のまま残り resume が拒否され、(2) 手動で state を修正して resume しても `resolveResumeStep()` が implementer でなく code-review から再開し、未完了のコードに対して無意味な review escalation が発生した。

## What Changes

### 1. pipeline catch パスに safety net を追加

- `pipeline.runInternal()` の catch（L154-160）: `.state` が付いていない throw に対し `store.fail()` で state を `failed` に設定。既存の `getStepOutcome()` → transition table → `escalate` → `awaiting-resume` フローに乗せる
- `pipeline.run()` の catch（L79-87）: `runInternal` を超えて throw が漏れた場合の最終防衛線。`status === "running"` なら `awaiting-resume` に遷移

### 2. `resolveResumeStep()` の default logic を失敗理由で分岐

- `from` 未指定 + crash/error（`iterationsExhausted === 0` or step が reviewer でない）: `resumePoint.step` そのものから再開
- `from` 未指定 + review exhaustion（`iterationsExhausted > 0` かつ reviewer step）: 対応する fixer から再開
- `--from` 明示指定: 既存の role-based mapping を維持（最優先）
- `resumePoint` null + `from` 未指定: 既存の fallback 挙動を維持

## Files Modified

- `src/core/pipeline/pipeline.ts` — catch パスに safety net 追加
- `src/core/resume/resolve-step.ts` — default logic を crash/exhaustion で分岐
- `tests/unit/core/pipeline/` — pipeline crash → awaiting-resume テスト追加
- `tests/unit/core/resume/resolve-step.test.ts` — crash/exhaustion 分岐テスト追加

## Impact

- **修正対象**: pipeline の全 step で crash した場合の state 遷移が安全になる
- **後方互換**: `--from` 指定時の挙動は一切変わらない。`from` 未指定 + `resumePoint` null の fallback も変わらない
- **既存テスト**: `from` 未指定テスト（L70-78）は `resumePoint` の `iterationsExhausted` に依存するため更新が必要

## Out of Scope

- resume 時に agent に失敗理由を伝える `--message` オプション
- cancel コマンド
- executor 内部のエラーハンドリング改善（executor は既に正しく `.state` を付けている。今回は executor の漏れを pipeline が救う defense in depth）
