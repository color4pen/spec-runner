# finish Phase 2 push 後の merge state polling を改善する

## Meta

- **type**: spec-change
- **slug**: finish-phase2-merge-state-polling

## 背景

`specrunner finish` の Phase 2 で feature branch を push した後、Phase 3 の `gh pr merge` が「Base branch was modified」で失敗する。push により PR の HEAD が変わり、GitHub が mergeability を再計算するまでの間に merge を試みるため。

現在の `fetchPrViewWithRetry` は `mergeStateStatus === UNKNOWN` のみを retry 条件としているが、push 後は UNKNOWN 以外の状態（CLEAN でありながら merge 不可）も発生する。

## 要件

1. Phase 2 push 後の polling を改善: `mergeStateStatus` が `CLEAN` になるまで retry する（UNKNOWN 以外の非 CLEAN 状態も retry 対象にする）
2. retry 条件: `mergeStateStatus !== "CLEAN"` の間は retry する。最大 5 回、3 秒間隔
3. retry 上限到達時は現在の mergeStateStatus で Phase 3 に進む（escalation しない — merge が通る可能性があるため）
4. `cli-finish-command` spec に Phase 2→3 間の polling を delta spec として追加

## 受け入れ基準

- [ ] Phase 2 push 後に mergeStateStatus が CLEAN になるまで polling する
- [ ] push 直後の merge が「Base branch was modified」で失敗しない
- [ ] delta spec が `openspec validate` を pass する
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/finish-phase2-merge-state-polling.md` by `merged-to-archive-consolidation`.
