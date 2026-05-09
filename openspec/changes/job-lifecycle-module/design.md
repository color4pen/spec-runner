## Context

spec-runner の `JobStatus` は 7 値（`running`, `awaiting-resume`, `awaiting-merge`, `failed`, `terminated`, `archived`, `canceled`）を持つ。遷移ロジックは 6 箇所以上に分散し、各箇所が `state.status = "..."` を直接代入している。遷移マップが存在しないため、不正な遷移の検出もテストも不可能。

`jobstate-lifecycle-status` change で `awaiting-resume` / `canceled` を追加した際、全箇所の手動同期が必要だった。この問題は status 追加のたびに再発する。

## Goals / Non-Goals

**Goals:**

- 全 JobStatus 遷移ルールを `VALID_TRANSITIONS` マップとして宣言的に定義する
- `transitionJob` 純粋関数で遷移検証・history 追記・patch マージを一箇所に集約する
- `TERMINAL_STATUSES` / `ACTIVE_STATUSES` 定数を canonical source として提供する
- `idempotency.ts` の `isFullyFinished` を `TERMINAL_STATUSES.has()` に置換・削除する
- `ps.ts` のハードコード `ACTIVE_STATUSES` を lifecycle からの import に置換する

**Non-Goals:**

- 既存の遷移箇所（pipeline.ts, resume.ts 等）を `transitionJob` 呼び出しに移行する（Phase 2）
- `transitionAndPersist` convenience 関数（Phase 3）
- reconciliation / stale detection（Phase 4）

## Decisions

**D1: 純粋関数、クラスではない**

- **Decision**: `transitionJob` は純粋関数として実装する。I/O なし
- **Rationale**: 既存コードベースが関数スタイル。テスト容易性を最優先。永続化は呼び出し元の責務

**D2: `VALID_TRANSITIONS` は `ReadonlyMap<JobStatus, ReadonlySet<JobStatus>>`**

- **Decision**: immutable な Map + Set で遷移マップを定義する
- **Rationale**: TypeScript の `readonly` 修飾子だけでは Map/Set の mutation を防げない。`Readonly*` 型で不変性を型レベルで保証

**D3: 同一 status への遷移は `noop: true` で返す**

- **Decision**: `transitionJob(state, state.status, ctx)` は throw せず `{ state, noop: true }` を返す
- **Rationale**: 冪等な操作パス（例: archived → archived の再呼び出し）でエラーにする理由がない。呼び出し元が `noop` を見て early return できる

**D4: terminal status からの遷移は throw**

- **Decision**: `archived` / `canceled` からの遷移は `InvalidTransitionError` を throw する（noop を除く）
- **Rationale**: terminal status は不可逆。意図しない復活を静的に阻止する

**D5: `TransitionContext` で呼び出し元を識別する**

- **Decision**: `trigger` フィールドで遷移の発生元を記録し、history に含める
- **Rationale**: デバッグ・forensics で「誰がこの遷移を起こしたか」を追跡可能にする

**D6: `idempotency.ts` 削除、`TERMINAL_STATUSES.has()` に統合**

- **Decision**: `isFullyFinished` は `TERMINAL_STATUSES.has(status)` の 1 行ラッパーに過ぎないため、関数ごと削除する
- **Rationale**: 間接層の排除。`TERMINAL_STATUSES` が canonical source になることで、terminal 判定の重複定義を防ぐ
- **Migration**: `orchestrator.ts` の import を `lifecycle.ts` からの `TERMINAL_STATUSES` に変更。`isFullyFinished(state)` → `TERMINAL_STATUSES.has(state.status)` に置換

**D7: `appendHistoryEntry` は既存実装を再利用**

- **Decision**: `transitionJob` 内部で `schema.ts` の `appendHistoryEntry` を呼ぶ。history エントリの `step` フィールドに `ctx.trigger` を、`message` に `ctx.reason` を記録する
- **Rationale**: history 追記ロジックの重複を避ける。`MAX_HISTORY_SIZE` ガードも既存実装に委譲

**D8: `patch` は `Partial<Omit<JobState, 'version' | 'jobId' | 'createdAt' | 'status' | 'history'>>` に制約**

- **Decision**: `patch` で上書きできるフィールドを制約する。`version`, `jobId`, `createdAt`, `status`, `history` は上書き不可
- **Rationale**: `status` は遷移ロジックが管理する。`history` は `appendHistoryEntry` が管理する。これらを `patch` で上書きすると不変条件が壊れる

## Risks / Trade-offs

- **Phase 1 の限定的効果**: lifecycle.ts を新設するが、既存の遷移箇所は Phase 2 まで移行しない。一時的に真実の源が 2 つ共存する
- **noop の過信**: 同一 status への遷移を noop で返すと、本来 throw すべき論理エラーを見逃す可能性がある。ただし Phase 2 で呼び出し元を `transitionJob` に移行する際に guard が機能するため、許容する
