# Review Feedback: job-state-store-di — Iteration 2

- **reviewer**: code-review agent
- **date**: 2026-05-22
- **verdict**: approved

---

## Summary

iteration 1 で指摘した P2 3 件（P2-01 / P2-02 / P2-03）がすべて修正されている。新たな P0/P1/P2 は存在しない。

code-fixer commit (`3c18ac4`) の変更内容:
- `src/core/step/executor.ts`: `import { JobStateStore }` → `import type { JobStateStore }` (P2-01 解消)
- `tests/pipeline-integration.test.ts`: `defaultStoreFactory` 定数を L21 に 1 箇所定義し全テストで参照 (P2-02 解消)
- `tests/unit/step/executor.store-cache.test.ts`: TC-13 / TC-14 の単体テストを新規追加 (P2-03 解消)

---

## Findings

### P3-01: executor.test.ts に inline storeFactory が 5 箇所残っている

- **severity**: P3
- **file**: `tests/unit/step/executor.test.ts` L32, L165, L226, L285, L336, L390
- **detail**: `makeExecutor` ヘルパー内と各テストの `deps` オブジェクトに `(id: string) => new JobStateStore(id)` がインライン記述されている。TC-22 は pipeline-integration.test.ts を対象としており、本ファイルは要件外。機能上の問題はなく、将来の保守負担の記録として P3 扱い。
- **fix**: 必要になった時点で `makeExecutor` 内の factory をファイル先頭の定数に抽出する程度でよい。本 iteration での修正は不要。

---

## iteration 1 指摘の対応確認

| 指摘 | 内容 | 対応状況 |
|------|------|---------|
| P2-01 | executor.ts の `import type` 未適用 | ✅ 修正済み (`import type { JobStateStore }`) |
| P2-02 | pipeline-integration.test.ts storeFactory 未集約 | ✅ 修正済み (`defaultStoreFactory` 定数に集約) |
| P2-03 | TC-13/TC-14 getStore キャッシュの単体テスト欠落 | ✅ `executor.store-cache.test.ts` で TC-13/TC-14 を直接カバー |

---

## Must-scenario カバレッジ確認

| TC | 優先度 | 実装状況 |
|----|--------|---------|
| TC-01 StoreFactory 型が export されている | must | OK |
| TC-02 PipelineDeps に storeFactory が存在する | must | OK |
| TC-03 storeFactory は必須フィールド | must | OK (required、typecheck green) |
| TC-04 pipeline.ts に `new JobStateStore` なし | must | OK (grep 0 件確認済み) |
| TC-05 catch block が storeFactory 経由 | must | OK |
| TC-06 escalation 時に storeFactory 経由 | must | OK |
| TC-07 loop exhaustion 時に storeFactory 経由 | must | OK |
| TC-08 end → awaiting-merge 遷移時 | must | OK |
| TC-09 post-step persist | must | OK |
| TC-11 executor.ts に `new JobStateStore` なし | must | OK (grep 0 件確認済み) |
| TC-12 StepExecutor constructor が storeFactory 受け取る | must | OK |
| TC-13 getStore() キャッシュが storeFactory を 1 回のみ呼ぶ | must | OK (executor.store-cache.test.ts TC-13) |
| TC-15 pipeline と executor が同一 storeFactory を共有 | must | OK |
| TC-16 local.ts buildDeps が storeFactory を返す | must | OK |
| TC-17 managed.ts buildDeps が storeFactory を返す | must | OK |
| TC-19 fake storeFactory で escalation 観測 | must | OK (pipeline.storeFactory.test.ts) |
| TC-20 fake storeFactory で loop exhaustion 観測 | must | OK (pipeline.storeFactory.test.ts) |
| TC-21 fake storeFactory でファイル I/O 抑制 | must | OK (pipeline.storeFactory.test.ts) |
| TC-23 既存結合テストが green | must | OK (238 files, 2592 tests passed) |
| TC-24 typecheck green | must | OK |
| TC-25 runner.test.ts の deps mock に storeFactory 含む | must | OK |
| TC-26 全テスト green | must | OK |
| TC-29 JobStateStore public メソッド契約不変 | must | OK |
| TC-31 step-execution-architecture spec に注入契約記述 | must | OK |
| TC-32 pipeline-orchestrator spec に storeFactory 追加記述 | must | OK |

---

## 受け入れ基準の最終確認

- [x] pipeline run 経路（pipeline.ts / executor.ts）で `JobStateStore` を inline `new` していない（grep 0 件確認）
- [x] pipeline と executor が同一の注入された store 依存を共有している（`run.ts` で `deps.storeFactory` を渡す）
- [x] 永続化分岐をモック store で検証する test が追加されている（pipeline.storeFactory.test.ts / executor.store-cache.test.ts）
- [x] 注入 seam が delta spec に記述されている（step-execution-architecture / pipeline-orchestrator）
- [x] `bun run typecheck && bun run test` が green（iter 1 verification: 238 files, 2592 tests passed）
