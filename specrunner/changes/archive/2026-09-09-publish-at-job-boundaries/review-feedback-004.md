# Code Review Feedback — iteration 004

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` を実行し、78 files / 3443 insertions / 1220 deletions の差分範囲を確認した。
- `design.md`、`tasks.md`、`spec.md`、`test-cases.md` の MUST scenario を、commit-only、publication-only、PR 前後、PR なし完了、halt policy、reopen、通知、managed runtime の実装・テスト差分に照合した。
- iteration 003 の GitHub 有効・PR なし profile の publication failure 後に reopen できない指摘について、`isNoPrPublicationRetry` と CLI credential gate の修正、および追加単体テストを確認した。
- `verification-result.md` に記録された build / typecheck / test / lint / changed-line-coverage の成功証跡を確認した。

## 検証できなかった項目

- verification 証跡後に iteration 003 の code-fixer 変更が追加されているため、現在の HEAD に対する build / typecheck / test / lint の成功は証跡化されていない。レビュー指示に従い同一 suite は再実行していない。
- 実 GitHub、実 remote credential、Vercel への接続は要件どおり使用していない。

## Findings 詳細

1. `src/core/step/verification.ts:72`: verification result の local commit が失敗しても warning を出すだけで、verification step 自体は元の phase verdict をそのまま返す。そのため、たとえば `git commit` が失敗した実行でも verification は `passed` と記録され、pipeline は成果 publish と PR API へ進める一方、検証証跡は commit されず ledger にも登録されない。これは「verification は結果をローカル保存・commitし、後続処理は同じ worktree から読む」という要求と、TC-001/T-006 の verification 完了後にのみ公開する順序を破る。`propagateResult.ok === false` を step failure/escalation として扱い、commit 済みの verification revision がない限り publication/PR に進ませない必要がある。commit failure 時に PR API と publication が呼ばれない実経路テストも追加する。
