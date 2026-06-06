# Design: `.specrunner/jobs/` を完全撤去する

## Context

job state は 3 つの置き場を持っていた。

- **slug 正本**（`specrunner/changes/<slug>/state.json` + `events.jsonl`, branch 同伴 / worktree 配下）— local runtime の portable な真実。
- **sidecar**（machine-local, `.specrunner/local/<slug>/`）— local は `liveness.json`、managed は `marker.json` + full state（`state.json` + `events.jsonl`）。`jobId ↔ slug ↔ worktreePath` の index。
- **jobId ストア**（`.specrunner/jobs/<jobId>/state.json` + `events.jsonl`、および legacy flat `.specrunner/jobs/<jobId>.json`）— **legacy**。

先行する 3 request（`decouple-jobs-dir-reads` / `decouple-jobs-dir-writes` / `managed-slug-keyed-state`）が merge 済みであり、local / managed いずれの runtime も active な read / write で jobId ストアを使わなくなった。残るのは後方互換のための死蔵コードと旧データのみ：

- `JobStateStore.load()` の split-layout + legacy flat-file fallback。
- `loadStateByJobId`（step 4）/ `resolveStateStoreByJobId`（step 3）の no-sidecar 安全網（jobId ストア）。
- `xdg.ts` の jobId-store path helper 5 種（`getJobsDir` / `getJobStatePath` / `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath`）。
- これらを唯一使う `JobStateStore.create()`（production caller なし）と `JobStateStore.delete()` の jobs-dir 削除ロジック。
- `local.ts` の no-worktree fallback（`buildDeps` の `storeFactory`、`registerCleanup` の `makeStore`）— 到達不能ながら jobId ストアを構築する経路。`decouple-jobs-dir-writes` で「撤去は retire-jobs-dir で」と明示 defer 済み。
- doctor の storage check 2 種（`jobs-writable` / `old-state-files`）。
- `prompts/rules.ts` の `.specrunner/jobs/<jobId>.json` 参照。
- 既存ユーザーの旧 `.specrunner/jobs/<jobId>(.json|/)` データ。

本変更はこれらを撤去し、`.specrunner/jobs/` への依存をコードベースから完全に消す。旧データは自動 migration せず、doctor が検出して手動削除を促す（architect 評価済み：R1〜R3 で active な jobs-dir 参照がゼロになったため自動 migration は不要）。

### 現状の jobs-dir 残存参照（撤去対象）

| # | 場所 | 内容 |
|---|------|------|
| L1 | `JobStateStore.load()`（`store/job-state-store.ts`） | slug/changeDir 不在時に split-layout → legacy flat を読む fallback |
| L2 | `JobStateStore.getEventsPath()` / `getStateJsonPath()` | slug/changeDir 不在時に `getJobEventsPath` / `getJobStateJsonPath` を返す |
| L3 | `JobStateStore.create()` | jobId ストアへ初期 state を書く（production caller なし＝死蔵） |
| L4 | `JobStateStore.delete()` | `getJobDir` / `getJobStatePath` で jobs-dir / legacy flat を削除 |
| R-step4 | `loadStateByJobId()` 末尾 | `new JobStateStore(jobId, repoRoot).load()`（jobs-dir 読み） |
| R-step3 | `resolveStateStoreByJobId()` 末尾 | `new JobStateStore(jobId, repoRoot)`（jobs-dir 書き store） |
| LR1 | `LocalRuntime.buildDeps()` の `storeFactory` | worktreePath 不在時に `new JobStateStore(id, cwd)` |
| LR2 | `LocalRuntime.registerCleanup()` の `makeStore` | slugOpts 不在時に `new JobStateStore(jobId, cwd)` |
| X1 | `xdg.ts` | `getJobsDir` / `getJobStatePath` / `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath` |
| D1 | `doctor/checks/storage/jobs-writable.ts` | `.specrunner/jobs/` の writable チェック |
| D2 | `doctor/checks/storage/old-state-files.ts` | `.specrunner/jobs/*.json` の GC カウント |
| P1 | `prompts/rules.ts` | `- **Job state**: .specrunner/jobs/<jobId>.json` |

## Goals / Non-Goals

**Goals**:

- `src/` に `.specrunner/jobs/` への読み書き参照・jobId-store path helper（5 種）が定義も使用も残らない。
- jobId からの state 解決が **sidecar → slug 起点のみ**を経由し、jobs-dir fallback を持たない。解決不能時は read は明示エラー、write は degraded skip（`null`）にする。
- 旧 `.specrunner/jobs/` データが存在しても `job ls` / `show` / `cancel` / `resume` / `archive` が local / managed 両 runtime で壊れず動く。
- doctor が旧 `.specrunner/jobs/` の存在を検出し手動削除を促す。storage writable チェックは machine-local sidecar root を起点にする。
- `bun run typecheck && bun run test` を green に保つ。

**Non-Goals**:

- runtime 別の read/write 移行（先行 request `decouple-jobs-dir-reads` / `decouple-jobs-dir-writes` / `managed-slug-keyed-state` で完了済みの前提）。
- 旧 `.specrunner/jobs/` データの自動 migration（doctor 警告 + 手動削除に倒す）。
- slug 正本 / sidecar の内部 schema 変更、`changeDir` seam・managed full state の挙動変更。
- terminal managed job の `--all` 恒久可視化（既知 debt、本変更では扱わない）。

## Decisions

### D1: `JobStateStore` を slug / changeDir 専用ストアにし、jobs-dir layout を撤去する（L1 / L2 / L3 / L4）

`JobStateStore` の path 解決を「slug-mode（`slug` + `stateRoot`）」と「changeDir seam」の 2 モードに限定する。jobId-only モード（`new JobStateStore(jobId, repoRoot)`）を**無効**にする。

- **`load()`**: 現状の「slug/changeDir 分岐 → ENOENT で jobId path へ fall-through → legacy flat readFile」を、`changeDir || isSlugMode()` を**前提**にする実装へ変える。いずれでもない場合は `SpecRunnerError`（内部不変条件違反）を throw する。slug/changeDir 経路の `ENOENT` は fall-through せず**そのまま伝播**させる（呼び出し側が JOB_NOT_FOUND 等に翻訳する）。
- **`getEventsPath()` / `getStateJsonPath()`**: `changeDir` / slug-mode の分岐のみ残し、末尾の `getJobEventsPath` / `getJobStateJsonPath` 返却を削除する。両モード不在時は throw する。
- **`create()`**: production caller が存在せず（bootstrap は両 runtime とも `buildInitialJobState` に defer 済み）、jobId ストアへ書く唯一の static method。**メソッドごと削除**する。`buildInitialJobState`（純粋 factory、export）は temp。
- **`delete()`**: `getJobDir` / `getJobStatePath` で jobs-dir / legacy flat を物理削除する唯一の static method。jobs-dir が空になった今、削除対象は存在しない。**メソッドごと削除**し、purge 責務を呼び出し側（slug を保持する cancel runner）へ移す（D3 参照）。
- `JobStateStore` の class / `load()` / `list()` docstring から jobs-dir layout 記述を削除し、実際の section 構成（slug current / archive / worktrees、sidecar supplement、managed markers）に合わせる。

**Rationale**: jobId-only モードは jobs-dir を生かす最後の構造的根拠。先行 3 request で全 active 経路が slug/changeDir に移ったため、モードを 2 つに絞れば helper / fallback / create / delete が一斉に不要になる。`load()` の「どこを読むか」と「ENOENT で別 layout を試す」の結合を解くのが最小修正。

**Alternatives considered**:
- *`create()` を slug 正本書き込みに作り替えて温存*: `create()` 時点で権威ある slug は無く（`request.slug` は null 可）、置き場を確定できない。bootstrap defer（先行 request の確立パターン）に反する。却下。
- *jobId-only モードを no-op stub として残す*: production 非到達の死蔵モードを型に残すのは負債。fail-loud（throw）が安全。却下。

### D2: job-access の no-sidecar 安全網を撤去し、read=エラー / write=null にする（R-step4 / R-step3）

`loadStateByJobId` / `resolveStateStoreByJobId` は sidecar（liveness / marker）→ slug 起点で解決する。末尾の「sidecar 無し → jobId ストア」安全網を撤去する。

- **`loadStateByJobId()`**（read）: sidecar 解決が尽きた場合（entry 無し、または local entry で accessible な slug state 無し）に `new JobStateStore(jobId, repoRoot).load()` を呼ぶ末尾を削除し、`SpecRunnerError(JOB_NOT_FOUND)` を throw する。呼び出し側（`job show` / `cancel` / `resume`）は既に JOB_NOT_FOUND / ENOENT を「Job not found」相当に翻訳する。`job show` の catch に JOB_NOT_FOUND 分岐を補い、メッセージを揃える。
- **`resolveStateStoreByJobId()`**（write）: 末尾 `return new JobStateStore(jobId, repoRoot)` を `return null` に変える。呼び出し側（`resume` / `cancel` / `exit-guard` global）は既に `if (store) await store.persist(...)` で null を degraded skip する。

**Rationale**: 安全網は「sidecar を持たない legacy local job」を jobs-dir に着地させるためのもの。jobs-dir 撤去後はその着地先が無いため、read は「見つからない」、write は「書ける場所が無い＝skip」に倒すのが正しい。両呼び出し側は先行 request で既に null / エラー耐性を持つ。

**Alternatives considered**:
- *安全網を sidecar 無しでも slug 推測で解決*: jobId からは slug を推測できない（index は sidecar のみ）。却下。

### D3: `local.ts` の no-worktree fallback を撤去し、cancel の purge を slug 起点に統一する（LR1 / LR2 / L4）

- **`LocalRuntime.buildDeps()` の `storeFactory`**: `wtp` 不在時の `new JobStateStore(id, this.cwd)` を撤去する。`buildDeps` は `setupWorkspace` 後にのみ呼ばれ local では `worktreePath` が常に在るため、不在は不変条件違反として throw する（jobs-dir に無言で書かない）。
- **`LocalRuntime.registerCleanup()` の `makeStore`**: `slugOpts` 不在時の `new JobStateStore(jobId, cwd)` を撤去する。`makeStore` は best-effort cleanup 内（try/catch）で使われるため、`slugOpts` 不在時は throw でよい（caught → best-effort skip）。
- **cancel の purge**: `JobStateStore.delete()` 削除（D1）に伴い、purge 物理削除を slug 起点に寄せる。
  - 単体 `--purge`（`cancelSingleJob`）: 既存の `.specrunner/local/<slug>/` 削除（managed-slug-keyed-state で追加済み）を**唯一の物理削除**とし、`JobStateStore.delete(jobId)` 呼び出しを削除する。
  - 一括 `cancelAllTerminated`: `JobStateStore.delete(repoRoot, state.jobId)` を `getJobSlug(state)` 起点の `.specrunner/local/<slug>/` best-effort 削除に置換する（slug 空なら skip）。これにより新 layout の terminal managed state も purge され、jobs-dir 参照が消える。

**Rationale**: purge の対象は machine-local state。新 layout ではそれが `.specrunner/local/<slug>/` に集約される。purge 時点で marker は既に unlink 済みのため sidecar 再解決はできず、`state` から得た slug を直接使うのが正しい。local の slug 正本（commit 済 change folder）は破壊しない。

**Alternatives considered**:
- *`delete(jobId)` を sidecar 解決で slug 化*: purge 時点で marker が消えており解決不能。却下。
- *`delete()` を slug 引数版に signature 変更*: 全 caller / test に波及。`state` を持つ呼び出し側で inline 削除する方が局所的。却下。

### D4: doctor の storage check を sidecar 起点 + legacy 検出に置換する（D1 / D2、要件 4 / 6）

- **`jobs-writable` → machine-local sidecar root の writable チェック**: 検査対象を `.specrunner/jobs/` から `.specrunner/local/`（liveness / marker / managed full state の書き込み先）へ変える。「存在 + writable → pass / 不在 + 直近祖先 writable → warn / 不在 or not writable → fail」のロジックは温存する。check name / file を新 target に合わせて改名する（例 `local-state-writable`）。`required: true` を維持。
- **`old-state-files` → legacy `.specrunner/jobs/` 検出チェック（要件 6）**: GC カウント（100 件閾値）をやめ、`.specrunner/jobs/` が**存在すれば** `warn` を返し、手動削除（`rm -rf .specrunner/jobs`）を hint で促す。不在なら `pass`。check name / file を改名する（例 `legacy-jobs-dir`）。`required: false`（warn のみ）を維持。
- `doctor/checks/index.ts` の import / `commonChecks` 配列 / re-export を新 check へ差し替える。

**Rationale**: 要件 4「撤去または slug/sidecar 起点に置換」に従い、writable チェックは新 write 先（sidecar root）へ repoint、GC チェックは要件 6 の「旧データ検出 + 手動削除促し」へ転用する。doctor の DoctorCheck/DoctorContext 抽象（注入された `ctx.fs`）はそのまま使える。

**Alternatives considered**:
- *両 check を単純削除*: storage writability の health チェックを失う。writable は新 root へ repoint する方が情報量を保てる。却下。

### D5: `prompts/rules.ts` の job state path を新真実へ更新する（P1）

`RULES_MD_CONTENT` の `- **Job state**: .specrunner/jobs/<jobId>.json` を、新しい置き場（slug 正本 + machine-local sidecar）を表す記述へ更新する。agent 向け文書のため簡潔に、jobs-dir への言及を残さない。

**Rationale**: 要件 5。rules.md は全 pipeline agent が読む。撤去済みの path を残すと誤誘導になる。

### D6: jobs-dir を seed する既存テストを slug 起点へ移行する

`JobStateStore.create()`（D1 で削除）を setup に使う多数のテスト（`tests/state-store.test.ts` / `tests/resolve-job-id.test.ts` / `tests/finish-job-state.test.ts` / `tests/unit/core/command/runner.test.ts` ほか）と、jobs-dir に直接 flat file を書くテスト（`src/core/lifecycle/__tests__/exit-guard.test.ts` / `tests/jobs-dir-no-readdir.test.ts` / `tests/local-no-jobs-dir-writes.test.ts` / `tests/unit/util/xdg.test.ts` / `tests/unit/core/job-access/resolve-state-store.test.ts` ほか）が破綻する。

- jobs-dir への seed / 読み戻し / 期待を、slug 起点（`buildInitialJobState` + slug-mode もしくは `changeDir` ストアでの seed、または既存の slug seed パターン）へ移行する。共通化のため test 用 seeding helper を 1 つ用意し、`JobStateStore.create()` 呼び出しを置換する。
- jobs-dir helper / fallback / create / delete の**存在**を検証していたテスト（撤去対象の挙動そのものをアサートするもの）は削除し、新挙動（解決不能 → エラー / null、doctor の legacy 検出）の検証へ置き換える。新規シナリオの test 追加は test-case-gen / implementer が担当する。

**Rationale**: 撤去対象を seed/assert していたテストは撤去と同時に役目を終える。slug 起点 seeding helper に集約すれば移行は機械的になる。

### D7: 残存 docstring / コメントの整合（要件 7 の網羅）

機能参照ではないが jobs-dir に言及する doc / コメントを更新し、grep で意図が残らないようにする。

- `core/command/pipeline-run.ts` の `// managed: persists to jobs-dir` 等の stale コメント。
- `core/job-access/load-by-job-id.ts` の step 4 説明、`cli/job-show.ts` の「falling back to jobs-dir」コメント。
- `core/port/runtime-strategy.ts` / `core/runtime/local.ts` / `core/runtime/managed.ts` の「Does NOT write to .specrunner/jobs/」記述（撤去後は自明のため簡潔化 or 削除）。

**Rationale**: 要件 7 のコードベース横断クリーンに合わせ、誤読を生む過去前提のコメントを残さない。

## Risks / Trade-offs

- [Risk] **sidecar を持たない legacy local job が解決不能になる**（D2）→ Mitigation: 該当は jobs-dir のみに存在する旧 job で、read は JOB_NOT_FOUND、write は degraded skip。jobId は sidecar が無い以上元々 `resolveId` でも引けない。doctor が旧データを検出し手動削除を促す（要件 6）。
- [Risk] **テスト移行の blast radius が大きい**（D6、`JobStateStore.create` を使う ~25 ファイル）→ Mitigation: slug 起点 seeding helper に集約し置換を機械化。`bun run test` の失敗を起点に網羅。
- [Risk] **doctor storage check 改名で既存 doctor テストが破綻**（D4）→ Mitigation: check 改名・target 変更に合わせ doctor テストを更新（新 target の pass/warn/fail を検証）。
- [Trade-off] **一括 purge の対象変更**（D3）→ jobs-dir 削除をやめ `.specrunner/local/<slug>/` 削除に変える。新 layout の物理 state を正しく purge する側に倒れるため機能的に向上。
- [Trade-off] **`JobStateStore` の jobId-only モード喪失**（D1）→ 将来 jobId 直指定でストアを作る用途が出た場合は slug/changeDir 経由に統一する設計に従う。

## Open Questions

- なし（撤去対象・置換先は先行 3 request の Non-Goal として明示 defer されており、本変更で確定する）。

## Migration Plan

- **振る舞い互換**: active 経路は先行 request で既に slug/sidecar に移行済み。本変更は死蔵コード・fallback・helper の撤去と doctor / docs の整合のみ。slug 正本 / sidecar の schema は不変。
- **既存 job**: 新規 / active job は影響なし。旧 `.specrunner/jobs/` データは読み書き対象から外れ、doctor が存在を検出して手動削除を促す（自動削除しない）。
- **rollback**: 撤去した fallback / helper / create / delete / 安全網を復元すれば従来挙動へ戻る（データ形式不変で互換）。
- **ADR**: jobs-dir layout の全廃・jobId-only ストアモードの廃止・job-access 安全網の除去・doctor チェックの目的転用という構造的設計選択を伴うため `adr: true`。ADR は後続ステップで起票する。
