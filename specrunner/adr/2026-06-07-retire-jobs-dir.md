# `.specrunner/jobs/` を完全撤去し jobId-keyed ストアを廃止する

**Date**: 2026-06-07
**Status**: accepted
**Related**: `specrunner/adr/2026-06-06-decouple-jobs-dir-reads.md`（local runtime の jobs-dir 読み取り撤去）
**Related**: `specrunner/adr/2026-06-06-decouple-jobs-dir-writes.md`（local runtime の jobs-dir 書き込み撤去）
**Related**: `specrunner/adr/2026-06-07-managed-state-slug-keyed-local-dir.md`（managed runtime の slug キー化）
**Related**: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir を state 正本とする上位決定）
**Related**: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の changeDir seam）

## Context

`decouple-jobs-dir-reads` / `decouple-jobs-dir-writes` / `managed-slug-keyed-state` の 3 request が merge 済みになり、local / managed いずれの runtime も active な read / write で `.specrunner/jobs/<jobId>/`（jobId-keyed ストア）を使わなくなった。残るのは後方互換のための死蔵コードと旧データのみ：

| # | 場所 | 内容 |
|---|------|------|
| L1 | `JobStateStore.load()` | slug/changeDir 不在時に split-layout → legacy flat を読む fallback |
| L2 | `JobStateStore.getEventsPath()` / `getStateJsonPath()` | slug/changeDir 不在時に jobId-store path を返す |
| L3 | `JobStateStore.create()` | jobId ストアへ初期 state を書く（production caller なし） |
| L4 | `JobStateStore.delete()` | `getJobDir` / `getJobStatePath` で jobs-dir / legacy flat を削除 |
| R-step4 | `loadStateByJobId()` 末尾 | sidecar 解決失敗時に jobs-dir を読む安全網 |
| R-step3 | `resolveStateStoreByJobId()` 末尾 | sidecar 解決失敗時に jobs-dir ストアを返す安全網 |
| LR1 | `LocalRuntime.buildDeps()` の `storeFactory` | worktreePath 不在時に `new JobStateStore(id, cwd)` |
| LR2 | `LocalRuntime.registerCleanup()` の `makeStore` | slugOpts 不在時に `new JobStateStore(jobId, cwd)` |
| X1 | `xdg.ts` | `getJobsDir` / `getJobStatePath` / `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath` |
| D1 | `doctor/checks/storage/jobs-writable.ts` | `.specrunner/jobs/` の writable チェック |
| D2 | `doctor/checks/storage/old-state-files.ts` | `.specrunner/jobs/*.json` の GC カウント |
| P1 | `prompts/rules.ts` | `.specrunner/jobs/<jobId>.json` への言及 |

先行 3 request でこれらの「着地先」が消えたため、fallback / helper / create / delete / 安全網を安全に撤去できる状態になった。旧データは自動 migration せず doctor が検出して手動削除を促す（R1〜R3 で active 参照がゼロになったため自動 migration は不要と architect が評価）。

## Decision

### D1: `JobStateStore` を slug / changeDir 専用ストアにし、jobId-only モードを廃止する

`JobStateStore` の path 解決を「slug-mode（`slug` + `stateRoot`）」と「changeDir seam」の 2 モードに限定し、jobId-only モード（`new JobStateStore(jobId, repoRoot)` で slug / changeDir を伴わない構成）を**廃止**する。

- **`load()`**: 「slug/changeDir 分岐 → ENOENT で jobId path へ fall-through → legacy flat readFile」を、`changeDir || isSlugMode()` を前提にする実装へ変える。いずれでもない場合は `SpecRunnerError`（内部不変条件違反）を throw する。slug/changeDir 経路の `ENOENT` は fall-through せずそのまま伝播させる。
- **`getEventsPath()` / `getStateJsonPath()`**: changeDir / slug-mode の分岐のみ残し、末尾の jobId-store path 返却を削除する。両モード不在時は throw する。
- **`create()`**: production caller が存在せず jobId ストアへ書く唯一の static method。メソッドごと削除する。
- **`delete()`**: jobs-dir / legacy flat を物理削除する唯一の static method。メソッドごと削除し、purge 責務を呼び出し側（slug を保持する cancel runner）へ移す（D3 参照）。

**Rationale**: jobId-only モードは jobs-dir を生かす最後の構造的根拠。先行 3 request で全 active 経路が slug/changeDir に移ったため、モードを 2 つに絞れば helper / fallback / create / delete が一斉に不要になる。

### D2: job-access の no-sidecar 安全網を撤去し、read=エラー / write=null に変える

`loadStateByJobId` / `resolveStateStoreByJobId` は sidecar（liveness / marker）→ slug 起点で解決する。末尾の「sidecar なし → jobs-dir」安全網を撤去する。

- **`loadStateByJobId()`**（read）: sidecar 解決が尽きた場合に `new JobStateStore(jobId, repoRoot).load()` を呼ぶ末尾を削除し、`SpecRunnerError(JOB_NOT_FOUND)` を throw する。`job show` の catch に JOB_NOT_FOUND 分岐を補いメッセージを揃える。
- **`resolveStateStoreByJobId()`**（write）: 末尾 `return new JobStateStore(jobId, repoRoot)` を `return null` に変える。呼び出し側（resume / cancel / exit-guard）は既に `null` を degraded skip として扱う。

**Rationale**: 安全網は「sidecar を持たない legacy local job」を jobs-dir に着地させるためのもの。jobs-dir 撤去後はその着地先が無いため、read は「見つからない」、write は「書ける場所が無い＝skip」に倒すのが正しい。

### D3: `local.ts` の no-worktree fallback を撤去し、cancel purge を slug 起点に統一する

- **`LocalRuntime.buildDeps()` の `storeFactory`**: `wtp` 不在時の `new JobStateStore(id, this.cwd)` を撤去する。`buildDeps` は `setupWorkspace` 後にのみ呼ばれ `worktreePath` が常に在るため、不在は不変条件違反として throw する。
- **`LocalRuntime.registerCleanup()` の `makeStore`**: `slugOpts` 不在時の `new JobStateStore(jobId, cwd)` を撤去する。`makeStore` は best-effort cleanup 内（try/catch）で使われるため、`slugOpts` 不在時は throw でよい（caught → best-effort skip）。
- **cancel の purge**: `JobStateStore.delete()` 削除（D1）に伴い、物理削除を slug 起点に寄せる。単体 `--purge`（`cancelSingleJob`）では `.specrunner/local/<slug>/` 削除を唯一の物理削除とし、`JobStateStore.delete(jobId)` 呼び出しを削除する。一括 `cancelAllTerminated` では `JobStateStore.delete(repoRoot, state.jobId)` を `getJobSlug(state)` 起点の `.specrunner/local/<slug>/` best-effort 削除に置換する（slug 空なら skip）。

**Rationale**: purge の対象は machine-local state。新 layout ではそれが `.specrunner/local/<slug>/` に集約される。purge 時点で marker は既に unlink 済みのため sidecar 再解決はできず、`state` から得た slug を直接使うのが正しい。

### D4: doctor の storage check を sidecar 起点 + legacy 検出に置換する

- **`jobs-writable` → `local-state-writable`**: 検査対象を `.specrunner/jobs/` から `.specrunner/local/`（liveness / marker / managed full state の書き込み先）へ変える。「存在 + writable → pass / 不在 + 直近祖先 writable → warn / 不在 or not writable → fail」のロジックは温存する。`required: true` を維持。
- **`old-state-files` → `legacy-jobs-dir`**: GC カウント（100 件閾値）をやめ、`.specrunner/jobs/` が存在すれば `warn` を返し、手動削除（`rm -rf .specrunner/jobs`）を hint で促す。不在なら `pass`。`required: false` を維持。

**Rationale**: writable チェックは新 write 先（sidecar root）へ repoint することで storage health 監視を保持する。GC チェックは旧データ検出 + 手動削除促しに転用する。

### D5: `prompts/rules.ts` の job state path を新真実へ更新する

`RULES_MD_CONTENT` の `- **Job state**: .specrunner/jobs/<jobId>.json` を、新しい置き場（slug 正本 + machine-local sidecar）を表す記述へ更新する。

**Rationale**: rules.md は全 pipeline agent が読む。撤去済みの path を残すと誤誘導になる。

### D6: `xdg.ts` の jobId-store path helper 5 種を完全削除する

`getJobsDir` / `getJobStatePath` / `getJobStateJsonPath` / `getJobEventsPath` / `getJobDir` を `src/util/xdg.ts` から削除し、参照箇所を解消する。

**Rationale**: これらの helper は jobs-dir layout に特化しており、新 layout（slug 正本 / `.specrunner/local/<slug>/`）では不要。定義ごと削除することで「import できない → 使えない」型封鎖が成立する。

## Alternatives Considered

### Alternative 1: D1 — jobId-only モードを no-op stub として残す

- **Cons**: production 非到達の死蔵モードを型に残すのは負債。将来の誤用を招く
- **Why not**: fail-loud（throw）が安全。却下

### Alternative 2: D1 — `create()` を slug 正本書き込みに作り替えて温存する

- **Cons**: `create()` 時点で権威ある slug は無く（`request.slug` は null 可）、置き場を確定できない。bootstrap defer（先行 request の確立パターン）に反する
- **Why not**: 却下

### Alternative 3: D2 — 安全網を sidecar なしでも slug 推測で解決する

- **Cons**: jobId からは slug を推測できない（index は sidecar のみ）
- **Why not**: 却下

### Alternative 4: D3 — purge 時に `delete(jobId)` を sidecar 解決で slug 化する

- **Cons**: purge 時点で marker は既に unlink 済みのため sidecar 解決が不能
- **Why not**: 解決できない経路を呼び出すことになる。却下

### Alternative 5: D3 — `delete()` を slug 引数版に signature 変更して温存する

- **Cons**: 全 caller / test に波及。`state` を持つ呼び出し側で inline 削除する方が局所的
- **Why not**: 却下

### Alternative 6: D4 — 両 check を単純削除する

- **Pros**: 変更量が最小
- **Cons**: storage writability の health チェックを失う
- **Why not**: writable チェックは新 root へ repoint して情報量を保つ方が正しい。却下

## Consequences

### Positive

- `src/` に `.specrunner/jobs/` への読み書き参照が定義も使用も残らず、jobs-dir layout への依存がコードベースから完全に消える
- `JobStateStore` の path 解決モードが 2 つ（slug-mode / changeDir）に絞られ、内部不変条件が明確になる
- jobId からの state 解決が sidecar → slug 起点のみを経由し、経路が統一される
- doctor が旧 `.specrunner/jobs/` データを検出して手動削除を促し、既存ユーザーへの安全な移行パスが確保される
- cancel purge の対象が新 layout（`.specrunner/local/<slug>/`）に正しく向き、managed terminal state も確実に purge される

### Negative / Known Debt

- sidecar を持たない legacy local job（先行 3 request 以前に開始されジョブ dir のみに記録されていた）は `loadStateByJobId` で JOB_NOT_FOUND になる。doctor が旧データを検出し手動削除を促す（自動 migration なし）
- terminal managed job（marker clear 済み）の `--all` 恒久可視化は本変更のスコープ外（既知 debt）

## References

- Request: `specrunner/changes/retire-jobs-dir/request.md`
- Design: `specrunner/changes/retire-jobs-dir/design.md`
- Related: `specrunner/adr/2026-06-06-decouple-jobs-dir-reads.md`（前提 1：local 読み取り撤去）
- Related: `specrunner/adr/2026-06-06-decouple-jobs-dir-writes.md`（前提 2：local 書き込み撤去）
- Related: `specrunner/adr/2026-06-07-managed-state-slug-keyed-local-dir.md`（前提 3：managed slug キー化）
- Related: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir state model の上位決定）
- Related: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md`（`.specrunner/jobs/` 配置の原決定）
