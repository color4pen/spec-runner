# run の detach 内蔵と job wait — pipeline の生存管理を agent の shell 手順から CLI へ移す

## Meta

- **type**: new-feature
- **slug**: detached-run-lifecycle
- **base-branch**: main
- **adr**: true

## 背景

specrunner の実運用の主経路は LLM agent session（Claude Code 等）からの起動だが、agent harness は background task を idle timeout で SIGTERM する（macOS 5 分 / Windows 15 分、2026-08 の最新版でも設定不可の設計挙動。upstream: anthropics/claude-code #72851）。run / resume は現状 foreground blocking のため、agent が素朴に background 起動すると 1〜2 時間の pipeline が走行中に撃ち落とされる。job は awaiting-resume に落ちて resume 可能だが、撃墜と検出遅れは採用プロジェクトの運用障害として繰り返し報告されている。

現状の回避策は「nohup 二重 fork で PPID=1 に切り離し、pid ファイルを自前管理し、`kill -0` の poll でプロセス死亡を gate してから状態を読む」という shell 手順であり、この知識は CLI のどこにも提供されていない。しかもこの罠は事故るまで存在に気づけない型（SIGTERM を知らない agent は detach 手順を探さない）なので、docs に書いても届かない。対策は指示の配布ではなく判断場面の消去である: CLI が detach を内蔵し、待機を `job wait` として提供し、残る運用知識はコマンド出力面（起動時案内・help）で注入する。

なお、待機がプロセス生存を gate しなければならない理由は CLI 自身の構造にある: resume 走行中、main checkout の state.json は awaiting-resume のまま残り得る（resume の running 遷移は worktree 側 store に persist される）。on-disk status のみの poll は走行中に terminal と誤報する。

## 現状コードの前提

- run / job start / job resume はすべて foreground blocking。detach / daemonize / self-respawn 機構は存在しない（`src/cli/run.ts:108-113` の `process.exit(await runRunCore(...))`、pipeline 本体は `src/core/pipeline/pipeline.ts:216` の `while (true)`）
- `JobState.pid` は既に存在する（`src/state/schema/types.ts:417-418`）。job 作成時に `process.pid` が入り（`src/store/job-state-store.ts:78-79`）、resume 時に再設定され（`src/core/command/resume.ts:229`）、中断時に null クリアされる。liveness sidecar `.specrunner/local/<slug>/liveness.json` にも pid が書かれる（`src/core/runtime/local.ts:1432-1468`）
- resume の running 遷移 persist は `resolveStateStoreByJobId` で解決した store（worktree 側）に落ち、`runStore` が null の場合は skip される（`src/core/command/resume.ts:226-243`）。main checkout の state.json は resume 走行中も awaiting-resume のままになり得る
- 生存判定は既存実装がある: `isProcessAlive`（`src/core/resume/safety.ts:13-24`、EPERM→alive / ESRCH→dead）と `isStaleRunning`（同 :40-67、pid 解決順 state.pid → sidecar pid → updatedAt 15 分 fallback）。`job ls` は既に `isStaleRunning` を通して `running (stale?)` を表示する（`src/cli/ps.ts:144-150`、`src/core/job-list/operations-view.ts:326-337`）
- pipeline log は常時 session 非依存の場所に書かれている: `.specrunner/logs/<jobId>.log`（`src/util/xdg.ts:44-53`、`job show` が Log: 行で表示 `src/cli/job-show.ts:115-122`）
- unref 済み background spawn helper `spawnBackground` が存在する（`src/util/spawn.ts:73-107`）。ただし `detached: true` を渡しておらず、`stdio: "ignore"` で出力を捨てる
- status FSM: `TERMINAL_STATUSES = {archived, canceled}`、`ACTIVE_STATUSES = {running, awaiting-resume}`（`src/state/lifecycle.ts:58-60`）。escalation は独立 status ではなく awaiting-resume + resumePoint で表現される
- run の終了コード規約: awaiting-archive → 0、awaiting-resume → 1（`src/core/command/runner.ts:325-369`）。`EXIT_CODE = { SUCCESS: 0, GENERAL_ERROR: 1, ARG_ERROR: 2 }`（`src/errors.ts:3-7`）
- 起動時の運用案内は存在しない（`src/core/command/pipeline-run.ts:69,147` の Starting / Job ID 行のみ）

## 要件

1. **`--detach` flag**: run / job start / job resume に `--detach` を追加する。指定時、CLI は自分自身を親から切り離して再 spawn し（`detached: true` + unref + 親 exit。再帰防止の内部マーカー必須）、親は slug・監視コマンド（`job wait <slug>`）・log 参照方法（`job show <slug>`）を出力して即座に exit 0 する。既定（flag なし）の foreground 挙動は一切変えない
2. **detach 子プロセスの出力保全**: 子の stdout / stderr を捨てず、session 非依存の log ファイルへ redirect する（logger 初期化前の crash 診断のため。ファイルの置き場・命名は `.specrunner/logs/` 配下で設計判断。jobId は spawn 時点で未確定なので slug をキーにできること）。log の所在は `job show` から辿れること
3. **`job wait <slug>`**: job が settle するまで block する新コマンド。判定は**プロセス生存を gate にする**: `JobState.pid` / liveness sidecar から解決した pid が生存している間は on-disk status に関わらず待ち続け、プロセス死亡後に初めて status を読んで報告する（resume 中の disk-lag 誤報の吸収）。pid が解決できない場合（後方互換 state）は `isStaleRunning` の fallback（updatedAt 15 分）に従う
4. **wait の終了コードと出力**: settle 時に 1 行で slug / status / 次アクション（awaiting-resume なら resume コマンド、awaiting-archive なら archive コマンド等）を出力する。終了コードは awaiting-archive / archived → 0、awaiting-resume / failed / terminated / canceled → 1、引数エラー・slug 不在 → 2（run の既存規約と整合）
5. **起動時の運用案内（知識注入）**: foreground の run / resume 起動時に 1 行〜数行の案内を出す — pipeline は長時間走ること、agent session からは `--detach` + `job wait` を使うこと。detach 親の出力（要件 1）と併せ、案内文言はテストで固定できる形で一箇所に定義する。help（Job commands ブロック）に `job wait` と `--detach` を追記する
6. **spawnBackground の拡張**: detach 用途に `detached: true` と stdio の file redirect を渡せるようにする。既存の呼び出し元の挙動は変えない
7. **docs 追随**: `docs/` の運用記述（run の起動・監視）に detach + wait の標準フローを記載する

## スコープ外

- foreground 既定の変更（既定 detach 化は将来の別判断。本 request は opt-in）
- Windows での detach 挙動の検証（POSIX を一次対象とし、設計で制約を明記する）
- `job ls` の表示変更（`running (stale?)` の既存表示で足りる）
- harness 側（Claude Code）の挙動への対処・回避の自動判定（agent 環境の検出はしない）
- 走行中プロセスへの再 attach（log tail は `job show` の Log 参照で足りる）

## 受け入れ基準

- [ ] `--detach` 指定時、spawn が `detached: true` + stdio の log redirect + unref で行われ、再帰防止マーカーが付与されることをテストで固定する（spawn 境界の注入で検証）。破壊確認込み
- [ ] detach 親が pipeline を実行せずに slug と `job wait` / `job show` の案内を出力して exit 0 することをテストで固定する
- [ ] 再帰防止: マーカー付きで起動された子が再 spawn しないことをテストで固定する
- [ ] `job wait`: 解決した pid が生存中は on-disk status が awaiting-resume / awaiting-archive であっても待ち続けることをテストで固定する（resume disk-lag の誤報吸収の歯）。破壊確認込み
- [ ] `job wait`: プロセス死亡後、status に応じた 1 行報告と終了コード（awaiting-archive/archived → 0、awaiting-resume/failed/terminated/canceled → 1）をテストで固定する
- [ ] `job wait`: pid 不在の後方互換 state で `isStaleRunning` fallback に従うことをテストで固定する
- [ ] `job wait`: slug 不在が終了コード 2 になることをテストで固定する
- [ ] 起動時案内・detach 親出力・help の文言存在をテストで固定する（output contract テストの様式）
- [ ] `--detach` なしの run / resume の挙動（foreground・出力・終了コード）が無変更であることを既存テスト無変更 green で確認する
- [ ] `spawnBackground` の既存呼び出し元の挙動が無変更であることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: CLI 内蔵 detach（self-respawn）** — 追加依存なし（`child_process` の `detached: true` + unref + 親 exit）。nohup 二重 fork の shell 手順知識を丸ごと不要にする。「LLM session に state を持たせない」原則の運用面への適用
- **採用: wait は process-death gate** — resume 走行中に main checkout の state.json が awaiting-resume のまま残る構造（resume の persist は worktree 側 store）を CLI 内部で吸収する。state 先行 poll は原理的に誤報する
- **採用: opt-in（`--detach`）+ 出力面での案内** — 既定変更は attended / CI 利用を壊す非互換。案内はコマンド出力に置く（agent が確実に読む唯一の面。docs は「事故るまで探す動機が無い」型の罠に届かない）
- **却下: docs / skill への手順記載のみ** — 手順は agent の shell 実行に依存し裁量で縮退する。実際に採用プロジェクトへは届かなかった
- **却下: 既定 detach 化** — run の同期的な exit code（awaiting-archive → 0）に依存する既存利用・CI を壊す。将来の判断として分離
- **却下: agent 環境の自動検出で detach** — 環境判定は fragile で、挙動が環境により分岐すること自体が新たな不確実性になる
- **却下: `job wait` を on-disk status の poll で実装** — resume disk-lag で誤報することが確認済み。プロセス生存 gate が唯一正しい
