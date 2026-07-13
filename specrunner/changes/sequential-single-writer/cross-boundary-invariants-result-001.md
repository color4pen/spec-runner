# Cross-Boundary Invariants Review — sequential-single-writer — iter 1

- **verdict**: approved

## Scope

`git diff main...HEAD --stat` 対象ファイル（抜粋）:

- `src/core/step/executor.ts` — 564 行削→ producer 化
- `src/core/step/commit-orchestrator.ts` — 新設 368 行
- `src/core/step/step-halt.ts` — +168 行（factory 拡張・新 factory 2 件）
- `src/core/step/__tests__/commit-orchestrator.test.ts` / `executor-sequential-regression.test.ts` — 新規テスト
- `tests/unit/architecture/core-invariants.test.ts` — B-13 / B-14 歯追加
- `architecture/model.md` / `conformance.md` / `domain-model.md` / `divergence-status.md` — catalog 昇格

---

## 検査観点（cross-boundary invariants）

diff が変更していないコードの暗黙の前提を、新しい挙動が黙って破っていないかを判定する。
実装が正しく・テストが green のままでも、既存機構との相互作用にのみ欠陥が宿るクラスのバグを対象とする。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | B-13 guard blind spot | `src/core/step/executor-helpers.ts` | `failStepWithError`（`store.fail` + `store.persist`）と `createSessionWithHistory`（`store.appendHistory` + `store.update` + `store.fail`）が dead code として残存している。B-13 の歯は `executor.ts` の直接 call-site を grep するが、これらの関数はその scope 外に存在する。もし `executor.ts` や `core/step/` 内のコードが将来これらを再 import して呼んでも B-13 は検知できない。現時点で呼び出し元はゼロ（grep 確認済み）だが、ratify 済み invariant の近傍に「B-13 を迂回できる経路」が dead code として残る構造的ギャップである。 | `failStepWithError` と `createSessionWithHistory` を `executor-helpers.ts` から削除する（死に体コード除去）。削除後も `recordFailedStepResult` と `attachStateAndRethrow` は残り、`commit-orchestrator.ts` の import には影響しない。 |
| 2 | LOW | 暗黙の型不変条件 | `src/core/step/commit-orchestrator.ts` line 362 | `apply()` 内の `commitSkipped(step as AgentStep, ...)` キャスト。「CLI step は skipped を返さない」という不変条件が `runCliStep` の実装に依存しており、型レベルで保証されていない。現在 `runCliStep` に activation check がないため問題は起きないが、将来 CLI step に activation を追加した場合、キャストが silent に通過して `commitSkipped` が `CliStep` を受け取る。 | `commitSkipped` のシグネチャを `step: AgentStep | CliStep`（= `Step`）に広げるか、または `kind: "skipped"` の生成元を `runAgentStep` のみに型で制限する（`StepExecutionResult` の skipped variant を `AgentStepExecutionResult` に分離する）。現時点では非ブロッキング。 |

---

## 詳細検査

### 1. `pipeline.ts` との境界（crash-resilience persist の二重書き込み）

`pipeline.ts:289` の `store.persist(state)`（crash-resilience）は本 change の scope 外として明示されており、`CommitOrchestrator.commitSuccess/commitSkipped` の persist 後に同一 state を再書きする。
- **逐次成功 path**: CommitOrchestrator → persist → pipeline → persist（同一 state の二重書き、idempotent）
- **halt path**: CommitOrchestrator.commitHalt → persist → `attachStateAndRethrow` → pipeline catch → `state = err.state` → pipeline → persist（halt 済み state を再書き、idempotent）
- **unexpected throw（executor が `.state` を attach せずに投げた場合）**: pipeline safety net（line 276–281）が `store.fail(pre-begin-state, ...)` を呼ぶ。この時点で `begin()` が既に `{step}-started` history を disk に書いているが、safety net が pre-begin state で上書きする。これは **変更前も同じ挙動**（元の executor の `store.update` 後に unexpected throw が起きた場合も同様）であり、regression でない。

結論: pipeline 境界の write 競合は pre-existing のまま。本 change は挙動を変えていない。

### 2. `ParallelReviewRound` との境界（per-member persist の移行）

- `ParallelReviewRound.run()` は `executor.execute(memberStep, state, deps)` を `Promise.allSettled` で並列呼び出し（line 188）。
- 変更後、各 member の `execute()` が `CommitOrchestrator.begin()` → `produce()` → `apply()` を経る。per-member `store.persist` は `commitSuccess/commitHalt` が担う（before: executor 内から直接）。
- Round の merge-persist（line 255: `await store.persist(state)`）は不変。最終状態は merge-persist が authoritative であり、per-member persist の移転は観測結果に影響しない。
- `CommitOrchestrator` は `StepExecutor` が1インスタンス所有し、並列 member 全員が共有する。`storeCache` の構造は元の `executor.ts` の `storeCache` と同一パターンであり、concurrent access 上の新たな race は生じない。

結論: 並列経路の不変条件（D7）は維持されている。

### 3. `begin()` の activation check 前実行（B-13 始動前書き込み）

`execute()` は activation check より前に `begin()` を呼ぶ。skipped になる step も `{step}-started` history が書かれる。
これは元の `runAgentStep` の冒頭 `store.update + appendHistory` と同じシーケンス（TC-012 compliance）であり、regression でない。
`commitSkipped` は `begun` state（`{step}-started` 済み）を受け取り、`{step}-skipped` を追記して persist する。history 列 = `{step}-started → {step}-skipped` は以前と一致。

### 4. `executor-helpers.ts` からの import 整合

`commit-orchestrator.ts` が `executor-helpers.ts` から import するのは `recordFailedStepResult` と `attachStateAndRethrow` の2関数のみ（line 29–32）。`failStepWithError` と `createSessionWithHistory` は import されておらず、呼び出し元がプロダクションコードにゼロであることを grep で確認。

ただし Finding 1 で述べたように、これらの dead code は B-13 guard の file-scope を迂回できる構造を形成しており、削除が推奨される。

### 5. B-13 / B-14 の歯の有効性確認

`core-invariants.test.ts` の B-13 / B-14 describe ブロックを確認:
- B-13: `executor.ts` に `store\.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)\(` が存在しないことを grep でアサート（非コメント行限定）。`commit-orchestrator.ts` に対応 call-site が存在することを liveness guard で確認。regression guard（inject→検出）も実装済み。
- B-14: `executor.ts` に `(transitionJob|attachStateAndRethrow)\(` が存在しないことを grep でアサート。同様に liveness + regression guard あり。

`executor.ts` の直接 call-site はゼロであることを手動確認（grep 結果: comment line のみ）。歯は現状 green かつ有効。

### 6. `commitHalt` の `Promise<never>` 保証

`commitHalt` の返り型は `Promise<never>`。`attachStateAndRethrow` が必ず throw することは `executor-helpers.ts` 経由 `port/error-helpers.ts` に実装されている。型システムが non-throw path を compile-error にするため、commitHalt が正常返却するリスクはない。

---

## 総評

B-13 / B-14 の中核実装（executor からの store mutation 除去・CommitOrchestrator への一元化）は正確に実施されている。逐次経路の観測挙動（state / verdict / history / throw）は既存テストと新規 regression test によって固定されており、並列経路の不変条件も維持されている。

Finding 1（MEDIUM）は active な invariant 違反ではなく dead code が生む構造的 gap であり、次 PR でのクリーンアップで解消できる。Finding 2（LOW）は latent な型安全性の欠如であり、CLI step に activation を追加する際に対処すれば足りる。いずれも本 change のマージをブロックしない。
