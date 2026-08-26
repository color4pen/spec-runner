# Tasks: archive を 1 回で完結させ、merge 後の再 archive 契約を撤回する

推奨実行順は T-01 → T-08。T-01 は下位モジュール、T-03 が中核、T-04 以降は周辺面。
T-09 は最終検証で、他タスク完了後に実施する。

## T-01: cleanup module を改名し `deleteRemoteBranch` option を追加する（D3）

- [ ] `src/core/archive/post-merge-cleanup.ts` を `src/core/archive/cleanup.ts` にリネームする（`git mv` 相当）
- [ ] エクスポート名を `runPostMergeCleanup` → `runArchiveCleanup`、`PostMergeCleanupInput` → `ArchiveCleanupInput` に変更する
- [ ] `ArchiveCleanupInput` に `deleteRemoteBranch?: boolean` を追加する。未指定時は `true`（現行の破壊的挙動を既定として温存し、呼び出し側の明示的な opt-out のみで抑止する）
- [ ] `deleteRemoteBranch === false` のとき `git push origin --delete <branch>` を実行しない。worktree の撤去、`liveness.json` 削除、managed marker 削除、sidecar ディレクトリ削除、`--no-worktree` 時の base branch checkout、`git branch -D <branch>`（local 削除）はいずれも従来どおり実行する
- [ ] `deleteRemoteBranch === false` の経路で「remote branch `<branch>` は保持した（PR がまだ open のため）。必要なら `git fetch origin <branch>` で復元できる」旨の 1 行を stdout に出力する
- [ ] module 冒頭の JSDoc を書き換え、「merge 後専用の後始末」ではなく「archive 完了後の共通 cleanup。remote branch 削除は呼び出し側が選択する」ことを明記する
- [ ] `src/core/archive/merge-completion.ts` の import と呼び出しを新シンボルに追従させる（`deleteRemoteBranch` は指定しない＝`true` のまま）
- [ ] `src/core/archive/merge-then-archive.ts` / `src/core/archive/orchestrator.ts` を含む全参照元の import path・シンボル名を更新する
- [ ] `tests/unit/core/archive/post-merge-cleanup.test.ts` を `tests/unit/core/archive/archive-cleanup.test.ts` にリネームし、import path とシンボル名のみ差し替える（既存アサーションは変更しない）
- [ ] 新規テストを 3 本追加する:
  (a) `deleteRemoteBranch: false` で `git push origin --delete` が 1 度も spawn されないこと
  (b) `deleteRemoteBranch: false` でも `git branch -D <branch>` は spawn されること
  (c) `deleteRemoteBranch` 未指定時の spawn 列が改名前と完全一致すること

**Acceptance Criteria**:
- `src/core/archive/post-merge-cleanup.ts` が存在しない
- `grep -rn "runPostMergeCleanup\|PostMergeCleanupInput" src tests` の結果が空
- `deleteRemoteBranch: false` を渡した呼び出しで `push origin --delete` が発行されない
- `deleteRemoteBranch` 未指定（既定 `true`）の呼び出しで発行される git コマンド列が変更前と同一
- `bun run typecheck` と archive 関連のユニットテストが green

## T-02: orchestrator の push 段にべき等 guard を入れる（D5 Path A）

- [ ] `runArchiveOrchestrator` の Phase 1 で `archiveChangeFolder` と `commitArchive` の戻り値 `skipped` をローカル変数に捕捉する
- [ ] `recordedSomething = !mvSkipped || !commitSkipped` を算出する
- [ ] `recordedSomething === false`（＝今回の run で新たに記録した内容が無い）のときのみ、push 前に `git ls-remote --heads origin <branch>` を実行する。stdout が空なら push 自体を skip し、「remote branch `<branch>` は既に存在しないため push を skip した」旨を warning として出力して処理を継続する
- [ ] `recordedSomething === false` で push を実行した結果が失敗した場合は、escalation ではなく warning に格下げして処理を継続する
- [ ] `recordedSomething === true` のときは push を必須のままとし、失敗時は既存の `Phase 1 (git push origin <feature-branch>)` escalation を維持する
- [ ] `git ls-remote` が非 0 終了した場合は fail-open とし、push を通常どおり試行する（判定不能を理由に archive を止めない）
- [ ] push を skip した場合でも `git rev-parse HEAD` による `headSha` の取得は従来どおり行う
- [ ] module 冒頭の JSDoc と push 段のインラインコメントを、この分岐を説明する内容に更新する
- [ ] 新規テストを追加する:
  (a) mv/commit 双方 skipped かつ `ls-remote` 空 → push が spawn されず exit 0
  (b) mv/commit 双方 skipped かつ `ls-remote` が branch を返す → push が spawn され exit 0
  (c) mv/commit 双方 skipped かつ push 失敗 → escalation されず exit 0（warning のみ）
  (d) 新規記録あり かつ push 失敗 → 従来どおり escalation
  (e) `ls-remote` 失敗 → push が試行される

**Acceptance Criteria**:
- 上記 (a)〜(e) の 5 挙動がテストで固定されている
- 新規記録がある通常経路の git コマンド列と exit code が変更前と同一
- `tests/unit/no-worktree-archive.test.ts` がアサーション変更なしで green
- `bun run typecheck` が green

## T-03: `runPlainArchive` を単相契約に書き換える（D1/D2/D4/D5/D6）

- [ ] `PlainArchiveInput` から `githubClient` / `owner` / `repo` を削除する。`githubToken`（git transport 認証用）と `designLayer` は残す
- [ ] `GitHubClient` 型 import と `./merge-completion.js` からの import を削除する
- [ ] 現行の merge-state 検出ブロック（`getPullRequest` 呼び出し、`prData.state` 判定、`MERGED + archiveRecorded → completeAfterMerge`、`MERGED + !archiveRecorded → mergedBeforeRecordEscalation`）を丸ごと削除する
- [ ] 処理順を「context 解決 → terminal short-circuit → Path 判定 → Path A または Path B」に再構成する
- [ ] terminal short-circuit（`archived` / `canceled`）は現行の `Already finished (${state.status}).` メッセージと exit 0 を維持する
- [ ] Path B（degraded）の判定条件を実装する: `archiveRecorded === true` かつ
  （（`noWorktree === false` かつ（`worktreePath === null` または `fs.exists(worktreePath)` が false））
  または（`noWorktree === true` かつ（`branch === null` または `git rev-parse --verify --quiet refs/heads/<branch>` が非 0）））
- [ ] Path A（記録経路）: `runArchiveOrchestrator` → 成功時に `markJobArchived(slug, recordDir)` → `runArchiveCleanup({ ..., deleteRemoteBranch: false })` → exit 0
- [ ] Path B（縮退経路）: orchestrator を呼ばず、`assertJobFinishable(state)` → `markJobArchived(slug, cwd)` を best-effort（throw は warning に握り潰す）→ `runArchiveCleanup({ ..., deleteRemoteBranch: false })` → exit 0
- [ ] `prNumber !== undefined` で `awaiting-archive` に留める分岐を削除する。PR の有無で経路を分岐させない
- [ ] Path A の `markJobArchived` が throw した場合は exit 1 の escalation とし、`failedStep: "plain archive (markJobArchived)"` を設定し、cleanup を実行しない
- [ ] orchestrator が escalation を返した場合（exit 1）はそのまま返し、transition も cleanup も行わない
- [ ] 成功時の stdout メッセージを新設する。branch 名、PR 番号（記録がある場合）、「次は GitHub で PR を merge すること」、「PR が既に merge / close 済みの場合この archive commit は base branch に届かない」旨の警告を含める。PR state を読まないため、この案内は無条件に出力する
- [ ] 成功時の stdout に「再度 `job archive` を実行せよ」「`awaiting-archive` のまま残る」に相当する文言を一切含めない
- [ ] module 冒頭の JSDoc を単相契約の説明に全面的に書き換える

**Acceptance Criteria**:
- `grep -n "GitHubClient\|merge-completion" src/core/archive/plain-archive.ts` の結果が空
- plain archive の実行経路で GitHub PR API（`getPullRequest` / `getCheckStatus` / `mergePullRequest` / `listPullRequestFiles`）が一切呼ばれない
- PR 番号あり・PR OPEN の `awaiting-archive` job が 1 回の実行で `archived` + cleanup まで到達し exit 0
- PR 番号なしの job も同一経路で `archived` + cleanup に到達する
- push 失敗時は exit 1 の escalation となり、status は `awaiting-archive` のまま、cleanup も実行されない
- `markJobArchived` 失敗時（Path A）は exit 1 の escalation となり cleanup が実行されない
- Path B が `archiveRecorded === true` かつ record working tree 不能時のみ選ばれ、exit 0 で終わる
- `archiveRecorded === false` かつ worktree 欠損時は Path B に落ちず escalation する
- cleanup 呼び出しが常に `deleteRemoteBranch: false` を伴う
- 成功時 stdout に再実行案内および `remains in awaiting-archive` 相当の文言が含まれない

## T-04: CLI の plain archive 分岐から GitHub client 構築を除去する（D1）

- [ ] `src/cli/archive.ts` の非 `--with-merge` 分岐から `getOriginInfo` / `createGitHubClient` の呼び出しと、そこから導出していた `plainGithubClient` / `plainOwner` / `plainRepo` を削除する
- [ ] `runPlainArchive` への引数から `githubClient` / `owner` / `repo` を外す。`githubToken` と `designLayer` は維持する
- [ ] 削除により未使用となった import / 変数を除去する
- [ ] `--with-merge` 分岐の処理と引数は一切変更しない

**Acceptance Criteria**:
- `bun run typecheck` が green
- `src/cli/archive.ts` の plain 分岐に `createGitHubClient` / `getOriginInfo` の呼び出しが存在しない
- `--with-merge` 分岐が `runMergeThenArchive` に渡す引数が変更前と同一
- CLI の archive 関連テストが green

## T-05: `merge-completion.ts` を `--with-merge` 専用として明示する（D7）

- [ ] `src/core/archive/merge-completion.ts` の module JSDoc に「本 module は `job archive --with-merge` 専用であり、plain archive からは使用しない」旨を明記する
- [ ] `completeAfterMerge` / `mergedBeforeRecordEscalation` の各 JSDoc に、呼び出し元が `merge-then-archive.ts` に限定される前提を書き加える
- [ ] `merge-then-archive.ts` 側の呼び出し箇所は変更しない（挙動は現状維持）

**Acceptance Criteria**:
- `merge-completion.ts` を import しているのが `merge-then-archive.ts` のみ
- `--with-merge` 関連テストがアサーション変更なしで green

## T-06: `job ls` の次アクションを操作順 archive → merge に合わせる（D8-2）

- [ ] `src/core/job-list/operations-view.ts` の `deriveNextAction` の `case "awaiting-archive"` を、`prMerged` の値に依らず `job archive ${slug}` を返すよう変更する
- [ ] 同関数の JSDoc にある status → next action 対応表を更新する
- [ ] `buildStatusCell` の `"awaiting-archive (PR merged)"` 表示は変更しない（表示上の事実であり、次アクション判定とは独立）
- [ ] `tests/unit/core/job-list/operations-view.test.ts` の該当ケースを更新する。`prMerged: false` / `prMerged: null` で `null` を期待していたケースを `job archive <slug>` 期待に変更し、`prMerged: true` のケースは既存の期待値のまま残す

**Acceptance Criteria**:
- `awaiting-archive` かつ `prMerged: false` の row の次アクションが `job archive <slug>`
- `awaiting-archive` かつ `prMerged: null` の row の次アクションが `job archive <slug>`
- `awaiting-archive` かつ `prMerged: true` の row の次アクションが従来どおり `job archive <slug>`
- `operations-view.test.ts` が green

## T-07: workflow_dispatch の archive 案内から 2 相記述を除去する（D8-1）

- [ ] `.github/workflows/specrunner-dispatch.yml` の `- archive:` コメントブロックを書き換え、「2 相の実行を前提とする」「1 回目（merge 前）」「2 回目（merge 後・head branch 削除済み）」「completeAfterMerge」「相の判定」に相当する記述をすべて削除する
- [ ] 代わりに「archive は 1 回の実行で完結する（folder 移動 + commit/push + `archived` 遷移 + local cleanup）」「PR の merge は archive 後に人間が GitHub 上で行う独立の操作」「`archived` は PR が merge 済みであることを意味しない」を記述する
- [ ] `action` input の description から 2 相・再実行を示唆する語を除去し、単発実行として記述する
- [ ] `elif [ "$ACTION" = "archive" ]` 以下の実行コマンドは byte 単位で変更しない

**Acceptance Criteria**:
- `grep -n "2 相\|2相\|再実行\|completeAfterMerge\|1 回目\|2 回目" .github/workflows/specrunner-dispatch.yml` の結果が空
- archive 実行分岐の CLI 呼び出しが変更前と同一
- YAML が構文的に妥当（`yq` 等でのパースが成功する）

## T-08: plain archive のテストを新契約に置き換える

- [ ] `src/core/archive/__tests__/plain-archive.test.ts` の mock 対象を `../post-merge-cleanup.js` / `runPostMergeCleanup` から `../cleanup.js` / `runArchiveCleanup` に差し替える
- [ ] 2 相契約を固定していたテスト（TC-011 / TC-013 / TC-014 / TC-015 / TC-016 / TC-017 / TC-019 / TC-020 / TC-021 / TC-024 / TC-026 相当）を削除する
- [ ] GitHub API 非呼び出しを検証する既存ケース（TC-018 / TC-025 相当）は残し、「plain archive の全経路で PR API が 0 回呼ばれる」ことを検証する形に強化する
- [ ] terminal short-circuit のケース（TC-023 / TC-040 相当）は維持する
- [ ] spec.md の各 Scenario と 1:1 対応する新規テストを追加する:
  (a) PR OPEN の `awaiting-archive` job が 1 回で `archived` + cleanup + exit 0
  (b) 成功時 stdout に再実行案内・`remains in awaiting-archive` 相当が含まれない
  (c) `archived` 済み job の再実行が short-circuit して exit 0
  (d) 全経路で PR API 呼び出しが 0 回
  (e) cleanup が `deleteRemoteBranch: false` で呼ばれる
  (f) push 失敗 → exit 1・未遷移・cleanup 未実行
  (g) transition 失敗 → exit 1・cleanup 未実行
  (h) 記録済み + remote branch 消失 → 新規 commit なし・push skip の warning・`archived` + cleanup・exit 0
  (i) 記録済み + remote branch 存在 → 再 push・`archived` + cleanup
  (j) 記録済み + worktree 欠損 → Path B で exit 0
  (k) 未記録 + worktree 欠損 → escalation exit 1・未遷移
- [ ] PR 番号なし job に対する既存ケース（cleanup が呼ばれないことを固定していた TC-022 相当）を、cleanup が呼ばれることを期待する形に反転する
- [ ] ファイル冒頭の TC 一覧コメントを実際のテスト構成に合わせて更新する
- [ ] `--with-merge` 系テスト（`merge-then-archive` 関連 / `achieved-assurance-*` / `merge-then-archive-floor*`）は mock path とシンボル名のみ追従させ、アサーションは変更しない
- [ ] `tests/unit/no-worktree-archive.test.ts` の 2 相を前提とするコメントを更新する

**Acceptance Criteria**:
- `src/core/archive/__tests__/plain-archive.test.ts` に 2 相契約（再実行前提・`awaiting-archive` 据え置き）を期待するアサーションが 1 つも残っていない
- spec.md の全 Scenario に対応するテストが存在する
- archive 関連の全ユニットテストが green

## T-09: 全体検証

- [ ] `bun run build` / `bun run typecheck` / `bun run test` をすべて実行し green を確認する
- [ ] architecture 検証テスト（DSM / layer 依存テスト）が green であることを確認する
- [ ] `grep -rn "runPostMergeCleanup\|post-merge-cleanup" src tests .github` の結果が空であることを確認する
- [ ] `grep -rn "2 相\|再実行" .github/workflows/specrunner-dispatch.yml` の結果が空であることを確認する
- [ ] plain archive 経路に GitHub PR API 呼び出しが残っていないことを `grep -rn "getPullRequest\|mergePullRequest" src/core/archive/plain-archive.ts src/cli/archive.ts` で確認する（`--with-merge` 分岐の該当行のみ許容）
- [ ] 本 tasks.md のチェックボックスを実施済み状態に更新する

**Acceptance Criteria**:
- build / typecheck / test / architecture テストがすべて green
- 上記 grep 群がいずれも期待どおりの結果
- tasks.md の全チェックボックスが完了状態
