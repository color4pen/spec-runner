# archive を 1 回で完結させ、merge 後の再 archive 契約を撤回する

## Meta

- **type**: spec-change
- **slug**: single-phase-archive
- **base-branch**: main
- **adr**: true

## 背景

#1049 / #1051 で plain `job archive` の `archived` transition を PR merge 後まで遅延し、remote execution では次の 2 相操作になった。

```text
awaiting-archive
  → archive（archive record を feature branch に push）
  → awaiting-archive のまま
  → GitHub UI で PR merge
  → archive を再実行
  → archived + cleanup
```

この契約は操作として不自然で、同じ `archive` コマンドが merge 前後で別の意味を持つ。

`archive` の本来の仕事は、feature branch 上で change folder を archive 位置へ移し、その archive commit を PR に乗せ、SpecRunner 側の job を終端させること。PR merge はその後 GitHub 上で人間が行う独立した操作であり、`archived` と `PR MERGED` を同期させる必要はない。

## 正しい操作モデル

```text
pipeline 完了
  ↓
awaiting-archive
  ↓
archive
  - specrunner/changes/ → archive/ へ move
  - archive commit を feature branch に commit / push
  - local worktree / sidecar 等を cleanup
  - awaiting-archive → archived
  ↓
GitHub UI で人間が PR merge
  ↓
完了
```

`archived` は「PR が merge 済み」を意味しない。**SpecRunner 側の archive 処理が完了した**ことだけを表す。PR の OPEN / MERGED は GitHub 側の事実として独立して扱う。

## 要件

1. plain `job archive <slug>` / `job archive --from-issue <issue>` は **1 回の実行で archive を完了**する。
2. archive record commit は従来どおり feature branch に作成・pushし、folder move が PR に含まれること。
3. archive record push 成功後に `awaiting-archive → archived` へ遷移すること。PR merge を待たないこと。
4. archive 実行時に既存の local cleanup（worktree / sidecar 等）を完了すること。merge 後の再実行を cleanup の前提にしないこと。
5. PR merge は GitHub UI / GitHub governance に完全に委譲し、archive command は merge を待たない・検出しない・後追い finalize しないこと。
6. `runPlainArchive` の `MERGED + archiveRecorded → completeAfterMerge` を通常操作契約として使わないこと。`src/core/archive/merge-completion.ts` を削除するか、`--with-merge` ／移行経路専用として残すかは ADR で決定する。
7. workflow_dispatch の `action=archive` も **1 回だけ**で完了すること。workflow コメント・メッセージから「2 相 archive」「merge 後に再実行」の案内を除去すること。
8. `--with-merge` は別契約として必要なら維持してよいが、plain archive の意味を二相に引きずらないこと。
9. 操作順は **archive → merge** を正とする。PR が既に MERGED の job に archive を実行した場合の挙動を設計で明示すること（少なくとも job を `archived` + cleanup へ終端できること。archive record commit が main に届かない可能性は operator へ警告として表面化してよいが、terminal transition の条件にはしない）。
10. 旧 2 相契約の残置 job（archive record push 済み・PR merge 済み・状態 `awaiting-archive`）に対して、新しい plain archive を 1 回実行すれば `archived` + cleanup へ到達できること（べき等な後始末として扱い、専用の移行コマンドは追加しない）。

## 非目標

- archive folder move の廃止
- archive commit を main へ直接書くこと
- GitHub UI merge の自動化
- webhook / daemon による merge 後処理
- 新しい archive/finalize コマンドの追加
- PR merge 状態と job status の同期機構追加

## 受け入れ条件

- [ ] `awaiting-archive` の PR OPEN job に `job archive` を 1 回実行すると archive folder move + commit/push + cleanup + `archived` まで完了する
- [ ] archive 後、PR が OPEN のままでも job は `archived`
- [ ] その後 GitHub UI で PR を mergeしても SpecRunner コマンドの再実行は不要
- [ ] archive commit が PR に含まれ、merge後の main では change folder が archive 位置にある
- [ ] 旧 2 相契約の残置 job（record push 済み・PR MERGED・`awaiting-archive`）にも 1 回の archive で `archived` + cleanup が完了する
- [ ] workflow_dispatch `archive` の実行も 1 回で完結し、「merge後にもう一度 archive」の案内がない
- [ ] plain archive は GitHub PR state の MERGED 判定を terminal transition の条件にしない
- [ ] typecheck / test / architecture tests が green

## 設計上の訂正

#1049 で採った「archive record が main に merge されるまで `archived` にしない」という前提を撤回する。

```text
job lifecycle: awaiting-archive → archived
PR lifecycle:  OPEN → MERGED
```

この 2 つは別の状態機械であり、同期させない。

## 関連

- #1049
- PR #1051
- #1054
- #1082（reopen / resume 分離。reopen は `awaiting-archive` 限定のため、本 issue により reopen 可能窓は「archive 実行前まで」に固定される）
- `src/core/archive/plain-archive.ts`
- `src/core/archive/merge-completion.ts`
- `.github/workflows/specrunner-dispatch.yml`