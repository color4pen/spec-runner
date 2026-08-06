# Tasks: run の detach 内蔵と `job wait`

<!--
実装順序:
  T-01（xdg detach log path）→ T-02（spawnBackground 拡張）→ T-03（detach モジュール: マーカー/args除去/guidance/spawn）
  → T-04（案内文言 単一定義 + foreground notice 配線）→ T-05（CLI 配線: --detach flag / job wait registry / USAGE）
  → T-06（job wait コマンド実装: process-death gate）→ T-07（job show へ detach log 表示）
  → T-08（テスト: detach / 再帰防止 / spawn 拡張）→ T-09（テスト: job wait gate / 終了コード / fallback / 不在）
  → T-10（テスト: 出力契約 notice/guidance/help、foreground 無変更）→ T-11（docs 追随）→ T-12（最終検証）。

禁止範囲（design.md Non-Goals）:
  - foreground 既定を detach 化しない（opt-in のみ）。
  - `spawnBackground` 既存呼び出し元（factory.ts / power-assertion.ts）の挙動を変えない。
  - `job ls` の表示を変えない。
  - agent 環境の自動検出を実装しない。
  - Windows detach の検証はしない（POSIX 一次対象、制約は design に明記済み）。
  - foreground（--detach なし）の stdout 契約・終了コードを変えない。
-->

## T-01: detach log path helper を追加する

- [x] `src/util/xdg.ts` に `getDetachLogPath(repoRoot: string, slug: string): string` を追加する。
      返り値は既存 log dir（`getVerboseLogDir` = `.specrunner/logs/`）配下の slug-keyed path
      （例 `<repoRoot>/.specrunner/logs/<slug>.detach.log`）。既存 `<jobId>.log` と衝突しない命名にする。
- [x] 既存の `getVerboseLogDir` / `getVerboseLogPath` の挙動は変更しない。

**Acceptance Criteria**:
- `getDetachLogPath(root, "foo")` が `.specrunner/logs/` 配下の slug 由来 path を返す。
- 既存 `getVerboseLogPath(root, jobId)` の返り値は無変更。
- `typecheck` green。
- detach log ファイルは `0o600` モードで作成されること（既存 verbose log の `openSync(path, 'a', 0o600)` 慣例と一致）。

## T-02: `spawnBackground` を detach 用途に拡張する（既存呼び出し元は無変更）

- [x] `src/util/spawn.ts` の `SpawnBackgroundOptions` に任意フィールドを追加する:
      `detached?: boolean`、log redirect 指定（例 `logFilePath?: string`）、full-env passthrough
      （例 `inheritSecrets?: boolean` もしくは verbatim env を渡す口）。
- [x] `spawnBackground` 本体で、`detached` 指定時のみ `spawn(..., { detached: true, ... })` を渡す。
      log redirect 指定時のみ、追記モードで開いた fd を `stdio: ["ignore", fd, fd]` として渡す
      （未指定時は現状どおり `stdio: "ignore"`）。full-env passthrough 指定時のみ `stripSecrets` を経由せず
      full env（呼び出し元が渡すマーカー込み env）を使う（未指定時は現状どおり `stripSecrets(process.env) + opts.env`）。
- [x] `unref()` は現状どおり常時行う。`onError` ハンドラ同期付与も維持する。
- [x] `factory.ts` / `power-assertion.ts` の呼び出しは変更しない（新フィールド未指定のまま）。

**Acceptance Criteria**:
- 新フィールド未指定の呼び出しで `detached` は渡されず、`stdio` は `"ignore"`、env は `stripSecrets` 適用。
- `detached: true` + log redirect + full-env 指定で、それぞれ spawn へ正しく反映される（DI/spy で検証）。
- log redirect で渡すファイル記述子は `openSync(path, 'a', 0o600)` で開くこと（owner-only 保護）。
- `typecheck` green。

## T-03: detach モジュール（マーカー / args 除去 / guidance / self-respawn）を実装する

- [x] `src/core/command/detach.ts` を新設し、次を export する:
      - `DETACH_MARKER_ENV`（= `"SPECRUNNER_DETACHED"`）と `isDetachedChild(env): boolean`。
      - `stripDetachFlag(args: string[]): string[]` — `--detach` および `--detach=...` トークンのみ除去。
      - `buildDetachGuidance(slug: string): string` — slug・`job wait <slug>`・`job show <slug>` を含む案内。
      - `detachSelf(opts): number` — 子を spawn（`process.execPath` + `process.argv[1]` +
        `stripDetachFlag(args)`、cwd=repoRoot、`detached: true`、log redirect=`getDetachLogPath`、
        full-env passthrough + マーカー付与）し、`buildDetachGuidance` を stdout に出力して `0` を返す。
- [x] spawn 境界はテスト注入可能にする（`spawnBackground` もしくは同型の `SpawnBackgroundFn` を DI し、
      既定で本物を使う）。実プロセスを起動せずに spawn 引数・env・stdio を固定できること。
- [x] guidance の出力先は stdout。preflight / auth / config / network は一切呼ばない。

**Acceptance Criteria**:
- `isDetachedChild` がマーカー env の有無で真偽を返す。
- `stripDetachFlag(["run","foo","--detach","--no-worktree"])` が `--detach` のみ除去する。
- `detachSelf` が `detached: true` + log redirect + マーカー env + `--detach` 除去済み引数で spawn を 1 回呼び、
  guidance を出力して 0 を返す（DI 注入で検証）。
- `typecheck` green。

## T-04: 案内文言を単一定義し foreground notice を配線する

- [x] foreground 起動時案内の文言を 1 箇所に定義する（例 `src/core/command/operational-guidance.ts` の
      定数/関数、もしくは T-03 の detach モジュール）。文言は pipeline が長時間走ること・agent session からは
      `--detach` + `job wait` を使うことを含む。
- [x] foreground の run / resume 起動経路の共通点（`CommandRunner.execute`、run と resume 双方が通る）で、
      `!isDetachedChild(process.env)` のとき当該案内を `logInfo`（stderr、`--quiet` 抑制）で 1 回出す。
      stdout（`--json` 契約含む）と終了コードには触れない。detach 子では出さない。

**Acceptance Criteria**:
- foreground notice 文言が単一モジュールに定義され `--detach` と `job wait` を含む。
- foreground（マーカー非設定）の run / resume で案内が stderr に出る。detach 子（マーカー設定）では出ない。
- 案内は stdout に一切書かない。
- `typecheck` green。

## T-05: CLI に `--detach` flag と `job wait` を配線し USAGE を更新する

- [x] `src/cli/command-registry.ts` の `run`（alias）・`job start`・`job resume` の flags に
      `detach: { type: "boolean" }` を追加する。
- [x] 各 handler で、`parsed.flags["detach"] && !isDetachedChild(process.env)` のとき `detachSelf(...)` を
      呼び `process.exit(0)`（slug は design D5 に従い解決: resume は positional、run/job start は
      request path 解決 → `parseRequestMdRaw` で slug 抽出。解決失敗時は spawn せず既存の run.ts 相当エラーで
      非ゼロ終了）。それ以外は従来どおり foreground（`runRun` / `runResume`）へ委譲する。
- [x] `job.subcommands.wait` を追加する（positional `slug` required、handler は `runJobWait` を呼び
      `process.exit(code)`）。worktree guard は `job show` / `job ls` と同じ様式（main checkout 外なら拒否）。
- [x] USAGE（`command-registry.ts` の `USAGE` 文字列）の Job commands ブロックに `job wait <slug>` を追記し、
      `job start` / `job resume` / `run` の各行に `--detach` を明記する。

**Acceptance Criteria**:
- `run --detach` / `job start --detach` / `job resume --detach` が Unknown flag エラーにならない。
- マーカー非設定 + `--detach` で detachSelf が呼ばれ pipeline は実行されない。マーカー設定時は foreground。
- `--detach` と `--json` の同時指定は ARG_ERROR（exit 2）で終了し、pipeline も spawn も行わない（テストで固定）。
- `job wait <slug>` が dispatch され、slug 欠落は exit 2。
- `run` / `job start` の detach 経路で `parseRequestMdRaw` 後に `SLUG_REGEX` を検証し、不一致なら
  spawn せず非ゼロ終了すること（テストで固定）。
- USAGE に `job wait` と `--detach` が含まれる。
- `typecheck` green。

## T-06: `job wait` コマンド（process-death gate）を実装する

- [x] `src/cli/job-wait.ts` を新設し `runJobWait(slug: string, opts): Promise<number>` を export する。
- [x] slug から state を解決する（`JobStateStore.list` の最新 updatedAt、`job show` と同様）。不一致 → exit 2。
- [x] settle 判定 `isSettled(state, sidecarPath)` を実装する（design D6）:
      pid 解決順は `state.pid` → sidecar（`.specrunner/local/<slug>/liveness.json`）pid。
      pid 解決可 → `isProcessAlive` が真の間は status に関わらず未 settle、死亡で settle。
      pid 不在 → `isStaleRunning`（`src/core/resume/safety.ts`）の fallback に従う。
      `isProcessAlive` / `isStaleRunning` は既存実装を再利用する。
- [x] poll ループ: 各 tick で state を再ロードし `isSettled` を評価。未 settle なら sleep して継続。
      poll 間隔・時刻・state ロード・liveness 判定・sidecar pid 解決を DI seam として注入可能にする。
- [x] settle 時に 1 行で `slug` / `status` / 次アクションを stdout 出力（design D7 の写像）。終了コード:
      awaiting-archive / archived → 0、awaiting-resume / failed / terminated / canceled → 1。
- [x] 1 行フォーマットと次アクション写像は 1 箇所に定義しテストで固定する。

**Acceptance Criteria**:
- pid 生存中は on-disk status が awaiting-* でも待ち続ける。死亡後に status を読む。
- pid 不在 state で `isStaleRunning` fallback に従う。
- settle 報告が status 別に正しい次アクションと終了コードを返す。
- slug 不在は **2 秒間隔 × 5 回**（計約 10 秒）リトライしてから exit 2 を返す（detach 親の初期化ウィンドウ対応）。
  リトライ間隔・回数は DI seam で注入可能にし、テストで実時間なしに検証する。
- `typecheck` green。

## T-07: `job show` に detach log の所在を表示する

- [x] `src/cli/job-show.ts` の `printJobState` に、slug に対応する detach log
      （`getDetachLogPath(repoRoot, slug)`）が存在するとき `Detach log: <relpath>` 行を追加する
      （存在しないときは出さない）。既存の `Log:`（`<jobId>.log`）表示は無変更。

**Acceptance Criteria**:
- detach log が存在する slug で `job show` 出力に detach log の相対 path が含まれる。
- detach log が無い場合、当該行は出ない。既存 `Log:` 行は無変更。
- `typecheck` green。

## T-08: テスト — detach spawn / 再帰防止 / spawnBackground 拡張

- [x] detach spawn 契約テスト（spawn 境界注入）: `detached: true` + stdio の log redirect + `unref` +
      マーカー env + `--detach` 除去済み引数で spawn される。**破壊確認込み**（`detached` / マーカーを外すと落ちる）。
- [x] detach 親テスト: pipeline を実行せず slug と `job wait` / `job show` 案内を出力し exit 0。
- [x] 再帰防止テスト: マーカー付き（`isDetachedChild` 真）で起動された経路が spawn を呼ばず foreground に入る。
- [x] `spawnBackground` 拡張テスト: 新フィールド未指定で既存挙動（非 detached / `stdio:"ignore"` /
      `stripSecrets`）を保つ。detach 経路で full-env（credential + マーカー）が保持される。

**Acceptance Criteria**:
- 上記 4 群が green。破壊確認テストが「歯を外すと落ちる」ことを示す。
- 既存 `spawnBackground` 呼び出し元のテストは無変更で green。

## T-09: テスト — `job wait` の gate / 終了コード / fallback / 不在

- [x] pid 生存中は on-disk status `awaiting-resume`（および `awaiting-archive`）でも待ち続ける。**破壊確認込み**
      （status 先行 settle に改変すると落ちる）。
- [x] プロセス死亡後、status 別に 1 行報告と終了コード（awaiting-archive/archived → 0、
      awaiting-resume/failed/terminated/canceled → 1）を固定する。
- [x] pid 不在の後方互換 state で `isStaleRunning` fallback（running かつ updatedAt 15 分超 → settle）に従う。
- [x] slug 不在で **2 秒間隔 × 5 回リトライ**後に exit 2 を返す（DI 注入で実時間なしに検証する）。
- [x] 実プロセス・実時間なしで検証する（liveness 判定・clock・state ロードを DI 注入）。

**Acceptance Criteria**:
- 上記シナリオが green。破壊確認テストが process-death gate の有効性を示す。
- slug 不在リトライテストが「5 回リトライ後に exit 2」を固定する。

## T-10: テスト — 出力契約（notice / guidance / help）と foreground 無変更

- [x] output contract テスト様式で、foreground notice が `--detach` と `job wait` を、detach guidance が slug と
      `job wait` / `job show` を、USAGE が `job wait` と `--detach` を含むことを固定する。
- [x] foreground（`--detach` なし）の run / resume の stdout 出力・終了コードが無変更であることを、
      **既存テストを無変更のまま green** に保つことで確認する（新規 notice は stderr / quiet 抑制）。
- [x] `--detach --json` 同時指定で exit 2 を返し pipeline も spawn も行わないことをテストで固定する。

**Acceptance Criteria**:
- 3 種の文言存在テストが green。
- 既存の foreground run / resume 出力・exit code テストが無改変で green。
- `--detach --json` 排他テストが green。

## T-11: docs 追随

- [x] `docs/operations.md`（run の起動・監視の運用記述）に detach + wait の標準フローを追記する:
      agent session からは `specrunner run <slug> --detach` で起動し `specrunner job wait <slug>` で待機、
      log は `specrunner job show <slug>` で辿る。SIGTERM idle-timeout の背景と、`--detach` が opt-in である
      （既定は foreground）ことを明記する。
- [x] repo 固有資源への不要な参照を持ち込まない（成果物は単体で読める記述にする）。

**Acceptance Criteria**:
- `docs/operations.md` に `--detach` と `job wait` を用いた標準フローが記載される。

## T-12: 最終検証

- [x] `typecheck && test` を green にする。
- [x] 受け入れ基準（request.md の全項目）と本 tasks / spec の対応を確認する。

**Acceptance Criteria**:
- `bun run typecheck` と `bun run test` が green。
- request.md の受け入れ基準の各項目に対応するテストが存在し green。
