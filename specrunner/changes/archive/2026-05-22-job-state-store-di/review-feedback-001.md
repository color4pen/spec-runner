# Review Feedback: job-state-store-di

- **reviewer**: code-review agent
- **date**: 2026-05-22
- **verdict**: needs-fix

---

## Summary

実装は設計の主要目的（pipeline.ts / executor.ts の inline `new JobStateStore` 排除、`storeFactory` の DI 統一）を達成している。`bun run typecheck && bun run test` は green（238 test files, 2592 tests all passed）。以下に見つかった問題を記載する。

---

## Findings

### P2-01: executor.ts の value import を `import type` に変更すべき

- **severity**: P2
- **file**: `src/core/step/executor.ts` L8
- **detail**: `import { JobStateStore } from "../../store/job-state-store.js";` が value import のまま残っている。delta spec（step-execution-architecture/spec.md）は「StepExecutor SHALL NOT import ... JobStateStore」と記述しており、tasks.md は「型参照で必要なので残す」と書いているが、それなら `import type { JobStateStore }` に変更すれば spec の意図（値として構築しない）と実装を一致させられる。現状は `new` を呼んでいないため機能上の問題はないが、spec の文言と齟齬がある。
- **fix**: `import { JobStateStore }` → `import type { JobStateStore }`

---

### P2-02: `pipeline-integration.test.ts` に `storeFactory` が 33 箇所個別にインライン記述されている（TC-22 違反）

- **severity**: P2
- **file**: `tests/pipeline-integration.test.ts` L288, L339, L395 … (計 33 箇所)
- **detail**: test-cases.md TC-22（should）は「テストヘルパーに default storeFactory が 1 箇所のみ定義されている」を要求する。design.md D6 も「pipeline-integration test 等のテストヘルパーに `(id: string) => new JobStateStore(id)` の default factory を 1 箇所定義する」と明記している。実装では共通ヘルパーに集約されておらず、`storeFactory: (id: string) => new JobStateStore(id)` が 33 回個別にインライン記述されている。将来 store の生成方法が変わった場合に 33 箇所を修正する必要が生じる。
- **fix**: `buildDeps` ヘルパー関数（`pipeline-integration.test.ts` 内）に `storeFactory` を 1 箇所まとめるか、`const defaultStoreFactory: StoreFactory = (id) => new JobStateStore(id);` をファイル先頭に定義して参照させる。

---

### P2-03: TC-13 / TC-14（getStore キャッシュの単体テスト）が未追加

- **severity**: P2
- **file**: 該当テストファイルなし
- **detail**: test-cases.md TC-13（must）「getStore() を同じ jobId で 3 回呼ぶと storeFactory が 1 回のみ呼ばれる」、TC-14（should）「異なる jobId で新しいインスタンスが生成される」は、いずれも `pipeline.storeFactory.test.ts` や他のテストファイルで直接カバーされていない。verification-result.md は `25/25 must TCs covered` と報告しているが、TC-13 は must 扱いであり、getStore キャッシュの動作は delta spec にも明記されている。`pipeline.storeFactory.test.ts` のカバー対象は TC-19/20/21 のみ（ファイルヘッダコメントに明記）。
- **fix**: `executor.ts` の `getStore()` キャッシュ挙動を直接テストする unit test を追加する（`StepExecutor` を `storeFactory` spy 付きで構築し、`getStore` を public にするか executor 内部呼び出し経由で検証）。

---

### P3-01: `pipeline-integration.test.ts` に `storeFactory` を複数回インラインで書いていると将来の `StoreFactory` 型変更時に全件修正が必要

- **severity**: P3
- **file**: `tests/pipeline-integration.test.ts`
- **detail**: P2-02 と関連。型が変わった場合の保守負担として記録する。P2-02 の修正により解消される。

---

## Must-scenario カバレッジ確認

| TC | 優先度 | 実装状況 |
|----|--------|---------|
| TC-01 StoreFactory 型が export されている | must | OK (`src/core/types.ts` L42) |
| TC-02 PipelineDeps に storeFactory が存在する | must | OK (L87) |
| TC-03 storeFactory は必須フィールド | must | OK (required、typecheck green) |
| TC-04 pipeline.ts に `new JobStateStore` なし | must | OK (grep 0 件確認済み) |
| TC-05 catch block が storeFactory 経由 | must | OK (`pipeline.ts` L92) |
| TC-06 escalation 時に storeFactory 経由 | must | OK (`pipeline.ts` L295) |
| TC-07 loop exhaustion 時に storeFactory 経由 | must | OK (`pipeline.ts` L470) |
| TC-08 end → awaiting-merge 遷移時 | must | OK (`pipeline.ts` L277) |
| TC-09 post-step persist | must | OK (`pipeline.ts` L212) |
| TC-11 executor.ts に `new JobStateStore` なし | must | OK (grep 0 件確認済み) |
| TC-12 StepExecutor constructor が storeFactory 受け取る | must | OK (`executor.ts` L47) |
| TC-13 getStore() キャッシュが storeFactory を 1 回のみ呼ぶ | must | **未テスト** (P2-03) |
| TC-15 pipeline と executor が同一 storeFactory を共有 | must | OK (run.ts で `deps.storeFactory` を渡している) |
| TC-16 local.ts buildDeps が storeFactory を返す | must | OK (`local.ts` L281) |
| TC-17 managed.ts buildDeps が storeFactory を返す | must | OK (`managed.ts` L172) |
| TC-19 fake storeFactory で escalation 観測 | must | OK (pipeline.storeFactory.test.ts) |
| TC-20 fake storeFactory で loop exhaustion 観測 | must | OK (pipeline.storeFactory.test.ts) |
| TC-21 fake storeFactory でファイル I/O 抑制 | must | OK (pipeline.storeFactory.test.ts) |
| TC-23 既存結合テストが green | must | OK (238 files, 2592 tests passed) |
| TC-24 typecheck green | must | OK |
| TC-25 runner.test.ts の deps mock に storeFactory 含む | must | OK |
| TC-26 全テスト green | must | OK |
| TC-29 JobStateStore public メソッド契約不変 | must | OK (`src/store/job-state-store.ts` 変更なし) |
| TC-31 step-execution-architecture spec に注入契約記述 | must | OK (delta spec 確認済み) |
| TC-32 pipeline-orchestrator spec に storeFactory 追加記述 | must | OK (delta spec 確認済み) |

---

## スコープ外ファイルの確認

- `src/core/cancel/runner.ts`, `src/core/finish/`, `src/core/command/runner.ts`, `src/core/command/resume.ts` に `new JobStateStore` が残っていることを確認。スコープ外として正しく未変更。
- `src/store/job-state-store.ts` 変更なし（TC-29 OK）。
- `src/state/store.ts` 変更なし（TC-30 OK）。

---

## 総評

P0/P1 は存在しない。P2 が 2 件（executor.ts の `import type` 未適用、pipeline-integration.test.ts のヘルパー未集約）と、must TC-13 の単体テスト欠落が 1 件（P2-03）。

P2-03（TC-13 must テスト未追加）については、verification-result.md が `25/25 must TCs covered` と報告しており、getStore キャッシュ挙動が統合テスト経由で間接的にカバーされている可能性もある。ただし TC-13 の記述は「storeFactory の呼び出し回数が 1 回」という明示的な assertion を求めており、現状のテストでその点を直接検証するものは存在しない。

- **verdict**: needs-fix
