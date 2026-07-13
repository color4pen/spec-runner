# archive --with-merge の merge 失敗後に job が復旧不能になる問題を修正

## Meta

- **type**: spec-change
- **slug**: archive-recover-unmerged
- **base-branch**: main
- **pipeline**: standard
- **adr**: true

## 背景

`job archive --with-merge` は archive-record（change folder の `archive/` への移動を feature branch に commit・push ＋ job status を `archived` へ遷移）を merge の前に行う。その後 merge が失敗（escalation）すると、job は active（`awaiting-archive` から `archived` へ遷移済）でも、local checkout 上の archived（archive commit は未 merged の feature branch 上にあり main checkout の走査に現れない）でもなくなり、`archive --with-merge` を再実行しても job 解決が「No job found」になって recovery できない。手動 `gh` merge ＋ worktree 除去が必要になる。

## 現状コードの前提

- merge-then-archive の順序: Step 2 初期 PR check → Step 3 archive-record（`runArchiveOrchestrator`、feature branch に commit・push ＋ status を `archived` へ）→ Step 4 wait → Step 5 merge → Step 6 post-merge cleanup（`src/core/archive/merge-then-archive.ts:170-235, :482-560`）。
- Step 1 の job 解決は `JobStateStore.list(cwd, { includeArchived: true })` を slug で filter（`:142-146`）。archived を含むが、走査は local checkout であり、未 merged feature branch 上の archive commit（archived state の所在）は含まれない → 「No job found」。
- Step 3 の archive-record は idempotent（`:218` コメント）。
- **制約**: Step 2 は `jobStatus === "archived"`（`:196`）で「archive 記録済み → merge 後の crash resume（cleanup）」と「merge 先行 → 順序エラー escalation（`:205`）」を区別している。status 遷移の timing を変える fix はこの区別を壊してはならない。

## 要件

1. `--with-merge` の merge が archive-record 後に失敗しても、job が `archive --with-merge` の再実行で解決でき、idempotent な archive-record を経て merge を retry できるようにする。
2. その際、Step 2 の「archive 記録済みか否か」の判定（現状 `jobStatus === "archived"`）を維持する。status 遷移の timing を merge 後へ遅延する場合は、「archive 記録済み」を表す別のシグナル（例: branch 上の archive folder 存在、または専用フラグ）へ判定を置き換え、merge-crash resume（`:196-203`）が引き続き機能することを保証する。
3. `--with-merge` を伴わない `job archive` 単体の挙動は変えない。

**最重量部の名指し**: 「archived 状態」と「archive 記録済みシグナル」の分離。merge 前は再解決可能な状態（awaiting-archive）を保ちつつ、Step 2 の crash-resume 判定が壊れないように「記録済み」を別途表現する。

## スコープ外

- merge-wait の grace（H-1 の `merge-wait-blocked-grace` で対応済）。
- config / verification 系。
- archive-record（folder-move）自体のロジック変更。

## 受け入れ基準

- [ ] `--with-merge` で archive-record 後・merge 前に、job が再解決可能な状態（`awaiting-archive` 相当）であることをテストで固定する。
- [ ] merge 失敗（escalation）後に `archive --with-merge` を再実行すると job が解決され、idempotent な archive-record を経て merge へ進めることをテストで固定する。
- [ ] merge 成功後に status が `archived` へ遷移し、post-merge cleanup が走ることをテストで固定する。
- [ ] archive 記録済み ＋ PR merged の crash resume（`:196-203`）が引き続き機能することをテストで固定する。
- [ ] `--with-merge` なしの `job archive` の既存挙動が不変であることを既存テストで確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- Step 1 の job 解決を feature branch まで広げて archived-on-branch を探す案は却下。local checkout に無い未 merged branch を走査するのは複雑で状態の所在が分散する。状態を再解決可能に保つ方が単純。
- archive-record（folder-move commit）を merge 後に回す案は却下。archive commit は merge に含める必要があり、merge 前に branch へ commit する順序は不可欠。遷移する「状態」と「記録済みシグナル」だけを設計し、branch commit の順序は変えない。
