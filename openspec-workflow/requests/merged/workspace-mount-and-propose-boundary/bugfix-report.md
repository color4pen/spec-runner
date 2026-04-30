# Bugfix Report: workspace-mount-and-propose-boundary

## Meta

- **reported**: 2026-04-30
- **severity**: normal
- **status**: investigating

## Symptom

- **何が起きたか**: dogfooding-001 の 2 回目投入で、(A) propose agent が README.md を直接 +7 行編集（越境）、(B) spec-review が「change folder が存在しない」として escalate し halt
- **発生条件**: `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` 実行時。propose 完了後の各 step の Anthropic session
- **エラーメッセージ**: spec-review session で "The change folder `openspec/changes/readme-status-section` doesn't exist yet"

## Reproduction

- **再現手順**:
  1. `cd ~/Documents/GitHub/spec-runner`
  2. `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md`
  3. propose 段階で README.md 編集が発生し、spec-review で escalation
- **再現結果**: 既に再現済み（job a6150b33-0f2a-4d27-abbc-80c720789dab、log /tmp/dogfooding-002-run.log、session sesn_011CaZc7grG2dVMzFrRce3sf / sesn_011CaZcNd9BSyUq68KbvJhsi）

## Fix

- **修正内容**: (1) workspace branch propagation 実装（SessionClient port に branch 追加、Anthropic adapter で checkout 渡す、各 step が state.branch 渡す、defensive fallback 削除）。(2) propose system prompt に Workflow context + Path-fence + user request override 追加。(3) spec-review-system.ts の陳腐化コメント削除。
- **変更ファイル**: TBD（修正フェーズで確定）

## Verification

- **修正確認**: 既存テスト通過 + dogfooding e2e PASS（実投入は本 PR merge 後）
- **リグレッション**: Build _ | Type _ | Lint _ | Test _
