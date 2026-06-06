# local runtime job の読み取り経路を sidecar index + slug dir に一本化する

**Date**: 2026-06-06
**Status**: accepted
**Related**: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir を state の正本とする段2移行の上位決定）
**Related**: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の DI パターン）

## Context

slug dir 移行（`event-journal-slug-dir-state-model.md` D5/D7/D8）により、local runtime job の state 正本は `specrunner/changes/<slug>/`（branch 同伴）に、machine-local index は `.specrunner/local/<slug>/liveness.json` に移った。しかし `JobStateStore.list()` / `resolveId()` と複数の caller が依然として legacy の jobId-keyed ストア `.specrunner/jobs/<jobId>/` の **readdir スキャン**に依存しており、以下の問題があった。

- jobs-dir の `state.json` は job 作成時（`status=running` / `step=init`）の stub が以後の step 遷移を受けずに凍結するため、slug dir の正本と乖離し不整合の温床になっていた。
- `list()` の dedup（newest `updatedAt`）でかろうじて救われているが、読むストアを取り違えれば不正な古い値を返す。
- managed runtime は slug dir への dual-write を持たないため、managed の jobs-dir 読み取りを一律に切り離すことはできなかった。

## Decision

### D1: `listLocalSidecars()` を store 層の新モジュール（`local-job-index.ts`）に置き、sidecar を唯一の local jobId index に昇格する

`.specrunner/local/*` を一度だけ readdir し、各 slug dir の `liveness.json`（local）/ `marker.json`（managed）を読んで `{ slug, jobId, worktreePath, kind }` の entry 列を返す `listLocalSidecars(repoRoot)` helper を `src/store/local-job-index.ts` に置く。`resolveJobIdToSlug(repoRoot, jobId)` はこの entry 列から jobId 一致を返す。

この module は `fs` と `src/util/paths.ts` のみに依存し、`core/` を import しない。

**Rationale**: sidecar はもともと `jobId ↔ slug ↔ worktreePath` の machine-local index として設計されており、それを唯一の local index にすれば jobs-dir の readdir を読み取り経路から完全に外せる。store 層の最下層に閉じることで `JobStateStore` から循環なく参照できる。

### D2: `list()` から local jobs-dir スキャン（旧 section 3）を撤去し、local を sidecar/worktree/archive 経路に置き換える

`list()` の local 読み取り経路を次の順で確立する:

1. current checkout の active slug 状態（`specrunner/changes/*/state.json`）
2. current checkout の archived slug 状態（`specrunner/changes/archive/*/state.json`）
3. worktree 走査（`.git/specrunner-worktrees/*`）の active slug 状態
4. sidecar index（D1）を補完として組み込み、上記 (1)-(3) で拾えていない local sidecar entry について `worktreePath` の slug dir（active）→ `resolveCanonicalStateDir`（archived）の順で state 本体を解決

旧 jobs-dir readdir（`.specrunner/jobs/` の `getJobsDir` scan）は撤去する。managed の section 4（marker → jobs-dir, `readFile` のみ、readdir ではない）は完全温存する。

**Rationale**: active=worktree 内 slug dir、archived=`changes/archive/`、index=sidecar を `list()` の local 正式モデルにする。jobs-dir は frozen stub であり dedup で常に負けるか取り違えの種にしかならないため readdir を外す。

### D3: `resolveId()` の候補集合を `list()` の jobId 群 ∪ sidecar index に拡張する

`resolveId(repoRoot, prefix)` の候補集合を `list()` の jobId 群と sidecar index（D1）の union にする。worktree 削除済み・未 archive の degraded local job も sidecar に jobId を持つため、prefix 解決から取りこぼさない。

**Rationale**: 「jobId を失わない」を保証するには `list()` から消えた degraded entry も解決できる必要がある。union が最小の安全策。

### D4: local runtime state-read caller を `jobId → slug → slug-dir load` に集約する

`loadStateByJobId(repoRoot, jobId)`（`src/core/job-access/load-by-job-id.ts`）を core 層に新設し、次の解決順を定める:

1. `resolveJobIdToSlug(repoRoot, jobId)` で sidecar entry を得る
2. `kind="local"`: `worktreePath` の slug dir（active）→ `resolveCanonicalStateDir`（archived）の順で `JobStateStore({ changeDir }).load()`
3. `kind="managed"`: jobs-dir 経由の `JobStateStore(jobId).load()`（managed スコープ温存）
4. sidecar 不在: jobs-dir + legacy flat の fallback `readFile`（安全網として温存）

移行 caller: `job-show.ts`（UUID branch）、`cancel/runner.ts`（`cancelSingleJob` load）、`command/resume.ts`（resolveId fallback load）、`finish/resolve-target.ts`（`resolveByJobId` load）。各 caller の書き込み（dual-write / jobId ストア persist）は不変。

**Rationale**: caller を 1 つの解決経路に集約することで jobId 直読み（jobs-dir）を読み取りの主経路から外す。fallback readFile は readdir スキャンではないため「jobs-dir readdir ゼロ」の不変条件に抵触しない。

### D5: archive Phase 2 の worktreePath クリアを sidecar へ repoint する

`archive/orchestrator.ts` Phase 2 の worktree teardown 後の worktreePath クリアを、jobId ストアへの read/write ではなく sidecar（`liveness.json`）の `worktreePath` を `null` に更新する isolated な操作に置き換える。sidecar 不在（ENOENT）は best-effort で無視。dual-write 本体には触れない。

**Rationale**: slug モデルでは worktreePath は machine-local（sidecar 管理）の値。archive 完了時の事実（worktree 消去）を sidecar に反映することで、以後の sidecar 駆動解決（D1/D4）が現実と整合する。

### D6: 書き込み（dual-write）と managed 読み取り経路を温存する

本変更は**読み取り経路のみ**を slug/sidecar 起点に移す安全な中間状態とし、dual-write 本体（jobId ストアへの書き込み）と managed の section 4（marker → jobs-dir）は一切変更しない。`load()` の jobs-dir fallback readFile も温存する。

**Rationale**: 書き込み撤去・managed slug 化は別 request に切り分けることで、既存挙動（managed 可視性・crash recovery）を壊さずに段階的に jobs-dir 依存を縮退させる。

## Alternatives Considered

### Alternative 1: jobs-dir readdir を残し、entry から runtime を判定して local だけ除外する

- **Cons**: `fs.readdir` 呼び出し自体が残るため「local jobs-dir を readdir しない」受け入れ基準を満たせない
- **Why not**: 却下

### Alternative 2: sidecar 読みを各 caller に inline したまま共通化しない

- **Cons**: resume / cancel / orchestrator に同じ `liveness.json` 読みが重複しており、エラー処理の一貫性と今後のメンテナンスコストが高まる
- **Why not**: index 化の機会に `local-job-index.ts` へ集約することで重複を解消する

### Alternative 3: worktree 走査 (section 3) も sidecar の `worktreePath` 駆動に置き換える

- **Cons**: brute-force worktree readdir を減らせるが、section 3 は cross-branch 可視性を支える実績経路。本変更で回帰面を最小化するため温存し、sidecar 駆動は補完位置に留める
- **Why not**: 既存挙動の保護を優先し、完全置き換えは後続で検討

### Alternative 4: degraded entry を最小 JobState として合成して list に出す

- **Cons**: `status` / `step` を捏造する必要があり表示の意味が無い
- **Why not**: jobId 保持は `resolveId` の責務に寄せ、list には現れない設計にする

### Alternative 5: `resolveId()` の候補を sidecar index のみにする（`list()` との union をとらない）

- **Pros**: 実装が単純になり、呼び出しが 1 本に絞られる
- **Cons**: archived job（sidecar が無い / 古い）や managed job の jobId を取りこぼす
- **Why not**: `list()` の jobId 群との union をとることで archived / managed を漏らさず、かつ degraded local の sidecar-only entry も拾える。union が安全

### Alternative 6: 各 caller を `list()` + jobId filter に統一する（`loadStateByJobId` helper を作らない）

- **Pros**: 解決経路を `list()` に一本化でき、helper module が不要
- **Cons**: `list()` の全走査コストを jobId 直 load のたびに払う。jobId → slug の直接解決より重く、意図も不明確になる
- **Why not**: sidecar → slug-dir の直接解決経路を持つ `loadStateByJobId` の方が軽く、caller の意図が明確

### Alternative 7: archive Phase 2 で jobId ストアへの書き込みを残す（worktreePath クリアの repoint をしない）

- **Pros**: archive Phase 2 の変更量が最小
- **Cons**: 読み取りを sidecar 駆動に移した後も vestige の jobs-dir write が残り、worktreePath の現実と乖離した値が sidecar 駆動解決の邪魔になる
- **Why not**: sidecar の worktreePath を null に repoint することで、D1/D4 の sidecar 駆動解決が archive 後の状態と整合する

### Alternative 8: sidecar ごと削除する（archive Phase 2 の代替）

- **Pros**: archived job の sidecar が不要になり cleanup が早まる
- **Cons**: archived local job の `jobId → slug` 解決を sidecar から失う
- **Why not**: `worktreePath: null` への isolated repoint が情報を保ちつつ最小変更

## Consequences

### Positive

- local runtime job の `list()` / `resolveId()` が jobs-dir readdir に依存せず、frozen stub による不整合が構造的に排除される
- `jobId → slug → slug-dir` の一本化された解決経路が確立され、caller ごとの読み先取り違いが起きなくなる
- worktree 削除済み・未 archive の degraded local job も sidecar index 経由で jobId を失わない
- archive Phase 2 の worktreePath クリアが slug モデルの正しい書き先（sidecar）に向く

### Negative / Known Debt

- canceled local job（worktree 削除済み・未 archive）は `job ls` 一覧から消える。`--all` での完全可視性は archive 後に確保される（既定 `job ls` は terminal を除外するため影響なし）
- terminal managed job（marker clear 済み）の `--all` 可視性が部分的に低下する可能性がある。managed slug 化の後続 request で恒久解決する
- `resolveId()` が `list()` と `listLocalSidecars()` を並列で呼ぶため `.specrunner/local/` readdir が 1 回の呼び出しで 2 度発生する。`list()` に sidecar entries を戻り値に含めるか内部 API を共有化することで後続 request で解消する
- dual-write（jobId ストアへの書き込み）と fallback readFile は暫定的に残存する。後続 request で dual-write 撤去・managed slug 化とともに畳む

## References

- Request: `specrunner/changes/decouple-jobs-dir-reads/request.md`
- Design: `specrunner/changes/decouple-jobs-dir-reads/design.md`
- Related: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir state model の上位決定、D7/D8 に本 ADR の前提が置かれている）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（`changeDir` seam の DI パターン）
- Related: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md`（`.specrunner/jobs/` 配置の決定）
