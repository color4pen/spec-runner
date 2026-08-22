# Actions dispatch に archive を追加し、merge 後の head branch 削除に耐える

## Meta

- **type**: new-feature
- **slug**: dispatch-archive-action
- **base-branch**: main
- **adr**: false

## 背景

#1051 により、plain `specrunner job archive <slug>` は archive record を feature branch に push した時点では `awaiting-archive` を維持し、PR merge 後の再実行で `archived` 遷移と cleanup を行うようになった。これにより remote execution の正規フローは次の形にできる。

```text
Actions で archive record を作る
  -> PR の CI を確認
  -> GitHub UI で人間が merge
  -> Actions で archive を再実行
  -> MERGED を確認
  -> completeAfterMerge -> exit 0
```

ただし現状は、この運用を Actions UI だけで完結できない。問題は 2 つ。

**問題 1**: `.github/workflows/specrunner-dispatch.yml` の `action` は `start / resume` の 2 択のみで、archive を dispatch できない。`job archive --from-issue <n>` は既に存在するため、workflow が archive の状態機械を持つ必要はなく、CLI に委譲するだけでよい。

**問題 2**: merge 後の 2 回目の archive 実行が、local state の無い環境（ephemeral runner）で job を解決できない。1 回目の archive record 作成は change folder を `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ git mv するため、merge 後は active な change folder がどこにも存在しない。`archive --from-issue` の locator は closing PR の head branch から checkpoint を復元するが、checkpoint slug 解決は archive / canceled 配下を候補から除外するため PR head からは解決できず、`loadStateByJobId` の fallback scan も archive 配下を skip するため local 解決も成立しない。加えて GitHub UI の merge では head branch が削除される（標準運用）ため、branch fetch 自体も失敗する。branch-borne checkpoint の再構成で解こうとする前提自体が誤りで、merge 後は main に載った archive record を正とすべきである。

## 現状コードの前提

- `.github/workflows/specrunner-dispatch.yml` — `action` の choices は `start` / `resume` のみ
- `src/core/finish/archive-change-folder.ts` — 1 回目の archive record 作成は `specrunner/changes/<slug>/` を `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ git mv する
- `src/git/checkpoint-ref.ts` — checkpoint slug 解決は `archive` / `canceled` を候補から除外する（`EXCLUDED_CHANGE_DIRS`）
- `src/core/job-access/load-by-job-id.ts:85` — jobId の fallback scan は `archive` / `canceled` を skip する
- `src/core/archive/job-context.ts:47` — `resolveArchiveJobContext` は `listWithSourceDirs(cwd, { includeArchived: true })` で archive 配下の record を既に読んでいる。不足しているのは jobId→slug の対応付けのみ
- **実測**: main に merge 済みの archive record 内 `state.json` の status は `awaiting-archive` のまま。`archived` の永続効果は「archive/ 配下という path」+ local 側の遷移で表現され、`completeAfterMerge()`（`src/core/archive/merge-completion.ts`）は local state への `markJobArchived` + `runPostMergeCleanup` である
- merge 前は PR が open で head branch が存在するため、既存の closing PR branch fetch + `runAttachVerification` の attach 経路がそのまま機能する

## 実装範囲

次の 2 相の正規フローで Actions 完結させる。

```text
1回目（merge 前）: completed marker -> jobId -> closing PR head branch
  -> 既存 runAttachVerification（branch fetch）-> archive record push -> awaiting-archive
2回目（merge 後）: completed marker -> jobId
  -> checkout 済み base の archive record を listWithSourceDirs({ includeArchived: true }) で検索
  -> jobId + issueNumber 照合で slug 解決 -> runArchive(slug)
  -> 既存 runPlainArchive が archiveRecorded + PR MERGED を確認 -> completeAfterMerge -> exit 0
```

1. **dispatch への archive 追加**: `SpecRunner Dispatch` の `action` に `archive` を追加し、`specrunner job archive --from-issue "$ISSUE"` を呼ぶ。workflow は archive の状態機械・merge 判定を持たず、CLI に委譲する。`--with-merge` は渡さない。
2. **post-merge の archive record fallback**: `runArchiveFromIssue` の local jobId lookup miss 時に、`listWithSourceDirs({ includeArchived: true })` の record から `jobId + issueNumber` 一致で slug を解決する archive 専用 fallback を追加する。
3. fallback で一致したら rebind / attach を通さず既存 `runArchive` に直行する。merge 済み確認（PR MERGED）と完了処理は既存 `runPlainArchive` / `completeAfterMerge` に委譲する。
4. archive record が見つからない merge 前は、従来どおり closing PR branch + `runAttachVerification` の経路を使う。
5. **一般契約の維持**: `resolveCheckpointSlug` / `loadStateByJobId` / resume・attach の一般契約は変更しない。新しい pipeline step / status / verifier は追加しない。

## 非目標

- Actions が PR を自動 merge すること
- CI status の監視を archive command に追加すること
- webhook / daemon による自動 cleanup
- 新しい archive 専用 workflow を増やすこと
- merge 後に main へ `archived` を書き戻すこと（`archived` の永続効果は path + local 側で表現済み）
- 新しい job status の追加
- `refs/pull/<n>/head` への fetch fallback の追加（merge 前は head branch が存在し、merge 後は branch-borne checkpoint を使わないため不要）
- `runAttachVerification` の interface 拡張（fetch 済み OID の受け渡し等）

## 受け入れ条件

- [ ] `workflow_dispatch` の `action` choices に `archive` が含まれ、archive 分岐が `specrunner job archive --from-issue <issue>` の呼び出しのみであることを設定検査テストで固定する（workflow yaml を parse して assert）
- [ ] local jobId lookup miss + archive record（jobId + issueNumber 一致）で slug が解決され、attach / branch fetch を経ずに `runArchive` へ直行し `completeAfterMerge` が exit 0 になることをテストで固定する（head branch 削除済みシナリオ）
- [ ] jobId または issueNumber が一致しない record は解決対象にならないこと、archive record 不在かつ closing PR 経路も不成立の場合は従来どおり `ARCHIVE_FROM_ISSUE_UNCONFIRMED` になることをテストで固定する
- [ ] merge 前（archive record が base に無く PR が open）は従来の closing PR branch + `runAttachVerification` 経路が使われることをテストで固定する
- [ ] archive record 作成後・merge 前は `awaiting-archive` のままである（#1051 の既存テストが無変更で green）
- [ ] `--with-merge` 経路・resume / attach の既存テストは無変更で green
- [ ] `runArchiveFromIssue` の解決順序を pin する既存テストに限り新契約への更新を許容する。それ以外は無変更で green
- [ ] `typecheck && test` が green

## 関連

- #1049 / #1051（状態遷移を merge 境界に揃えた前提）
- 実装前レビューと方針整理・裁定は本 issue のコメントを参照
