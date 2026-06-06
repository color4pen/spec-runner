# Design: resume 時に liveness sidecar の pid を現在のプロセスで更新する

## Context

`LocalRuntime.writeLivenessSidecar`（`src/core/runtime/local.ts`）は
`.specrunner/local/<slug>/liveness.json` に `{ pid: process.pid, session: null, worktreePath, jobId }`
を書き込む private メソッドで、現状 `setupWorkspace` 内の **新規 worktree を作成する 3 経路** からのみ呼ばれる:

- run path（origin から新規 worktree を作成）
- resume / recreate path（`existingWorktreePath` が disk 上に存在しない → 新規作成）
- resume / null path（`existingWorktreePath === null` → 新規作成）

一方、resume で **既存 worktree を再利用する path**（`existingWorktreePath` が指す dir が disk 上に存在する場合、
`src/core/runtime/local.ts` の `setupWorkspace` 内）は、`manager.create` を呼ばず既存パスをそのまま
`WorkspaceContext` に詰めて即 return しており、`writeLivenessSidecar` を呼ばない。

このため resume 後のプロセスは新しい pid で動いているのに、sidecar の `pid` は前回プロセス（既に死亡）の値の
ままになる。`job ls`（`runPs` → `isStaleRunning`）は sidecar の死んだ pid を `process.kill(pid, 0)` で probe
して stale と誤判定し、`running (stale?)` と表示する。

なお resume の状態遷移（`src/core/command/resume.ts` の `prepare()`）は `state.pid` を `process.pid` に更新済みだが、
sidecar は `setupWorkspace` 側でしか書かれないため、再利用 path だけが取り残されている。

## Goals / Non-Goals

**Goals**:

- resume で既存 worktree を再利用する場合にも、liveness sidecar の `pid` を現在のプロセス（`process.pid`）で
  上書きする。
- sidecar の `worktreePath` / `jobId` は既存値（= 再利用する worktree の値）を保持する。

**Non-Goals**:

- sidecar のフォーマット変更（フィールドの追加・削除・改名はしない）。
- `job ls` の stale 判定ロジック（`isStaleRunning` / `runPs`）の変更（#537 で対応済み）。
- 新規 worktree 作成 3 経路の挙動変更（既に `writeLivenessSidecar` 済みで regression なし）。
- `state.pid` の更新（resume の `prepare()` が既に行っている。本変更の対象外）。

## Decisions

### D1: 再利用 path で既存の `writeLivenessSidecar` を呼ぶ（新規抽象なし）

`setupWorkspace` の「既存 worktree を再利用する」分岐（`worktreeExists === true` で `WorkspaceContext` を
return する直前）に、`await this.writeLivenessSidecar(slug, jobId, existingWorktreePath)` を 1 行追加する。

- **Rationale**: architect 評価済み。`writeLivenessSidecar` は既に `pid: process.pid` を書く実装であり、
  再利用 path から呼ぶだけで要件 1 を満たす。新規 worktree 作成 3 経路と同じ呼び出し規約に揃うため、
  「sidecar は `setupWorkspace` の全 return path で最新 pid を持つ」という invariant が構造的に回復する。
- **要件 2（worktreePath / jobId の保持）の充足**: `writeLivenessSidecar(slug, jobId, worktreePath)` は
  渡された `worktreePath` / `jobId` をそのまま書く。再利用 path では `existingWorktreePath`（= 再利用する
  worktree のパス。worktree は変わらない）と現在の `jobId` を渡すため、既存値がそのまま保持される。
  `session` フィールドは run path 含め常に `null` で生成されており、null を書き戻しても情報損失はない。
- **Alternatives considered**:
  - sidecar を read → `pid` だけ書き換えて write（部分更新）→ 既存 helper を捨てて新ロジックを足すことになり、
    フォーマットの二重管理を招く。`writeLivenessSidecar` が全フィールドを再生成する現行設計と整合しない。却下。
  - resume の `prepare()`（`resume.ts`）側で sidecar を書く → sidecar 書き込みは `LocalRuntime` の責務で、
    `cwd`（repoRoot）と worktree 解決を持つのも `setupWorkspace`。責務分散になり再利用 path 以外との一貫性も崩れる。却下。

### D2: 既存 worktree の `worktreePath` は state を再更新しない

再利用 path では worktree が変わらないため、`updateJobState` による `state.worktreePath` の書き換えは行わない
（新規作成 3 経路のみ `worktreePath` が新しくなるため state を更新している）。sidecar の書き込みだけを追加する。

- **Rationale**: 再利用 path で worktree は不変。state の `worktreePath` も既存値で正しく、再書き込みは不要な
  I/O と差分を生むだけ。変更は「sidecar の pid を現在プロセスに合わせる」最小範囲に限定する。

## Risks / Trade-offs

- [Risk] `writeLivenessSidecar` は best-effort（内部で `try/catch` し例外を握り潰す）。sidecar 書き込みに
  失敗すると pid が古いままになり stale 誤判定が残る。
  → Mitigation: これは新規作成 3 経路と同一の既存挙動。本変更で劣化はしない。失敗時も `isStaleRunning` の
  Priority 1（`state.pid` の生存確認。resume が `process.pid` に更新済み）が先に評価されるため、sidecar
  書き込み失敗だけでは即 stale にはならない。

- [Trade-off] sidecar の `session` を毎回 `null` で書き戻す。
  → run path / recreate path / null path も同様に `session: null` を書いており、sidecar の `session` は常に
  `null` で運用されている。要件 2 が保持を求めるのは `worktreePath` / `jobId` のみで、影響はない。

## Open Questions

なし。
