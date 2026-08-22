# Tasks: dispatch archive action と PR head 経由の archive 経路

実装順は T-01 → T-02 → T-03 → T-04 → T-05 → テスト群（T-06..T-09）→ T-10。
T-05 と T-08 は design.md の Open Question 1（D4 の採否）の裁定を前提とする。

## T-01: dispatch workflow に archive action を足す（D1）

- [ ] `.github/workflows/specrunner-dispatch.yml` の `action` input の `options` に `- archive` を追加する
- [ ] `action` の `description` に archive の説明を足す（例: "archive: merge 済み PR の job を取り込む"）
- [ ] ファイル冒頭のコメントブロック（`- start:` / `- resume:` の説明）に `- archive:` の項を追加する
- [ ] "Run pipeline" step の shell 分岐に archive の枝を追加する。既存の `if [ "$ACTION" = "resume" ]` の後に `elif [ "$ACTION" = "archive" ]; then bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` を置き、`else` は `job start` のまま残す
- [ ] archive の枝では `--with-merge` / `--from` / `--prompt` / `--force` を渡さない

**Acceptance Criteria**:
- `action` の choice が `start` / `resume` / `archive` の 3 つになっている
- archive 選択時に実行されるコマンドが `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` の 1 行のみである
- `elif` を欠いて `archive` が `else`（= `job start`）へ落ちる状態になっていない
- `resume` / `start` の分岐は diff 上で無改変である

## T-02: locator に refs/pull/<n>/head fallback を足す（D2）

- [ ] `src/core/issue-target/archive.ts` の候補 loop で、`git fetch origin <headRefName>` が非 0 のときに即 `continue` せず、`git fetch origin refs/pull/<prNumber>/head` を試す
- [ ] head branch 経路が成功した場合の OID 解決は現行どおり `git rev-parse origin/<branch>^{commit}`、fallback 経路は `git rev-parse FETCH_HEAD^{commit}` とする
- [ ] fallback の fetch または rev-parse が失敗した場合は、どちらの失敗かが分かる `logWarn` を出して `continue`（現行と同じ skip 挙動）
- [ ] OID 確定後の処理（`readStateJsonFromRef` → JSON parse → 4 点 identity → `confirmed.push`）は 2 経路で共通の 1 本にする。identity の項目・比較対象は変更しない
- [ ] `FETCH_HEAD` を使う設計上の天井（loop を並列化すると別 PR の OID を掴みうる。並列化するなら専用 refspec へ切り替える）をコード内コメントで明示する

**Acceptance Criteria**:
- head branch fetch 成功時は `refs/pull/<n>/head` の fetch が呼ばれない
- head branch fetch 失敗 + pull ref fetch 成功時に、`FETCH_HEAD^{commit}` の OID で identity 検証が走る
- 両方失敗した PR は warning 付きで skip され、確定候補が 0 なら `ARCHIVE_FROM_ISSUE_UNCONFIRMED` になる
- 4 点 identity のフィールド・比較対象が diff 上で変わっていない

## T-03: runAttachVerification に任意入力 checkpointOid を足す（D3）

- [ ] `src/core/attach/orchestrator.ts` の `AttachVerificationInput` に `checkpointOid?: string` を追加する
- [ ] `checkpointOid` 指定時は `git fetch origin <branch>` と `git rev-parse origin/<branch>^{commit}` を両方 skip し、その OID で `readCheckpointFromRef` → `verifyCheckpoint` を実行する
- [ ] 未指定時のコードパス（fetch → rev-parse → 読み込み → 検証、失敗時 `ATTACH_FETCH_FAILED`）は無改変で残す
- [ ] 返り値の `branch` は引数の branch 名をそのまま返し、`checkpointOid` は検証に使った OID を返す
- [ ] 「呼び出し側が identity 検証済みの OID を渡す前提」であることを JSDoc に明記する

**Acceptance Criteria**:
- `checkpointOid` を渡すと git の fetch / rev-parse が 1 度も呼ばれない
- `checkpointOid` を渡さない呼び出しは既存テスト（`tests/attach/orchestrator.test.ts` 等）が無改変で緑
- `job resume --from-issue` / `job attach --branch` の呼び出し側に `checkpointOid` が渡っていない

## T-04: archive-from-issue で検証済み OID を持ち回す（D3 wiring）

- [ ] `src/cli/archive-from-issue.ts` の `runAttachVerification` 呼び出しに `checkpointOid: resolved.checkpointOid` を追加する
- [ ] head branch 経路 / fallback 経路のどちらでも渡す（分岐させない）
- [ ] `setupWorkspace` に渡す `attachCheckpoint.checkpointRef` は従来どおり `verified.checkpointOid` を使う

**Acceptance Criteria**:
- locator が確定した OID と `setupWorkspace` が materialize する OID が同一である
- head branch 削除済みシナリオで `ATTACH_FETCH_FAILED` が発生しない
- `src/cli/__tests__/archive-from-issue.test.ts` の既存アサーション（`expect.objectContaining` ベース）が緑のまま

## T-05: merge 後の slug 解決を base branch の archive record から行う（D4）

> design.md の Open Question 1 の裁定が (A) の場合に実施する。(B)/(C) の裁定なら本タスクを差し替える。

- [ ] `src/cli/archive-from-issue.ts` で `loadStateByJobId` が `JOB_NOT_FOUND` を返した直後に、`JobStateStore.listWithSourceDirs(repoRoot, { includeArchived: true })` を引く解決を追加する
- [ ] `state.jobId === jobId` かつ `state.issueNumber === issueNumber` の entry のみを候補にする
- [ ] 候補の `sourceChangeDir` が `specrunner/changes/archive/` 配下であることを必須にする（merge 済み record であることの確認）
- [ ] 候補が 1 件なら slug を採用し、locator（`resolveArchiveBranchFromIssue`）と attach 検証・`setupWorkspace` を skip して `runArchive({slug})` へ直行する
- [ ] 候補が 0 件なら従来どおり locator 経路へ落ちる
- [ ] 候補が 2 件以上なら確定させず `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を投げる
- [ ] `src/core/job-access/load-by-job-id.ts` は変更しない（`resume --from-issue` の解決規則を動かさないため）
- [ ] この経路が 4 点 identity ではなく「jobId + issueNumber + archive 配下 + 後段の PR MERGED 再確認」で成立していることを、根拠を含めてコード内コメントに残す

**Acceptance Criteria**:
- local state 無し + merge 済み archive record ありの checkout で slug が解決される
- 解決後の `runArchive` が `archiveRecorded = true` を得て `completeAfterMerge` に到達する
- active な change folder がある通常環境では従来の local short-circuit が先に成立し、本経路が走らない
- jobId は一致するが issueNumber が異なる record は候補にならない
- `src/core/job-access/load-by-job-id.ts` の diff が空である

## T-06: dispatch workflow の不変条件テスト（AC1）

- [ ] `tests/` 直下に workflow 検証テストを追加する（例: `tests/dispatch-workflow-archive.test.ts`）
- [ ] YAML parser 依存を追加しない。`tests/grep-workflow-actions-pinned.test.ts` / `tests/dependabot-config.test.ts` と同様に、ファイル読み込み + ブロック抽出 + 文字列/正規表現で判定する
- [ ] `action` の `options` ブロックを抽出し、`start` / `resume` / `archive` を含むことを assert する
- [ ] "Run pipeline" step の run ブロックを抽出し、`archive` 分岐が `job archive --from-issue "$ISSUE"` を呼ぶこと、その分岐に `--with-merge` が現れないことを assert する
- [ ] `archive` が `else`（`job start`）へ落ちないこと（`archive` 用の条件分岐が存在すること）を assert する

**Acceptance Criteria**:
- 新規依存が `package.json` に追加されていない
- `options` から `archive` を消すとテストが落ちる
- archive 分岐に `--with-merge` を足すとテストが落ちる
- archive の `elif` を消すとテストが落ちる

## T-07: locator fallback の単体テスト（AC2 / AC3）

- [ ] `src/core/issue-target/__tests__/archive.test.ts` に fallback ケースを追加する（既存 TC の変更ではなく追加）
- [ ] ケース 1: head branch fetch 失敗 → `refs/pull/<n>/head` fetch 成功 → 4 点 identity 一致 → branch / slug / checkpointOid が返る
- [ ] ケース 2: head branch fetch 失敗 → pull ref fetch 成功 → identity 不一致 → skip → `ARCHIVE_FROM_ISSUE_UNCONFIRMED`
- [ ] ケース 3: head branch fetch 失敗 → pull ref fetch も失敗 → skip → `ARCHIVE_FROM_ISSUE_UNCONFIRMED`
- [ ] ケース 4: head branch fetch 成功時に pull ref fetch が呼ばれないことを spawn stub の呼び出し履歴で assert する
- [ ] spawn stub は既存の branch 名キー方式を踏襲し、`refs/pull/<n>/head` と `FETCH_HEAD` を扱えるよう拡張する

**Acceptance Criteria**:
- 上記 4 ケースが緑
- 既存の head branch 主経路テスト（TC-011 等）が無改変で緑
- fallback を実装から外すとケース 1〜3 が落ちる

## T-08: ephemeral な merge 後 archive の end-to-end テスト（AC4）

- [ ] `tests/attach/attach-resume-e2e.test.ts` の real-git fixture 方式（bare origin + clone）を踏襲した e2e を追加する
- [ ] fixture 条件: local state 無し（sidecar index 無し・active change folder 無し）、base branch checkout に merge 済み archive record（`specrunner/changes/archive/<date>-<slug>/state.json`, status `awaiting-archive`, `pullRequest.number` あり）、head branch は remote から削除済み、`refs/pull/<n>/head` 相当の ref は存在
- [ ] GitHub client は stub とし、closing PR 列挙・`getPullRequest` は `MERGED` を返す。issue の completed marker から jobId が解決される状態にする
- [ ] `job archive --from-issue <n>` の exit code が 0 であることを assert する
- [ ] `completeAfterMerge` に到達したこと（post-merge cleanup の stdout 行、および job status が `archived` になったこと）を assert する
- [ ] 新しい archive record commit が push されていないことを assert する
- [ ] `worktreePath` が現在のマシンに存在しない場合でも warning のみで exit 0 を維持することを assert する

**Acceptance Criteria**:
- local state 無しの環境で exit 0 かつ job status が `archived`
- record commit が増えていない
- cleanup の空振り warning が exit code に影響しない
- T-05 の実装を外すとこのテストが落ちる

## T-09: 既存契約の回帰確認

- [ ] `src/core/archive/__tests__/plain-archive.test.ts` の MERGED + record 済み → `completeAfterMerge` を固定するケースが無改変で緑であることを確認する
- [ ] `--with-merge` 経路のテストが無改変で緑であることを確認する
- [ ] `tests/attach/` 配下の attach / resume テストが無改変で緑であることを確認する
- [ ] 更新してよいのは「head branch のみを fetch する旧挙動を pin しているテスト」に限る。更新した場合は対象テストと更新理由を PR 説明に列挙する
- [ ] `src/git/checkpoint-ref.ts` の `EXCLUDED_CHANGE_DIRS` を変更していないことを確認する

**Acceptance Criteria**:
- 上記テスト群の diff が空、または旧 fetch 挙動 pin テストの更新のみ
- `src/git/checkpoint-ref.ts` の diff が空

## T-10: typecheck / test 全体緑

- [ ] `bun run typecheck` が通る
- [ ] `bun run test` が全て通る

**Acceptance Criteria**:
- typecheck / test が緑
- 新規依存が追加されていない
