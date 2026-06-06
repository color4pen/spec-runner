# Design: `.specrunner/jobs/` への読み取り依存を slug/sidecar 起点に移行する

## Context

job state は2系統で正本を持つ。

- **slug 正本**（`specrunner/changes/<slug>/state.json` + `events.jsonl`, branch 同伴）— status / step / journal / pullRequest 等のポータブルな真実。local runtime job は run 中の step 遷移をここ（worktree 配下）へ書く。
- **sidecar**（machine-local, `.specrunner/local/<slug>/`）— local は `liveness.json`（`{ pid, session, worktreePath, jobId }`）、managed は `marker.json`（`{ slug, jobId, status, createdAt }`）。いずれも `jobId` を保持し、`jobId ↔ slug ↔ worktreePath` の index になる。

加えて legacy の jobId-keyed ストア `.specrunner/jobs/<jobId>/`（`state.json` + `events.jsonl`、旧 flat `<jobId>.json` も含む）が dual-write されており、`JobStateStore.list()` / `resolveId()` と多くの caller が**読み取り**でこれに依存する。jobId ストアは冗長で、job 作成時（`status=running` / `step=init`）の stub が以後の step 遷移を受けずに凍結するため、`list()` の dedup（newest `updatedAt`）に救われてはいるものの「どのストアを読むか」の取り違えで不整合を生む温床になっている。

本変更は **local runtime job** について `.specrunner/jobs/` への**読み取り依存をゼロ**にする。jobId / cross-branch アクセスは「sidecar で `jobId → slug → worktreePath` を解決 → その slug dir（active=worktree 内、archived=`changes/archive/`）から state を読む」経路に置き換える。**書き込み（dual-write）は本変更では一切触れない**安全な中間状態とする。

managed runtime は full state を `.specrunner/jobs/<jobId>/` のみに保持し slug 正本を持たない（slug dir に dual-write しない）。slug 正本から読む本変更の前提が成立しないため managed runtime はスコープ外とし、managed の jobs-dir 読み取り経路（`list()` の managed marker → jobs-dir、section 4）は温存する。

### 既存の再利用可能な部品（先行 change で導入済み）

- `resolveCanonicalStateDir(slug, repoRoot)`（`src/core/finish/resolve-canonical-state-dir.ts`）— active（`changes/<slug>/`）優先、無ければ archive（`changes/archive/<dated>-<slug>/`）の state dir を返す。date prefix 非依存。
- `JobStateStore` の `changeDir` seam — slug-mode opts に state ディレクトリ絶対パスを明示注入でき、`load()`（fold）/ `persist()`（delta-append）を archive-location でも回せる。
- `getJobSlug(state)`（`src/state/job-slug.ts`）— slug → branch → request.path basename の fallback 解決。

### 触れる主な seam

- `src/store/job-state-store.ts` — `JobStateStore.list()`（section 1/1b/2/3/4）、`resolveId()`、`load()`（jobId-mode fallback は温存）。
- `src/util/paths.ts` — `livenessJsonPath` / `managedMarkerPath` / `localSidecarDir`、および `.specrunner/local` base の列挙ヘルパー。
- `src/core/finish/resolve-canonical-state-dir.ts` — archived/active(main-checkout) state dir 解決（再利用）。
- caller: `src/cli/job-show.ts`（UUID load）、`src/core/cancel/runner.ts`（`cancelSingleJob` load）、`src/core/command/resume.ts`（resolveId fallback load）、`src/core/finish/resolve-target.ts`（`resolveByJobId` load）。
- `src/core/archive/orchestrator.ts` — Phase 2 の worktreePath クリア（jobId ストア → sidecar へ repoint）。
- tests: `tests/resolve-job-id.test.ts`、`tests/state-store.test.ts`（TC-047）、`tests/store/job-state-store.test.ts`、archive/cancel/resume の各 caller test。

## Goals / Non-Goals

**Goals**:

- `JobStateStore.list()` / `resolveId()` が **local runtime job** について `.specrunner/jobs/` を readdir しない。
- jobId / cross-branch の解決を sidecar index（`liveness.json` / `marker.json`）+ slug dir に一本化し、local の state 本体を worktree（active）/ `changes/archive/`（archived）から読む。
- local runtime job の状態読み取り caller（`job show` / `job cancel` load / `resume` load / archive `resolve-target` load）を slug 経由に移行する。
- archive Phase 2 の worktreePath クリアを isolated に sidecar へ repoint する。
- managed の可視性（marker → jobs-dir, section 4）と dual-write の書き込み挙動を不変に保つ。
- `bun run typecheck && bun run test` を green に保つ。

**Non-Goals**:

- **managed runtime の jobs-dir 依存**の解消（managed は slug 正本を持たないため別 request）。`list()` の managed marker → jobs-dir 経路は温存する。
- jobId ストアへの**書き込み**（dual-write 本体）の撤去。read 移行のみ。
- `JobStateStore.load()` の `.specrunner/jobs/` fallback（特定 path の `readFile`）除去。本変更は **readdir スキャン**を外すだけで、最後の安全網としての fallback readFile は温存する。
- 旧 `.specrunner/jobs/<jobId>(.json|/)` データの migration、`xdg.ts` helper / doctor checks の撤去。

## Decisions

### D1: sidecar を index とする `jobId ↔ slug ↔ worktreePath` resolver を新設する

`.specrunner/local/*` を列挙し、各 slug dir の `liveness.json`（local）/ `marker.json`（managed）を読んで `{ slug, jobId, worktreePath, kind }` の entry 列を返す helper を store 層に置く（例: `src/store/local-job-index.ts`）。

- `listLocalSidecars(repoRoot): Promise<LocalSidecarEntry[]>` — `.specrunner/local/*` を一度だけ readdir し、各 dir で `liveness.json` → `kind="local"`、無ければ `marker.json` → `kind="managed"` を読む。壊れた / 不在の sidecar は skip。
- `resolveJobIdToSlug(repoRoot, jobId): Promise<LocalSidecarEntry | null>` — entry 列から `jobId` 一致を返す。

この helper は `fs` と `src/util/paths.ts` のみに依存し、`core/` を import しない（store 層の最下層に保つ）。`JobStateStore.list()` / `resolveId()` がこの helper を index として用いる。

**Rationale**: jobId ストアが担っていた「全 job の index（jobId 列挙）」を sidecar に置き換える。sidecar はそもそも `jobId ↔ slug ↔ worktreePath` を持つために導入された machine-local index であり、これを唯一の index にすれば jobs-dir の readdir を読み取り経路から外せる。store 層に閉じることで `JobStateStore` から循環なく参照できる。

**Alternatives considered**:
- *jobs-dir を readdir したまま entry から runtime を判定して local だけ除外する*: readdir 自体を消す要件（AC1）を満たせない。却下。
- *sidecar 読みを各 caller に inline したまま共通化しない*: 既に resume / cancel / orchestrator に同じ `liveness.json` 読みが重複しており、index 化の機会に 1 箇所へ集約する。

### D2: `list()` から local jobs-dir スキャン（section 3）を撤去し、local を sidecar/worktree/archive 経路に置き換える

`JobStateStore.list()` の現状の走査は次の5区画。

1. current checkout の active slug 状態（`specrunner/changes/*/state.json`）
2. (1b) current checkout の archived slug 状態（`specrunner/changes/archive/*/state.json`）
3. local worktrees の active slug 状態（`.git/specrunner-worktrees/*/specrunner/changes/*/state.json`）
4. (旧 section 3) **legacy jobs-dir スキャン**（`.specrunner/jobs/<jobId>/` split-layout + flat `<jobId>.json`）
5. (section 4) managed marker → jobs-dir（`.specrunner/local/<slug>/marker.json` → jobId → jobs-dir state）

本変更は **(4) legacy jobs-dir スキャンを撤去**する（`getJobsDir(repoRoot)` の readdir を削除）。local active job の state 本体は (3) worktree slug dir、archived は (1b) `changes/archive/` から引き続き得られる。さらに sidecar index（D1）を local の index として組み込み、(1)/(1b)/(3) でまだ拾えていない local sidecar entry については、その `worktreePath` の slug dir（active）→ `resolveCanonicalStateDir`（archived）の順で state 本体を解決して merge する（dedup は従来どおり jobId / newest `updatedAt`）。state 本体がどこにも無い（worktree 削除済み・未 archive の）entry は full state を作れないため list には現れないが、jobId は sidecar index 側に保持され `resolveId`（D3）で失われない。

managed の **section 4（marker → jobs-dir）は完全温存**する。section 4 は `.specrunner/local/*` を readdir し marker.json と特定 jobId の `state.json` を `readFile` するのみで、jobs-dir の readdir は行わない。

**Rationale**: 「active=worktree 内 slug dir、archived=`changes/archive/`、index=sidecar」を `list()` の local 経路の正式モデルにする。jobs-dir は frozen stub であり、dedup で常に負けるか取り違えの種にしかならないため readdir を外す。managed は slug 正本を持たないため marker 経由の jobs-dir 読みを唯一の可視経路として残す。

**Alternatives considered**:
- *worktree 走査 (3) も sidecar の `worktreePath` 駆動に置き換える*: brute-force worktree readdir を減らせるが、(3) は現状 cross-branch 可視性を支える実績経路であり、本変更では温存して回帰面を最小化する。sidecar 駆動は (3) を補完する位置づけにとどめる。
- *degraded entry を最小 JobState として合成して list に出す*: status/step を捏造する必要があり、表示の意味が無い。jobId 保持は `resolveId` の責務に寄せる。却下。

### D3: `resolveId()` を sidecar index + slug 状態の合併候補で解決する

`resolveId(repoRoot, prefix)` は現状「full UUID は素通し、そうでなければ `list()` を呼んで `jobId.startsWith(prefix)` で絞る」。`list()` から jobs-dir スキャンが消えるため、候補集合を **`list()` の jobId 群 ∪ sidecar index（D1）の jobId 群**にする。full UUID（36 文字）の素通しは不変。

- 0 件 → `JOB_NOT_FOUND`、1 件 → 確定、2 件以上 → `AMBIGUOUS_JOB_ID`（既存挙動）。

**Rationale**: worktree 削除済み・未 archive の degraded local job も sidecar に jobId を持つため、prefix 解決から取りこぼさない（要件5「jobId は失わない」）。active/archived/managed は `list()` 側で拾え、両者の union で漏れと jobs-dir 依存を同時に解消する。

**Alternatives considered**:
- *候補を sidecar index のみにする*: archived（sidecar が無い / 古い）や managed の取りこぼしが出る。union が安全。却下。

### D4: local runtime state-read caller を `jobId → slug → slug-dir load` に移行する

jobId 起点で state を読む caller を共通 helper 経由に揃える。helper は store + core/finish を束ねられる core 層に置く（例: `loadStateByJobId(repoRoot, jobId)`）。

解決順:
1. `resolveJobIdToSlug(repoRoot, jobId)`（D1）で sidecar entry を得る。
2. `kind="local"`:
   - `worktreePath` の `specrunner/changes/<slug>/state.json` が存在 → `new JobStateStore(jobId, repoRoot, { slug, stateRoot: worktreePath }).load()`（active）。
   - 無ければ `resolveCanonicalStateDir(slug, repoRoot)` → 解決 dir を `changeDir` seam に渡して `load()`（archived / main-checkout）。
3. `kind="managed"`: `new JobStateStore(jobId, repoRoot).load()`（jobs-dir。managed スコープ温存）。
4. sidecar 不在: `new JobStateStore(jobId, repoRoot).load()`（jobs-dir + legacy flat の fallback readFile。Non-Goal どおり温存する安全網）。

移行対象:
- `src/cli/job-show.ts` — UUID branch の `new JobStateStore(input, repoRoot).load()`。
- `src/core/cancel/runner.ts` — `cancelSingleJob` の load。
- `src/core/command/resume.ts` — slug 解決失敗時の resolveId fallback load。
- `src/core/finish/resolve-target.ts` — `resolveByJobId` の load。

各 caller の**書き込み（persist）は触れない**（dual-write 温存）。読み取りソースのみ slug 起点へ切り替える。

**Rationale**: caller を 1 つの解決経路に集約することで、jobId 直読み（jobs-dir）を読み取りの主経路から外す。active は worktree、archived は archive、と location=identity を保ったまま slug 正本を読む。fallback readFile は readdir スキャンではないため AC1（jobs-dir を readdir しない）に抵触しない。

**Alternatives considered**:
- *各 caller を `list()` + jobId filter に揃える*: 直 load の高速経路を失い、全走査コストを毎回払う。jobId→slug の直接解決の方が軽く意図も明確。却下。

### D5: archive Phase 2 の worktreePath クリアを sidecar へ repoint する

`src/core/archive/orchestrator.ts` Phase 2 は worktree 削除後に `new JobStateStore(jobId, cwd)` を load → `persist({ ...current, worktreePath: null })` で jobId ストアの worktreePath をクリアしている。これを **sidecar（`liveness.json`）の `worktreePath` を `null` に更新する** isolated な読み書きに置き換える（jobId ストア read/write を行わない）。sidecar 不在（ENOENT）は best-effort で無視。dual-write 本体・他の persist には触れない。

**Rationale**: slug モデルでは worktreePath は machine-local（sidecar 管理）の値であり、jobId ストアへ書くのは vestige。archive 完了時に worktree が消える事実を sidecar に反映すれば、以後の sidecar 駆動解決（D1/D4）が現実と整合する。jobId ストアの read/write を 1 箇所減らせて読み取り脱依存にも寄与する。

**Alternatives considered**:
- *sidecar ごと削除する*: archived local job の jobId→slug 解決を sidecar から失う。state 本体は archive scan で拾えるが、isolated repoint（worktreePath=null）の方が情報を保ちつつ最小。却下。
- *jobId ストアへの書き込みを残す*: 読み取りを外しても vestige の write が残り、worktreePath の現実と乖離した値が sidecar 駆動解決の邪魔になる。repoint する。

### D6: 書き込み（dual-write）と managed 読み取り経路を温存する

dual-write 本体（`LocalRuntime.updateJobState` の jobId ストア + slug ストア二重書き、`create()` の jobId ストア初期化、cancel/resume の jobId ストア persist 等）は本変更で**一切変更しない**。managed の section 4（marker → jobs-dir）と `load()` の jobs-dir fallback readFile も温存する。

**Rationale**: 本変更は「読み取りのみを slug/sidecar 起点へ移す」安全な中間状態に限定する。書き込み撤去・managed slug 化は後続 request に切り分けることで、既存挙動（特に managed と crash recovery）を壊さずに段階的に jobs-dir 依存を縮退させる。

## Risks / Trade-offs

- [Risk] **canceled local job の degraded 化**: `cancelSingleJob` は cleanup（worktree 削除）を persist より先に行い、canceled state を jobId ストアへ persist する（write はスコープ外で不変）。本変更で `list()` が jobId ストアを読まなくなるため、worktree 削除済み・未 archive の canceled local job は full state を `list()` に出せず degraded（jobId は sidecar に保持）になる。→ **Mitigation**: 既定 `job ls` は `!isTerminal` で terminal を元々除外するため既定表示は不変。`--all` での canceled local job 表示は変わり得るため test を更新し、要件5「degrade 表示でよいが jobId を失わない」の範囲であることを固定する。
- [Risk] **terminal managed job の `--all` 可視性**: managed の終端化で marker が clear される経路では、marker 不在の terminal managed job は section 4 で拾えず、旧 section 3（直 jobs-dir scan）だけが拾っていた。section 3 撤去で `--all` から外れ得る。→ **Mitigation**: AC3 の managed 可視性は marker 保持の **active** managed job を対象に固定する。managed は本変更スコープ外（slug 正本を持たず archive 経路自体が未対応）であり、managed の完全な可視性は slug 化の後続 request で担保する。Open Question に明記する。
- [Risk] **jobs-dir-only fixture の既存 test が破綻**: `tests/resolve-job-id.test.ts`（TC-02/04/05）と `tests/state-store.test.ts`（TC-047）は `create()` で jobId ストアのみに job を作り、`list()`/`resolveId()` がそれを拾う前提。section 3 撤去で破綻する。→ **Mitigation**: 新 index モデル（sidecar + slug dir）でセットアップし直す。`resolveId` 系は `liveness.json` を併置、`list()` の corrupt-skip 系は worktree/archive slug 状態の壊れケースへ移す。
- [Trade-off] **degraded entry を list に出さない**: status/step を捏造しないため、worktree 喪失かつ未 archive の job は `job ls` 一覧から消える（jobId は `resolveId` で生存）。表示の正確性を優先し、合成表示を避ける。

## Open Questions

- terminal managed job（marker clear 済み）の `--all` 可視性を本変更で部分的に失う点は、managed slug 化の後続 request で恒久解決する想定でよいか（暫定的に jobs-dir-only に頼らないことを優先）。
- archive Phase 2 で sidecar の worktreePath を `null` に repoint する際、archived local job の sidecar をいずれ撤去するか（state 本体は archive scan で十分なため、index としての sidecar の寿命をどこまで延ばすか）は後続で再検討。
- dual-write（jobId ストア書き込み）撤去の後続 request で、本変更が残した jobs-dir fallback readFile と `create()` の jobId ストア初期化をまとめて畳む。

## Migration Plan

- 振る舞い互換: 読み取り経路の差し替えのみで、ファイル形式・slug 正本・sidecar の schema は不変。既存 job の state 本体（worktree / archive / jobs-dir）はそのまま読める（local は slug 経由、fallback で jobs-dir readFile 可）。
- 既存 job: 本変更後も active local job は worktree slug dir、archived は `changes/archive/` から `list()` に現れる。sidecar を持つ local job は `resolveId` でも解決できる。sidecar が無い旧 job は fallback readFile（D4 step4）で個別 load 可能。
- rollback: section 3 復活 + caller の load を jobId 直読みへ戻すだけで従来挙動に戻る。書き込み・managed・データ形式は不変のため互換性は保たれる。
- ADR: 新規 index 経路（sidecar を唯一の jobId index に昇格）と読み取り契約（jobId→slug→slug-dir）の確立を伴うため、`adr: true`。ADR は後続ステップで起票する。
