# Design: awaiting-archive checkpoint の issue 起点取り込み

## Context

remote runner で完走した job は branch 上に awaiting-archive の checkpoint（state.json /
events.jsonl / change folder）と PR を残して環境ごと消える。ローカルに job state が無いため
`job archive <slug> --with-merge` は `merge-then-archive.ts` Step 1 の
`JobStateStore.listWithSourceDirs` で発見できず exit 2「No job found with slug」で弾かれる。
正規の取り込み経路が存在せず、operator は手動 merge + change folder 手動移動しかできず、
archive orchestrator の記録（archive-record commit / status 遷移 / post-merge cleanup）が欠落する。

既存資産で本 request が乗る土台は揃っている:

- `verifyCheckpoint`（verify-checkpoint.ts）は generic integrity 層（journal / counter / profile /
  request.md / identity）を status 非依存で持ち、use-case policy を**引数注入**できる
  （checkpoint-verification-policy-split が用意した注入点）。default は `attachResumePolicy`。
- `runAttachVerification`（attach/orchestrator.ts）が fetch → OID 解決 → read → verify を担い、
  `setupWorkspace(attachCheckpoint)`（local.ts）が checkpoint OID から worktree + local state を
  status 非依存で実体化する。
- issue 起点 resume（cli/resume-from-issue.ts + issue-target/resume.ts）が
  「marker → jobId → local short-circuit → branch 解決 → rebind → 実行」の型を確立済み。
- 完走通知（notify/issue-notifier.ts）は `kind="completed"` marker（jobId 埋め込み）+ PR URL +
  archive hint を issue コメントに投稿しており、機械可読契約は marker のみ。

実測（2026-08-21）: PR が branch から作成されると GraphQL `linkedBranches` は空になり、
`closedByPullRequestsReferences` が closing PR（number / headRefName）を返す。
awaiting-archive は必ず PR が存在するため、locator は closing PR references を使う。

本 request は「取り込みは archive の一形態」として、issue 起点 resume と対称な
`job archive --from-issue <n>` を実装し、rebind 後は既存 archive 実行に無改変で接続する。

## Goals / Non-Goals

**Goals**:

- awaiting-archive 用の CheckpointVerificationPolicy を追加し、既存 policy / generic 層を変更せず注入点で差し替える。
- `job attach --branch <branch>` を awaiting-resume / awaiting-archive の両受理にし、hint を status で出し分ける。
- `job archive --from-issue <n> [--with-merge]` を追加し、completed marker → jobId、closing PR references →
  branch（4 点照合）で取り込み対象を一意確定し、rebind 後に既存 archive 実行へ接続する。
- local state が既にある場合は rebind せず既存 archive へ直行する（local short-circuit）。
- issue 起点 resume の policy（awaiting-resume 限定）と locator（escalation marker + linkedBranches）を不変に保つ。

**Non-Goals**:

- managed runtime での attach / 取り込み（attach は従来どおり local runtime 限定）。
- `job archive` への `--detach` 追加（archive は従来どおり foreground 実行）。
- inbox / ラベルによる取り込みの自動発火。
- checkpoint 未公開のまま消えた remote job の救済（checkpoint publish の能力差は既存 ADR の設計どおり）。
- issue 起点 resume 側 locator の closing-PR 対応（resume 時点は PR 未作成で linkedBranches で解決できる）。
- archive orchestrator（merge-then-archive / orchestrator）本体のロジック変更。

## Decisions

### D1: awaiting-archive policy は新規 `attachArchivePolicy` を注入点で差し替える

`checkpoint-policy.ts` に `attachArchivePolicy: CheckpointVerificationPolicy` を追加する。
検査は 2 点のみ:

- `state.status === "awaiting-archive"`（不一致は `checkpointNotAttachableError("not-quiescent", ...)`）
- `state.pullRequest?.number` の存在（欠落は `checkpointNotAttachableError("missing-pr-number", ...)`）

resume 前提の checks（resumePoint / pipeline descriptor / resume step の reads() precheck）は課さない。
generic integrity 層（`verifyCheckpoint` 本体）と `attachResumePolicy` は無改変。

- Rationale: checkpoint-verification-policy-split が「use-case checks を policy に分離し引数注入する」
  ために用意した注入点をそのまま使う。generic 層は status 非依存なので awaiting-archive でも安全に通る。
- Alternatives considered:
  - `verifyCheckpoint` 本体に status 分岐を追加 — 却下（注入点の設計意図を無視し generic 層を汚す）。
  - `attachResumePolicy` を status 引数で分岐させる — 却下（resume policy に archive の関心を混ぜる）。

### D2: `job attach --branch` は status 分岐する composite `attachQuiescentPolicy` を渡す

`verifyCheckpoint` は state を内部で read してから policy を実行するため、policy 選択時点で status が
判っている。そこで `attachQuiescentPolicy`（composite）を追加する。`ctx.state.status` を見て
awaiting-resume → `attachResumePolicy.verify(ctx)` に委譲、awaiting-archive →
`attachArchivePolicy.verify(ctx)` に委譲、それ以外 → `not-quiescent` で拒否する。
`attach.ts` はこの composite を渡し、成功後の next-step hint を `verified.state.status` で出し分ける
（awaiting-resume → `job resume <slug>` / awaiting-archive → `job archive <slug> --with-merge`）。

- Rationale: 「status に応じて policy を選択」を、verify の単一パス構造を崩さず policy 内 dispatch で実現する。
  attach.ts 側で state を先読みして policy を選ぶ案は fetch/read の二重化と TOCTOU を招く。
- Alternatives considered:
  - attach.ts で state.json を先読みして policy を選ぶ — 却下（余分な I/O・二重解決）。
  - `verifyCheckpoint` に status 引数を足す — 却下（status は同じ state から導出、鶏卵）。

### D3: `runAttachVerification` に optional `policy` 引数を追加（default: attachResumePolicy）

`AttachVerificationInput` に `policy?: CheckpointVerificationPolicy` を足し、`verifyCheckpoint` へ素通しする
（未指定は attachResumePolicy）。呼び出し 3 箇所:

- `attach.ts` → `attachQuiescentPolicy`（D2）
- `archive --from-issue` rebind → `attachArchivePolicy`（D1）
- `resume-from-issue.ts` → 未指定（= attachResumePolicy、既存挙動そのまま）

- Rationale: 注入点を CLI 経路まで貫通させる最小変更。resume 経路は引数を渡さないので完全に不変。
- Alternatives considered: archive 経路だけ `verifyCheckpoint` を直接呼ぶ — 却下（fetch/OID 解決の重複、
  attach orchestrator の一貫性喪失）。

### D4: jobId は completed marker から解決する（escalation 版と対称）

`issue-notifier.ts` に `parseCompletedJobId(body): string | null`（`kind="completed"` marker 専用 regex）を
追加。`issue-target/archive.ts`（新規）に `resolveCompletedJobId`（escalation 版と対称: 全コメント走査 →
completed marker 収集 → 最新 createdAt を採用 → 不在は `archiveFromIssueNoMarkerError`）を追加する。
completed 専用 regex なので escalation marker は自然に無視される。

- Rationale: escalation を一度も経ずに完走した job は escalation marker を持たない。completed marker は
  awaiting-archive を残す全 job が必ず投稿する唯一の機械可読契約。
- Alternatives considered:
  - escalation marker を流用 — 却下（無 escalation 完走で成立しない）。
  - 通知コメント本文の PR URL をパース — 却下（本文は表示用で機械契約ではない）。

### D5: branch は closing PR references + 4 点照合で一意確定する

GitHubClient port（`kernel/github-client.ts`）に
`listIssueClosingPullRequests(owner, repo, issueNumber): Promise<Array<{ number: number; headRefName: string }>>`
を追加し、adapter（`adapter/github/github-client.ts`）に GraphQL
`closedByPullRequestsReferences(first:50){ nodes { number headRefName } }` 実装を足す。
`issue-target/archive.ts` の `resolveArchiveBranchFromIssue` は各候補 PR の headRefName を
`git fetch origin <headRefName>` → OID 解決 → `readStateJsonFromRef` → 軽量 parse し、
**4 点照合**で確定する:

- `state.jobId === jobId`
- `state.issueNumber === issueNumber`
- `state.branch === headRefName`
- `state.pullRequest.number === PR.number`

closing PR 0 件 → `archiveFromIssueNoPrError`。確定 0 件 / 複数 → `archiveFromIssueUnconfirmedError`。
不一致・unreadable な候補は skip（match をブロックしない）。resume の 3 点照合ロジックとは
「候補源（closing PR vs linkedBranch）」「照合 4 点目（PR number）」が異なるため別関数として実装する
（resume.ts は無改変）。

- Rationale: 実測で PR 作成後 `linkedBranches` は空。awaiting-archive は PR 必在なので closing PR references が
  唯一の候補源。PR number を 4 点目に加えることで、同一 branch 名で異なる PR が絡む事故を排除する。
- Alternatives considered:
  - 既存 `listIssueLinkedBranches`（linkedBranches + closingPR headRefName の union、PR number を捨てる）を流用 —
    却下（PR number が取れず 4 点照合できない）。
  - resume の resolver を closing-PR 対応に拡張して共用 — 却下（resume は PR 未作成前提で linkedBranches が正しく、
    共用は resume テストを書き換える回帰源になる）。

### D6: local state があれば rebind せず既存 archive へ直行する

`loadStateByJobId(repoRoot, jobId)` が返せば（= 既にローカル完走 job）rebind を経ず、そのまま
既存 archive 実行（`runArchive`）へ直行する。`JOB_NOT_FOUND` のときのみ branch 解決 + rebind へ進む。

- Rationale: issue 起点 resume の short-circuit と対称。ローカルに state がある job を remote 扱いで
  再取得するのは無駄かつ差異の温床。
- Alternatives considered: 常に rebind — 却下（既存ローカル job に対する冗長 fetch/worktree 実体化）。

### D7: rebind 後は既存 archive orchestrator に無改変で接続する

rebind は D3 の `runAttachVerification({ policy: attachArchivePolicy })` で検証し、
`LocalRuntime.setupWorkspace(slug, jobId, { attachCheckpoint: { branch, checkpointRef: checkpointOid }, baseBranch })`
で worktree + local state を実体化する。その後は確定 slug で既存 `runArchive({ slug, withMerge, cwd, mergeWaitMs })`
を呼ぶだけ。merge-then-archive Step 1 の `listWithSourceDirs` が実体化済み state を発見するため、
archive 側に remote 特例は不要。

- Rationale: 取り込み後の状態を「ローカル完走 job と同一」にするのが不変条件。archive 本体を触らないことで
  既存 archive/merge テストを無変更で維持する。
- Alternatives considered: archive 側に「issue 起点」特例分岐 — 却下（不変条件を壊し、archive の複雑度を上げる）。

### D8: CLI 面は `job archive --from-issue <n>`、slug positional と排他

`command-registry.ts` の archive command に `"from-issue": { type: "integer", min: 1 }` を追加し、
slug positional を `required: false` に変更する。handler は「slug と --from-issue の**厳密 XOR**」を強制する
（両方指定・両方欠落 → exit 2）。`--from-issue` 経路は新規 `cli/archive-from-issue.ts` の
`runArchiveFromIssue(issueNumber, { withMerge, mergeWaitMs, cwd, repoRoot, logLevel })` に routing し、
`--with-merge` / `--merge-wait-ms` をそのまま引き継ぐ。resume-from-issue と対称の CLI 面。

- Rationale: 取り込みは archive の一形態。`job resume --from-issue` と対称にし学習面積を増やさない。
- Alternatives considered: `job intake` 等の新コマンド新設 — 却下（能力は同じで学習面積だけ増える）。

### D9: archive --from-issue は local runtime 限定・foreground

rebind は local 専用のため、`runArchiveFromIssue` は入口で `config.runtime === "local"` を確認し、
非 local は `attachRuntimeUnsupportedError` で拒否する（resume-from-issue と対称）。`--detach` は追加しない。

- Rationale: rebind（worktree 実体化）は local runtime にのみ存在する能力。archive は既存どおり foreground。
- Alternatives considered: managed 対応 / --detach 追加 — いずれも本 request のスコープ外。

### D10: 新規 typed error は exit 2、resume 版と対称

`errors.ts` に 3 コードを追加し `EXIT_CODE_MAP` で ARG_ERROR(2) に割り当てる:

- `ARCHIVE_FROM_ISSUE_NO_MARKER` — completed marker 不在（factory `archiveFromIssueNoMarkerError`）
- `ARCHIVE_FROM_ISSUE_NO_PR` — closing PR 0 件（factory `archiveFromIssueNoPrError`、hint は `job attach --branch` を案内）
- `ARCHIVE_FROM_ISSUE_UNCONFIRMED` — 確定 0 / 複数 / 4 点不一致（factory `archiveFromIssueUnconfirmedError`）

- Rationale: RESUME_FROM_ISSUE_* と対称の粒度。exit 2 は「invocation / 前提を直して再実行」の意味で resume と一致。
- Alternatives considered: 汎用 GITHUB_API_ERROR で済ませる — 却下（0 件 / 複数 / marker 不在で operator の次アクションが異なる）。

## Risks / Trade-offs

- [Risk] awaiting-archive checkpoint が resume policy で誤って attach される回帰 → Mitigation: `attach.ts` は
  composite（D2）を明示的に渡し、resume-from-issue は policy 未指定（default resume）を維持。両経路をテストで固定。
- [Risk] resolveArchiveBranchFromIssue と resolveResumeBranchFromIssue の重複コード（fetch→rev-parse→readState→parse）→
  Mitigation: resume 不変の受け入れ基準を守るため意図的に重複を許容。共通化は resume テスト書き換えを招くため本 request では行わない。
  <!-- ponytail: duplicated fetch/parse loop between resume/archive locators; unify only if a 3rd locator appears -->
- [Risk] closing PR が複数（過去に close→reopen した PR や複数 PR）で headRefName が重複 → Mitigation: 4 点照合で
  jobId/issueNumber/branch/PR number 全一致のみ confirmed、複数 confirmed は typed error（fail-closed、自動 merge しない）。
- [Risk] port interface へのメソッド追加で full 実装（`GitHubApiClient`）以外が壊れる → Mitigation: 唯一の full 実装は
  adapter のみ。他は型注釈 / 部分 mock で受け取るだけなので typecheck 影響なし。
- [Trade-off] archive --from-issue は local 限定。managed runner の job も checkpoint さえ公開されていれば
  local checkout から取り込める（rebind が local worktree を作るため）ので実害は小さい。

## Open Questions

なし（設計判断は request の「architect 評価済みの設計判断」で確定済み）。
