# code-fixer 判断ログ — cli-finish-command

## 2026-05-01 — iter1 → iter2 修正判断

- archive-pr.ts を 3 つの公開関数に分割する :: orchestrator が idempotency 確認 → branch 準備 → push+create を 3 段階で呼べるようにし、各段階の前後で他のステップを挟めるようにするため
- checkArchivePrAlreadyMerged を export する :: F#2 の根本原因（probe が tree mutation の後ろにある）を構造的に解決するため、orchestrator が mutation 前に呼べる必要がある
- prepareArchiveBranch で `git checkout -b` 失敗時に `git checkout -B` で force-reset する :: F#3 の stale-branch 問題を解決。-B は branch が存在すれば origin/main へ強制再ポイント、存在しなければ作成するため、prior failed run の commit を持ち越さない
- pushAndCreateArchivePr を branch 準備とは独立した関数とする :: orchestrator が `prepareArchiveBranch` → `archiveOpenspec` → `moveRequestsDir` → `pushAndCreateArchivePr` の順序で commits を archive branch に積む構造を取れるようにするため
- createArchivePr 関数を残置する :: 既存の finish-archive-pr.test.ts ユニットテストの結合シナリオ（idempotency + branch + push + create）を維持するため。orchestrator は使わないが test fixture と互換維持
- orchestrator.ts で JOB_NOT_FINISHABLE エラーを formatEscalation で 4-field block にラップする :: F#4 で指摘された「raw err.message を escalation に渡す」を解消し、他の escalation 出力との format 一貫性を維持するため。failedStep="job-state-gate", detectedState=`JOB_NOT_FINISHABLE (status=...)`、recommendedAction = ps コマンドで状態確認、resumeCommand で再実行
- orchestrator step 順序を request.md §5 に厳密に合わせる :: F#1 (CRITICAL) を解消。merge feature PR → idempotency probe → prepareArchiveBranch → archiveOpenspec → moveRequestsDir → pushAndCreateArchivePr → markJobArchived の 7 段階。archive 系 commits は必ず chore/archive-<slug> 上に積まれる
- archive PR が既に merged の場合は openspec archive と git mv をスキップする :: idempotent な再実行で「main に prior run で archive commit が反映済み」のケースに対応。archive branch を再作成しても commit は origin/main から流れているため新たに必要なし、markJobArchived のみ実行して exit 0 で完了

## 2026-05-01 — iter2 → iter3 修正判断

- `openspec archive` 成功後に `git add openspec/changes/` を spawn する :: F#1 (CRITICAL)。openspec archive は filesystem mv のみで git stage しないため、後続 commit に変更が含まれない。`openspec/changes/` 配下を一括 stage することで削除と新規 archive ディレクトリの両方を staging する
- orchestrator 成功パス末尾に `git checkout main` を spawn する :: F#2 (HIGH)。archive branch は `--delete-branch` で remote が消えるため、user が remote に存在しないローカルブランチ上に取り残されるのを防ぐ。失敗（escalation）パスでは branch を維持して debug 用途を残す
- `git diff --cached --quiet` の exit code で staged 変更の有無を判定し、exit 0 ならば commit をスキップする :: F#4 (MEDIUM)。substring `"nothing to commit"` の locale 依存を排除する。テストも 2-call → 3-call シーケンスに更新
- `isFeaturePrAlreadyMerged` を idempotency.ts から削除する :: F#5 (MEDIUM)。grep で src/ / tests/ の import が 0 件であることを確認済み。dead export の除去
- `createArchivePr` に legacy combined entry docstring を追記する :: F#6 (LOW)。orchestrator が使わない理由を明示し、次 request で削除判断する際の文脈を残す
- TC-045 に spawn 呼び出し順序の index assertion を追加する :: F#3 (MEDIUM)。exists=true の stubFs を使って openspec archive が実行されるシナリオを構成し、fetch < checkout < openspec < git-add < mv < diff < commit < push < pr-create < pr-merge-auto < checkout-main の順序を assert する
