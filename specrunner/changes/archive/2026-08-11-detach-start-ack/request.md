# --detach の起動 ack — 親の exit を登録完了または子の失敗まで遅延し、起動失敗を伝播する

## Meta

- **type**: spec-change
- **slug**: detach-start-ack
- **base-branch**: main
- **adr**: true

## 背景

`job start --detach` / `job resume --detach` の親プロセスは、子を spawn した直後に「Detached pipeline started」を出力して exit 0 する。validation（preflight / provider readiness / 重複 guard）はすべて子側でしか走らないため、次の 2 つの運用問題が起きている:

1. **起動失敗が成功として報告される**: request.md の不備や credential 欠如で子が即死しても、親は exit 0 で「started」を返す。失敗は detach log にしか残らず、呼び出し元（human / agent）は成功と誤認する。
2. **直後の `job wait` が "No job found" で落ちる**: state.json / liveness sidecar が最初に disk に現れるのは workspace setup 時であり、そこまでに preflight → provider readiness probe → git fetch → worktree add が走る（network 依存で unbounded）。`job wait` の not-found retry は固定 10 秒窓のため、登録前に窓が尽きると exit 2 になる。さらに「まだ登録前」と「起動失敗で永遠に登録されない」が同じ exit 2 で区別できない。

根本原因は「detach の成功」を spawn 成功と同一視していること。本 request は detach 親の exit を「job の登録完了」または「子の死亡」まで遅延し、exit code を起動の実態に一致させる。固定時間窓ではなく process-death-gated の待機（既存 `job wait` と同じ哲学）を採る。

## 現状コードの前提

- `--detach` 分岐は preflight より前にあり、親は slug 解決のみで `detachSelf` → 即 `process.exit(0)` する（run/job start: `src/cli/command-registry.ts:428-442`、resume: `src/cli/command-registry.ts:697-711`）
- `detachSelf` は spawn + 案内出力 + return 0 のみ。spawn した子の handle（pid）は破棄され、待機・確認は一切ない（`src/core/command/detach.ts:105-130`）。子の stdout/stderr は slug キーの detach log へ redirect される（`src/core/command/detach.ts:110`、`getDetachLogPath` は `src/util/xdg.ts`）
- 子側の初回 disk 登録（state.json + liveness sidecar の persist）は workspace setup 時: worktree mode は `src/core/runtime/workspace-materializer.ts:114-117`（sidecar は :117・:149・:177）、no-worktree mode は `src/core/runtime/local.ts:371-376`。それ以前に preflight（`src/cli/run.ts:61-75`）→ provider readiness probe（`src/core/command/runner.ts:105-124`）→ reviewer / pipeline descriptor 検証（`src/core/command/pipeline-run.ts:90-133`）→ git fetch + worktree add が走る
- `job wait` の not-found retry は 5 回 × 2000ms の固定窓（`src/cli/job-wait.ts:141-143` の default deps、retry loop は :180-193）。尽きると stderr "No job found for slug" + exit 2
- 子が preflight で失敗した場合、state は一切作られない。`job wait` は同じ exit 2 を返し、失敗理由は detach log にのみ残る
- resume の場合、前回 run の state.json / liveness sidecar が既に存在する（sidecar pid は死んだ前プロセスのもの）。resume 時の liveness sidecar 更新は `src/core/runtime/workspace-materializer.ts:91`（resume-existing）/ `:117`（resume-recreated）で行われる。`src/core/command/resume.ts:291` の transitionJob は state.json の pid フィールドの更新である
- 初期 JobState は `status: "running"` + `pid: process.pid` で生成される（`src/store/job-state-store.ts:78-79`）
- `EXIT_CODE = { SUCCESS: 0, GENERAL_ERROR: 1, ARG_ERROR: 2 }`（`src/errors.ts`）

## 要件

1. **detach 親の ack 待機**: 親は spawn 後、次のいずれかまで待ってから exit する。時間ベースの固定 timeout で打ち切らない（process-death-gated）。
   - (a) **子の登録完了** → 従来の案内（`job wait` / `job show` の guidance）を出力して exit 0
   - (b) **子プロセスの死亡（登録前）** → detach log の末尾を stderr へ転記し、`EXIT_CODE.GENERAL_ERROR` で exit
2. **exit 0 の契約**: detach 親の exit 0 は「pipeline プロセスが生存しており、`job wait <slug>` / `job ls` がこの job を発見できる状態に到達した」ことを保証する。観測点は新規 run では liveness sidecar + state.json の出現、resume では sidecar pid の子系への更新（前回 run の残骸 sidecar を ack と誤認しないこと）。観測の実装詳細（poll 間隔・ファイル観測手段）は design で確定する。
3. **失敗伝播の内容**: (b) の stderr 転記は、detach log から失敗理由が判読できる分量（末尾数十行程度で設計確定）とし、detach log のフルパスも併記する。
4. **`job wait` の hint 追記**: "No job found" エラーの stderr に detach log の確認手順を hint として追記する。retry 窓・判定ロジック自体は変更しない。
5. **文言・help の追随**: `--detach` の help 記述（「即座に return」）と案内文言を新契約に追随させる。文言はテストで固定できる形で一箇所に定義する（既存の output contract テスト様式に従う）。
6. **不変条件**: foreground 経路（--detach なし）と detach 子の挙動（SPECRUNNER_DETACHED marker、log redirect、再帰防止）は一切変えない。

## スコープ外

- `job wait` の retry 窓・判定ロジックの変更（hint 文言のみ）
- 受理前 status（fake-running）の導入 — 別 request（本 request 完了後にスコープを再評価する）
- detach 子の validation 順序の変更（preflight を親で先行実行する案は設計判断で却下、下記）
- Windows での挙動検証（既存 detach 機構と同じく POSIX 一次対象）

## 受け入れ基準

- [ ] 親は登録完了まで exit しないことをテストで固定する（spawn 境界 + 登録観測の seam 注入で登録遅延をシミュレート）。破壊確認込み
- [ ] 子が登録前に死亡した場合、親が非 0 で exit し、stderr に detach log の内容とフルパスが含まれることをテストで固定する
- [ ] 登録完了時、従来の guidance 出力 + exit 0 をテストで固定する
- [ ] resume --detach: 前回 run の残骸 sidecar（死んだ pid）を ack と誤認しないことをテストで固定する（レースの歯）
- [ ] 統合: `job start --detach` が exit 0 した直後の `job wait <slug>` が exit 2 にならないことをテストで固定する
- [ ] `job wait`: "No job found" の stderr に detach log への hint が含まれることをテストで固定する
- [ ] 既存 detach テストのうち「親が即 exit 0 する」を pin している it（`src/cli/__tests__/detach-flag-cli.test.ts` / `src/cli/__tests__/detach-output-contract.test.ts`）は新契約に名指しで更新する。それ以外（`src/util/__tests__/spawn-background-detach.test.ts` / `src/util/__tests__/xdg-detach-log.test.ts` / `src/cli/__tests__/job-wait.test.ts` の既存 it）は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 親は child-death-gated + 登録観測で待つ** — 「プロセス生存を gate にし、時間窓に依存しない」は `job wait` で確立済みの哲学。登録は preflight + workspace setup の完了で必ず起きるか、子の死亡で永遠に起きないかの二値であり、この 2 事象を待てば ack は決定的になる。
- **採用: 失敗は detach log の転記で伝播** — 子の stderr は既に detach log に集約されている。親が別チャネルを持つより、既存の log を読み戻す方が情報の欠落がない。
- **却下: 親で preflight を先行実行してから spawn** — preflight（provider readiness probe を含む）が親子で二重実行になり、network probe の実行回数が倍増する。親子の環境差（env / cwd）で親 pass・子 fail が起き得るため、ack の保証としても不完全。
- **却下: `job wait` の retry 窓拡大** — 時間窓の延長はレースを縮めるだけで消さない。登録所要時間は network 依存で unbounded であり、どの固定値でも再発する。
- **却下: spawn 後の固定 sleep** — 同上。かつ成功時にも常に待ち時間を払う。
