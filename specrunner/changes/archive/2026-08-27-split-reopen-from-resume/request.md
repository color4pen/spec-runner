# job reopen が pipeline 実行まで内包し resume の入力・安全機構を迂回する — lifecycle 操作と実行を分離する

## Meta

- **type**: bug-fix
- **slug**: split-reopen-from-resume
- **base-branch**: main
- **adr**: true

## 問題

現在の `job reopen` は、OPEN PR を持つ `awaiting-archive` job に対する operator-scoped lifecycle 操作であると同時に、`CommandRunner` を継承して指定 step から pipeline を即時実行する。

しかし、実行コマンドとして必要な入力・安全機構は `resume` 側にしか存在しない。

- `reopen` の入力は `--from` / `--reason` のみ
- `--reason` は operator event と state transition の理由にだけ使われ、step prompt には渡らない
- `ReopenCommand.prepare()` は `resumePrompt: undefined` を返すため、reopen 後に agent へ修正指示を渡せない
- `resume` が持つ `--prompt` / `--adopt-commits` / `--apply-canon` / `--wontfix` 等の再開時入力・preflight が reopen にはない

その結果、reopen 前に人間が変更を加えた場合も扱いが一貫しない。

| reopen 前の状態 | 現在の挙動 |
|---|---|
| job worktree で commit + push 済み | origin 上の既存 revision として暗黙に受け入れられる |
| commit 済み・未 push | reopen に `--adopt-commits` がなく、後続 push の egress ledger で `EGRESS_UNKNOWN_COMMIT` になり得る |
| 未 commit の変更 | reopen ingress では検査されず、開始 step の write-scope により混入・隔離・復元のいずれかになる |
| 別環境から PR branch に push | 既存 local worktree を fetch / update せず、古い checkout から再実行し得る |

これは「reopen が実行まで所有する一方、resume の実行契約を持っていない」ことによる責務境界の欠陥である。`reopen --prompt` だけを追加すると、次に `--adopt-commits` / `--apply-canon` 等も複製することになり、二つの実行 entry point が継続的に乖離する。

## 期待する責務分離

### `job reopen`

reopen は **awaiting-archive job を再開可能にする operator lifecycle 操作**だけを担う。

- status が `awaiting-archive` であることを確認する
- associated PR が OPEN であることを fail-closed で確認する
- `--reason` を operator event として記録する
- `awaiting-archive → awaiting-resume` へ遷移する
- 既存 branch / PR / 過去 evidence を保持する
- agent / CLI step を起動しない

### `job resume`

resume を **pipeline を実行する唯一の再開 entry point**とする。

- `--from` で開始 step を決める
- `--prompt` を対象 step に one-shot injection する
- `--adopt-commits` / `--apply-canon` / `--wontfix` 等の既存 preflight・operator adjudication を適用する
- worktree / revision / dirty state を検査してから `awaiting-resume → running` へ遷移し、pipeline を実行する

概念フロー:

```text
job reopen <slug> --reason "human review feedback"
  awaiting-archive → awaiting-resume
  process exits without pipeline execution

job resume <slug> --from code-fixer --prompt "指摘内容..."
  awaiting-resume → running
  pipeline execution
```

Actions で即時再実行したい場合も、workflow が同一 run 内で `reopen` と `resume` を順番に compose すればよい。core command の責務を結合する必要はない。

## 要件

1. `ReopenCommand` から pipeline 実行責務を除去し、成功時は `awaiting-resume` で停止する。
2. reopen 成功時に agent query / CLI step / pipeline が一切起動しないことを固定する。
3. pipeline 再実行は `job resume` を経由し、既存の `--prompt` と各種 ingress safety option を利用する。
4. `--from` は実行位置の指定なので resume 側を正本とする。既存 `reopen --from` の互換方針（廃止、移行期間付き deprecation 等）は ADR で決定する。
5. reopen の state-only 遷移を永続化しても、pipeline-managed metadata だけの更新により source revision binding を不要に失効させない。Actions が同一 run で reopen → resume する場合は中間 push を必須にしない。
6. `action=reopen` の Actions 経路は、新しい責務境界に合わせて reopen → resume を明示的に compose するか、transition-only action と execution action を分ける。
7. help / guide / ADR / architecture test を新契約へ更新する。

## 受け入れ基準

- [ ] OPEN PR を持つ `awaiting-archive` job に `job reopen <slug> --reason <text>` を実行すると、status が `awaiting-resume` になり、pipeline は起動せず終了する
- [ ] merged / closed PR、archived / canceled job の reopen は従来どおり拒否される
- [ ] reopen の operator event と reason が保持される
- [ ] reopen 後に `job resume <slug> --from <step> --prompt <text>` を実行すると、指定 step が起動し、prompt がその step に届く
- [ ] reopen 後の未 push commit は `resume --adopt-commits`、dirty protected canon は `resume --apply-canon` という既存の単一契約で処理できる
- [ ] `ReopenCommand` から `CommandRunner` / pipeline 実行への依存が除去される、または同等の architecture invariant で直接実行不能が固定される
- [ ] local / managed / Actions の各 execution face で lifecycle と execution の意味が一致する
- [ ] typecheck / test が green

## スコープ外

- merge 済み PR の reopen
- 新しい fixup step / reviewer step の追加
- prompt の findings 構造化
- resume の既存 retry policy 変更

## 関連

- #876: reopen の初回導入。初期契約から lifecycle transition と pipeline 再実行が結合されている
- #1066: Actions reopen。reopen 後の同一 run 即時実行を明示的に固定しているため、本 issue で契約変更対象となる
- #1083: archive 1 相化。archive 実行で即 `archived` になるため、reopen（`awaiting-archive` 限定）の可能窓は archive 実行前までに固定される。本 issue の ADR は #1083 の新契約を前提に書くこと
- #629: merge 前の人間レビュー指摘を既存 PR に反映する操作の議論