# Design: `job ls` のプロセス死亡検出を `isStaleRunning` に一本化する

## Context

`job ls`（`src/cli/ps.ts` の `runPs` → `formatJobRow`）の stale 判定は、`running` job の
`updatedAt` からの経過時間が `STALE_THRESHOLD_MS`（1 時間）を超えたかどうかだけで決まる。
プロセスが kill / セッション切断で強制終了しても、`updatedAt` が更新されないまま 1 時間
経過するまで素の `running` と表示され、ユーザーに「まだ動いている」と誤認させる。

一方 `resume` コマンド（`src/core/command/resume.ts`）が使う
`isStaleRunning`（`src/core/resume/safety.ts`）は、

1. `state.pid` の生存確認（`process.kill(pid, 0)` probe）
2. `pid` 不在時は liveness sidecar（`.specrunner/local/<slug>/liveness.json`）の `pid`
3. それも取れない場合は `updatedAt` 経過時間 fallback（`STALE_RUNNING_THRESHOLD_MS` = 15 分）

の 3 段で判定し、プロセス死亡を即検出できる。

同じ「この job は生きているか」の判定が 2 か所に分かれて精度が食い違っているのが本質。
`ps.ts` 側の独自閾値ロジックを廃し、`isStaleRunning` を再利用して判定を一本化する。

**現状の関係**:
- `runPs(opts, githubClient)`: `repoRoot` を解決し、job 一覧を取得・整形して stdout に書く。
  `awaiting-archive` job については GitHub の PR merge 状態を確認して `prMerged` を算出し、
  job ごとに `formatJobRow(job, isTty, nowMs, prMerged)` を呼ぶ。
- `formatJobRow(...)`: 表示専用の整形関数。現状はこの中で stale 判定（1 時間閾値）を
  内製している。
- `isStaleRunning(state, sidecarPath?)`: `resume.ts` が `sidecarPath = path.join(cwd, livenessJsonPath(slug))`
  を渡して呼ぶ。非 `running` status では常に `false` を返す。

## Goals / Non-Goals

**Goals**:

- `job ls` がプロセス死亡済みの `running` job を pid / sidecar 経由で即座に検出し、
  `running (stale?)` と表示する。
- stale 判定を `isStaleRunning` に一本化し、`ps.ts` 固有の判定ロジック・閾値を撤去する。
- pid / sidecar が取れない場合の fallback を `STALE_RUNNING_THRESHOLD_MS`（15 分）に統一する。

**Non-Goals**:

- `running` → `awaiting-resume` への自動遷移（`resume` の責務。`ls` は表示のみで状態を書き換えない）。
- プロセス死亡時の graceful shutdown / signal handler の追加。
- `isStaleRunning` 自体のロジック変更（既存挙動をそのまま再利用する）。
- `reconcile.ts` の `reconcileStaleRunning`（inline 版）の変更（別経路・別責務、本変更の対象外）。

## Decisions

### D1: stale 判定は `isStaleRunning`（`core/resume/safety.ts`）を再利用する

`ps.ts` 内に新規の pid / sidecar 判定を書かず、既存の `isStaleRunning` を import して呼ぶ。

- **Rationale**: architect 評価済み。`isStaleRunning` は pid → sidecar → 時間 fallback の
  3 段判定を完備しており、`ps.ts` はこれを呼ぶだけで要件を満たす。判定を 1 か所に集約することで
  `resume` と `ls` の精度差（本 bug の根本原因）が構造的に解消する。
- **Alternatives considered**:
  - `ps.ts` に独自の pid 判定を再実装 → ロジック二重化が再発し本 bug を作り直すだけ。却下。
  - `reconcile.ts` の inline 版を流用 → あちらは `state → core` 境界回避のための意図的な複製で、
    sidecar 判定を持たない（pid か時間のみ）。要件の「sidecar 経由で即判定」を満たせない。却下。
- **Module boundary**: `src/cli` → `src/core/resume` は下位レイヤへの正当な依存。
  `ps.ts` は既に `../core/port/github-client.js` を import しており、cli → core は許容済み。
  module-boundary regression test は `core/request` のみを対象とするため抵触しない。

### D2: staleness は `runPs`（orchestration 層）で算出し、`formatJobRow` には `boolean` で渡す

`formatJobRow` の中で `isStaleRunning` を呼ぶのではなく、`runPs` のループ内で
`const isStale = isStaleRunning(job, sidecarPath)` を算出し、`formatJobRow` に
事前計算済みの `isStale: boolean` を渡す（既存の `prMerged` と同じパターン）。

- **Rationale**:
  - `isStaleRunning` は sidecar ファイルの read と `process.kill` probe という副作用を伴う。
    純粋な整形関数である `formatJobRow` に I/O・プロセス probe を持ち込まない。
  - `prMerged`（GitHub API 由来）と完全に同じ「runPs で外部状態を解決 → formatJobRow は表示のみ」
    という既存の整形パイプラインの慣習に一致する。
  - `formatJobRow` の unit test が決定的に保てる（fs / process のモック不要。`isStale` を直接渡す）。
- **Alternatives considered**:
  - `formatJobRow` に `sidecarPath` / `repoRoot` を渡して内部で `isStaleRunning` を呼ぶ →
    純粋な整形関数に副作用が混入し、unit test に fs/process モックが必要になる。却下。

### D3: sidecar path 解決は `resume.ts` と同一の方法に揃える

`runPs` のループ内で job ごとに sidecar path の候補
`sidecarCandidate = path.join(repoRoot, livenessJsonPath(getJobSlug(job)))` を組み立て、
**ファイルが実在する場合のみ** `isStaleRunning(job, sidecarCandidate)` に渡す。
ファイルが存在しない場合は `sidecarPath` を渡さず（`undefined`）、`isStaleRunning` の Priority 3
（`updatedAt` 経過時間 fallback）が適用されるようにする。

```
const sidecarCandidate = path.join(repoRoot, livenessJsonPath(getJobSlug(job)));
const sidecarPath = fs.existsSync(sidecarCandidate) ? sidecarCandidate : undefined;
const isStale = isStaleRunning(job, sidecarPath);
```

- **Rationale**:
  - `isStaleRunning` の Priority 2 は `sidecarPath` が渡されたときにファイルが存在しない場合
    即 `true`（stale）を返す（CI fresh checkout を想定した挙動）。`runPs` が常に `sidecarPath` を
    渡すと、「state.pid なし・sidecar ファイル不在・updatedAt 15 分以内」の job が
    Priority 3 に到達できず即 stale 扱いになり、request.md 要件 3 の
    「pid / sidecar が取得できない場合は 15 分 fallback」と矛盾する。
  - sidecar ファイルが存在する場合は `sidecarPath` を渡し、`isStaleRunning` の Priority 2
    （ファイル内の pid の生存確認）を有効にする。
  - sidecar ファイルが存在しない場合は `undefined` を渡し、Priority 3（時間 fallback）を適用する。
    これにより、sidecar を作成しない旧形式の state file でも 15 分閾値が正しく機能する。
  - `fs.existsSync` は同期 I/O だが、`runPs` は既に `isStaleRunning` 内の sidecar read と
    `process.kill` probe という同等の I/O を `running` job ごとに行っており、追加コストは無視できる。
  - `resume.ts` は `path.join(cwd, livenessJsonPath(slug))`（cwd = repoRoot）で path を解決しており、
    候補パスの組み立て方は同一。`getJobSlug` は `ps.ts` で既に import 済み、`livenessJsonPath` は
    `src/util/paths.ts` の既存 export。`fs` は `node:fs` を import する。

### D4: `ps.ts` 固有の `STALE_THRESHOLD_MS`（1 時間）を撤去する

`ps.ts` の `const STALE_THRESHOLD_MS = 60 * 60 * 1000` と、それを使った `formatJobRow` 内の
inline 経過時間判定を削除する。

- **Rationale**: 閾値の single source of truth を `isStaleRunning` の
  `STALE_RUNNING_THRESHOLD_MS`（15 分）に一本化する（要件 3）。`ps.ts` に閾値が残ると
  二重管理に戻り、再び精度がずれる。

## Risks / Trade-offs

- [Risk] 既存テスト `tests/finish-ps-integration.test.ts` の `TC-NEW-08` は
  「1 時間超で stale」「30 分は stale でない」という旧契約を assert しており、本変更で破綻する。
  特に「pid / sidecar なし・30 分経過」は新しい 15 分 fallback では stale 扱いになる。
  → Mitigation: `formatJobRow` の新契約（`isStale` を引数で受け取る）に合わせて TC-NEW-08 を
  更新し、`runPs` レベルで pid 駆動・15 分 fallback を検証する integration test を追加する（T-02）。

- [Risk] `formatJobRow` のシグネチャ変更が他の呼び出し元に波及する。
  → Mitigation: 呼び出し元（`runPs`、`tests/finish-ps-integration.test.ts`、
  `tests/cli-stdout-snapshot.test.ts` 等）を grep で洗い出し、全箇所を更新する（T-01 / T-02）。

- [Risk] `isStaleRunning` は `running` job ごとに `process.kill` probe と sidecar read を行う。
  → Mitigation: `isStaleRunning` は非 `running` status で即 `false` を返すため probe/read は
  `running` job のみ。実運用で同時 `running` は通常 0〜数件で、コストは無視できる。
  PR merge 確認（既存）も同様に少数 job のみ走る前例がある。

- [Trade-off] `isStaleRunning` の時間 fallback は内部で `Date.now()` を使うため、`runPs` が
  整形に使う `nowMs`（formatAge 用）とは別時刻になる。stale 判定への実害はない（ミリ秒差）。

## Open Questions

なし。
