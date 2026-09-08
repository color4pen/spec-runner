# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `rules.md` で conformance の権限範囲を確認し、`request.md` の 8 Acceptance Criteria と設計要求、`spec.md` の 9 Requirements / 26 Scenarios を規範として抽出した。`design.md` の D1〜D7 と全項目完了の `tasks.md` は計画コンテキストとして扱った。
- `git diff main...HEAD --stat` で 86 files / 4004 insertions / 1314 deletions の実装範囲を確認し、変更された runtime、pipeline、command、state/config、verification、notification、reopen、tests、docs を追跡した。
- local normal/fixer/reverification の finalizer、parallel review round、verification propagation が既存の scoped/guarded staging、除外、revision/OID 記録を維持した commit-only 経路になり、途中 push を呼ばないことを確認した。managed runtime の既存 remote handoff は local の省略対象になっていない。
- `publishCommittedBranch` が remote feature ref の有無に応じて remote-relative range または `HEAD --not --remotes=origin` を列挙し、全 outgoing OID を `synthesizedCommits` と照合してから push することを確認した。worktree diff や新規 commit の有無を publish 条件にしておらず、unknown commit は fail closed、push は同一認証済み transport seam で再試行される。
- PR-producing 経路で verification/review 後の pre-PR publish が PR API より先に必須となり、API/existing-open 処理後に PR identity と awaiting-archive を保存・commit・post-PR publish することを確認した。pre-PR、PR API、post-PR の失敗状態と、PR なし publication failure の reopen 例外を照合した。
- GitHub-disabled および pr-create のない profile が awaiting-archive で成果と final checkpoint を publish し、PR API を必要としないことを確認した。
- `pipeline.publishCheckpointOnHalt` の boolean validation、default true、job 作成時 snapshot、legacy=true accessor、effective text/JSON の value/source 表示を確認した。resume/reopen/attach は保存済み state を維持し、runtime/provider/CI から policy を推測しない。
- pipeline 内 halt と pipeline 前 fidelity gate が quiescent state を先に保存し、managed path のみ commit した後、保存済み policy が有効な場合だけ publish することを確認した。disabled/failure 時は remote-ready/issue resume guidance を抑止し、same-worktree retryability を残す。
- signal/beforeExit/process-loss は新 publication seam を呼ばず、archive は record push 成功前に archived transition/cleanup へ進まないことを実装・回帰テスト・運用文書で確認した。
- README、configuration、operations、Actions workflow、architecture の記述が job 境界公開、halt policy、controlled halt と突然終了の保証差に追従していることを確認した。
- `verification-result.md` の build / typecheck / test / lint / changed-line-coverage 成功証跡と、後続修正に対する focused test・現 HEAD の test/typecheck/lint 証跡を再利用した。レビュー指示に従い full suite は重複実行していない。

## 検証できなかった項目

None. 実 GitHub/Vercel/credential への接続は要求どおり検証対象にせず、isolated Git fixture と API/transport spy の証跡を使用した。

## Findings 詳細

None.
