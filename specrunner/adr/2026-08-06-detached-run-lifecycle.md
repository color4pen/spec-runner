# ADR: Pipeline 生存管理の CLI 内蔵 — detach self-respawn と process-death gate

## ステータス

accepted

## コンテキスト

specrunner の実運用の主経路は LLM agent session（Claude Code 等）からの起動である。agent harness は background task を idle timeout で SIGTERM する（macOS 5 分 / Windows 15 分、2026-08 時点で設定不可の設計挙動 — upstream: anthropics/claude-code #72851）。`run` / `job resume` は foreground blocking であり（`src/cli/run.ts` の `process.exit(await runRunCore(...))`、pipeline 本体は `src/core/pipeline/pipeline.ts` の `while (true)`）、agent が素朴に background 起動すると 1〜2 時間の pipeline が走行中に撃ち落とされる。

現状の回避策は「nohup 二重 fork で PPID=1 に切り離し、pid ファイルを自前管理し、`kill -0` の poll でプロセス死亡を gate してから状態を読む」という shell 手順であり、CLI のどこにも提供されていない。この罠は「事故るまで存在に気づけない型」であるため、docs に書いても届かない。

**待機が process-death を gate しなければならない理由は CLI 自身の構造にある**。resume 走行中、main checkout の `state.json` は `awaiting-resume` のままになり得る。resume の running 遷移は `resolveStateStoreByJobId` で解決した store（worktree 側）に persist され、`runStore` が null のとき skip される（`src/core/command/resume.ts:226-243`）。on-disk status のみを poll すると走行中に terminal と誤報する。この構造的 disk-lag は `job wait` の実装がプロセス生存を gate にすることでのみ正しく吸収できる。

`JobState.pid`・liveness sidecar・`isProcessAlive`・`isStaleRunning` の既存実装が生存判定基盤として存在しており（`src/core/resume/safety.ts`）、これを `job wait` と detach 経路が再利用する。

## 決定

### D1: CLI 内蔵 detach（self-respawn）を opt-in の `--detach` で提供する

`--detach` 指定時、CLI は自分自身を `detached: true` + `unref()` + stdio の log redirect で再 spawn し、親は pipeline を一切実行せずに slug・監視コマンド（`specrunner job wait <slug>`）・log 参照方法（`specrunner job show <slug>`）を出力して即座に `exit 0` する。既定（`--detach` なし）の foreground 挙動・出力・終了コードは一切変えない。

**実装**: 子は `process.execPath` + `process.argv[1]` + `stripDetachFlag(process.argv.slice(2))` で起動する。生 args から `--detach` トークンのみ除去し、他の flag/positional（`--no-worktree` / `--issue` / `--from` / `--prompt` 等）は verbatim に引き継ぐ。cwd は main checkout（親は worktree guard 通過済みなので必ず main checkout にいる）。

**却下案**:
- *docs / skill への手順記載のみ* — 手順は agent の shell 実行に依存し裁量で縮退する。実際に採用プロジェクトへは届かなかった実績がある。
- *既定 detach 化* — run の同期的な exit code（`awaiting-archive → 0`）に依存する CI / attended 利用を壊す非互換。将来の判断として分離。
- *agent 環境の自動検出で detach* — 環境判定は fragile で、挙動が環境により分岐することが新たな不確実性になる。
- *専用の `spawnDetached` を新設* — request.md が `spawnBackground` 拡張を明示するため却下。

### D2: 再帰防止は内部マーカー env `SPECRUNNER_DETACHED=1` で行う

子は env var `SPECRUNNER_DETACHED=1` 付きで起動される。`isDetachedChild(env)` が真のとき、`--detach` が引数に残っていても detach 分岐を skip して foreground 実行する。このマーカーが再帰防止の正典 gate である。生 args からの `--detach` 除去（D1）との二重防御だが、**マーカーが正典**（除去漏れがあっても再 spawn しない）。

環境変数マーカーは spawn 境界を越えて確実に伝播し、args 解析順に依存しない。

**却下案**: *args のみで判定* — 除去漏れ時に無限 fork の危険があり却下。

### D3: detach 子の出力は slug-keyed detach log へ redirect する

子の stdout / stderr を捨てず `.specrunner/logs/<slug>.detach.log` へ redirect する（logger 初期化前の crash 診断のため）。jobId は spawn 時点で未確定なので slug をキーにする。path helper `getDetachLogPath(repoRoot, slug)` を `src/util/xdg.ts` に追加する。子が pipeline logger を初期化した後の pipeline log は従来通り `<jobId>.log` に落ちる。detach log の所在は `job show` から辿れるよう `printJobState` に `Detach log:` 行を追加する（ファイルが存在するときのみ表示）。

**却下案**:
- */dev/null 破棄* — crash 診断不能。
- *jobId キー* — spawn 時点で未確定。

### D4: `spawnBackground` を detach 用途に拡張する（既存呼び出し元は無変更）

`SpawnBackgroundOptions` に任意フィールド `detached?: boolean`・`logFilePath?: string`・`rawEnv?: Record<string, string>` を追加する。未指定時はすべて現状挙動（`detached` なし / `stdio: "ignore"` / `stripSecrets` 適用）に落ちるため、既存呼び出し元（`factory.ts` / `power-assertion.ts`）は無変更。

**full-env passthrough の根拠**: `stripSecrets` は**外部**サブプロセス（git / gh / SDK）への credential 漏洩防止の歯である。detach 子は specrunner 自身（同一 trust domain）であり、`GITHUB_TOKEN` / `ANTHROPIC_API_KEY` 等の credentials を preflight で env から読む。既定の strip を通すと子の認証が壊れる。detach 経路のみ full env（+ マーカー）を渡す口を設け、既存の外部プロセス経路は既定の strip を維持する。

### D5: 親の guidance slug を子が算出する slug と一致させる

`job wait <slug>` が正しく機能するには親が出力する slug と子が実際に発行する job の slug が一致しなければならない。`job resume` では positional がそのまま slug。`run` / `job start` では request path を `parseRequestMdRaw`（認証・network なしの決定的 parse）で slug を抽出し、`SLUG_REGEX` で検証する。slug 解決に失敗する入力では親は spawn せずに非ゼロ終了する（doomed child を作らない）。

**却下案**:
- *子が slug をファイルに書いて親が読む* — race で却下。
- *positional を無条件に slug 扱い* — file 入力で誤り、却下。

### D6: `job wait <slug>` はプロセス生存を gate にする

`job wait` はプロセス生存を gate にして job が settle するまで block する。判定の中核:

1. pid を解決する（`state.pid` → 無ければ liveness sidecar `.specrunner/local/<slug>/liveness.json` の pid）。
2. **pid が解決できた場合**: `isProcessAlive(pid)` が真の間は status に関わらず待ち続ける（resume disk-lag の誤報を吸収）。プロセス死亡後に初めて on-disk status を確定値として読む。status が `running` のまま残っている場合（SIGKILL / クラッシュなど beforeExit を経由しない終了）は `awaiting-resume` として扱う。
3. **pid が解決できない場合（後方互換 state）**: `isStaleRunning` の fallback に従う（status が `running` かつ updatedAt 15 分超で settled）。

poll 間隔・時刻・状態ロード・liveness 判定・sidecar pid 解決は DI seam として注入可能にし、テストが実プロセス・実時間なしで gate を固定できるようにする。

slug 不在の場合は 2 秒間隔 × 5 回リトライしてから exit 2 を返す（detach 親が `job wait` 案内を出力して exit 0 した直後に子の preflight がまだ完了していない初期化ウィンドウでの誤報防止）。

**却下案**: *on-disk status poll* — resume disk-lag で誤報することが確認済み。プロセス生存 gate が唯一正しい実装。

### D7: settle 報告と終了コード規約

settle 時に `slug` / `status` / 次アクションを 1 行で stdout に出力する。次アクション写像:

| status | 次アクション | exit code |
|---|---|---|
| awaiting-archive | `specrunner job archive <slug>` | 0 |
| archived | （済。アクションなし） | 0 |
| awaiting-resume | `specrunner job resume <slug>` | 1 |
| failed / terminated | `specrunner job show <slug>`（調査） | 1 |
| canceled | （終端。アクションなし） | 1 |

引数エラー（slug 欠落）・slug 不在 → exit 2。`run` の既存規約（`runner.ts` / `EXIT_CODE`）と整合する。出力文言は 1 モジュールに定義しテストで固定する。

### D8: 運用知識はコマンド出力面に注入する（docs でなく）

- **foreground 起動時案内**: foreground の run / resume 起動時（`!isDetachedChild` のとき）に、pipeline が長時間走ること・agent session からは `--detach` + `job wait` を使うことを `logInfo`（stderr、`--quiet` で抑制）で出す。stdout（`--json` 契約）と終了コードを変えない。detach 子では出さない。
- **detach 親出力**: `buildDetachGuidance(slug)` を `src/core/command/detach.ts` に一元定義する。
- **help**: USAGE の Job commands ブロックに `job wait <slug>` を追記し、`job start` / `job resume` / `run` 行に `--detach` を明記する。

案内文言（foreground notice / detach guidance）は 1 箇所に定義し、output contract テストで存在を固定する。

**根拠**: agent が確実に読む唯一の面はコマンド出力である。docs は「事故るまで探す動機が無い」型の罠に届かない（採用プロジェクトで実証済み）。`logInfo`（stderr, quiet 抑制）は foreground の stdout 契約と exit code を変えないため「`--detach` なしの挙動無変更」要件と両立する。

## 検討した代替案

### Alternative 1: docs / skill への手順記載のみ

「nohup 二重 fork で PPID=1 に切り離し、`kill -0` で poll する」手順を docs / skill に記載する。

- **Pros**: CLI の変更なし。実装コスト最小。
- **Cons**: 手順は agent の shell 実行の巧拙に依存し、agent session の制約（write tool 不使用 / nohup 知識不足）で縮退する。実際に採用プロジェクトへは届かなかった。
- **Why not**: 「事故るまで存在に気づけない型の罠」に docs は届かない。対策は指示の配布ではなく判断場面の消去である。

### Alternative 2: 既定 detach 化（すべての run を自動で detach）

`--detach` を opt-in ではなく既定挙動にする。

- **Pros**: agent が何もしなくても SIGTERM から守られる。
- **Cons**: run の同期的な exit code（`awaiting-archive → 0`）に依存する CI パイプライン / attended 利用がすべて破壊される非互換変更になる。既存テストが大量破壊される。
- **Why not**: 非互換性のリスクが高く、将来の別 request として明示的に分離。opt-in（`--detach`）+ 出力面での案内で移行を促す。

### Alternative 3: agent 環境の自動検出で detach

`CLAUDE_AGENT` 等の env var を検出して自動で detach するか否かを切り替える。

- **Pros**: agent が `--detach` を知らなくても保護される。
- **Cons**: 環境判定は fragile（env var の有無は運用により変動する）。挙動が環境により分岐することが新たな不確実性になる。CI で同じコマンドが異なる挙動をする場合の debuggability が下がる。
- **Why not**: 「環境判定 → 挙動分岐」の構造そのものが新たな罠になる。透明な opt-in の方が動作が予測可能。

### Alternative 4: `job wait` を on-disk status の poll で実装

`state.json` の status を定期的に読み、terminal status（`awaiting-archive` / `awaiting-resume` / `failed` / `terminated` / `canceled`）になったら報告する。

- **Pros**: 実装が単純。プロセス管理の知識が不要。
- **Cons**: resume 走行中に main checkout の `state.json` が `awaiting-resume` のまま残る構造的 disk-lag により、走行中に terminal status と誤報する。これは設計上不可避で、on-disk poll では根本的に解決できない。
- **Why not**: 実際の運用障害の発生源がこの誤報であり、on-disk poll で実装することは障害を「解決済み」に見せかけながら継続させることになる。

## 影響

### Positive

- agent session が `--detach` を指定するだけで SIGTERM から pipeline を保護できる。nohup 二重 fork の shell 手順知識が不要になる。
- `job wait` が process-death gate により resume 走行中の disk-lag 誤報を CLI 内部で吸収し、自動化スクリプトが `job wait` の exit code を分岐に使えるようになる。
- 起動時案内・help・detach 親出力により、運用知識が agent が確実に読む面（コマンド出力）に注入される。
- foreground の挙動・出力・終了コードは一切変わらない（CI / attended 利用は無変更）。

### Negative

- detach log（`.specrunner/logs/<slug>.detach.log`）が `pruneOldLogs` の対象外で残存する。子は pipeline logger 初期化後は `<jobId>.log` に書くため detach log は bootstrap 出力のみで小容量だが、retention は未解決。
- detach 子への full-env passthrough は credentials を detach 子（specrunner 自身）に渡す設計例外。今後のコードレビューで detach 経路を変更する場合は credentials が伝播することを念頭に置く必要がある。

### 既知の限界

- PID reuse（pid が死亡後に別プロセスに再利用される）による wait の誤判定は既存 `isProcessAlive` / `isStaleRunning` と同じ既知限界として扱う。pid 不在経路の 15 分 fallback が下限を与える。
- Windows での detach 挙動は POSIX を一次対象としており未検証（`detached: true` + `unref()` は POSIX 系での動作保証）。

### 将来の開発者への注意

- **`--detach` の出力が stdout に書く場合は `--json` 契約と競合する** — detach 親出力はテキスト形式で stdout に書く。`--detach --json` の同時指定は ARG_ERROR（exit 2）とすることで `--json` 契約を前提にパースする自動化がパースエラーになる事故を防ぐ。この制約は維持すること。
- **新しい credentials を env から読む場合**: detach 経路は `rawEnv`（full env passthrough）を使う。`stripSecrets` の除去パターンが更新された場合、detach 子が新 credentials を正しく受け取っていることを確認すること。
- **`SPECRUNNER_DETACHED` マーカーを他の用途に流用しない** — このマーカーは「detach 子として起動された」という状態のみを表す。他の条件分岐（環境検出・機能 flag 等）に使い回すと detach の再帰防止 gate の意味論が壊れる。

## 参照

- Request: `specrunner/changes/detached-run-lifecycle/request.md`
- Design: `specrunner/changes/detached-run-lifecycle/design.md`
- Spec: `specrunner/changes/detached-run-lifecycle/spec.md`
- Review: `specrunner/changes/detached-run-lifecycle/review-feedback-001.md`, `review-feedback-002.md`
- 実装: `src/core/command/detach.ts`（self-respawn 実装）、`src/core/command/operational-guidance.ts`（案内文言）、`src/cli/job-wait.ts`（process-death gate 実装）
- Related ADR: [2026-05-26-process-lifecycle-keepalive](./2026-05-26-process-lifecycle-keepalive.md) — KeepAlive sentinel による pipeline / process lifecycle binding。本 ADR が外部（agent harness）からの SIGTERM に対処するのに対し、KeepAlive は Bun event loop の早期 exit に対処する相補的な関係にある。
- Related ADR: [2026-05-27-cli-log-persistence](./2026-05-27-cli-log-persistence.md) — pipeline log の session 非依存な永続化（`.specrunner/logs/<jobId>.log`）。本 ADR の detach log（`<slug>.detach.log`）はこの延長として同じ logs ディレクトリに置く。
