# plain archive の状態遷移を merge 境界に合わせる

## Meta

- **type**: spec-change
- **slug**: archive-state-after-merge
- **base-branch**: main
- **adr**: true

## 背景

現在の plain `specrunner job archive <slug>` は、feature branch 上に archive record commit を作成・push する段階で `awaiting-archive -> archived` に遷移する。

一方 `--with-merge` 経路では `deferArchivedTransition: true` を使い、PR merge 成功後まで `awaiting-archive` を維持している。

この差により、plain archive を GitHub Actions 等から「archive record を PR に積む操作」として使うと、次の不整合が起こりうる。

```text
awaiting-archive
  -> archive record commit / push
  -> archived
  -> CI failure or PR remains unmerged
```

job state は `archived` だが変更は main に入っていない、という状態になる。

今後の remote execution では、Actions で archive record を積み、CI を確認したうえで最終 merge は GitHub UI から人間が行う運用も正規経路になりうる。plain archive の意味を「archive record の準備」と「merge 後の terminal transition」に分ける必要がある。

## 現状コード

- `src/core/archive/orchestrator.ts`
  - plain archive は `deferArchivedTransition` が false のため archive record 時点で `markJobArchived()` を呼ぶ
  - archive commit を feature branch に push する
- `src/core/archive/merge-then-archive.ts`
  - `deferArchivedTransition: true` で archive record を先に PR に積む
  - CI/check を待つ
  - merge 成功後に `archived` 遷移 + post-merge cleanup を行う
- `job archive --from-issue <n>` により remote runner から awaiting-archive checkpoint を取り込めるため、Actions を archive face にする前提は既に成立している

## 期待する状態モデル

plain archive でも archive record を push しただけでは terminal にしない。

```text
awaiting-archive
  -> archive record commit / push
  -> awaiting-archive
  -> CI
  -> PR merge
  -> archived + cleanup
```

`archived` は「archive record が作られた」ではなく、少なくとも「対象変更が merge 済みで、後処理を完了した」状態として扱う。

## 要件

1. plain `job archive` は archive record commit を作成・push しても `awaiting-archive` を維持する。
2. `archived` への terminal transition は PR merge 後にのみ行う。
3. 既存 `--with-merge` の `archive record -> CI wait -> merge -> archived -> cleanup` 経路は維持する。
4. GitHub UI 等で out-of-band merge された場合に、再実行可能な正規経路で `archived` transition + cleanup を完了できること。
   - 既存 `job archive` / `job archive --from-issue` の再実行で merged PR を検出して完結できる形を優先して検討する。
   - webhook 専用の新しい状態機構を先に導入しない。
5. archive record 作成済み・PR 未mergeの状態から再実行しても、archive commit を重複作成しないこと。
6. PR が未mergeのまま CI failure / canceled / timeout になっても job は `awaiting-archive` のままであること。
7. merge 後の worktree teardown / branch cleanup は既存 post-merge cleanup を再利用すること。

## 受け入れ基準

- [ ] plain `job archive` 成功後、PR 未mergeなら state は `awaiting-archive`
- [ ] archive record commit は feature branch に push される
- [ ] archive record push 後に CI が failure でも state は `awaiting-archive`
- [ ] out-of-band で PR merge 後、正規コマンド再実行により `archived` + cleanup まで完了する
- [ ] `--with-merge` は既存どおり CI green を待って merge 後に `archived` になる
- [ ] archive record 済み状態からの再実行は冪等
- [ ] branch/worktree cleanup は merge 前には行われない
- [ ] 既存テストのうち plain archive の旧意味（record 時に archived へ遷移）を pin するテストに限り新契約への更新を許容する。それ以外の既存 archive / from-issue / with-merge テストは無変更で green

## 設計上の注意

新しい `archive-prepare` のようなコマンドは原則追加しない。CLI 面を増やすより、`job archive` の状態意味を merge 境界に合わせる。

2026-06-03 の archive ADR では archive を client-closed な最終片づけとして分離したが、その後 remote job / issue-target / `archive --from-issue` が導入され、Actions 上で archive record を作る execution face が現実的になった。今回の変更では archive orchestrator の GitHubClient 非依存という不変は維持しつつ、terminal transition のタイミングを見直す。
