# Design: run の detach 内蔵と `job wait` — pipeline 生存管理を CLI へ

## Context

specrunner の主経路は LLM agent session（Claude Code 等）からの起動である。agent harness は
background task を idle timeout で SIGTERM する（設定不可の設計挙動）。`run` / `job resume` は現状すべて
foreground blocking であり（`src/cli/run.ts:112` の `process.exit(await runRunCore(...))`、pipeline 本体は
`src/core/pipeline/pipeline.ts:216` の `while (true)`）、agent が素朴に background 起動すると 1〜2 時間の
pipeline が走行中に撃ち落とされる。job は `awaiting-resume` に落ちて resume 可能だが、撃墜と検出遅れが
運用障害になる。現状の回避策は「nohup 二重 fork で PPID=1 に切り離し、pid ファイルを自前管理し、`kill -0`
poll でプロセス死亡を gate する」shell 手順であり、CLI のどこにも提供されていない。この罠は事故るまで
存在に気づけない型なので docs に書いても届かない。対策は指示配布ではなく判断場面の消去である。

待機がプロセス生存を gate しなければならない理由は CLI 自身の構造にある: resume 走行中、main checkout の
state.json は `awaiting-resume` のまま残り得る。resume の running 遷移 persist は `resolveStateStoreByJobId`
で解決した store（worktree 側）に落ち、`runStore` が null のとき skip される（`src/core/command/resume.ts:226-243`）。
on-disk status のみの poll は走行中に terminal と誤報する。

### 現状コードの前提（検証済み）

- **foreground 一本**: run / job start / job resume はすべて foreground blocking。detach / daemonize /
  self-respawn 機構は存在しない。
- **pid 記録**: `JobState.pid`（`src/state/schema/types.ts:417-418`）は job 作成時に `process.pid` が入り
  （`src/store/job-state-store.ts:78-79`）、resume 時に再設定され（`src/core/command/resume.ts:229`）、
  中断時に null クリアされる。liveness sidecar `.specrunner/local/<slug>/liveness.json` にも pid が書かれる
  （`src/core/runtime/local.ts:1432-1468`、`writeLivenessSidecar`）。
- **生存判定の既存実装**: `isProcessAlive`（`src/core/resume/safety.ts:13-24`、EPERM→alive / ESRCH→dead）と
  `isStaleRunning`（同 :40-67、pid 解決順 state.pid → sidecar pid → updatedAt 15 分 fallback。ただし
  status が `running` のときのみ stale を返す）。
- **pipeline log の所在**: `.specrunner/logs/<jobId>.log`（`src/util/xdg.ts:44-53` の `getVerboseLogPath`）。
  `job show` が `Log:` 行で表示する（`src/cli/job-show.ts:115-122`）。
- **background spawn helper**: `spawnBackground`（`src/util/spawn.ts:73-107`）は `unref()` 済みだが
  `detached: true` を渡さず `stdio: "ignore"` で出力を捨てる。env は `stripSecrets(process.env)` を通す
  （`src/util/env-filter.ts`、`GITHUB_TOKEN` / `ANTHROPIC_API_KEY` / `*_TOKEN` 等を除去）。既存呼び出し元は
  `factory.ts`（LocalRuntime）と `power-assertion.ts` の 2 箇所のみで、いずれも `SpawnBackgroundFn` 型経由。
- **status FSM**: `TERMINAL_STATUSES = {archived, canceled}`、`ACTIVE_STATUSES = {running, awaiting-resume}`
  （`src/state/lifecycle.ts:58-60`）。escalation は独立 status ではなく `awaiting-resume` + `resumePoint`。
- **終了コード規約**: run は awaiting-archive → 0、awaiting-resume → 1（`src/core/command/runner.ts:325-369`）。
  `EXIT_CODE = { SUCCESS: 0, GENERAL_ERROR: 1, ARG_ERROR: 2 }`（`src/errors.ts:3-7`）。
- **起動時の運用案内は無い**: `src/core/command/pipeline-run.ts:69,147` の `Starting` / `Job ID` 行のみ。
- **dispatch**: `bin/specrunner.ts` が registry（`src/cli/command-registry.ts`）ベースで dispatch。`run` は
  top-level worktree guard、`job start` / `job resume` は `guardedSubcommands` で main checkout 起動を強制。
  CLI 実体は `process.execPath`（node/bun バイナリ）+ `process.argv[1]`（script）で再起動できる。

## Goals / Non-Goals

**Goals**:

- `run` / `job start` / `job resume` に opt-in の `--detach` を追加し、CLI 内蔵の self-respawn で親から
  切り離す。親は pipeline を実行せず、slug と監視コマンドを案内して即 exit 0 する。
- detach 子プロセスの stdout/stderr を session 非依存の slug-keyed log ファイルへ保全する。
- `job wait <slug>` を新設し、**プロセス生存を gate**にして job が settle するまで block する（resume の
  disk-lag 誤報を CLI 内部で吸収）。
- 運用知識をコマンド出力面（foreground 起動時案内・detach 親出力・help）に注入する。
- `spawnBackground` を detach 用途に拡張する（既存呼び出し元は無変更）。
- docs に detach + wait の標準フローを記載する。

**Non-Goals**:

- foreground 既定の変更（既定 detach 化は将来の別判断。本 change は opt-in）。
- Windows での detach 挙動の検証（POSIX を一次対象。設計で制約を明記）。
- `job ls` の表示変更（`running (stale?)` の既存表示で足りる）。
- harness（Claude Code）挙動への対処・agent 環境の自動検出。
- 走行中プロセスへの再 attach（log は `job show` の Log 参照で足りる）。
- pid 再利用（PID reuse）の完全解決（既存 `isProcessAlive` / `isStaleRunning` と同じ既知限界として扱う）。

## Decisions

### D1: CLI 内蔵 detach（self-respawn）を opt-in の `--detach` で提供する

`--detach` 指定時、CLI は自分自身を再 spawn して親から切り離す。追加依存なし
（`node:child_process` の `detached: true` + `unref()` + 親 `exit(0)`）。nohup 二重 fork の shell 手順知識を
丸ごと不要化する。「LLM session に state を持たせない」原則の運用面への適用。

**再起動コマンドの構成**: 子は `process.execPath` + `process.argv[1]` + `stripDetachFlag(process.argv.slice(2))`
で起動する。生 args から `--detach`（`--detach` および `--detach=...`）トークンのみ除去し、他の flag/positional
（`--no-worktree` / `--issue` / `--from` / `--prompt` 等）は verbatim に引き継ぐ。cwd は main checkout
（親は worktree guard 通過済みなので必ず main checkout にいる）。

**親の責務**（preflight/auth/config を一切行わない）:
1. guidance 用 slug を決定的に解決する（D5）。
2. log ファイル path を解決する（D3）。
3. 子を spawn（D4）。
4. `buildDetachGuidance(slug)` を stdout に出力し `exit 0`。

**Rationale**: 「why self-respawn not nohup手順配布」— 手順は agent の shell 実行に依存し裁量で縮退する
（実際に採用プロジェクトへは届かなかった）。CLI が内蔵すれば判断場面そのものが消える。
**Alternatives considered**: (a) docs / skill への手順記載のみ → 却下（届かない）。(b) 既定 detach 化 →
却下（run の同期的 exit code に依存する CI/attended 利用を壊す非互換。D8）。(c) agent 環境の自動検出で detach
→ 却下（環境判定は fragile で分岐自体が新たな不確実性）。

### D2: 再帰防止は内部マーカー env で行う

子は env var `SPECRUNNER_DETACHED=1`（specrunner-owned・provider 非依存の命名）付きで起動される。
`isDetachedChild(env)` が真のとき、`--detach` が渡っていても detach 分岐を skip して foreground 実行する。
生 args からの `--detach` 除去（D1）と併せた二重防御だが、**マーカーが正典の gate**（除去漏れがあっても
再 spawn しない）。

**Rationale**: 環境変数マーカーは spawn 境界を越えて確実に伝播し、args 解析順に依存しない。
**Alternatives considered**: args のみで判定 → 除去漏れ時に無限 fork の危険があり却下。

### D3: detach 子の出力は slug-keyed log へ redirect する

子の stdout / stderr を捨てず `.specrunner/logs/<slug>.detach.log` へ redirect する（logger 初期化前の
crash 診断のため）。jobId は spawn 時点で未確定なので **slug をキー**にする（既存の `<jobId>.log` とは別系統）。
path helper を `src/util/xdg.ts` に追加する（`getDetachLogPath(repoRoot, slug)`）。子が pipeline logger を
初期化した後の pipeline log は従来通り `<jobId>.log` に落ちる。**detach log の所在は `job show` から辿れる**
よう `printJobState` に `Detach log:` 行を追加する（ファイルが存在するときのみ表示）。

**Rationale**: 既存 log dir（`.specrunner/logs/`）配下に置くことで既存の可観測性導線（`job show`）に
自然に載る。slug キーは spawn 時点で確定している唯一の識別子。
**Alternatives considered**: `/dev/null` 破棄 → 却下（crash 診断不能）。jobId キー → 却下（spawn 時点で未確定）。

### D4: `spawnBackground` を detach 用途に拡張する（既存呼び出し元は無変更）

`SpawnBackgroundOptions` に次の任意フィールドを追加する:

- `detached?: boolean` — `spawn` へ `detached` を渡す（未指定 → 現状どおり非 detached）。
- `stdio?` 相当の **log redirect 指定**（例 `logFilePath?: string`）— 指定時は開いた fd を
  `["ignore", fd, fd]` として渡す（未指定 → 現状どおり `"ignore"`）。
- **full-env passthrough**（例 `inheritSecrets?: boolean` もしくは verbatim な `rawEnv`）— detach 子は
  specrunner 自身であり、preflight で credentials（`GITHUB_TOKEN` / `ANTHROPIC_API_KEY` /
  `CLAUDE_CODE_OAUTH_TOKEN` 等）を env から読む。既定の `stripSecrets` を通すと子の認証が壊れるため、
  detach 経路のみ full env（+ マーカー）を渡せる口を設ける。

未指定時はすべて現状挙動（`detached` なし / `stdio: "ignore"` / `stripSecrets` 適用）に落ちるため、既存
呼び出し元（`factory.ts` / `power-assertion.ts`）は無変更。

**Rationale**: 「why full-env for detach not stripSecrets」— stripSecrets は**外部**サブプロセス
（git / gh / SDK）への credential 漏洩防止の歯。detach 子は specrunner 自身（同一 trust domain）であり、
credentials の伝播が正しい。既存の外部プロセス経路は既定の strip を維持する。
**Alternatives considered**: (a) 専用の `spawnDetached` を新設 → 要件 6 が `spawnBackground` 拡張を明示するため
却下。(b) 必要な secret 名を detach 側で列挙して opts.env に載せる → 名前列挙が fragile で却下。

### D5: 親の guidance slug は子が算出する slug と一致させる

`job wait <slug>` が正しく機能するには、親が出力する slug と子が実際に発行する job の slug が一致しなければ
ならない。

- `job resume`: positional はそのまま slug。
- `run` / `job start`: positional は slug|file。親は run.ts と同じ解決（存在すれば file path、なければ
  `storeResolve` fallback）で request path を得たのち、request parser（`parseRequestMdRaw`、認証・network
  なしの決定的 parse）で slug を抽出する。これは子の preflight が `request.slug` として算出する値と同じ。
  抽出後、`SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` で検証し、不一致なら子を spawn せず非ゼロ終了する
  （不正な slug 値で `job wait <invalid>` 案内を出して子を spawn する UX 混乱を防ぐ）。
- slug 解決に失敗する入力（request を解決できない）では子も失敗するため、親は spawn せずに run.ts と同等の
  エラーを出して非ゼロ終了する（doomed child を作らない）。

**Rationale**: slug は wait の唯一のキー。親子で slug がずれると監視が別 job を指す。
**Alternatives considered**: 子が slug をファイルに書いて親が読む → race で却下。positional を無条件に slug 扱い
→ file 入力で誤り、却下。

### D6: `job wait <slug>` はプロセス生存を gate にする

新コマンド `job wait <slug>`（`src/cli/job-wait.ts` + registry `job.subcommands.wait`）。判定の中核は
**プロセス生存 gate** であり、on-disk status を先に見ない。1 tick の判定 `isSettled(state, sidecarPath)`:

1. pid を解決する（`state.pid` → 無ければ sidecar `.specrunner/local/<slug>/liveness.json` の pid）。
2. **pid が解決できた場合**: `isProcessAlive(pid)` が真の間は **status に関わらず待ち続ける**（生存中は
   `awaiting-resume` / `awaiting-archive` が disk に見えても未確定として待つ = resume disk-lag の誤報吸収の歯）。
   プロセス死亡後に初めて on-disk status を確定値として読む。
3. **pid が解決できない場合（後方互換 state）**: `isStaleRunning` の fallback に従う。status が `running`
   でなければ settled、`running` なら updatedAt 15 分閾値（`isStaleRunning` を再利用）。

poll 間隔（既定 2 秒程度）・時刻・状態ロード・liveness 判定・sidecar pid 解決は DI seam として注入可能にし、
テストが実プロセス・実時間なしで gate を固定できるようにする。

**Rationale**: 「why process-death gate not status poll」— resume の running persist は worktree 側 store に
落ち、main checkout の state.json は `awaiting-resume` のまま残り得る（Context 参照）。status 先行 poll は
原理的に誤報する。プロセス生存が唯一正しい gate。
**Alternatives considered**: on-disk status poll → 却下（disk-lag で誤報、確認済み）。

### D7: wait の settle 報告と終了コード

settle 時に 1 行で `slug` / `status` / 次アクションを stdout に出力する。次アクション写像:

| status | 次アクション | exit code |
|---|---|---|
| awaiting-archive | `specrunner job archive <slug>` | 0 |
| archived | （済。アクションなし） | 0 |
| awaiting-resume | `specrunner job resume <slug>` | 1 |
| failed / terminated | `specrunner job show <slug>`（調査） | 1 |
| canceled | （終端。アクションなし） | 1 |

引数エラー（slug 欠落）・slug 不在 → exit 2。run の既存規約（`runner.ts:325-369` / `EXIT_CODE`）と整合。
出力文言（1 行フォーマット + 次アクション写像）は 1 モジュールに定義しテストで固定する。

**Rationale**: awaiting-archive/archived を成功（0）、要人手の停止（awaiting-resume/failed/terminated/canceled）
を 1 とすることで、`job wait` の exit code をそのまま自動化の分岐に使える。
**Alternatives considered**: 全 settle で 0 → 却下（停止と完了を区別できず自動化に使えない）。

### D8: 運用知識はコマンド出力面に注入する（docs でなく）

- **foreground 起動時案内**: foreground の run / resume 起動時（`!isDetachedChild` のとき）に、pipeline が
  長時間走ること・agent session からは `--detach` + `job wait` を使うことを 1〜数行、`logInfo`（stderr、
  `--quiet` で抑制）で出す。stdout（特に `--json` 契約）には触れない。detach 子（`isDetachedChild`）では出さない。
- **detach 親出力**: D1 の `buildDetachGuidance(slug)`。
- **help**: USAGE の Job commands ブロックに `job wait <slug>` を追記し、`job start` / `job resume` / `run`
  alias 行に `--detach` を明記する。

案内文言（foreground notice / detach guidance）は 1 箇所（例 `src/core/command/operational-guidance.ts` もしくは
detach モジュール）に定義し、テストで存在を固定する。

**Rationale**: 「why 出力面 not docs」— agent が確実に読む唯一の面はコマンド出力。docs は「事故るまで探す動機が
無い」型の罠に届かない。`logInfo`（stderr, quiet 抑制）は foreground の stdout 契約と exit code を変えないため、
「--detach なしの挙動無変更」を満たす。

## Risks / Trade-offs

- **[Risk] foreground 起動時案内で既存 output テストが割れる** → Mitigation: 案内は `logInfo`（stderr）で
  出し、`--quiet` で抑制、stdout（`--json` 含む）には一切書かない。既存テストは主に `toContain` 様式のため
  additive 追加で緑を保つ。T-09 で「既存テスト無変更 green」を検証する。
- **[Risk] detach 子への env full passthrough で secret が想定外プロセスへ漏れる** → Mitigation: full env は
  detach 経路（specrunner 自身の再起動、同一 trust domain）に限定。既存の外部プロセス経路は `stripSecrets`
  既定を維持し、D4 の新フィールド未指定で従来挙動。
- **[Risk] PID reuse で wait が生存誤判定して hang する** → Mitigation: 既存 `isProcessAlive` /
  `isStaleRunning` と同じ既知限界として扱い、Non-Goal に明記。pid 不在経路の 15 分 fallback が下限を与える。
- **[Risk] slug-keyed detach log がログ保持（`pruneOldLogs`）の対象外で無限に残る** → Mitigation: 子は
  pipeline logger 初期化後は `<jobId>.log` に書くため detach log は bootstrap 出力のみで小容量。開き方は
  append とし、肥大が問題化した場合の retention は別 change に分離（本 change の Non-Goal）。
- **[Trade-off] 親が slug 解決のため request.md を軽く parse する（run/job start）** → preflight/auth/network は
  行わない決定的 parse に限定。子が算出する slug との一致（D5）を優先。

## Open Questions

- detach log の開き方（append か truncate か）: 診断のため append を推奨するが、bounded 化を優先するなら
  truncate も可。実装者裁量（挙動契約はテストで固定する範囲外）。
- foreground 起動時案内の行数・正確な文言: 1 箇所定義・テストで存在固定という制約内で実装者が確定する。

## ADR candidate

adr: true。本 change の architectural な決定（D1 self-respawn 内蔵 / D6 process-death gate / D8 出力面への
知識注入 / 却下した既定 detach 化・自動環境検出）は adr-gen step で ADR 化される。
