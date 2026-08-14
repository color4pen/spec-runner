# archive の draft 削除が実ファイルに届いていない: repo 本体側・両形式の削除に直す

## Meta

- **type**: bug-fix
- **slug**: archive-flat-draft-cleanup
- **base-branch**: main
- **adr**: false

## 背景

archive は取り込み時に該当 slug の draft を削除する設計だが、実際にはほぼ一度も削除できておらず、merge 済み request の draft が数十件規模で蓄積していた。原因は二層ある:

1. **場所の誤り**: 削除は archive record を作る job worktree 内のパス(`<recordDir>/specrunner/drafts/<slug>`)を対象にしている。しかし draft は通常 git 管理外(untracked)のローカルファイルとして repo 本体の working tree にのみ存在し、untracked ファイルは worktree に現れない。worktree 側をいくら消しても実ファイルには届かない。
2. **形式の取りこぼし**: 削除対象がディレクトリ形式 `drafts/<slug>/` のみで、実運用標準のフラット形式 `drafts/<slug>.md` を見ていない。

いずれも `fs.rm` の `force: true` により「対象が存在しない」ケースが無音で成功するため、失敗が観測されないまま蓄積した。

## 現状コードの前提

- `src/core/archive/orchestrator.ts:260-265` — `fs.rm(<recordDir>/specrunner/drafts/<slug>, { recursive: true, force: true })`。recordDir は archive record 用の job worktree。フラット形式への対応なし
- `src/core/request/store.ts:13-55` — draft 解決はディレクトリ形式(`drafts/<slug>/request.md`)とフラット形式(`drafts/<slug>.md`)の両対応
- draft は通常 untracked(repo 本体の `git status` で `?? specrunner/drafts/`)。worktree には存在しない
- `src/core/cancel/runner.ts:154` — cancel の `--restore-draft` は `deps.repoRoot` 基準で drafts/ に書き戻す(repo 本体側を操作する既存前例)
- `src/core/archive/orchestrator.ts:272-280` — worktree 側で `git add specrunner/drafts/` を行うが、untracked draft は worktree に無いため実質 no-op

## 要件

1. **repo 本体側の削除** — archive 完了時に、repo 本体(repoRoot)の `specrunner/drafts/<slug>.md`(フラット)と `specrunner/drafts/<slug>/`(ディレクトリ)の両形式を削除する。untracked ファイルでも消えること。どちらも存在しない場合は現行どおり無音で続行してよい(archive の完了を draft 残存より優先)。
2. **tracked draft の扱い** — 削除対象の draft が git 管理下(tracked)だった場合、repo 本体の working tree を黙って dirty にしない。削除は行わず、手動削除を促す警告を出す(自動 commit はしない)。
3. **worktree 側の既存処理の整理** — 実質 no-op になっている worktree 側の削除・staging は、削除するか要件 1 と整合する形に整理する(判断は design。残す場合はその理由を design に明記する)。

## スコープ外

- 既に蓄積した過去の残存 draft の掃除(対応済み・手動削除済み)
- cancel `--restore-draft` の形式対応
- draft の形式統一・git 管理方針の変更

## 受け入れ基準

- [ ] archive 完了後、repo 本体のフラット形式 draft `drafts/<slug>.md` が削除されることをテストで固定する
- [ ] archive 完了後、repo 本体のディレクトリ形式 draft `drafts/<slug>/` が削除されることをテストで固定する
- [ ] 両形式とも存在しない場合に archive が失敗せず警告も出ないことをテストで固定する
- [ ] tracked な draft の場合は削除せず警告が出ることをテストで固定する
- [ ] 既存テストが無変更で green(worktree 側処理を整理する場合は design で更新対象を列挙し根拠を明示する)
- [ ] `typecheck && test` が green
