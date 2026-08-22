# Design: Actions dispatch に archive を追加し、merge 後の head branch 削除に耐える

## Context

`SpecRunner Dispatch` workflow (`.github/workflows/specrunner-dispatch.yml`) は
`workflow_dispatch.inputs.action` の choices として `start` / `resume` のみを公開しており、
archive を Actions UI から発火できない。

`specrunner job archive --from-issue <n>` は既に存在する（`src/cli/archive-from-issue.ts`）。
その解決順序は現状 2 段である:

1. `resolveCompletedJobId` — issue コメントの completed marker から jobId を得る
2. `loadStateByJobId(repoRoot, jobId)` — hit すれば slug を得て `runArchive` へ直行
3. miss なら `resolveArchiveBranchFromIssue` — closing PR の head branch を fetch し、
   branch-borne checkpoint の 4 field identity（jobId / issueNumber / branch / PR number）を照合
   → `runAttachVerification` → `setupWorkspace` → `runArchive`

plain archive は merge 境界で 2 相に分かれている（`src/core/archive/plain-archive.ts`）:

- **1 回目（merge 前）**: archive record を feature branch に push し、`awaiting-archive` を維持する。
  この record 作成は change folder を `specrunner/changes/<slug>/` から
  `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ `git mv` する
  （`src/core/finish/archive-change-folder.ts:52`）。
- **2 回目（merge 後）**: PR が MERGED かつ `archiveRecorded` なら `completeAfterMerge`
  （`markJobArchived` + `runPostMergeCleanup`）を実行して exit 0 で終わる。

問題は 2 回目を local state の無い ephemeral runner から実行できない点にある。checkout 済み base
（merge 後の main）には active な change folder が存在せず、次の 3 経路がいずれも成立しない:

- `resolveCheckpointSlug` は `EXCLUDED_CHANGE_DIRS = new Set(["archive", "canceled"])`
  で archive 配下を候補から除外する（`src/git/checkpoint-ref.ts:21,85`）
- `loadStateByJobId` の fallback scan も `archive` / `canceled` を skip する
  （`src/core/job-access/load-by-job-id.ts:85`）
- GitHub UI の merge は head branch を削除するため、`resolveArchiveBranchFromIssue` の
  `git fetch origin <branch>`（`src/core/issue-target/archive.ts:136`）自体が失敗する

一方で、merge 後の base には archive record が載っている。`resolveArchiveJobContext` は
既に `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` で archive 配下の
record を読んでおり（`src/core/archive/job-context.ts:47`）、`archiveRecorded` を
`basename(dirname(sourceChangeDir)) === "archive"` で判定している（同 68 行）。
不足しているのは **jobId → slug の対応付けのみ**である。

**実測**: main に merge 済みの archive record 内 `state.json` の status は `awaiting-archive` のまま。
`archived` の永続効果は「`archive/` 配下という path」＋ local 側の遷移で表現される。

## Goals / Non-Goals

**Goals**:

- `workflow_dispatch` の `action` に `archive` を追加し、CLI へ委譲するだけの分岐を置く
- merge 後（head branch 削除済み）の 2 回目 archive を、checkout 済み base の archive record から
  slug 解決できるようにする
- merge 前は従来どおり closing PR head branch + `runAttachVerification` の経路を使う
- `resolveCheckpointSlug` / `loadStateByJobId` / resume・attach の一般契約を変更しない

**Non-Goals**:

- Actions が PR を自動 merge すること
- CI status の監視を archive command に追加すること
- webhook / daemon による自動 cleanup
- 新しい archive 専用 workflow を増やすこと
- merge 後に base へ `archived` を書き戻すこと
- 新しい job status / pipeline step / verifier の追加
- `refs/pull/<n>/head` への fetch fallback
- `runAttachVerification` の interface 拡張（fetch 済み OID の受け渡し等）
- workflow への `--with-merge` の付与

## Decisions

### D1: workflow は archive の状態機械を持たず、CLI 呼び出し 1 行に委譲する

`action` choices に `archive` を追加し、`Run pipeline` step の分岐に
`bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` を呼ぶ 1 本の枝を足す。
merge 判定・record 作成・完了判定はすべて CLI 側にある（`runPlainArchive`）ため、
workflow 側は状態を一切見ない。`--with-merge` は渡さない。

既存の `if [ "$ACTION" = "resume" ] ... else ... fi` に `elif [ "$ACTION" = "archive" ]` を
挿入する形にとどめ、shell 構造の作り替えはしない。

**Rationale**: 状態機械を workflow yaml に複製すると CLI と二重管理になり、
`awaiting-archive` の意味が 2 か所に散る。workflow を「発火面」に限定するのは
既存 `start` / `resume` 分岐と同じ設計であり、それを踏襲するのが最小差分。

**Alternatives considered**:

- *archive 専用 workflow を新設する*: 却下。checkout / bun install / sandbox 前提 /
  log dump の各 step を丸ごと複製することになり、request の非目標にも該当する。
- *workflow 側で PR の merge 状態を見て 1 回目 / 2 回目を出し分ける*: 却下。
  `runPlainArchive` が既に同じ判定を持っており、分岐が食い違うと 1 回目の record 作成が
  skip される事故になる。
- *`--with-merge` を渡す*: 却下。merge は GitHub UI で人間が行うのが本フローの前提であり、
  CI 監視・自動 merge は非目標。

### D2: workflow の設定検査は yaml 依存を足さず、path scope 付きの構造抽出で行う

`.github/workflows/specrunner-dispatch.yml` を読み、
(a) `on.workflow_dispatch.inputs.action.options` の要素列、
(b) `Run pipeline` step の `run:` script 内 `archive` 分岐の本文、
の 2 つを **indent scope で切り出してから** assert する。ファイル全体に対する
素の部分文字列一致（`toContain("archive")`）は使わない。

**Rationale**: 本 project の最大の長所は依存極小であり、テスト専用に yaml parser を
足すのは devDependencies であっても最小依存の原則に反する。一方で素の
`toContain` は「`run:` 本文のどこかに `archive` の文字がある」だけで通ってしまい、
choices への追加を検証しない。既存 `tests/grep-workflow-actions-pinned.test.ts` の
`pull_request:` block 走査（TC-006）が同じ問題に同じ手法で答えており、
その precedent を再利用する。切り出した subtree に対する assert であれば
「yaml を parse して assert する」という受け入れ条件の意図（scope 付き構造検証）を満たす。

**Alternatives considered**:

- *`yaml` package を devDependency に追加する*: 却下。依存極小の North Star に反する。
- *ファイル全体への `toContain("archive")`*: 却下。`run:` 本文にも `archive` が現れるため、
  choices への追加を検証できない偽陽性テストになる。

### D3: archive record fallback は `src/core/archive/job-context.ts` に置く

新規 export を 2 つ追加する:

- `isArchiveRecordDir(sourceChangeDir: string): boolean`
  — `basename(dirname(sourceChangeDir)) === "archive"`。既存 `resolveArchiveJobContext` の
  `archiveRecorded` 判定（現在は同ファイル内のインライン式）もこれを使うよう置き換える。
- `resolveArchivedSlugByJobId({ cwd, jobId, issueNumber }): Promise<string | null>`
  — `listWithSourceDirs(cwd, { includeArchived: true })` の結果から
  `state.jobId === jobId && state.issueNumber === issueNumber && isArchiveRecordDir(sourceChangeDir)`
  を満たす entry を探し、`getJobSlug(state)` を返す。該当なし・derived slug が空文字列なら `null`。

**Rationale**: このファイルは既に `JobStateStore` / `getJobSlug` / `node:path` を import しており、
「archive record とは何か」という概念の持ち主でもある。新しい依存 edge を 1 本も足さずに済む。
`isArchiveRecordDir` を共有するのは重複回避が目的ではなく **整合性のため**である
— fallback 側と `resolveArchiveJobContext` 側で archive record の判定がずれると、
fallback が解決した slug を `runPlainArchive` が `archiveRecorded: false` と見なし、
MERGED 検出時に `mergedBeforeRecordEscalation`（exit 1）へ落ちる。判定は 1 つでなければならない。

**Alternatives considered**:

- *`src/core/issue-target/archive.ts` に置く*: 却下。当該 module は
  「kernel ports / git / state / errors / logger のみ import する」と冒頭 DSM 注記で
  宣言しており、`store/` への import は新規 edge になる。
- *`src/cli/archive-from-issue.ts` にインライン展開する*: 却下。archive record 判定式が
  core 側と cli 側に分裂し、上記の整合性リスクを直に踏む。

### D4: 解決順序は local state → archive record → closing PR の 3 段にする

`runArchiveFromIssue` の解決順序を次に変更する:

| 段 | 経路 | 変更 |
|----|------|------|
| 1 | `resolveCompletedJobId` → jobId | 変更なし |
| 2 | `loadStateByJobId` hit → local slug | 変更なし |
| 3 | **`resolveArchivedSlugByJobId` hit → archive record の slug** | **新規** |
| 4 | `resolveArchiveBranchFromIssue` → `runAttachVerification` → `setupWorkspace` | 変更なし |
| 5 | `runArchive(slug)` | 変更なし |

段 3 で hit した場合、rebind / attach / branch fetch をいずれも通さず段 5 へ直行する。

**Rationale**:

- 段 2 より後に置く理由: active な local state が最優先という既存契約を保つため。
  段 2 が hit する状況で段 3 を先に見ると、既存の routing 契約（TC-018）が変わる。
- 段 4 より前に置く理由: archive record が base に載るのは merge 後だけなので、
  merge 前は段 3 が構造的に miss し、段 4 に落ちる。**2 相の出し分けが状態から自動的に決まり、
  mode flag / 相の明示指定が要らない**。加えて段 3 は local filesystem read のみで、
  network も `git fetch` も伴わないため段 4 より厳密に安価。
- attach を通さない理由: record は merge によって checkout 済み base の commit に既に載っており、
  検証すべき remote checkpoint も setup すべき workspace も存在しない。attach を通そうとすると
  GitHub が merge 時に削除した head branch を要求することになり、そもそも成立しない。

**Alternatives considered**:

- *`loadStateByJobId` の fallback scan を `archive/` にも広げる*: 却下。resume / attach / ps が
  共有する一般契約を変え、すべての jobId 解決が終端相当の archived job を拾うようになる。
  request の非目標「一般契約の維持」に該当する。
- *`refs/pull/<n>/head` への fetch fallback ＋ `runAttachVerification` への checkpointOid 受け渡し*:
  却下（operator 裁定）。merge 後の正は base に載った archive record であり、
  branch-borne checkpoint を再構成する前提自体が誤り。
- *段 3 を段 2 より前に置く*: 却下。上記のとおり既存 routing 契約を変える。

### D5: 照合鍵は jobId ＋ issueNumber の完全一致、対象は archive record のみ

- 両方が一致した entry のみ採用する。record 側の `issueNumber` が `undefined` / `null` の場合は不一致扱い。
- `isArchiveRecordDir(sourceChangeDir)` が false の entry（active な change folder）は対象外。
- 多重一致の分岐は設けない。`listWithSourceDirs` は jobId で dedup し、
  `updatedAt` が最新の 1 件のみを残す（`src/store/job-catalog.ts:40-47`）ため、
  同一 jobId の候補は構造上たかだか 1 件になる。
- `getJobSlug(state)` が空文字列を返した record は miss 扱いにする。

**Rationale**:

- jobId 単独でも一意だが、issueNumber を併せることで「completed marker が別 issue へ
  転記された」場合に誤った job を archive しない。identity の 2 field 照合は
  既存 `resolveArchiveBranchFromIssue` の 4 field 照合と同じ思想。
- archive record 限定にする理由: change folder が active な位置にある間は
  「まだ record を作っていない ＝ merge 前」であり、その相の正規経路は段 4 である。
  この限定が「merge 前は従来経路」という契約を状態から決定づける。
- 空 slug を miss にする理由: `runArchive({ slug: "" })` は
  `No job found with slug ''` という無意味な失敗になる。段 4 へ落として
  `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を返すほうが診断可能。

**Alternatives considered**:

- *slug で照合する*: 却下。同一 slug で再実行された別 job を取り違える。
- *多重一致に `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を足す*: 却下。到達不能な分岐であり、
  テストで固定できない死コードになる。

### D6: merge 済み確認と完了処理は既存経路に完全委譲する

段 3 が返すのは slug のみで、以降は無改造の `runArchive` → `runPlainArchive` が担う。
`runArchive` は自前で GitHub client を構築し `githubClient` / `owner` / `repo` を
`runPlainArchive` に渡している（`src/cli/archive.ts:284-295`）ため、merge 後の実行は

`resolveArchiveJobContext` が base の record を発見 → `archiveRecorded: true` /
record の `pullRequest.number` → `getPullRequest` が `MERGED` → `completeAfterMerge` → exit 0

という既存の流れをそのまま通る。`plain-archive.ts` / `merge-completion.ts` /
`post-merge-cleanup.ts` は変更しない。

**Rationale**: 「MERGED ＋ `archiveRecorded` → `completeAfterMerge` → exit 0」は
既に `src/core/archive/__tests__/plain-archive.test.ts` TC-013 で固定済みの振る舞いである。
本変更が新たに担保すべきなのは「そこへ辿り着くための slug 解決」だけなので、
完了側を再実装も再テストもしない。

**Alternatives considered**:

- *fallback 経路専用の完了処理を書く*: 却下。`completeAfterMerge` の複製になり、
  2 実装の乖離を招く。

## Risks / Trade-offs

- **[ephemeral runner では `markJobArchived` が失敗し、警告が出る]**
  `resolveWorktreePathForArchive` は worktree が存在しなくても規約由来の path を返す
  （`src/core/archive/orchestrator.ts:96-97`）ため、fresh runner では `recordDir` が
  実在しない directory を指し、`markJobArchived` が `JOB_NOT_FOUND` を投げる。
  → **Mitigation**: 不要。`completeAfterMerge` はこの失敗を catch して警告を出し、
  cleanup を続行する設計であり（`src/core/archive/merge-completion.ts:45-51`）、exit 0 は保たれる。
  `archived` の永続効果は「`archive/` 配下という path」で既に表現済みで、
  base へ書き戻さないことは本 request の非目標。

- **[cleanup が既に消えた head branch を削除しようとする]**
  `runPostMergeCleanup` は `git branch -D` / `git push origin --delete` を実行する。
  → **Mitigation**: 不要。remote 側は `isRemoteRefNotFound` で無警告に吸収され、
  local 側は警告のみで throw しない（`src/core/archive/post-merge-cleanup.ts:96-115`）。

- **[local 開発 repo では merge 前でも段 3 が hit しうる]**
  worktree 内に archive record がある状態（1 回目実行後・merge 前）では
  `listWithSourceDirs` の worktree archive walk（`src/store/job-catalog.ts:135-160`）が
  当該 record を拾い、段 4 を経ずに `runArchive` へ直行する。
  → **Mitigation**: 不要。到達先は `runPlainArchive` の PR OPEN 分岐で、
  record の再記録は冪等（TC-017 で固定済み）、状態は `awaiting-archive` のまま。
  従来はここで head branch を fetch し rebind してから同じ結果に着地していたため、
  結果は同一で経路だけが安価になる。受け入れ条件が固定する「merge 前は従来経路」は
  「base に archive record が無い」場合の契約であり、これと矛盾しない。

- **[段 3 の追加が既存の解決順序 pin テストを 1 件変える]**
  → **Mitigation**: request の受け入れ条件が「`runArchiveFromIssue` の解決順序を pin する
  既存テストに限り新契約への更新を許容する」と明示している。更新対象は
  `src/cli/__tests__/archive-from-issue.test.ts` の TC-019 系（段 3 を明示的に miss させる
  mock 追加）に限定し、他は無改変で green を維持する。

- **[workflow 設定検査テストが indent 依存で壊れやすい]**
  → **Mitigation**: 抽出範囲を `action` の `options:` block と `run:` script 内 archive 分岐に
  限定し、失敗時は抽出した block をそのまま error message に載せて、
  yaml 整形変更が原因だと即座に判別できるようにする。

## Open Questions

- ephemeral runner での post-merge 実行は毎回
  `Warning: failed to transition <slug> to archived` を stderr に出す（上記 Risk 参照）。
  exit 0 は保たれるため機能上の問題はないが、local state が存在しない実行では
  この警告を抑制すべきかは本 request の範囲外として保留する。
