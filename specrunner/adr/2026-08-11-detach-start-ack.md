# ADR: `--detach` 起動 ack — 親の exit を登録完了または子の死亡まで遅延する

- **date**: 2026-08-11
- **slug**: detach-start-ack
- **status**: accepted

## Context

`job start --detach` / `job resume --detach` は spawn 直後に exit 0 を返していた。
validation（preflight / provider readiness / 重複 guard）はすべて detach 子側でのみ実行されるため、2 つの運用問題が生じていた。

1. **起動失敗が成功として報告される**: request.md 不備や credential 欠如で子が即死しても、親は exit 0 で "started" を返す。失敗理由は detach log にのみ残り、呼び出し元（human / agent）は成功と誤認する。

2. **直後の `job wait` が "No job found" で落ちる**: liveness sidecar + state.json の初回 disk 書き込みは workspace setup 時（preflight → provider readiness probe → git fetch → worktree add の後）であり、network 依存で unbounded。`job wait` の 5 × 2000 ms 固定窓は登録完了前に尽きると exit 2 になる。「まだ登録前」と「起動失敗で永遠に登録されない」が同じ exit 2 で区別できない。

根本原因: "detach の成功" を "spawn の成功" と同一視していること。

本 ADR は detach 親の exit を「job の登録完了」または「子の死亡」まで遅延させる設計と、
その中に潜む非自明な正確性要件を記録する。

## Decisions

### D1: 登録完了の観測点は `liveness sidecar pid == spawned child pid`

spawn handle の `handle.pid` で子の pid が判明する。登録完了の唯一の判定基準を
「`<repoRoot>/.specrunner/local/<slug>/liveness.json` が存在し、その `pid` が
spawn した子の pid に等しい」と定義した。

この判定基準は新規 run と resume の両方を統一的に扱う。

- **新規 run**: spawn 前に sidecar は存在しない。子が workspace setup を完了させると
  state.json の直後に sidecar が書かれる（実装の ordering 上 sidecar 出現 ⊆ state.json 出現）。
  子の pid を持つ sidecar の出現 = 登録完了。

- **resume**: 前回 run の sidecar が既に存在し、その pid は死んだ前プロセスのものである。
  resume 子は自身の pid でこれを上書きする。判定基準が "sidecar 存在" ではなく
  "sidecar.pid === childPid" であるため、前回 run の残骸を ack と誤認しない
  （resume race の歯）。

**採用しなかった観測点**:

| 案 | 問題点 |
|---|---|
| state.json の存在のみ | resume では state.json が spawn 前から存在するため誤検知 |
| sidecar の存在のみ | resume では stale sidecar が spawn 前から存在するため誤検知 |
| `isProcessAlive(sidecar.pid)` | pid recycle による偶発マッチ、zombie が除去できない |
| 専用 "ready" マーカーファイル | 新しい書き込み点と artifact が必要。sidecar pid 一致が既に同等情報を持つ |

### D2: 死亡 gate は子の `exit` イベントで駆動する（`isProcessAlive` ではない）

pipeline 子プロセスは detach 親の **直接の子**である。子が exit すると zombie になり、
親が reap するまで `process.kill(childPid, 0)` は成功を返し続ける。
`isProcessAlive(childPid)` で poll すると zombie 中に "alive" と誤判定し、親が永久に hang する。

死亡 gate は `proc.on("exit", callback)` イベントで駆動する。`exit` イベントは
子の死亡を通知すると同時に zombie を reap させる。`onError` イベント（ENOENT 等の
spawn 失敗）と `handle.pid === undefined`（spawn 即失敗）も同様に即時失敗として扱う。

`job wait` が `isProcessAlive` を安全に使えるのは、reparent された子（init が reap 済み
または zombie 不在）を probe する場合であり、直接の子には適用できない。
この非対称性が D2 の核心である。

子は `detached: true` + `unref()` 状態で spawn されるため、登録完了後は親よりも
長生きする。`unref()` は ref-count からの除外であり `exit` リスナーが発火しなくなる
わけではない——親が生きている間はリスナーは機能する。

### D3: 登録チェックを死亡チェックより先に評価する（register-then-die race の解決）

各 poll tick の評価順:

1. **登録チェック（先）**: `sidecar.pid === childPid` → SUCCESS
2. **死亡チェック（後）**: `childEnded` flag が立っている → GENERAL_ERROR
3. どちらでもなければ `sleep(pollIntervalMs)` して次 tick へ

sidecar は disk 上に永続するため、子が登録直後に死亡しても次 tick 以降の登録チェックで
SUCCESS と判定できる。これは「`job wait` / `job ls` がこの job を発見できる」という
exit 0 契約に一致する。

死亡を先にチェックすると、登録と死亡が同 tick に発生したケースで誤って
GENERAL_ERROR を返す。

### D4: 失敗伝播は detach log の末尾転記で行う

登録前に子が死亡した場合、親は detach log (`getDetachLogPath(repoRoot, slug)`) の
末尾 40 行を stderr に転記し、log のフルパスを付記して GENERAL_ERROR で exit する。

子の stderr は既に detach log に集約されているため、読み戻しは情報の欠落なく
失敗理由を親に届ける手段となる。

40 行の選定根拠: preflight / credential 失敗は通常数行から数十行で収まる。
log が大きくなる前に子が死ぬため全体読み込み + tail slice で十分。
大きなログが問題になった場合は逆方向チャンクリードに移行できる
（`ponytail:` 全体読み込み、detach log が大きくなる前に死ぬ前提）。

**採用しなかった案**:

- 構造化 IPC / exit-code channel: 新プロトコルが必要、既存 log が保持する情報の二重化
- 親で preflight を先行実行してから spawn: network probe が二重実行になる。
  親子の環境差（env / cwd）で親 pass・子 fail が起き得るため、ack の保証としても不完全
- spawn 後の固定 sleep: 登録所要時間は network 依存で unbounded。成功時も常に固定遅延を払う

### D5: `detachSelf` を async + child-death-gated に変え、seam を DI で注入する

`detachSelf` を `async`: `Promise<number>` に変更し、spawn は同期的に先行させ（spawn
shape の既存テストが live のまま機能する）、その後 ack ループを async で駆動する。

テスト可能性 seam として DI オブジェクト（`JobWaitDeps` スタイルを踏襲）を導入:
`spawnFn`, `readSidecarPid(repoRoot, slug)`, `readDetachLogTail(logPath, lines)`,
`sleep`, `pollIntervalMs`（既定値 200 ms）。

ack ループを `detachSelf` に折り込むか独立した `waitForStartAck` ヘルパーに分けるかは
実装の裁量。DI オブジェクトの構造は共通。

poll 間隔 200 ms の選定根拠: ack は短命な待機（数秒〜数十秒）で成功遅延が UI に出る。
`job wait` の 2000 ms は長時間 job 待機用に調整されており短命 ack には不適切。

### D6: exit 0 の契約変更

変更前: "detach parent の exit 0 = spawn が成功した"
変更後: "detach parent の exit 0 = pipeline プロセスが生存しており、`job wait <slug>` /
         `job ls` がこの job を発見できる状態に到達した"

`job wait` の "No job found" stderr に detach log への hint を追記する。
retry 窓・判定ロジックは変更しない（ack 変更で競合が根本的に解消されるため、
窓の拡大は不要）。

## Alternatives Considered

### Alternative 1: 親で preflight を先行実行してから spawn する

preflight（provider readiness probe を含む）を spawn 前に親プロセスで実行し、失敗したら spawn しない。

- **Pros**: 失敗を即座に返せる。子の死亡を待つ必要がない。
- **Cons**: preflight（network probe）が親子の両方で実行されるため二重実行になる。親子の環境差（env / cwd）で「親が pass、子が fail」が起き得るため ack の保証としても不完全。
- **Why not**: network probe 二重実行のコスト増、かつ環境差による信頼性の低下。request.md「architect 評価済みの設計判断」で明示却下。

### Alternative 2: `job wait` の retry 窓を拡大する

not-found retry を 5 × 2000 ms から大きな値（例: 30 × 2000 ms）に広げ、登録が間に合うようにする。

- **Pros**: 変更が小さい。既存の `job wait` ロジックをほぼ変えない。
- **Cons**: setup 時間は network 依存で unbounded。どの固定値でも条件が揃えば再発する。「まだ登録前」と「起動失敗で永遠に登録されない」が同じ exit 2 のままで区別できない問題も解消されない。
- **Why not**: race を縮めるだけで消さない。根本原因（spawn 成功を detach 成功と同一視すること）が残る。request.md「architect 評価済みの設計判断」で明示却下。

### Alternative 3: spawn 後に固定 sleep を挿入する

親が spawn 後に一定時間（例: 3 秒）待ってから exit する。

- **Pros**: 実装が極めて単純。
- **Cons**: Alternative 2 と同じ根本問題を持つ。加えて、成功時でも常に固定遅延コストを払う。
- **Why not**: 同上。request.md「architect 評価済みの設計判断」で明示却下。

### Alternative 4: `isProcessAlive(childPid)` で子の死亡を poll する

`proc.kill(childPid, 0)` を繰り返し呼んで子が死んだことを検出する（`job wait` と同様の手法）。

- **Pros**: `job wait` で実績のあるコードを流用できる。
- **Cons**: pipeline 子は detach 親の **直接の子**であるため、子が exit すると zombie になる。zombie に対して `kill(pid, 0)` は成功を返し続け、親が永久に hang する。`job wait` が `isProcessAlive` を安全に使えるのは、init に reparent されて zombie が残らない（または reap 済みの）プロセスを probe する場合に限られる。
- **Why not**: 直接の子に対して使うと zombie hang が確定する。`exit` イベントが正しい代替（D2）。

### Alternative 5: 専用 "ready" マーカーファイルを子が書く

子が登録完了時に専用ファイル（例: `.specrunner/local/<slug>/ready`）を書き、親はその出現を待つ。

- **Pros**: シグナルが明示的で liveness sidecar の pid 読み込みが不要。
- **Cons**: 新しい artifact（マーカーファイル）と新しい書き込み点を追加する必要がある。liveness sidecar の pid 一致判定が既に同等の情報を持つため冗長。
- **Why not**: YAGNI。sidecar pid 一致が既にこの情報を包含しており、新たな artifact を追加する理由がない（design.md D1）。

## Risks / Trade-offs

- **pid identity 仮定**: D1 は `handle.pid` が子の `process.pid` と等しいことを前提とする。
  現実装は `spawn(execPath, [...], { shell: false })` の直接 exec であり、中間 re-exec が
  ないため成立する。将来 shim 経由の起動になった場合は identity が永遠に一致せず、
  親が子の死亡まで待ち続ける（fail-safe: 偽成功にならない）。
  `ponytail:` pid identity — CLI が shim 経由になった場合は revisit。

- **Success が unbounded の setup 時間をブロックする**: exit 0 が "discoverable" を保証する
  ためには登録完了を待つ必要があり、setup 時間（network 依存）だけ親がブロックされる。
  これは意図した trade-off。将来 fake-running status を導入すれば登録前に exit 0 を返せる
  可能性があるが、それは別 request のスコープ。

## Consequences

### Positive

- `job start --detach` / `job resume --detach` の exit 0 が「discoverable」を保証するため、
  直後の `job wait` が exit 2 "No job found" で落ちる問題が根本解消される。
- 起動失敗が detach log に埋もれず、親プロセスの stderr + exit code として伝播される。
- resume の stale sidecar race が pid identity 判定によって構造的に閉じられる。

### Negative / 既知の制約

- 親プロセスが登録完了まで（= workspace setup 完了まで）終了しない。
  `--detach` の「即座に return」という従来の振る舞いが失われる。
- Windows での挙動は既存 detach 機構と同様に未検証（POSIX primary）。

## References

- Request: `specrunner/changes/detach-start-ack/request.md`
- Design: `specrunner/changes/detach-start-ack/design.md`
- Spec: `specrunner/changes/detach-start-ack/spec.md`
