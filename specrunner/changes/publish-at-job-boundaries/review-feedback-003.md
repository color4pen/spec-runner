# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` を実行し、73 files / 3288 insertions / 1216 deletions の差分範囲を確認した。
- `design.md`、`tasks.md`、`spec.md` と `test-cases.md` の全 MUST scenario を、公開境界、停止時 policy、egress ledger、通知、再試行経路の実装・テスト差分に照合した。
- iteration 001/002 の findings に対する typed terminal commit failure、pre-PR error preservation、disabled halt の local commit、halt publication result に応じた通知、Actions の明示設定を追跡し、修正されていることを確認した。
- `verification-result.md` に記録された build / typecheck / test / lint の成功証跡を確認した。

## 検証できなかった項目

- verification 証跡後に code-review/code-fixer の変更が追加されているため、現在の HEAD に対する build / typecheck / test / lint 成功は証跡化されていない。レビュー指示に従い同一 suite は再実行していない。
- 実 GitHub、実 remote credential、Vercel への接続は要件どおり使用していない。

## Findings 詳細

1. `src/core/pipeline/pipeline.ts:424` / `src/core/command/reopen.ts:142`: PR を作らない profile で final publication が失敗すると、pipeline は先に state を `awaiting-archive` に保存してから例外を投げる。一方、この状態から実行を再試行する唯一の lifecycle command である `job reopen` は、GitHub integration が有効なら recorded PR を必須とする。したがって GitHub は有効だが profile に `pr-create` がない正常完了経路では、未送信 commit と local state は残っても reopen/resume できず、差分なし publication retry に到達できない。これは TC-011、TC-024、TC-030 の組合せで要求される no-PR publication failure の local retryability を満たさない。final publication failure を retryable な状態へ遷移させるか、publication failure を記録した no-PR `awaiting-archive` job に限定して再公開を許可する必要がある。GitHub-enabled/no-PR profile の失敗→差分なし retry を既存 CLI/CommandRunner 経路で固定する統合テストも追加する。
