# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` を実行し、67 files / 3115 insertions / 1205 deletions の差分範囲を確認した。
- `design.md`、`tasks.md`、`spec.md` と `test-cases.md` の全 MUST scenario を実装差分・テスト差分に照合した。
- commit-only / publish-only 分離、PR 前後と PR なし完了、halt policy snapshot、verification propagation、managed no-op、archive 関連の変更を確認した。
- iteration 001 の3 findingについて code-fixer 差分を追跡し、typed commit failure、pre-PR error preservation、policy=false 時の local checkpoint commit が実装されたことを確認した。
- `verification-result.md` に記録された build / typecheck / test / lint の成功証跡を確認した。

## 検証できなかった項目

- verification 証跡の後に iteration 001 の code-fixer commit が追加されているため、その修正後 HEAD に対する build / typecheck / test / lint 成功は証跡化されていない。レビュー指示に従い同一 suite は再実行していない。
- 実 GitHub、実 remote credential、Vercel への接続は要件どおり使用していない。

## Findings 詳細

1. `src/core/pipeline/pipeline.ts:669` / `src/core/command/runner.ts:367` / `src/core/notify/issue-notifier.ts:283`: halt checkpoint の publish が無効または失敗しても、共通 terminal notifier は通常の escalation comment を投稿する。この comment は remote branch の compare URL と `specrunner job resume <slug>` を無条件で案内するため、remote checkpoint が存在しない状態を issue 起点で再開可能に見せる。保存済み policy と publication result を notifier に反映し、publish 成功時だけ remote/issue resume を案内し、disabled/failure は same-worktree retry のみに限定する必要がある。

2. `.github/workflows/specrunner-dispatch.yml:11`: Actions 運用例は checkpoint が常に feature branch に publish 済みであると記述したままで、要求された `pipeline.publishCheckpointOnHalt: true` の明示設定がない。project config で false を選んだ場合もこの workflow の説明は別 runner から resume 可能と誤認させるため、workflow が参照する project config/例に true を明示し、コメントも stored policy と publish 成功を条件にする必要がある。
