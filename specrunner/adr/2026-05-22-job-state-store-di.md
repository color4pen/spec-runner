# ADR-20260522: JobStateStore を Factory 注入に統一し Pipeline の inline new を排除する

**Date**: 2026-05-22
**Status**: accepted

## Context

`new JobStateStore(jobId)` がコードベース全体で 23 回・8 ファイルに散在していた。特に `src/core/pipeline/pipeline.ts` 単体で 7 回 inline 生成（L93/203/213/278/296/367/470）し、`src/core/step/executor.ts` も `getStore()` 内で 1 回 inline 生成していた。

一方で `StepExecutor` の `spawnFn`/`sleepFn`/`runner` は `PipelineDeps` 経由で注入済みであり、「DI する依存」と「実行中に素 new する依存」が同一レイヤー内で混在していた。

実害は testability に出る:

- `JobStateStore` constructor は jobId のみを取り、内部で XDG パスを解決してファイル I/O を行う。pipeline が直接 new するため、テストで永続化分岐（loop exhaustion・escalation・transition 時の persist）を差し替えられない
- 1 回の pipeline run では jobId は不変なのに、同一 jobId のインスタンスを 7 回作り直していた

## Decision

### D1: `storeFactory: (jobId: string) => JobStateStore` を `PipelineDeps` に required field として追加

`src/core/types.ts` に `StoreFactory = (jobId: string) => JobStateStore` 型を定義・export し、`PipelineDeps.storeFactory` として required で追加する。

`optional + default fallback` は採用しない。`spawn` で排除した leaky default パターンを再導入しないため。

### D2: 単一インスタンス注入ではなく factory 注入

`buildDeps(config, request, slug, workspace)` は jobId を引数に取らない。jobId が確定するのは `prepare()` 後であるため、単一インスタンス注入は composition root のシグネチャ変更を強制し結合が増える。factory 注入なら deps は jobId 非依存で構築でき、`spawn: SpawnFn` と同型のパターンになる。

将来 cancel/finish/resume（複数 jobId を扱う経路）が同一 seam に乗る際も factory 注入であれば対応可能。

### D3: composition root は `RuntimeStrategy.buildDeps()`（local.ts / managed.ts）

`spawn: spawnCommand` を注入しているのと同じ場所に `storeFactory: (id) => new JobStateStore(id)` を追加する。`CommandRunner` を root にすると runtime strategy 分離が崩れるため採用しない。

### D4: `executor` の `getStore()` キャッシュは維持し内部 new のみ差し替え

`StepExecutor.getStore(jobId)` が同一 jobId に対して同一インスタンスを返すキャッシュ機構は「重複構築回避」という別責務として残す。内部の `new JobStateStore(jobId)` のみ `this.storeFactory(jobId)` に置換する。これにより pipeline / executor が同一の注入された factory を共有する非対称が解消される。

### D5: `JobStateStore` の port 化（interface 抽出）はしない

単一具象実装であり、テスト目的は永続化分岐の観測/抑制に限定される。factory を in-memory fake に差し替えれば達成でき、interface 抽出は over-abstraction。テストでは `satisfies` で構造的に型チェックする。

### D6: cancel/finish/resume の inline new はスコープ外

`src/core/cancel/runner.ts`・`src/core/finish/`・`src/core/command/runner.ts`・`src/core/command/resume.ts` の `new JobStateStore` はスコープ外とする。これらは `PipelineDeps` チェーンに接続されていない短命経路であり、巻き込むと deps 構築の新設が必要になり本変更の凝集を壊す。ただし `StoreFactory` 型を export し、将来同じ seam に乗れる形にしておく。

## Alternatives Considered

### Alternative 1: 単一インスタンスを `PipelineDeps` に注入する

```ts
PipelineDeps.store: JobStateStore  // jobId 確定後に build
```

- **Pros**: シンプル。factory が不要
- **Cons**: `buildDeps(config, request, slug, workspace)` が jobId を引数に取る必要が生じる。composition root のシグネチャが変わり結合が増える。cancel/finish/resume は複数 jobId を扱うため単一インスタンスでは対応できない
- **Why not**: composition root の責務を増やさず factory で jobId を後解決できる

### Alternative 2: optional field + default fallback

```ts
storeFactory?: StoreFactory  // 省略時は (id) => new JobStateStore(id)
```

- **Pros**: 既存コードへの影響を最小化
- **Cons**: `spawn` で意図的に排除した「leaky default」パターンの再導入。テストでの差し替えが必須なのにデフォルト動作がある = 差し替え忘れが invisible に起きる
- **Why not**: `spawn` と設計方針を揃えるため required を選択

### Alternative 3: `JobStateStore` を interface/port に抽出する

```ts
interface IJobStateStore { load(): ...; persist(): ...; }
PipelineDeps.store: IJobStateStore
```

- **Pros**: 完全な抽象化。将来の実装差し替えが容易
- **Cons**: 現在の目的は「テストで永続化分岐を観測/抑制する」ことのみ。具象 factory の fake 差し替えで達成可能。interface を切ると factory の型シグネチャも変わり変更範囲が広がる
- **Why not**: over-abstraction。単一具象実装の今は factory 注入で十分

### Alternative 4: `CommandRunner` を composition root にする

- **Pros**: CommandRunner が cancel/finish/resume も扱うため、全経路を一元管理できる
- **Cons**: runtime strategy（local / managed）の分離が崩れる。CommandRunner が runtime 固有依存を知る必要が生じる
- **Why not**: `RuntimeStrategy.buildDeps()` が既存の DI 起点として成立しており、そこに追加するのが最小変更

## Consequences

### Positive

- `pipeline.ts` / `executor.ts` が `JobStateStore` を inline `new` しなくなり、テストで永続化分岐を完全に差し替え可能になる
- pipeline / executor が同一の注入された `storeFactory` を共有し、DI の非対称が解消される
- 1 回の pipeline run で同一 jobId のインスタンスを 7 回作り直していた無駄がなくなる（executor の getStore キャッシュが有効になる）
- `StoreFactory` 型が export され、将来 cancel/finish/resume が同一 seam に乗れる準備ができる
- fake storeFactory による unit test が追加され、loop exhaustion・escalation・遷移の永続化分岐がテスト可能になった

### Negative

- `PipelineDeps` に required field が追加されるため、`PipelineDeps` を直接構築するすべての呼び出しサイトへの変更が必要（型エラーとして surface する）
- テストヘルパーに `storeFactory` を明示的に渡す必要が生じる（design.md D6 の通りヘルパーに 1 箇所集約することで保守性を維持）

### Known Debt

- cancel/finish/resume 経路（`src/core/cancel/runner.ts` など）の `new JobStateStore` は未統一のまま残る。将来 `StoreFactory` 型を使って同一 seam に乗せる別 request を予定
- `executor.ts` の `import { JobStateStore }` は型参照として残っているが `import type` に変更すべき（review-feedback-001 P2-01）

## References

- Request: `specrunner/changes/job-state-store-di/request.md`
- Design: `specrunner/changes/job-state-store-di/design.md`
- Delta specs: `specrunner/changes/job-state-store-di/specs/step-execution-architecture/spec.md`, `specrunner/changes/job-state-store-di/specs/pipeline-orchestrator/spec.md`
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（既存 DI パターンの確立）
- Related: `specrunner/adr/2026-04-29-module-architecture-style.md`（hexagonal-lite + module-boundary 原則）
