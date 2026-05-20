# pipeline.ts の状態遷移を transitionJob 経由に移行する

## Meta

- **type**: refactoring
- **slug**: pipeline-transition-migration
- **base-branch**: main

## 背景

#75 Phase 1 で `src/state/lifecycle.ts` に `transitionJob` 純粋関数と `VALID_TRANSITIONS` マップを導入した（PR #180）。現在 `pipeline.ts` と `executor.ts` は `state.status = "..."` の直接代入で状態遷移を行っており、遷移バリデーションが効いていない。

Phase 2a として、pipeline 層の全遷移箇所を `transitionJob` 呼び出しに移行する。

## 要件

1. `pipeline.ts` の `running → awaiting-merge` 遷移（L253 付近）を `transitionJob(state, "awaiting-merge", { trigger: "pipeline", reason: "pipeline complete" })` に置換する
2. `pipeline.ts` の `running → awaiting-resume` 遷移（L86-101 の catch block、L260-273 の escalation）を `transitionJob` に置換する
3. `pipeline.ts` の `handleExhausted`（L367-411 付近）の `awaiting-resume` 遷移を `transitionJob` に置換する
4. `pipeline.ts` の history 直接操作（L158-171、L206-224 付近のスプレッド構文）を `appendHistoryEntry` 呼び出しに統一する（MAX_HISTORY_SIZE ガード漏れ防止）
5. `executor.ts` の timeout による `running → awaiting-resume` 遷移（L139-141 付近）を `transitionJob` に置換する
6. 遷移後の state は `transitionJob` の戻り値を使い、直接代入のスプレッド構文を排除する
7. `transitionJob` が返す `TransitionResult.state` をそのまま `store.persist()` に渡す

## スコープ外

- finish 層の遷移移行（Phase 2b で対応）
- resume コマンドの遷移移行（Phase 2c で対応）
- 永続化の一元化（Phase 3）
- `JobStateStore.fail()` の移行（Phase 3 で永続化統一時に対応）

## 受け入れ基準

- [ ] `pipeline.ts` に `state.status = "..."` の直接代入が存在しない
- [ ] `pipeline.ts` の history 操作が全て `appendHistoryEntry` 経由
- [ ] `executor.ts` の timeout 遷移が `transitionJob` 経由
- [ ] 既存テストが全て通る
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `transitionJob` は純粋関数のため、永続化（`store.persist()`）は呼び出し元の責務。この構造は変えない
- `JobStateStore.fail()` は Phase 3 の永続化統一まで残す。今回は `running → failed` の遷移のみ `transitionJob` に置換し、`fail()` メソッド自体の削除は行わない
- history の step-level ログ（ループ bookkeeping）は `appendHistoryEntry` を使うが、status 遷移の history は `transitionJob` が自動追記するため二重にならないよう注意


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/pipeline-transition-migration.md` by `merged-to-archive-consolidation`.
