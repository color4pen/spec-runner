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

**問題 2**: `archive --from-issue` の locator は closing PR の head branch 名を `git fetch origin <headRefName>` して checkpoint を復元する。GitHub UI で merge と同時に head branch が削除されると（標準的な運用）、2 回目の archive で fetch が失敗し、terminal completion に到達できない。

## 現状コードの前提

- `.github/workflows/specrunner-dispatch.yml:22-27` — `action` の choices は `start` / `resume` のみ
- `src/core/issue-target/archive.ts:132-140` — `resolveArchiveBranchFromIssue` は候補 PR の `headRefName` を `git fetch origin <branch>` で fetch し、失敗した候補は skip する。全候補 skip なら `ARCHIVE_FROM_ISSUE_UNCONFIRMED`
- **実測**: head branch 削除済みの PR でも `git fetch origin refs/pull/<n>/head` は成功する（PR #1051 で確認）。`headRefName` / `number` は branch 削除後も PR metadata に残る
- **実測**: main に merge 済みの archive record 内 `state.json` の status は `awaiting-archive` のまま。`archived` の永続効果は main には存在せず、「archive/ 配下という path」+ local 側の遷移で表現されている。`completeAfterMerge()`（`src/core/archive/merge-completion.ts`）は local state への `markJobArchived` + `runPostMergeCleanup` である
- local state がある環境では `loadStateByJobId` の short-circuit が locator を回避するため、branch 削除の影響は local state の無い環境（ephemeral runner）に限定される

## 実装範囲

1. **dispatch への archive 追加**: `SpecRunner Dispatch` の `action` に `archive` を追加し、`specrunner job archive --from-issue "$ISSUE"` を呼ぶ。workflow は archive の状態機械・merge 判定を持たず、CLI に委譲する。`--with-merge` は渡さない。
2. **locator の pull ref fallback**: `resolveArchiveBranchFromIssue` で head branch の fetch が失敗した候補について、`refs/pull/<prNumber>/head` の fetch に fallback する。取得する checkpoint tree は同一なので、既存の 4 点 identity verification（jobId / issueNumber / branch=headRefName / pullRequest.number）を無改変で適用する。新しい main 探索・復元経路は作らない。
3. **既存契約の維持**: 4 点 identity verification の強度と `--with-merge` 経路の挙動は変えない。
4. **merge 後の完了の定義**: remote / ephemeral runner での完了は「PR state が `MERGED`」「archive record が PR head に存在し identity verification を通過」「`completeAfterMerge()` 実行で exit 0」で成立させる。完了状態を永続化するための新しい status / marker / main への直接 commit は追加しない。

## 非目標

- Actions が PR を自動 merge すること
- CI status の監視を archive command に追加すること
- webhook / daemon による自動 cleanup
- 新しい archive 専用 workflow を増やすこと
- merge 後に main へ `archived` を書き戻すこと（`archived` の永続効果は path + local 側で表現済み）
- 新しい job status の追加

## 受け入れ条件

- [ ] `workflow_dispatch` の `action` choices に `archive` が含まれ、archive 分岐が `specrunner job archive --from-issue <issue>` の呼び出しのみであることを設定検査テストで固定する（workflow yaml を parse して assert）
- [ ] head branch fetch 失敗の候補が `refs/pull/<prNumber>/head` へ fallback し、4 点 identity 照合が成立することをテストで固定する
- [ ] fallback 経路でも identity 不一致の候補は skip され、全候補不成立なら `ARCHIVE_FROM_ISSUE_UNCONFIRMED` になることをテストで固定する
- [ ] PR MERGED + archive record 済み + identity 通過で `completeAfterMerge` が実行され exit 0 になることをテストで固定する（branch 削除済みシナリオ）
- [ ] archive record 作成後・merge 前は `awaiting-archive` のままである（#1051 の既存テストが無変更で green）
- [ ] `--with-merge` 経路の既存テストは無変更で green
- [ ] 既存テストのうち locator の旧 fetch 挙動（head branch 名のみ）を pin するテストに限り新契約への更新を許容する。それ以外は無変更で green
- [ ] `typecheck && test` が green

## 関連

- #1049 / #1051（状態遷移を merge 境界に揃えた前提）
- 実装前レビューと方針整理は本 issue のコメントを参照
