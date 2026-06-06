# archive 後に managed marker が残り幽霊 job が表示される

## Meta

- **type**: bug-fix
- **slug**: archive-clear-managed-marker
- **base-branch**: main
- **adr**: false

## 背景

managed runtime の marker（`.specrunner/local/<slug>/marker.json`）は `cancel` 時（`cancel/runner.ts`）と managed teardown 時（`managed.ts`）に削除されるが、`archive` コマンド（`archive/orchestrator.ts`）では削除されない。

archive 後 marker が残ると、`job ls` の section 4（managed markers）が古い jobId を拾い、幽霊 job を表示するリスクがある。cancel・teardown は消すのに archive だけ抜けている対称性の欠落。

## 要件

1. `archive` 成功時に managed marker（`.specrunner/local/<slug>/marker.json`）を削除する（best-effort）。
2. local runtime の liveness sidecar（`.specrunner/local/<slug>/liveness.json`）も同様に archive 成功時に削除する（best-effort）。
3. marker / sidecar の削除失敗は archive 全体を失敗させない（best-effort、warning のみ）。

## スコープ外

- managed runtime の state 永続化先の変更（R3 `managed-slug-keyed-state` で対応）
- marker / sidecar のフォーマット変更

## 受け入れ基準

- [ ] managed job を archive 後、`.specrunner/local/<slug>/marker.json` が削除されている
- [ ] local job を archive 後、`.specrunner/local/<slug>/liveness.json` が削除されている
- [ ] 削除失敗時に archive 全体は成功し、stderr に warning が出る
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- archive orchestrator の Phase 2（worktree teardown）の後に best-effort で `fs.unlink` するだけ。managed.ts の `clearManagedMarker` と同じパターン。新規抽象は不要。
