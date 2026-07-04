# 同一 slug の live job がある場合に2回目の run を拒否するガード

**Date**: 2026-07-04
**Status**: accepted
**Related**: `specrunner/adr/2026-06-01-dsm-runtime-strategy-demote.md`（RuntimeStrategy port 定義）, `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug 単位 sidecar）

## Context

liveness sidecar は slug 単位で 1 ファイル（`.specrunner/local/<slug>/liveness.json`）であり、
同一 slug で `specrunner run` を 2 回起動すると、2 回目の run（job B）が 1 回目（job A）の
sidecar を上書きする。`listLocalSidecars` は上書き後の job B しか解決できず、job A は
「Job not found」となり、worktree とプロセスが残ったまま `job cancel` する正規手段が失われる。

同一 slug の並列 run は「1 request = 1 PR」という製品契約上ほぼ常に誤操作であり、
支えるべきユースケースではない。sidecar を jobId 単位に分割して並列を許容する代わりに、
live な先行 job があるときに 2 回目の run を明示的に拒否して不整合を未然に防ぐ。

## Decision

### D1: ガードを `prepare()` の preflight スロット（`bootstrapJob` 直前）に置く

`PipelineRunCommand.prepare()`（`src/core/command/pipeline-run.ts`）で `bootstrapJob` を呼ぶ
**直前**にガードを差し込む。`bootstrapJob` より前で throw することで、job state（jobId 生成・
初期 JobState 構築・その永続化）を一切作らずに拒否する。

**Rationale**: 既存の preflight ガード群（reviewer 定義検証 / capability gate /
input-completeness 検証）と同じ "halt before any state is created" の設計思想。
sidecar 上書き（`writeLivenessSidecar` は `setupWorkspace` 内で呼ばれる）自体を
発生させないため、state 生成後のロールバックが不要になる。

`LocalRuntime.bootstrapJob` 内部での検査は、`params.request.slug`（canonical-path 由来で null 可）と
`request.slug`（sidecar が使う実 slug）が別値になり得るため slug を確実に得られず却下。

### D2: 検査は `RuntimeStrategy` の新規 seam に委譲する

`prepare()` は runtime 中立なコマンド層であり、local 固有の sidecar 読み取りを
直書きすると "config.runtime 分岐は createRuntime factory に閉じる" という規律を破る。
`RuntimeStrategy` に `assertNoDuplicateLiveJob(repoRoot, slug)` を追加し、実装を各 runtime に委譲する。

- **local**: liveness sidecar を読んで live job を検査する（D3）。
- **managed**: no-op（scope 外、D4）。

**port の可視性は `canDeriveChangedFiles` パターンを踏襲する**:

- `RuntimeStrategy`（port）では **optional**（`assertNoDuplicateLiveJob?(...)`）。
- `RealRuntimeStrategy`（concrete 実装用交差型）では **required**。

`prepare()` からは `await this.runtime.assertNoDuplicateLiveJob?.(cwd, slug)` の optional-call で呼ぶ。
optional-on-port により `RuntimeStrategy` 型として型付けられた既存テスト fake は
本メソッドを実装せずともコンパイル可能で、`?.` によりスキップされる。
required-on-`RealRuntimeStrategy` により `LocalRuntime` / `ManagedRuntime` の実装漏れはコンパイルエラーで検出される。

`prepare()` への sidecar 読み取り直書きは runtime 中立層に local 固有 I/O が漏れ managed でも誤発火するため却下。

### D3: 検査本体を injectable なピュア helper に切り出す

検査ロジックを `src/core/runtime/duplicate-slug-guard.ts` に
`checkDuplicateLiveJob(repoRoot, slug, deps?)` として実装する。
`deps` は `{ readFile?, isAlive? }` を受け取り、既定は実 fs 読み取りと
`isProcessAlive`（`src/core/resume/safety.ts`）。
`LocalRuntime.assertNoDuplicateLiveJob` はこの helper に委譲する薄いラッパとする。

| sidecar の状態 | 判定 |
|---|---|
| ファイル不在 / 読み取り不能 | **許容**（通常起動） |
| JSON 破損 | **許容** |
| `pid` フィールドが number でない / 欠如 | **許容** |
| `pid` が number かつ `isProcessAlive(pid)` が偽（stale） | **許容** |
| `pid` が number かつ `isProcessAlive(pid)` が真（live） | **拒否**（throw） |

`isAlive` 注入により live/dead 分岐を実プロセスに依存せず決定的にテストできる。
既存 `isProcessAlive` を再利用し、新規 pid 判定ロジックを追加しない。
helper を作らず `LocalRuntime` に直書きする代替案は dead-pid 分岐を決定的に固定できないため却下。

### D4: managed runtime は no-op（scope 境界）

`ManagedRuntime.assertNoDuplicateLiveJob` は何もせず即 resolve する。
managed の `marker.json` に対する同型ガードは本 change の scope 外とし、
実装を no-op にすることで scope 境界を明示的に文書化する。

### D5: 拒否エラーコードは `DUPLICATE_LIVE_JOB`

新規エラーコード `DUPLICATE_LIVE_JOB` と factory `duplicateLiveJobError(slug, priorJobId)` を
`src/errors.ts` に追加する。

- `message`: slug と先行 jobId を含む duplicate run 拒否メッセージ
- `hint`: `specrunner job cancel <priorJobId>` で cancel するか完了を待つ旨。先行 jobId が
  取れない縁ケースでは `specrunner job list` で確認するよう案内する
- `exitCode`: `EXIT_CODE_MAP` に `DUPLICATE_LIVE_JOB → ARG_ERROR(2)` を追加する
  （ユーザーが環境を解消してから再実行すべき前提エラーとして `WORKTREE_GUARD` と同じ扱い）

## Alternatives Considered

### Alternative 1: liveness sidecar を jobId 単位に分割して並列 run を許容する

`liveness-<short-jobId>.json` 形式にしてスロットを複数持たせ、同一 slug の並列 run を許容する案。

- **Pros**: 並列 run が技術的に可能になる
- **Cons**: sidecar 読み取り・cancel・show・cleanup の広範な改修を伴い、かつ「1 request = 1 PR」
  という製品契約外のユースケースを支える方向に向かう
- **Why not**: ガードで発生を防ぐ方が改修面が小さく製品契約とも整合する。architect 評価で却下済み

### Alternative 2: port メソッドを required にして既存テスト fake を全て修正する

- **Pros**: port の型安全性が最大になる
- **Cons**: `RuntimeStrategy` 型の既存テスト fake が全て壊れ、受け入れ基準「既存テスト無変更 green」に反する
- **Why not**: optional-on-port / required-on-concrete の `canDeriveChangedFiles` パターンが
  同じ問題を既に解決しており、新たな方式を導入する必要がない。却下

### Alternative 3: `LocalRuntime.bootstrapJob` の内部でガードを検査する

- **Pros**: ガードが runtime 層に閉じる
- **Cons**: `bootstrapJob` が受け取る `params.request.slug` は canonical-path 由来で null になり得る一方、
  sidecar が使う slug は `request.slug`（別値）であり、`bootstrapJob` 内部では正しい slug を確実に得られない
- **Why not**: preflight スロットでは slug が確定しており、`bootstrapJob` より前で弾く方が
  "halt before any state is created" の設計思想とも一致する。却下

## Consequences

### Positive

- 同一 slug の2回目 run が state を作らずに actionable なエラーで拒否され、sidecar 上書きによる
  「Job not found」状態の発生を未然に防ぐ
- 既存の `isProcessAlive` を再利用し、新規 pid 判定ロジックが不要
- optional-on-port パターンにより既存テスト fake が無変更で green を維持する
- `duplicate-slug-guard.ts` が injectable な deps で決定的にテスト可能

### Negative / Known Debt

- PID 再利用により stale な sidecar を live と誤判定する可能性がある（既存の cancel / resume / stale-running
  判定と同じ既知の限界。エラーに先行 jobId を含めることでユーザーが明示的に解消できる）
- managed runtime に対する同型ガードは未実装のまま残る

## References

- Request: `specrunner/changes/reject-duplicate-slug-run/request.md`
- Design: `specrunner/changes/reject-duplicate-slug-run/design.md`
