# JobStatus 遷移を lifecycle.ts に集約する

## Meta

- **type**: new-feature
- **slug**: job-lifecycle-module
- **base-branch**: main

## 背景

JobStatus の遷移ロジックが 6 箇所以上に分散している（`pipeline.ts`, `executor.ts`, `orchestrator.ts`, `job-state-update.ts`, `resume.ts`, `local.ts`）。各箇所が独自に `state.status = "..."` を直接代入しており、遷移ルールが暗黙的。不正な遷移（例: `archived` → `running`）を検出できず、新しい status 追加時に全箇所を手動で同期する必要がある。

これは #75 の Phase 1 にあたり、後続の全 Phase（pipeline 移行、finish 順序入れ替え、resume stale detection、永続化一元化、reconciliation）がこのモジュールに依存する。

## 要件

1. `src/state/lifecycle.ts` を新設する
2. `VALID_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>>` を定義する
   - `running` → `awaiting-resume`, `awaiting-merge`, `failed`, `terminated`
   - `awaiting-resume` → `running`, `canceled`
   - `awaiting-merge` → `archived`
   - `failed` → `running`, `canceled`
   - `terminated` → `running`, `canceled`
   - `archived` → なし（terminal）
   - `canceled` → なし（terminal）
3. `TERMINAL_STATUSES: ReadonlySet<JobStatus>` を export する（`archived`, `canceled`）
4. `ACTIVE_STATUSES: ReadonlySet<JobStatus>` を export する（`running`, `awaiting-resume`）
5. `transitionJob(state: JobState, to: JobStatus, ctx: TransitionContext): TransitionResult` 純粋関数を実装する
   - `VALID_TRANSITIONS` で遷移を検証。不正な遷移は throw
   - history エントリを `appendHistoryEntry` 経由で追記（MAX_HISTORY_SIZE ガード付き）
   - `ctx.patch` があれば state にマージ
   - `updatedAt` を更新
   - I/O なし（永続化は呼び出し元の責務）
6. `canTransition(from: JobStatus, to: JobStatus): boolean` ガード関数を export する
7. `isTerminal(status: JobStatus): boolean` ヘルパーを export する
8. `TransitionContext` 型を定義する
   - `trigger: string` — 呼び出し元の識別子（"pipeline", "signal-handler", "finish" 等）
   - `reason: string` — 人間可読な遷移理由
   - `patch?: Partial<...>` — 遷移と同時に適用する state の部分更新
9. `TransitionResult` 型を定義する
   - `state: JobState` — 遷移後の state
   - `noop: boolean` — 同一 status への遷移（冪等ケース）かどうか
10. `src/core/finish/idempotency.ts` の `isFullyFinished()` を `TERMINAL_STATUSES.has()` に置換し、`idempotency.ts` を削除する
11. `src/cli/ps.ts` の `ACTIVE_STATUSES` ハードコードを `lifecycle.ts` からの import に置換する

## スコープ外

- 既存の遷移箇所（pipeline.ts, resume.ts 等）を `transitionJob` 呼び出しに移行する作業（Phase 2）
- 永続化の一元化（Phase 3）
- reconciliation / stale detection（Phase 4）
- PID フィールドの state schema 追加（Phase 2c）
- `transitionAndPersist` convenience 関数（Phase 3）

## 受け入れ基準

- [ ] `lifecycle.ts` が全遷移ルールを宣言的に定義している
- [ ] `transitionJob` が不正な遷移を throw する
- [ ] `transitionJob` が history エントリを `appendHistoryEntry` 経由で追記する
- [ ] `transitionJob` が `ctx.patch` を state にマージする
- [ ] `canTransition` / `isTerminal` が正しく判定する
- [ ] `idempotency.ts` が削除され、呼び出し元が `TERMINAL_STATUSES.has()` を使用している
- [ ] `ps.ts` の `ACTIVE_STATUSES` が `lifecycle.ts` からの import に置換されている
- [ ] 全 `JobStatus` × 全遷移先の網羅テストが存在する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `transitionJob` は純粋関数。I/O なし。テスト容易性を最優先
- クラスではなく関数。既存コードベースが関数スタイルなので一貫性を保つ
- `VALID_TRANSITIONS` は `ReadonlyMap` + `ReadonlySet` で immutable を保証
- 冪等な遷移（同一 status への遷移）は `noop: true` で返す。throw しない
- `patch` フィールドは任意。PID 記録等は後続 Phase で `patch` 経由で渡す設計
- reconciliation は lifecycle の外。I/O が必要なため純粋関数の境界を壊さない
