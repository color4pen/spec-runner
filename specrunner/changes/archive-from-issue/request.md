# awaiting-archive checkpoint の issue 起点取り込み

## Meta

- **type**: new-feature
- **slug**: archive-from-issue
- **base-branch**: main
- **adr**: true

## 背景

remote 環境（GitHub Actions runner 等）で pipeline を完走した job は、branch 上に awaiting-archive の checkpoint（state.json / events.jsonl / change folder）と PR を残して環境ごと消える。ローカルにはこの job の state が存在しないため、`job archive <slug> --with-merge` は「No job found with slug」で弾かれ、取り込みの正規経路がない。現状の operator の選択肢は手動 merge + change folder の手動移動だけで、archive orchestrator の記録（archive-record commit / status 遷移 / post-merge cleanup）が欠落する。

checkpoint 検証の policy 分離（checkpoint-verification-policy-split）は、この「awaiting-archive の issue 起点取り込み」が issue 起点 resume と同じ rebind 機構を使うことを想定して整備されており、本 request はその想定用途を実装する。

## 現状コードの前提

- `src/core/archive/merge-then-archive.ts:186-199` — Step 1 は `JobStateStore.listWithSourceDirs(cwd)` で local job state を要求し、無ければ exit 2「No job found with slug」。`state.pullRequest?.number` 欠落も exit 2
- `src/core/attach/checkpoint-policy.ts:45-111` — `attachResumePolicy` は `status !== "awaiting-resume"` を not-quiescent で拒否し、resume 前提の checks（resumePoint 解決・resume step の reads() precheck）を課す
- `src/core/attach/verify-checkpoint.ts:71-79` — `verifyCheckpoint` は policy を引数注入でき（default: attachResumePolicy）、generic integrity 層（journal / counter / profile / request.md / identity）は status 非依存
- `src/cli/attach.ts:161-163` — attach 成功時の next-step hint は「Run 'specrunner job resume <slug>'」固定
- `src/cli/resume-from-issue.ts:110-207` — issue 起点 resume の流れ: marker から jobId 解決 → `loadStateByJobId` による local short-circuit → branch 解決 → rebind（`runAttachVerification` + `setupWorkspace(attachCheckpoint)`）→ resume
- `src/core/issue-target/resume.ts:52-77` — `resolveEscalationJobId` は `kind="escalation"` marker のみを走査する
- `src/core/issue-target/resume.ts:119-206` — branch locator は `listIssueLinkedBranches`（GraphQL `linkedBranches`）で候補を列挙し、checkpoint state.json の 3 点照合（jobId / issueNumber / branch）で確定する
- `src/core/notify/issue-notifier.ts:103-107, 215-226` — terminal 通知は `kind="completed"` marker（jobId 埋め込み）+ PR URL + archive コマンド hint を issue コメントとして投稿する
- `src/core/runtime/local.ts:487-494` — `setupWorkspace` の attachCheckpoint 経路は checkpoint OID からの worktree 実体化で、job status に依存しない
- `src/cli/command-registry.ts:1314-1324` — `job archive` は slug positional が `required: true`
- **実測（2026-08-21, 実 issue で確認）**: PR が branch から作成されると GraphQL `linkedBranches` は空になる（Development panel の branch エントリは PR に置き換わる）。同 issue の `closedByPullRequestsReferences` は closing PR（number / headRefName）を返す

## 要件

1. **awaiting-archive 用 CheckpointVerificationPolicy の追加**: `status === "awaiting-archive"` と `state.pullRequest?.number` の存在を検査する policy を追加する。resume 前提の checks（resumePoint 解決・reads() precheck）は課さない。既存 `attachResumePolicy` と generic integrity 層は変更しない。
2. **`job attach --branch <branch>` の awaiting-archive 受理**: checkpoint の status に応じて policy を選択し、awaiting-resume / awaiting-archive の両方を attach できるようにする。成功時の next-step hint を status で出し分ける（awaiting-resume → `job resume <slug>` / awaiting-archive → `job archive <slug> --with-merge`）。それ以外の status は従来どおり not-quiescent で拒否する。
3. **`job archive --from-issue <n> [--with-merge]` の追加**: issue 起点の取り込み経路を実装する。
   - jobId 解決: issue コメントの `kind="completed"` marker（複数あれば最新）から抽出する（既存 `parseEscalationJobId` / `resolveEscalationJobId` と対称の completed 版）。marker 不在は typed error。
   - local short-circuit: `loadStateByJobId` で local state が見つかれば rebind せず既存 archive 実行に直行する（issue 起点 resume の short-circuit と対称）。
   - branch 解決: `linkedBranches` ではなく closing PR references（GraphQL `closedByPullRequestsReferences`）で候補 PR を列挙し、各候補の headRefName の checkpoint state.json と 4 点照合（`jobId` / `issueNumber` / `branch` = headRefName / `pullRequest.number` = PR number）で一意確定する。0 件・複数確定は typed error。GitHubClient port に closing PR 列挙メソッドを追加する。
   - rebind: 確定した branch を awaiting-archive policy で検証し、`setupWorkspace(attachCheckpoint)` で worktree + local state を実体化した後、既存の archive 実行（`--with-merge` 指定時は merge-then-archive）にそのまま接続する。archive orchestrator 本体のロジックは変更しない。
   - 引数契約: slug positional と `--from-issue` は排他（両方指定・両方欠落は exit 2）。
4. **issue 起点 resume の不変**: `job resume --from-issue` の policy（awaiting-resume 限定）と locator（escalation marker + linkedBranches）は変更しない。awaiting-archive checkpoint の resume は引き続き拒否される。

## スコープ外

- managed runtime での attach / 取り込み（attach は従来どおり local runtime 限定）
- `job archive` への `--detach` 追加（archive は従来どおり foreground 実行）
- inbox / ラベルによる取り込みの自動発火
- signal 終了（SIGTERM 等）で checkpoint が未公開のまま消えた remote job の救済（checkpoint publish の能力差は既存 ADR の設計どおり）
- issue 起点 resume 側の branch locator の closing-PR 対応（resume 時点では PR 未作成であり linkedBranches で解決できる）

## 受け入れ基準

- [ ] awaiting-archive policy: awaiting-archive checkpoint の受理 / awaiting-resume・running の拒否 / `pullRequest.number` 欠落の拒否をテストで固定する
- [ ] `job attach --branch`: awaiting-archive checkpoint の attach 成功と hint の出し分けをテストで固定し、既存の awaiting-resume attach テストは無変更で green
- [ ] completed marker 解決: `kind="escalation"` marker を無視して `kind="completed"` のみ採用すること、複数時に最新を選ぶこと、不在時に typed error になることをテストで固定する
- [ ] closing-PR branch locator: 一意確定 / 0 件 / 複数確定 / 4 点照合の不一致 skip をテストで固定する
- [ ] `job archive --from-issue` の CLI 配線: `--with-merge` の引き継ぎと、slug positional との排他（両方・欠落で exit 2）をテストで固定する
- [ ] local short-circuit: local state が存在する場合に rebind を経ずに archive 実行へ直行することをテストで固定する
- [ ] `job resume --from-issue` が awaiting-archive checkpoint を引き続き拒否することをテストで固定し、既存の resume-from-issue / attach / archive テストは無変更で green
- [ ] `specrunner guide` の jobs / merge topic に issue 起点取り込みの経路を追記する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **branch locator は closing-PR references を使う**: 実測で PR 作成後の `linkedBranches` は空になるため、awaiting-archive（= pr-create 完了済みで PR が必ず存在する）の locator として linkedBranches は成立しない。closing PR の headRefName + checkpoint 4 点照合を採用する。却下案: completed 通知コメント本文の PR URL パース — 本文は表示用であり機械契約ではない（marker のみが機械可読契約）。
- **jobId は completed marker から解決する**: escalation marker の流用は、escalation を一度も経ずに完走した job で成立しないため却下。
- **新コマンドではなく `job archive --from-issue` に載せる**: 取り込みは archive の一形態であり、`job resume --from-issue` と対称の CLI 面にする。`job intake` 等の新コマンド新設は却下（学習面積が増えるだけで能力が同じ）。
- **policy 差し替えのみで generic 検証層は不変**: checkpoint-verification-policy-split が policy 注入点として設計した箇所に awaiting-archive 用 policy を注入する。verifyCheckpoint 本体の分岐追加は却下。
- **rebind 後は既存 archive orchestrator に無改変で接続**: `setupWorkspace(attachCheckpoint)` が worktree + local state を実体化すれば、merge-then-archive Step 1 の `listWithSourceDirs` がそのまま発見する。archive 側に remote 特例を足す案は却下（取り込み後はローカル完走 job と同一状態にするのが不変条件）。
