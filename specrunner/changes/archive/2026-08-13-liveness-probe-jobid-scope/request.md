# liveness 生存判定の sidecar pid 採用に jobId 照合を追加する

## Meta

- **type**: bug-fix
- **slug**: liveness-probe-jobid-scope
- **base-branch**: main
- **adr**: false

## 背景

liveness sidecar（`.specrunner/local/<slug>/`）は slug 単位の単一記録だが、束縛の identity は attempt（jobId）にある（`architecture/dynamic-model.md` liveness — 所有規則「sidecar の参照・解除は自 jobId と一致する記録に限る」）。sidecar の establish（check-and-claim）・削除・kill 対象解決は jobId 一致を要求する一方、**生存判定だけが sidecar の pid を jobId 照合なしに採用している**。

このため、slug を後続 attempt が check-and-claim で奪った直後の断面で、旧 attempt 側の stale 判定・`job wait` が「別 job の pid が生きている」ことを根拠に自 job を live と誤判定しうる。`architecture/divergence-status.md` に既知の未解消 divergence として記録済みで、本 request はその実装追随。

## 現状コードの前提

- `src/core/resume/safety.ts:49-62` — `isStaleRunning` の Priority 2 が sidecar JSON の `pid` を jobId 照合なしに読み、生存 probe に使っている（Priority 1 の `state.pid` は自 job の記録なので照合不要）。
- `src/cli/job-wait.ts:106-116` — `realReadSidecarPid` が sidecar JSON の `pid` のみを読み、`jobId` を見ていない。
- `src/core/liveness/resolve-pid.ts:60-80` — kill 側の `resolveJobPid` は `state.pid` 優先・sidecar は `sidecar.jobId === expectedJobId` の時のみ採用、という正しい規則を既に持つ純関数。
- `src/core/runtime/local.ts:1445` — sidecar record は `{ pid, session, worktreePath, jobId }` であり、照合に必要な `jobId` は既に書かれている。
- `src/core/runtime/local.ts:258` — worktreePath の sidecar 読みは `sidecar["jobId"] === jobId` を既に照合している（生存判定だけが取り残されている）。

## 要件

1. 生存判定が sidecar の `pid` を採用する際、記録の `jobId` が対象 job の jobId と一致する場合に限る。対象経路は 2 つ: `isStaleRunning`（resume / inbox の stale-running 判定）と `job wait` の sidecar pid 読み。
2. jobId 照合の規則は `resolveJobPid`（`src/core/liveness/resolve-pid.ts`）に既にあるものを再利用し、照合ロジックの並立実装を増やさない（sidecar 読み→照合の判定部を共通純関数に寄せる）。
3. jobId 不一致・`jobId` フィールド欠落の sidecar は「自 job の生存証拠として使えない記録」として扱う（kill 経路の `resolveJobPid` と同じ扱い。生存判定では pid 無しの場合と同じ分岐に落ちる）。

## スコープ外

- establish（check-and-claim）・削除・kill 対象解決・worktreePath 解決の各経路（既に jobId scope 済み）。
- sidecar schema の変更（`jobId` は既に書かれている）。
- doctor 経路・占有不変条件が破れた断面の裁定ロジック。

## 受け入れ基準

- [ ] jobId 不一致の sidecar pid が生存判定に採用されないことを unit テストで固定する（`isStaleRunning` と `job wait` の両経路）
- [ ] jobId 一致の sidecar pid は従来どおり生存判定に採用されることをテストで固定する（回帰なし）
- [ ] `jobId` フィールドの無い sidecar は生存証拠として不採用（pid 無しと同じ分岐）であることをテストで固定する
- [ ] sidecar pid の採用判定が `resolveJobPid` の規則と同一実装/共通純関数に集約されている
- [ ] 既存テストは原則無変更で green。jobId 非照合の現挙動を固定している既存テスト（候補: `src/cli/__tests__/job-wait.test.ts`、resume safety 系テスト）に限り本修正に合わせた期待値更新を許容する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: sidecar pid は「自 jobId の記録」である時のみ生存証拠として採用する。establish・削除・kill・worktreePath 解決と同一の所有規則に生存判定を揃える（`architecture/dynamic-model.md` liveness の所有規則が正典）。
- **採用**: `jobId` 欠落（旧版が書いた legacy sidecar）は不一致と同じ扱い。kill 経路の `resolveJobPid` が既にこの挙動であり、経路間で扱いを割らない。帰結: legacy sidecar しか持たない running job は stale 側に倒れうるが、現行版は job 生成時に `state.pid` を必ず書く（Priority 1 で照合不要のまま解決する）ため実影響は legacy 断面に限られる。
- **却下: slug のみ照合の現状維持** — 占有奪取直後に別 attempt の pid で live 誤判定する経路が残る。
- **却下: jobId 欠落 sidecar の照合免除（寛容読み）** — 免除は誤判定経路を温存し、kill 経路との規則不一致も生む。
- **却下: プロセスのコマンドライン検査による所有確認** — プラットフォーム依存で過剰。sidecar の jobId で足りる。
