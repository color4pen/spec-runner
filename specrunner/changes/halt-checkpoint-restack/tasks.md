# Tasks: halt checkpoint を未 push 作業 commit から分離して publish する

## T-01: `checkpoint-restack` journal record 型と store 追記経路を追加する

- [ ] `src/store/event-journal.ts` に `CheckpointRestackRecord` interface を追加する
      （`type: "checkpoint-restack"` / `ts: string` / `slug: string` / `branch: string` /
      `parentOid: string` / `localTipOid: string` / `unpublishedCommits: string[]` / `reason: string`）
- [ ] `EventRecord` union に `CheckpointRestackRecord` を追加する
- [ ] `FoldResult` に optional field（例: `checkpointRestacks?: CheckpointRestackRecord[]`）を追加し、
      `fold()` の dispatch に `checkpoint-restack` 分岐を足して chronological に収集する。
      optional にすることで既存の `FoldResult` literal（`src/store/job-state-projection.ts:65`,
      `src/store/job-journal.ts:134`）を変更せずに済ませる
- [ ] `checkpoint-restack` は `historyCount` / `stepCounts` / `steps` / `history` に一切寄与しないこと
      （lineage / operator-event / finding-recency と同じ journal-only 扱い）
- [ ] `JobJournal.appendCheckpointRestack(record)` を追加（`_appendRecord` へ委譲、state.json は更新しない）
- [ ] `JobStateStore.appendCheckpointRestack(record)` を追加（`appendLineage` / `appendOperatorEvent` と同形）

**Acceptance Criteria**:
- `fold()` が `checkpoint-restack` を含む events.jsonl を corruption なく処理し、record を収集する
- `checkpoint-restack` を 1 行追記しても `fold()` の `historyCount` / `stepCounts` が変化しない
- `store.appendCheckpointRestack()` が events.jsonl へ 1 行 append し、state.json を書き換えない
- `bun run typecheck` が green（既存 `FoldResult` literal の変更が不要であること）

## T-02: restack module（remote tip 解決 → tree 構築 → 封じ込め検査 → push）を実装する

- [ ] 新規 `src/core/step/checkpoint-restack.ts` を作成する。store には依存せず、
      副作用は callback（`recordRestack` / `persistCommit`）で受ける（design D7）
- [ ] 公開関数 `restackCheckpointOntoPublishedTip(params)` を実装する。params:
      `cwd` / `branch` / `slug` / `spawnFn: PipelineSpawnFn` / `messageLabel` /
      `pushFailureStderr` / `recordRestack?` / `persistCommit?`
- [ ] 戻り値は判別可能 union `RestackOutcome`:
      `{ kind: "skipped"; reason: "no-branch" | "no-remote-tip" | "no-local-tip" | "no-delta" | "tree-build-failed" | "containment-violation" }`
      / `{ kind: "published"; restackedOid; parentOid; graft: "merged" | "skipped" | "failed" }`
      / `{ kind: "push-failed"; restackedOid; parentOid; stderr }`
- [ ] `branch` パラメータが空文字列の場合は fetch を試みず即座に `skipped: no-branch` を返す
      （`no-branch` の唯一のトリガー条件）
- [ ] 手順 1（remote tip 解決, design D8）: `git fetch origin <branch>`（失敗は無視）→
      `git rev-parse refs/remotes/origin/<branch>^{commit}`。exitCode≠0 または stdout が空文字なら
      `skipped: no-remote-tip` を返す（**この早期 skip により既存 failure-path unit test が
      無変更で green のままになる**）
- [ ] 手順 2: `git rev-parse HEAD` で local tip を取得（失敗 → `skipped: no-local-tip`）。
      `git rev-list <parentOid>..<localTip>` で未 publish commit OID 列を取得（失敗時は空配列）
- [ ] 手順 3（journal, design D5）: `recordRestack` を **tree 構築より前**に呼ぶ。
      `reason` は `pushFailureStderr` を `maskSensitive`（`src/logger/stdout.js`）で伏字化し
      先頭 500 文字程度に truncate する。callback の throw は catch して warn し、処理を続行する
- [ ] 手順 4（tree 構築, design D3）: temp index path を
      `<cwd>/.specrunner/local/<slug>/restack-index-<timestamp>`（`localSidecarDir(slug)` を使用、
      親ディレクトリを `fs.mkdir(recursive)`）とし、以降の git 呼び出しへ
      `{ cwd, env: { GIT_INDEX_FILE: <temp index path> } }` を渡す:
      - `git read-tree <parentOid>`
      - `git ls-tree -r <parentOid> -- <changeDir>/` と `git ls-tree -r <localTip> -- <changeDir>/` を取得し
        （`<changeDir>` = `changeFolderPath(slug)`）、parent 側のみに存在するパスへ
        `git update-index --force-remove -- <path>`、local 側の各 entry へ
        `git update-index --add --cacheinfo <mode>,<oid>,<path>`
      - worktree の events.jsonl（`slugEventsPath(slug)`）が存在すれば `git hash-object -w -- <path>` し、
        `git update-index --add --cacheinfo 100644,<blob>,<eventsPath>` で上書きする
        （手順 3 で追記した record を publish 対象に含めるため）
      - `git write-tree` → tree OID
      - いずれかの git 呼び出しが失敗したら warn して `skipped: tree-build-failed`
- [ ] 手順 5: `git rev-parse <parentOid>^{tree}` と一致するなら `skipped: no-delta`（push しない）
- [ ] 手順 6: `git commit-tree <tree> -p <parentOid> -m "<messageLabel>: <slug> (restacked onto origin/<branch>)"`
- [ ] 手順 7（封じ込め検査, design D4）: `git diff --name-only <parentOid> <restackedOid>` を実行し、
      失敗または `<changeDir>/` 配下以外のパスが 1 件でもあれば push せず
      `skipped: containment-violation`（warn 付き）
- [ ] 手順 8: `persistCommit?.(restackedOid)` を push 前に呼ぶ（throw は catch して warn、push は続行）
- [ ] 手順 9: `git push origin <restackedOid>:refs/heads/<branch>` を最大 2 回。両方失敗なら
      warn（git stderr 付き）して `push-failed`
- [ ] 手順 10: push 成功時に `git update-ref refs/remotes/origin/<branch> <restackedOid>` を
      best-effort で実行し、remote-tracking ref を確定させる
- [ ] temp index file は成功・失敗いずれの経路でも best-effort で削除する（`finally`）
- [ ] module 内のすべての例外を握り潰し、この関数は決して throw しない

**Acceptance Criteria**:
- remote tip が解決できない（rev-parse が空 stdout）とき、push / journal 追記 / ledger 追記が
  1 度も発生せず `skipped: no-remote-tip` を返す
- tree 構築が `git read-tree` → `ls-tree`×2 → `update-index`（必要数）→ `hash-object` →
  `write-tree` の順で temp index（`GIT_INDEX_FILE` env）に対して行われ、
  worktree・index・HEAD を変更する git 呼び出し（`add` / `commit` / `checkout` / `reset` / `stash`）を
  一切発行しない
- 封じ込め検査で change folder 外パスが見つかった場合、`git push` が呼ばれない
- push が 2 回失敗しても関数は throw せず `push-failed` を返し、stderr に git stderr を含む警告が出る
- `recordRestack` の throw、`persistCommit` の throw のいずれでも処理が継続する

## T-03: publish 済み commit へのローカル branch 再接続（graft）を実装する

- [ ] T-02 の push 成功経路の後段として、`src/core/step/checkpoint-restack.ts` 内に graft 手続きを実装する
- [ ] `git symbolic-ref -q HEAD` が `refs/heads/<branch>` でなければ graft せず `graft: "skipped"`
- [ ] `git rev-parse HEAD` / `git rev-parse HEAD^{tree}` を取得し、
      `git commit-tree <headTree> -p <localHead> -p <restackedOid> -m "merge: publish restacked checkpoint for <slug>"`
      で merge commit を作る（tree は local HEAD と同一 = `-s ours` 相当。design D6）
- [ ] `persistCommit?.(mergeOid)` を呼んで `synthesizedCommits` 台帳へ追記する（throw は catch して warn）
- [ ] `git update-ref refs/heads/<branch> <mergeOid> <localHead>`（old value 指定の compare-and-swap）で
      branch を進める。失敗時は warn して `graft: "failed"`（publish 済みの結果は維持）
- [ ] worktree / index を触る git 呼び出しは行わない（`update-ref` と `commit-tree` のみ）

**Acceptance Criteria**:
- graft 後、`git merge-base --is-ancestor <restackedOid> refs/heads/<branch>` が真になる
- graft 後の branch tip の tree が graft 前の HEAD の tree と一致し、未 push 作業 commit が
  引き続き branch から到達可能である
- detached HEAD では branch ref が変化せず `graft: "skipped"` になる
- graft の各 git 失敗は warn のみで throw しない

## T-04: `commitFinalState` の push 二重失敗後段に restack を接続する

- [ ] `src/core/step/commit-push.ts` の `commitFinalState` に optional params
      `recordRestack?` / `restackEnabled` 相当の callback を追加する（`persistBeforePush` は
      restack の `persistCommit` としても再利用する）
- [ ] 既存の push 失敗 warn（`Warning: failed to push ${messageLabel} commit ...`）を**先に**出力し、
      その直後に `restackCheckpointOntoPublishedTip` を呼ぶ（design D1）
- [ ] 早期 return 分岐（staged 0 件 / staged 差分なし / commit 失敗 / egress 検査失敗）からは
      restack を呼ばない
- [ ] `RestackOutcome` に応じた追加の stderr メッセージを出す
      （published: 親 OID・restack OID・未 publish commit 件数を含む。
      push-failed / skipped: 理由を含む）。既存 warn の文言は変更しない
- [ ] `commitFinalState` は従来どおり `Promise<void>` を返し、いかなる場合も throw しない

**Acceptance Criteria**:
- push が 1 回目で成功する経路の git 呼び出し列が変更前と完全に一致する
  （`src/core/step/__tests__/commit-push-egress-invariant.test.ts` の TC-003 が無変更で green）
- push 二重失敗の既存テスト（TC-004 / TC-011）が無変更で green
  （restack は `no-remote-tip` で skip し、`persistBeforePush` の呼び出し回数も 1 回のまま）
- push 二重失敗時、既存 warn の後に restack 結果メッセージが 1 件出力される

## T-05: `LocalRuntime.commitFinalState` から journal / ledger callback を注入する

- [ ] `src/core/runtime/local.ts:752` の `commitFinalState` で、`slugStoreOpts()` が解決できる場合に
      `recordRestack` callback を組み立てる（`new JobStateStore(state.jobId, this.cwd, slugOpts)` の
      `appendCheckpointRestack` を呼ぶ。`slug` / `branch` は既存変数から埋める）
- [ ] `persistBeforePush`（既存: `updateJobState` + in-memory `synthesizedCommits` 追記）を
      restack の `persistCommit` としても渡す
- [ ] `slugStoreOpts()` が undefined の場合は callback を渡さない（restack 自体は callback なしで動く）
- [ ] `ManagedRuntime.commitFinalState`（no-op）は変更しない

**Acceptance Criteria**:
- restack が発生した場合、events.jsonl（worktree 内 = `stateRoot/specrunner/changes/<slug>/events.jsonl`）に
  `checkpoint-restack` record が 1 行追記される
- restack commit OID と graft merge OID が state.json の `synthesizedCommits` に含まれる
- `bun run typecheck` が green

## T-06: restack module の unit テストを追加する

- [ ] `src/core/step/__tests__/checkpoint-restack.test.ts` を新設し、既存の
      `makePipelineSpawnFnFromSequence` 相当の fake `spawnFn`（引数列を記録）で分岐を固定する
- [ ] remote tip 解決不可（rev-parse が空 stdout）→ push / recordRestack / persistCommit いずれも未呼び出し
- [ ] 正常系 → `git push origin <oid>:refs/heads/<branch>` の引数と、
      recordRestack が tree 構築（`read-tree` / `ls-tree`）より**前**に呼ばれる順序を assert する
- [ ] 封じ込め検査違反（`git diff --name-only` が `src/foo.ts` を返す）→ push 未発行
- [ ] `write-tree` が `<parent>^{tree}` と同値 → push 未発行（`no-delta`）
- [ ] push 2 回失敗 → throw せず `push-failed`、stderr に git stderr を含む
- [ ] `recordRestack` / `persistCommit` が reject しても throw せず後続が進む
- [ ] detached HEAD（`symbolic-ref` 失敗）→ `update-ref refs/heads/...` が発行されない
- [ ] worktree/index を変更する git subcommand（`add` / `commit` / `checkout` / `reset` / `stash` /
      `merge`）が 1 度も発行されないことを、記録した引数列に対する invariant assertion で固定する

**Acceptance Criteria**:
- 上記すべてのケースが vitest で green
- fake `spawnFn` の記録から、`GIT_INDEX_FILE` env を伴う呼び出しが tree 構築系のみであることを検証する

## T-07: 実 git（bare remote + pre-receive 拒否）による e2e テストを追加する

- [ ] `tests/halt-checkpoint-restack-e2e.test.ts` を新設する。
      `tests/bootstrap-egress-ledger-e2e.test.ts` の `gitSync` / `createGitRepo` /
      `createBareRemote` パターンを踏襲する
- [ ] fixture: bare remote に `pre-receive` hook（`chmod 0755`）を置き、push range に
      `.github/workflows/` を触る commit が含まれる場合に exit 1 で拒否する
- [ ] fixture: repo に `specrunner/changes/<slug>/`（request.md / design.md / spec.md / tasks.md /
      test-cases.md / state.json / events.jsonl）を作り、`attachResumePolicy` が要求する resume step の
      `reads()` 入力が揃った状態を publish 済み tip として push する。
      state.json は `status: "awaiting-resume"`・`_journal` counters・repository / jobId / branch / slug が
      整合する内容にする（`verifyCheckpoint` が通る最小構成）
- [ ] fixture: 拒否対象の作業 commit（`.github/workflows/ci.yml` + `src/`）をローカルに積み、
      その上で `commitFinalState`（実 git spawnFn）を呼ぶ
- [ ] TC（受け入れ条件 1）: `origin/<branch>` tip が restack commit になり、
      その親が restack 前の `origin/<branch>` tip と一致し、
      `git rev-list origin/<branch>` に作業 commit OID が含まれないことを assert する
- [ ] TC（受け入れ条件 1 補）: `git diff --name-only <parent> origin/<branch>` が
      `specrunner/changes/<slug>/` 配下のみであることを assert する
- [ ] TC（受け入れ条件 2）: bare remote を別 clone（local state 無し）して
      `runAttachVerification({ policy: attachQuiescentPolicy })` が成功し、
      `checkpointOid` が restack commit と一致し、`state.status === "awaiting-resume"`、
      resume step が halt した step に解決されることを assert する
- [ ] TC（journal）: `git show origin/<branch>:specrunner/changes/<slug>/events.jsonl` に
      `checkpoint-restack` record が含まれ、`parentOid` / `unpublishedCommits` が
      実際の OID と一致することを assert する
- [ ] TC（graft）: restack 成功後に `git merge-base --is-ancestor <restackedOid> HEAD` が真で、
      作業 commit がローカル branch から到達可能であることを assert する（TC-023）
- [ ] TC（synthesizedCommits / TC-027）: state.json の `synthesizedCommits` 配列に
      restack commit OID と graft merge commit OID の両方が含まれることを assert する
- [ ] TC（受け入れ条件 3）: pre-receive がすべての push を拒否する fixture で、
      `commitFinalState` が throw せず（`resolves`）、ローカル branch tip が元の checkpoint commit の
      ままであることを assert する
- [ ] hook を使えない CI 環境向けに、hook 生成失敗時は `it.skip` ではなく
      「push を拒否する spawnFn wrapper」で同等シナリオを構成できるようにする（どちらか一方で必ず検証する）

**Acceptance Criteria**:
- 上記 TC がすべて green
- テストが一時ディレクトリのみを使い、リポジトリ本体の git 状態を変更しない

## T-08: 通常経路の非回帰と全体検証

- [ ] `src/core/step/__tests__/commit-push-egress-invariant.test.ts` を変更せずに全件 green であることを確認する
- [ ] `tests/attach/*` / `src/core/attach/__tests__/*` / `src/store/**` の既存テストが green であることを確認する
- [ ] `bun run typecheck && bun run test` を実行して green を確認する
- [ ] 新規 public 関数・record 型に JSDoc（設計判断 D 番号への参照を含む）を付ける

**Acceptance Criteria**:
- `bun run typecheck` と `bun run test` がいずれも green
- 既存テストファイルへの変更が 0 件（新規テストファイルの追加のみ）
