# finish preflight が MERGED PR で UNKNOWN retry に詰まる問題の修正

## Meta

- **type**: bug-fix
- **slug**: fix-finish-merged-preflight

## 背景

`specrunner finish` を既に MERGED 状態の PR に対して実行すると、Phase 0 check 4 が mergeStateStatus=UNKNOWN で永久に retry → escalation する。MERGED PR は GitHub が mergeable 計算を行わないため UNKNOWN は正常な応答だが、preflight がそれを考慮していない。

## 要件

1. `src/core/finish/preflight.ts` の Phase 0 check 4 で、UNKNOWN retry の前に `state === "MERGED"` を判定し、MERGED なら `{ ok: true, data }` を返す
2. orchestrator の `prAlreadyMerged` path（TC-106）に到達できるようにする
3. MERGED PR への `specrunner finish` が Phase 1-3 skip + Phase 4 のみ実行で正常完了する

## 受け入れ基準

- [ ] MERGED 状態の PR に対して finish を実行しても escalation しない
- [ ] `bun run typecheck && bun test` が green
