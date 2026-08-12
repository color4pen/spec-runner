# Design: liveness 生存判定の sidecar pid 採用に jobId 照合を追加する

## Context

liveness sidecar（`.specrunner/local/<slug>/liveness.json`）の record は `{ pid, session, worktreePath, jobId }` を持つ（`local.ts:1445`）。slug を複数の attempt が順次占有する際、sidecar は最新占有者（attempt）を指す。

establish・削除・kill・worktreePath 解決はいずれも `sidecar.jobId === ownJobId` の照合を行っている。一方 **生存判定だけが jobId 照合なしに sidecar.pid を採用している**。対象は 2 経路:

1. `src/core/resume/safety.ts:49-62` — `isStaleRunning` Priority 2: `sidecar["pid"]` を jobId 照合なしに読む。
2. `src/cli/job-wait.ts:106-116` — `realReadSidecarPid`: `sidecar["pid"]` のみ読み、`jobId` を見ない。

kill 経路の `resolveJobPid`（`src/core/liveness/resolve-pid.ts:68-80`）はすでに正しい規則（`sidecar.pid` は `sidecar.jobId === expectedJobId` の時のみ採用）を純関数として持つ。この純関数と型（`SidecarContent`）を両経路で再利用することが基本方針。

## Goals / Non-Goals

**Goals**:
- `isStaleRunning` と `job wait` sidecar pid 読みに jobId 照合を追加し、占有奪取直後の誤判定を防ぐ。
- 照合ロジックを `resolveJobPid` に集約し、並立実装を増やさない。
- jobId 不一致・欠落の sidecar を kill 経路と同じ扱い（pid 無しと同分岐）にする。

**Non-Goals**:
- establish・削除・kill・worktreePath 解決の各経路（既に jobId scope 済み）。
- sidecar schema の変更（`jobId` は既に書かれている）。
- doctor 経路・占有不変条件が破れた断面の裁定ロジック。

## Decisions

### D1: `isStaleRunning` の sidecar pid 採用に `resolveJobPid` を使う

**Rationale**: 並立実装を避けるため。`resolveJobPid` は純関数であり、sidecar の型解釈（`SidecarContent`）も同ファイルにある。`isStaleRunning` は `state: JobState` を受け取るため `state.jobId` を `expectedJobId` として渡せる。

変更内容:
- `safety.ts` に `resolveJobPid` と `SidecarContent` を import する（`"../liveness/resolve-pid.js"`）。
- Priority 2: sidecar raw を `SidecarContent` 形式（`{ pid: number|null, jobId: string|null }`）に変換し、`resolveJobPid({ statePid: null, sidecar, expectedJobId: state.jobId })` を呼ぶ。
- `resolved.pid != null` → `isProcessAlive(resolved.pid)` で生存 probe。
- `resolved.pid == null`（jobId 不一致・欠落・pid 欠落）→ `true`（stale）を返す。現行の「sidecar present, no pid → stale」と同じ分岐。

**Alternatives**:
- インライン jobId チェック（`sidecar["jobId"] === state.jobId`）: 並立実装が残るため却下。

### D2: `JobWaitDeps.readSidecarPid` の戻り型を `SidecarContent | null` に変更し、poll ループで `resolveJobPid` を呼ぶ

**Rationale**: poll ループで `resolveJobPid` を呼ぶには `{ pid, jobId }` の両フィールドが必要。DI 境界の外側で jobId 照合を行うことで、`resolveJobPid` をコール側（poll ループ）に集約できる。

変更内容:
- `JobWaitDeps.readSidecarPid` の型: `(sidecarAbsPath: string) => number | null` → `(sidecarAbsPath: string) => SidecarContent | null`
- `realReadSidecarPid`: `pid` のみでなく `{ pid, jobId }` を返す（sync 版の sidecar content reader）。
- poll ループ（`job-wait.ts` sidecar 解決箇所）: sidecar record を取得後、`resolveJobPid({ statePid: null, sidecar: record, expectedJobId: currentState.jobId })` を呼び、`resolved.pid` を sidecarPid として使う。

**Alternatives**:
- `readSidecarPid(path, expectedJobId)` と jobId を引数に加えてフィルタを内部で行う: DI 境界が jobId を知る必要が生まれ、テストが書きにくくなるため却下。
- 戻り型を変えず呼び出し元で sidecar を再読み: 二重 I/O になるため却下。

### D3: jobId 欠落 sidecar は不一致と同じ扱い（pid 採用しない）

**Rationale**: `resolveJobPid` は `sidecar.jobId === expectedJobId` を評価する。`sidecar.jobId` が `null` の場合 `null === "some-id"` → false であり、自動的に不採用になる。kill 経路と経路間で扱いを割らない。

帰結: legacy sidecar（jobId フィールド欠落）しか持たない running job は stale 側に倒れうるが、現行版は job 生成時に `state.pid` を必ず書く（Priority 1 で jobId 照合不要のまま解決）ため実影響は legacy 断面に限られる。

## Risks / Trade-offs

- [Risk] `SidecarContent | null` への型変更で既存テストの mock 修正が必要。→ 影響は `readSidecarPid: vi.fn(() => 54321)` を返している "sidecar pid resolution" テスト 1 件のみ（jobId-matched な `SidecarContent` に更新）。他の mock は `null` を返しており型互換のまま。
- [Risk] `state.jobId` が `undefined` のケース（古い state schema）。→ `undefined === "some-id"` は false であり pid 不採用（stale 側）に倒れる。安全な方向。

## Open Questions

なし（architect 評価済みの設計判断で全分岐が確定している）。
