# ADR: requests/ を drafts/ に rename し archive 経路を changes/ に一本化する

**Date**: 2026-05-20
**Status**: Accepted
**Slug**: requests-to-drafts-restructure

---

## 背景

`specrunner/requests/active/<slug>.md` という起票エントリポイントは以下の問題を抱えていた:

1. **名前の意味過多**: "active" は起票直後（= run 前）の状態を意味するが、job state の `running / awaiting-merge / archived` 等と語彙が衝突し、「active = job 進行中」と読まれやすかった
2. **archive 経路の重複**: finish 時に `requests/merged/<slug>.md` と `changes/archive/<slug>/request.md` の 2 経路に同一内容が書き込まれ、冗長だった
3. **untracked 残骸バグ**: `requests/active/<slug>.md` は main worktree に untracked で生成されるため、feature branch では `changes/<slug>/request.md` として再追加される。squash merge 時に「active を add → active を rename to merged」が圧縮されて打ち消し合い、finish 後も `active/<slug>.md` が untracked のまま main に残り続けていた

---

## 判断 1: 起票エントリポイントを `specrunner/drafts/<slug>.md` に rename する

**決定**: `specrunner/requests/active/<slug>.md` → `specrunner/drafts/<slug>.md`

**根拠**: "drafts" は「まだ run していない原稿」だけを指し、状態が明確。run 開始と同時に move で消費するため、"まだ run していない" という意味が path に表れる。job state の語彙（running / archived 等）との衝突がない。

**却下した選択肢**:
- `requests/pending/` への rename: job state との衝突問題は同様に残る
- 現状維持: 語彙の衝突と untracked バグが継続する

---

## 判断 2: archive 経路を `changes/archive/<slug>/` の 1 経路に一本化する

**決定**: finish 時の archive は `specrunner/changes/archive/<slug>/` のみとし、`requests/merged/<slug>.md` への書き込みは廃止する

**根拠**:
- `move-requests-dir.ts`（active → merged の git mv）を廃止し、`archive-change-folder.ts`（`changes/<slug>/` → `changes/archive/<slug>/`）だけで archive が完結する
- 1 箇所への集約により「どこを見れば過去の request がわかるか」が一意になる
- `changes/archive/<slug>/` は request.md だけでなく design.md / tasks.md 等の作業 artifact も含むため、より完全な記録になる

**廃止するファイル**:
- `src/core/finish/move-requests-dir.ts` を廃止
- `src/core/finish/orchestrator.ts` から `moveRequestsDir` 呼び出しを削除

---

## 判断 3: run 開始時に draft を move（削除しつつコピー）して untracked 残骸バグを構造的に解消する

**決定**: worktree setup 時に `drafts/<slug>.md` を worktree の `changes/<slug>/request.md` にコピーした後、main worktree の `drafts/<slug>.md` を削除する（`fs.rm`）

**根拠**: untracked 残骸バグの root cause は「main worktree に起票ファイルが untracked のまま残り続ける」こと。run 開始を draft ファイルの唯一の消費者とし、run と同時に消費（削除）することで:

- main worktree から `drafts/<slug>.md` が消える（untracked 残骸バグの構造解）
- feature branch 上では `changes/<slug>/request.md` だけが新規追加される（経路一本化）
- squash merge 時の「add → rename → 打ち消し」問題が発生しない

**却下した選択肢**:
- `git add` で追跡してから mv する: worktree が origin/main から切られるため、main の untracked を追跡に乗せるだけでは feature branch への継承が難しい
- finish で active を削除する: finish は worktree 内で動作するため、main worktree の untracked ファイルには関知しない

---

## 判断 4: 既存 `requests/merged/` の 140 件は read-only として保持し migration しない

**決定**: `specrunner/requests/merged/` ディレクトリは削除せず read-only として保持する。新規 archive は `changes/archive/` のみに入る

**根拠**:
- 既存 140 件の migration は別 request で議論する予定であり、本 request のスコープに含めると変更範囲が過大になる
- 歴史的参照価値があるため、breaking 変更を避けて保持する
- `requests/active/` の廃止周知として `doctor/workflow-structure.ts` に deprecation 警告を追加するが、`requests/merged/` については警告対象外とする

**`checkSlugCollision` の扱い**:
- slug 衝突チェックは `drafts/` + `requests/merged/`（既存 140 件）+ `changes/archive/`（既存 106 件 + 新規分）の 3 経路を参照し、過去資産との衝突を引き続き防ぐ

---

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `src/util/paths.ts` | `draftsDir()` / `draftPath(slug)` ヘルパー追加 |
| `src/core/request/store.ts` | resolve/list/write/checkSlugCollision を drafts/ に向ける |
| `src/core/command/request-new.ts` | 出力先を drafts/ に変更 |
| `src/core/command/request-rm.ts` | 対象 path を drafts/ に変更 |
| `src/core/command/request-show.ts` | lookup 順を drafts/ 優先に変更（旧 requests/active/ は fallback） |
| `src/core/command/request-migrate-flat.ts` | 対象 path を drafts/ に対応 |
| `src/core/runtime/local.ts` | draft move（cp + rm）を worktree setup に追加 |
| `src/core/runtime/managed.ts` | draft 削除を worktree setup に追加 |
| `src/core/finish/move-requests-dir.ts` | 廃止 |
| `src/core/finish/orchestrator.ts` | moveRequestsDir 呼び出し削除 |
| `src/core/finish/resolve-target.ts` | slug 解決を drafts/ / changes/archive/ に変更、auto-detect 廃止 |
| `src/core/doctor/checks/repo/workflow-structure.ts` | drafts/ 主体の構造チェック、requests/active/ 廃止警告 |
| `src/context/request-patterns.ts` | changes/archive/<slug>/request.md から examples 収集 |
