# `job ls` がプロセス死亡済みの job を `running` と表示する

## Meta

- **type**: bug-fix
- **slug**: job-ls-pid-stale-detection
- **base-branch**: main
- **adr**: false

## 背景

`job ls` の stale 判定（`ps.ts`）は `updatedAt` からの経過時間のみで判定し、閾値は 1 時間。プロセスが kill やセッション切断で強制終了しても、1 時間経過するまで素の `running` と表示される。

一方 `resume` コマンドの stale 判定（`safety.ts` の `isStaleRunning`）は pid 生存確認 → sidecar pid → 経過時間 fallback の 3 段で判定し、プロセス死亡を即検出できる。

同じ「この job は生きているか」の判定が 2 か所に分かれ、精度がバラバラなため、`job ls` がプロセス死亡を報告できず、ユーザーに「まだ動いている」と誤認させる。

## 要件

1. `job ls` の stale 判定が pid / sidecar を参照し、プロセス死亡済みの `running` job を即座に `running (stale?)` と表示する。
2. `safety.ts` の `isStaleRunning` を再利用するか同等の判定を行い、stale 判定ロジックを一本化する。
3. pid / sidecar が取得できない場合の経過時間 fallback は `isStaleRunning` の 15 分（`STALE_RUNNING_THRESHOLD_MS`）を継承する。ps.ts 固有の 1 時間閾値は撤去する。

## スコープ外

- `running` → `awaiting-resume` への自動遷移（resume コマンドの責務、ls は表示のみ）
- プロセス死亡時の graceful shutdown / signal handler 追加

## 受け入れ基準

- [ ] プロセス死亡済みの `running` job が `job ls` で `running (stale?)` と表示される（pid / sidecar 経由で即判定）
- [ ] pid / sidecar が取得できない場合は 15 分（`isStaleRunning` の `STALE_RUNNING_THRESHOLD_MS`）の経過時間 fallback で判定される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- `isStaleRunning`（`safety.ts`）が既に pid → sidecar → 時間 fallback の 3 段判定を持つ。`ps.ts` はこれを呼ぶだけで済む。新規ロジック不要。
