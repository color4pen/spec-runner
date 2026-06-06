# managed runtime の machine-local state を slug キーの local/slug ディレクトリへ移す

**Date**: 2026-06-07
**Status**: accepted
**Related**: `specrunner/adr/2026-06-06-decouple-jobs-dir-writes.md`（local runtime の jobs-dir 書き込み撤去。managed を温存した前提）
**Related**: `specrunner/adr/2026-06-06-decouple-jobs-dir-reads.md`（local runtime の jobs-dir 読み取り撤去）
**Related**: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir を state 正本とする上位決定）
**Related**: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の changeDir seam）

## Context

`decouple-jobs-dir-writes` / `decouple-jobs-dir-reads` で local runtime の jobs-dir 依存は撤去済みだが、managed runtime は依然 `.specrunner/jobs/<jobId>/` を唯一の JobState 置き場として利用していた。これが jobs-dir を生かし続ける最後の理由となっていた。

managed runtime は worktree / feature branch を持たない（no-op workspace）。cloud agent が実体を進め、local CLI は追跡するだけなので、managed の JobState は branch-borne にできず machine-local に置く必要がある。現状はこれを jobId キーの `.specrunner/jobs/<jobId>/`（full state）に置き、`marker.json`（`.specrunner/local/<slug>/`）から jobId を引いて load していた。

利用経路は書き込み（W1–W5）と読み取り・解決（R1–R3）に分かれる:

| # | 種別 | 場所 |
|---|------|------|
| W1 | 書き | `bootstrapJob()` → `JobStateStore.create()` で jobId ストアへ初期 state |
| W2 | 書き | `updateJobState()` が jobId ストア経由で load→mutate→persist |
| W3 | 書き | `persistJobState()` が jobId ストアへ persist |
| W4 | 書き | `buildDeps()` の `storeFactory` が jobId ストアを参照（pipeline step / crash persist） |
| W5 | 書き | `registerCleanup()` の signal ハンドラが jobId ストアへ awaiting-resume persist |
| R1 | 読み | `JobStateStore.list()` section 4: marker → jobId → jobs-dir から load |
| R2 | 読み | `loadStateByJobId()` の `kind="managed"` 分岐: jobId ストアから load |
| R3 | 解決 | `resolveStateStoreByJobId()` の `kind="managed"` 分岐: jobId ストアを返す（persist 用） |

## Decision

### D1: `.specrunner/local/<slug>/` を managed の「machine-local full state ストア」とし `changeDir` seam で表現する

`JobStateStore` には `changeDir` > slug-mode > jobId の 3 つの path 解決モードがある。managed の置き場 `.specrunner/local/<slug>/` は slug 正本（`specrunner/changes/<slug>/`）でも jobs-dir でもないため、任意ディレクトリを指せる **`changeDir` seam** を使う。

- `managed.ts` に private helper `managedLocalStore(jobId, slug)` を置き、`new JobStateStore(jobId, cwd, { changeDir: <cwd>/.specrunner/local/<slug> })` を生成する。W1–W5 の全 persist 経路がこれを使う。
- **slug / stateRoot は渡さない**（`changeDir` 単独）。これにより `isSlugMode()` が false となり、`persist()` の `stateToStateJson` が **machine-local フィールドを strip せず full state を書く**。managed state の機械ローカルな性質（pid / session / worktreePath / request.slug / request.path を保持）がそのまま維持される。
- path helper `localSlugStateJsonPath(slug)` / `localSlugEventsPath(slug)` を `src/util/paths.ts` に追加し（TC-034: paths.ts は他 src module を import しない制約を維持）、list() / job-access の直接 path 構築でも再利用する。

**Rationale**: slug 正本を選ぶと portable strip（machine-local フィールドの除去）が掛かり managed state が痩せる。`changeDir` 単独は **置き場だけを差し替え、内容は full state のまま**にできる唯一のモード。

### D2: `JobStateStore.load()` が `changeDir` を slug-mode と独立に尊重する

現状 `load()` は `if (this.isSlugMode())` の分岐内でのみ `getStateJsonPath()`（changeDir 反映）を使い、それ以外は jobId path を読む。`changeDir` 単独（D1 の managed store）では `isSlugMode()` が false のため、`load()` が `changeDir` を無視して jobs-dir を読んでしまう。

- `load()` の分岐条件を `if (this.changeDir || this.isSlugMode())` に変える。`slugInject`（request.slug / request.path の convention 注入）は `isSlugMode()` の時のみ渡す（managed full state は request.slug/path を自前で持つため inject 不要）。

**影響範囲**: 既存の `changeDir` 利用箇所（`local.ts` の `persistJobState` canonical-dir 経路、job-access の local 分岐）は常に slug + stateRoot を伴い `isSlugMode()` が true のため、本変更で挙動は変わらない。

**Rationale**: 「どこを読むか（path 解決）」と「strip するか（slug-mode）」という別概念が `load()` で結合していたのを解く最小の修正。これにより `changeDir` 単独ストアが read/write 対称に機能する。

### D3: managed の初期 state 永続化を `setupWorkspace` の seed に defer する（bootstrap は I/O なし）

`bootstrapJob(repoRoot, params)` が受け取る `params.request.slug` は draft path から導出した slug（非 canonical path では null になりうる）であり、marker / setupWorkspace が使う権威ある slug（`setupWorkspace` の `slug` 引数）とは別物。bootstrap 時点では slug キーの置き場を確実に確定できない。

- `ManagedRuntime.bootstrapJob()` を `buildInitialJobState(params)` を返すだけの I/O なし実装にする（local と同一パターン）。`JobStateStore.create()` の jobs-dir 書き込みをやめる。
- `ManagedRuntime.setupWorkspace()` が、**run 経路（branchName あり）**で `opts.bootstrapState` を `managedLocalStore(jobId, slug)` へ fresh write（seed）する。これが events.jsonl + state.json を `.specrunner/local/<slug>/` に確立し、後続の `updateJobState` が load 可能になる。
- **resume 経路（branchName なし）**では seed しない（原 run の seed 済みストアが既存）。

**Rationale**: 権威ある slug は `setupWorkspace(slug, …)` の明示引数として渡る。初期永続化をそこへ寄せることで slug 取り違え（path 派生 slug vs メタ slug、null）を構造的に排除する。`decouple-jobs-dir-writes` D1/D2 が local に確立した defer パターンの managed への適用であり、両 runtime の bootstrap が揃う。

bootstrap crash window（jobId 採番後・seed 前のクラッシュ）: draft（`specrunner/drafts/<slug>/`）が setupWorkspace の request.md 移動成功まで残るため re-run で回復可能（`decouple-jobs-dir-writes` D5 と同列の許容）。

### D4: managed の read / resolve 経路を local/slug へ向ける

- **`JobStateStore.list()` section 4**: marker.json 列挙はそのまま（managed active job の index）。各 marker の slug に対し、load 元を `getJobStateJsonPath/getJobEventsPath`（jobs-dir）から `localSlugStateJsonPath(slug)/localSlugEventsPath(slug)` へ変える。
- **`loadStateByJobId()` の `kind="managed"`**: `new JobStateStore(jobId, repoRoot).load()` を `changeDir` 単独ストア（`sidecarEntry.slug` から slug を引く）の `.load()` へ。
- **`resolveStateStoreByJobId()` の `kind="managed"`**: 同様に `changeDir` 単独ストア（`sidecarEntry.slug`）を返す（persist 用）。

**Rationale**: marker は `.specrunner/local/<slug>/marker.json` にあり、full state は同ディレクトリの state.json に co-locate される。section 4 / job-access は marker（→ slug）から同ディレクトリの state を読むだけでよい。

### D5: marker.json を純粋 index にし、state.json を full state の単一正本にする

`marker.json` の現スキーマは `{ slug, jobId, status, createdAt }` だが、`status` は書き込み時 `"running"` 固定で**どこからも読まれず**、state.json の本物の status と乖離しうる重複フィールドだった。

- `writeManagedMarker()` の出力を `{ slug, jobId, createdAt }` にする（`status` を除去）。
- status の真実は state.json（same dir, full state）に一本化される。

**Rationale**: index と full state の責務を分離し、never-read で乖離源になる重複フィールドを除去する。

### D6: cancel の managed marker clear を canceled-state persist の後に行う

`cancelSingleJob` は `cleanupJobResources`（worktree/branch 削除 + 現状は marker unlink）を persist より前に実行する。marker を先に消すと、後続の canceled-state persist で `resolveStateStoreByJobId` が marker を見つけられず、managed を no-sidecar 安全網（jobId ストア）に誤って落としてしまう。

- `cleanupJobResources` から **managed marker unlink を切り出し**、canceled-state persist の **後**に best-effort で実行する。
- **`--purge`**: jobs-dir の `JobStateStore.delete(jobId)` に加え、`.specrunner/local/<slug>/` ディレクトリを best-effort 削除する（移設に伴う purge の取りこぼし防止）。

**Rationale**: marker は managed の唯一の runtime 判別 index。persist 時点で marker が在ることを保証するには clear を persist の後に置くしかない。

## Alternatives Considered

### Alternative 1: D1 — slug-mode（slug + stateRoot）を使い strip を受容する

- **Pros**: 既存の slug-mode path を変更なしに利用できる
- **Cons**: `pid` が strip され running managed job の cancel pid-kill / stale 判定が劣化する。machine-local full state の保持に反する
- **Why not**: managed state は machine-local の性質を保つ必要があり、strip を受容できない。却下

### Alternative 2: D1 — managed 専用の新ストアクラス / 新 path モードを追加する

- **Pros**: 責務を明確に分離した専用実装ができる
- **Cons**: `changeDir` seam で表現できるため不要な複雑さになる。最小依存（North Star）に反する
- **Why not**: 既存 seam で要件を満たせる場合に新クラスを追加しない。却下

### Alternative 3: D3 — bootstrap が `params.request.slug` で local/slug に persist する

- **Pros**: bootstrap 時点で local/slug に書き、crash window を縮小できる
- **Cons**: 非 canonical path で slug が null になりうる。path 派生 slug がメタ slug と乖離した場合に marker と別ディレクトリへ書く split を生む
- **Why not**: slug 取り違えを構造的に排除できない。却下

### Alternative 4: D3 — `bootstrapJob` port に権威 slug 引数を追加する

- **Pros**: bootstrap 時点で権威ある slug を確実に受け取り、crash window を縮小できる
- **Cons**: local 側の `bootstrapJob` にも不要な引数が伝播し、`pipeline-run.ts` の `params.request.slug` 構築ロジック（local の挙動）にも波及する。変更が defer より広範になる
- **Why not**: defer の方が変更が局所的で、local の既存 bootstrapJob シグネチャを保持できる。却下

### Alternative 5: D6 — cancel で store を cleanup 前に解決して保持する

- **Pros**: marker 消失前に store を確保できる
- **Cons**: local では worktree 削除後に持ち越した worktree ストアへ persist してしまい orphan を作る（`decouple-jobs-dir-writes` D6/local の skip を壊す）
- **Why not**: local の degraded skip 挙動を破壊する。却下

## Consequences

### Positive

- managed runtime が `.specrunner/jobs/<jobId>/` を読みも書きもしなくなり、jobs-dir の存在意義が消える（後続 `retire-jobs-dir` の前提が揃う）
- machine-local full state が slug キーの単一ディレクトリ（`.specrunner/local/<slug>/`）に集約される。marker / liveness / state が同所に co-locate される
- `changeDir` seam の「full-state mode」用途が確立し、slug-mode（portable strip）と明確に使い分けられる
- marker から never-read の `status` が除去され、index としての責務が純化される

### Negative / Known Debt

- bootstrap crash window（jobId 採番後・seed 前）で当該 job の記録が残らない。draft 残存で re-run 回復可能（D3）
- terminal managed job（canceled/archived で marker clear 済み）の `--all` 一覧 / jobId 解決は marker 消失後に低下しうる。恒久可視化（local/slug 列挙ベース）は後続 request で対応
- managed archive が local/slug state をどう扱うか（changes/archive へ移すか否か）は `retire-jobs-dir` と合わせて再検討

## References

- Request: `specrunner/changes/managed-slug-keyed-state/request.md`
- Design: `specrunner/changes/managed-slug-keyed-state/design.md`
- Related: `specrunner/adr/2026-06-06-decouple-jobs-dir-writes.md`（local runtime の jobs-dir 書き込み撤去。本 ADR の前提）
- Related: `specrunner/adr/2026-06-06-decouple-jobs-dir-reads.md`（読み取り経路の一本化）
