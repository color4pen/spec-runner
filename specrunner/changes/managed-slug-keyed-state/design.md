# Design: managed runtime の machine-local state を slug キーに移す

## Context

job state は性質ごとに置き場が分かれている。

- **slug 正本**（`specrunner/changes/<slug>/state.json` + `events.jsonl`, branch 同伴 / worktree 配下）— local runtime の portable な真実。
- **sidecar**（machine-local, `.specrunner/local/<slug>/`）— local は `liveness.json`（`{ pid, session, worktreePath, jobId }`）、managed は `marker.json`（`{ slug, jobId, status, createdAt }`）。`jobId ↔ slug` の index。
- **jobId ストア**（`.specrunner/jobs/<jobId>/state.json` + `events.jsonl`）— legacy。`decouple-jobs-dir-reads` / `decouple-jobs-dir-writes` で local の読み書きは slug 正本 + sidecar へ移行済み。**残る最後の利用者が managed**。

managed runtime は worktree / feature branch を持たない（no-op workspace）。cloud agent が実体を進め、local CLI は追跡するだけなので、managed の進行中 JobState は **branch-borne にできず machine-local** である。現状はこれを jobId キーの `.specrunner/jobs/<jobId>/` に full state として置き、`marker.json`（slug キー）から jobId を引いて load している。

この jobId ストア依存が `.specrunner/jobs/` を生かし続ける唯一の理由になっている。本変更は managed の machine-local state を、その性質（machine-local / full state）を保ったまま、**キーを jobId から slug に変え** `.specrunner/local/<slug>/`（marker / liveness と同じ場所）へ移す。

### 現状の managed jobs-dir 利用経路

書き込み（W）と読み取り・解決（R）に分かれる。

| # | 場所 | 内容 |
|---|------|------|
| W1 | `ManagedRuntime.bootstrapJob()` → `JobStateStore.create()` | 初期 state を jobId ストアへ永続化 |
| W2 | `ManagedRuntime.updateJobState()` | `new JobStateStore(jobId, cwd)` で load→mutate→persist（setupWorkspace 内の request.path / branch 更新） |
| W3 | `ManagedRuntime.persistJobState()` | `new JobStateStore(jobId, cwd).persist()` |
| W4 | `ManagedRuntime.buildDeps()` の `storeFactory` | `(id) => new JobStateStore(id, cwd)`（pipeline 各 step persist / crash persist が利用） |
| W5 | `ManagedRuntime.registerCleanup()` の `signalCleanup` | `new JobStateStore(jobId, cwd)` で load→transition→persist（SIGINT/SIGTERM） |
| R1 | `JobStateStore.list()` section 4 | marker.json → jobId → `getJobStateJsonPath/getJobEventsPath`（jobs-dir）から load |
| R2 | `loadStateByJobId()` の `kind="managed"` 分岐 | `new JobStateStore(jobId, repoRoot).load()`（jobs-dir） |
| R3 | `resolveStateStoreByJobId()` の `kind="managed"` 分岐 | `new JobStateStore(jobId, repoRoot)`（jobs-dir） |

さらに cross-cutting な persist 経路（`command/resume.ts` / `cancel/runner.ts` / `lifecycle/exit-guard.ts`）は runtime 非依存で、managed job に対しては R3（`resolveStateStoreByJobId`）の解決結果を使って persist する。

## Goals / Non-Goals

**Goals**:

- managed の全 persist 経路（W1–W5）が `.specrunner/local/<slug>/`（state.json + events.jsonl）へ書き、`.specrunner/jobs/<jobId>/` には書かない。
- managed の全 read / resolve 経路（R1–R3）が `.specrunner/local/<slug>/` から state を取得し、`.specrunner/jobs/` を参照しない。
- managed の cross-cutting persist（resume / cancel / exit-guard）が `resolveStateStoreByJobId` 経由で `.specrunner/local/<slug>/` に着地する。
- `marker.json` を **純粋な index** に整理し、`state.json` を full state の単一正本とする（重複・不整合を残さない）。
- machine-local / full state という managed state の性質を保つ（slug 正本のような portable strip をしない）。
- `bun run typecheck && bun run test` を green に保つ。

**Non-Goals**（別 request `retire-jobs-dir` で扱う）:

- `.specrunner/jobs/` の helper（`xdg.ts` の `getJobsDir` 系）、`load()` の jobs-dir fallback readFile、doctor checks の撤去。
- 既存 `.specrunner/jobs/<jobId>/` データの migration。

## Decisions

### D1: `.specrunner/local/<slug>/` を「machine-local full state ストア」として `changeDir` seam で表現する

`JobStateStore` には 3 つの path 解決モードがある（`changeDir` > slug-mode > jobId）。managed の置き場 `.specrunner/local/<slug>/` は slug 正本（`specrunner/changes/<slug>/`）でも jobs-dir でもないため、任意ディレクトリを指せる **`changeDir` seam** を使う。

- managed store = `new JobStateStore(jobId, cwd, { changeDir: <cwd>/.specrunner/local/<slug> })` を生成する private helper `managedLocalStore(jobId, slug)` を `managed.ts` に置き、W1–W5 全経路がこれを使う。
- **slug / stateRoot は渡さない**（`changeDir` 単独）。これにより `isSlugMode()` が false となり、`persist()` の `stateToStateJson(state, { slugMode: false })` が **machine-local フィールドを strip せず full state を書く**。managed state の性質（machine-local / full）がそのまま保たれる。
- path helper `localSlugStateJsonPath(slug)` / `localSlugEventsPath(slug)`（`.specrunner/local/<slug>/state.json` / `events.jsonl`）を `src/util/paths.ts` に追加し、`list()` / job-access の直接 path 構築でも再利用する（path 知識の集約、TC-034: paths.ts は他 src module を import しない制約を維持）。

**Rationale**: 要件「machine-local の性質を保ったまま、キーを jobId → slug に変える」を最小変更で満たす。slug 正本（`isSlugMode`）を選ぶと portable strip（worktreePath/pid/session/request.slug/path を除去）が掛かり managed state が痩せてしまう。`changeDir` 単独は **置き場だけを差し替え、内容は full state のまま**にできる唯一のモード。

**Alternatives considered**:
- *slug-mode（slug + stateRoot）を使い strip を受容*: `pid` が strip され managed running job の cancel pid-kill / stale 判定が劣化する。machine-local 性質の保持に反する。却下。
- *managed 専用の新ストアクラス / 新 path モードを追加*: `changeDir` seam で表現できるため新クラスは不要。最小依存（North Star）に反する。却下。

### D2: `JobStateStore.load()` が `changeDir` を slug-mode と独立に尊重する（store seam）

現状 `load()` は `if (this.isSlugMode())` の分岐内でのみ `getStateJsonPath()`（= `changeDir` 反映）を使い、それ以外は jobId path を読む。`changeDir` 単独（D1 の managed store）では `isSlugMode()` が false のため、`load()` が `changeDir` を無視して jobs-dir を読んでしまう。

- `load()` の分岐条件を `if (this.changeDir || this.isSlugMode())` に変える。`slugInject`（request.slug / request.path の convention 注入）は `isSlugMode()` の時のみ渡す（managed full state は request.slug/path を自前で持つため inject 不要）。

**影響範囲**: 既存の `changeDir` 利用箇所（`local.ts` の `persistJobState` canonical-dir 経路、job-access の local 分岐）は常に slug + stateRoot を伴い `isSlugMode()` が true のため、本変更で挙動は変わらない。`persist()` は既に `getStateJsonPath()`（changeDir 反映）で書くため変更不要。

**Rationale**: 「どこを読むか（path 解決）」と「strip するか（slug-mode）」という別概念が `load()` で結合していたのを解く最小の修正。これにより `changeDir` 単独ストアが read/write 対称に機能する。

### D3: managed の初期 state 永続化を `setupWorkspace` の seed に defer する（bootstrap は I/O なし）

`bootstrapJob(repoRoot, params)` が受け取る `params.request.slug` は **draft path から導出した slug**（`pipeline-run.ts` の `requestSlug`、非 canonical path では `null`）であり、marker / setupWorkspace が使う**権威ある slug**（`request.slug` メタ、`setupWorkspace` の `slug` 引数）とは別物である。bootstrap 時点では権威ある slug を確実に得られないため、slug キーの置き場を bootstrap で確定できない。

- `ManagedRuntime.bootstrapJob()` を `buildInitialJobState(params)` を返すだけの **I/O なし**実装にする（local と同一）。jobs-dir への `create()` 書き込みをやめる。
- `ManagedRuntime.setupWorkspace()` が、**run 経路（branchName あり）**で `opts.bootstrapState` を `managedLocalStore(jobId, slug)` へ fresh write（seed）する。これが events.jsonl + state.json を `.specrunner/local/<slug>/` に確立し、後続の `updateJobState`（request.path / branch 更新）が load 可能になる。
- **resume 経路（branchName なし）**では seed しない（原 run の seed 済みストアが既存）。marker の write/refresh のみ（現状維持）。running 遷移の persist は `ResumeCommand.prepare()` が `resolveStateStoreByJobId`（R3 → local/slug）経由で既に行う。

**Rationale**: 権威ある slug は `setupWorkspace(slug, …)` の明示引数として渡る。初期永続化をそこへ寄せることで slug キーの取り違え（path 派生 slug vs メタ slug、null）を構造的に排除する。これは `decouple-jobs-dir-writes` D1/D2 が local に確立した defer パターンの managed への適用であり、両 runtime の bootstrap が揃う。

**Trade-off（crash window）**: jobId 採番後・seed 前のクラッシュで当該 job の記録は残らない。draft（`specrunner/drafts/<slug>/`）が setupWorkspace の request.md 移動成功まで残るため re-run で回復可能（`decouple-jobs-dir-writes` D5 と同列の許容）。

**Alternatives considered**:
- *bootstrap が `params.request.slug` で local/slug に persist*: 非 canonical path で `null`、かつ path 派生 slug がメタ slug と乖離した場合に marker と別ディレクトリへ書く split を生む。却下。
- *port `bootstrapJob` に権威 slug 引数を追加*: local 側にも不要な引数が伝播し、`pipeline-run.ts` の params.request.slug 構築（local の挙動）にも波及する。defer の方が変更が局所的。却下。

### D4: managed の read / resolve 経路を local/slug へ向ける

- **`JobStateStore.list()` section 4**: marker.json 列挙はそのまま（managed active job の index）。各 marker の jobId に対し、load 元を `getJobStateJsonPath/getJobEventsPath`（jobs-dir）から `localSlugStateJsonPath(slug)/localSlugEventsPath(slug)`（同 slug ディレクトリ）へ変える。dedup（jobId / newest updatedAt）はそのまま。
- **`loadStateByJobId()` の `kind="managed"`**: `new JobStateStore(jobId, repoRoot).load()` を `changeDir` 単独ストア（`sidecarEntry.slug`）の `.load()` へ。
- **`resolveStateStoreByJobId()` の `kind="managed"`**: 同様に `changeDir` 単独ストア（`sidecarEntry.slug`）を返す（persist 用）。

これにより managed の読み取り・解決経路から `.specrunner/jobs/` 参照が消える。no-sidecar 安全網（step 4 / 末尾 fallback の jobId ストア）は legacy 用に温存する（Non-Goal）。

**Rationale**: marker は `.specrunner/local/<slug>/marker.json` にあり、full state は同ディレクトリの state.json に co-locate される。section 4 / job-access は marker（→ slug）から同ディレクトリの state を読むだけでよい。

### D5: marker.json を純粋 index にし、state.json を full state の単一正本にする

`marker.json` の現スキーマは `{ slug, jobId, status, createdAt }` だが、`status` は書き込み時に `"running"` 固定で **どこからも読まれず**、state.json の本物の status（awaiting-archive 等）と乖離しうる。要件 4「marker は index、state.json が full state、重複・不整合を残さない」に従い、marker を index に絞る。

- `writeManagedMarker()` の出力を `{ slug, jobId, createdAt }` にする（`status` を除去。`status` 固定値を避けるための pattern-scan 回避 hack も不要になる）。
- marker の lifecycle（setupWorkspace で write、terminal teardown / cancel で clear）は不変。`local-job-index.ts` / `list()` section 4 は marker から `jobId` のみ読むため読取りロジックは不変。
- status の真実は state.json（同ディレクトリ、full state）に一本化される。

**Rationale**: index と full state の責務を分離し、never-read で乖離源になる重複フィールドを除去する。

**Note**: terminal（archived/canceled）で marker を clear する既存挙動は維持するため、terminal managed job の `--all` 可視性 / jobId 解決は marker 消失後に低下しうる（`decouple-jobs-dir-reads` で既知の debt）。本変更は active / awaiting-archive（marker 保持）の正しさを対象とし、terminal の恒久可視化は扱わない（Risks 参照）。

### D6: cancel の managed marker clear を canceled-state persist の後に行う

`cancelSingleJob` は `cleanupJobResources`（worktree/branch 削除 **+ 現状は marker unlink**）を persist より前に実行する。marker を先に消すと、後続の canceled-state persist で `resolveStateStoreByJobId` が marker を見つけられず（R3）、managed を no-sidecar 安全網（jobId ストア）に誤って落としてしまう。

- `cleanupJobResources` から **managed marker unlink を切り出し**、canceled-state persist の **後**に best-effort で実行する。worktree/branch cleanup は persist 前のまま（local の degraded skip 挙動 = `decouple-jobs-dir-writes` D6 を保つ）。
- これにより managed cancel は marker 在中に `resolveStateStoreByJobId` → local/slug を解決し、canceled state を local/slug へ persist してから marker を消す。local cancel は marker を持たないため末尾 clear は no-op。
- **`--purge`**: `JobStateStore.delete(jobId)`（jobs-dir / legacy）に加え、`.specrunner/local/<slug>/` ディレクトリを best-effort 削除して managed の full state を物理削除する（移設に伴う purge の取りこぼし防止）。

**Rationale**: marker は managed の唯一の runtime 判別 index。persist が runtime を正しく解決するには persist 時点で marker が在る必要がある。clear の順序を persist 後にずらすのが最小かつ正しい修正。

**Alternatives considered**:
- *cancel で store を cleanup 前に解決して保持*: local では worktree 削除後に持ち越した worktree ストアへ persist してしまい orphan を作る（D6/local の skip を壊す）。却下。

## Risks / Trade-offs

- [Risk] **既存テストの破綻**（managed が jobs-dir に書く前提のテスト）: `tests/unit/core/runtime/managed.test.ts`（TC-07 / TC-036）、`tests/load-by-job-id.test.ts`（TC-023）、`tests/unit/core/job-access/resolve-state-store.test.ts`（TC-024）、`makeJobStateForManaged`（`JobStateStore.create` セットアップ）が該当。→ Mitigation: 実装で local/slug 起点へ更新（tasks 参照）。
- [Risk] **terminal managed job の可視性低下**（D5 Note）: marker clear 後、`--all` 一覧 / jobId 解決から terminal managed が外れうる。→ Mitigation: 既定 `job ls` は terminal を元々除外。active / awaiting-archive（marker 保持）は不変。恒久可視化（local/slug 列挙ベース）は scope 外、必要なら後続 request。
- [Trade-off] **bootstrap crash window**（D3）→ Mitigation: draft 残存で re-run 回復可能。
- [Trade-off] **`load()` seam の拡張**（D2）が全 `changeDir` 利用者に波及 → Mitigation: 既存利用は slug + stateRoot 同伴で `isSlugMode()` true のため挙動不変。新規（managed changeDir 単独）のみ新経路に入る。

## Open Questions

- terminal managed job の `--all` 恒久可視化（`.specrunner/local/<slug>/state.json` 直接列挙）を本変更に含めるか、後続 request に切り出すか。現設計は最小（marker 駆動）を採り、後者に倒す。
- managed の archive が local/slug state をどう扱うか（changes/archive へ移すか否か）は `.specrunner/jobs/` 撤去（`retire-jobs-dir`）と合わせて再検討。

## Migration Plan

- **振る舞い互換**: 置き場の差し替え（jobs-dir → local/slug）と marker schema の slim 化のみ。state.json / events.jsonl の内部 schema は不変。
- **既存 job**: 旧 `.specrunner/jobs/<jobId>/` の managed データの migration は行わない（Non-Goal `retire-jobs-dir`）。本変更後に開始する managed job が local/slug を使う。
- **rollback**: W1–W5 / R1–R3 を元の jobId ストア構築へ戻し、marker に status を復元すれば従来挙動に復帰（データ形式不変で互換）。
- **ADR**: machine-local state の slug キー化、`changeDir` を full-state seam として用いる設計選択、marker の index 化、cancel の clear 順序変更を伴うため `adr: true`。ADR は後続ステップで起票する。
