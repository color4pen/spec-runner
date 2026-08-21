# issue 起点 awaiting-archive 取り込み: archive face の設計

**Date**: 2026-08-21
**Status**: accepted
**Related**:
- `specrunner/adr/2026-08-20-checkpoint-verification-policy-split.md`（rebind primitive の policy 分離・本 ADR の直接的前提）
- `specrunner/adr/2026-08-20-issue-target-resume-from-issue.md`（resume face・`--from-issue` CLI パターンの先行確立）
- `specrunner/adr/2026-06-03-archive-command-client-closed.md`（archive orchestrator の client-closed 不変・本 ADR で継承）

## Context

remote 環境（GitHub Actions runner 等）で pipeline を完走した job は、branch 上に `awaiting-archive` の checkpoint（`state.json` / `events.jsonl` / change folder）と PR を残して環境ごと消える。ローカルに job state が存在しないため `job archive <slug> --with-merge` は `merge-then-archive.ts` Step 1 の `JobStateStore.listWithSourceDirs` で発見できず exit 2「No job found with slug」で弾かれる。正規の取り込み経路がなく、archive orchestrator の記録（archive-record commit / status 遷移 / post-merge cleanup）が欠落する。

issue 起点 resume ADR（`2026-08-20-issue-target-resume-from-issue.md`）は issue-target 層の **resume face** を確立した。本 ADR はその対称として **archive face** を確立する。

設計上の核心問題は 2 点あった:

1. **branch の発見手段**: resume face は `linkedBranches`（GraphQL）を optional index として使う。しかし実測（2026-08-21）で PR が branch から作成されると `linkedBranches` は空になり `closedByPullRequestsReferences` が closing PR（number / headRefName）を返すことが確認された。`awaiting-archive` は必ず PR が存在するため、同じ index では成立しない。
2. **jobId の解決源**: resume face は `kind="escalation"` marker を使う。しかし escalation を一度も経ずに完走した job は escalation marker を持たない。完走通知（`issue-notifier.ts`）が投稿する `kind="completed"` marker が唯一の機械可読契約である。

`checkpoint-verification-policy-split` ADR は awaiting-archive 取り込みが resume と同じ rebind 機構を使うことを明示的に想定し policy 注入点を用意した。本 ADR はその想定用途を実装し、`CheckpointVerificationPolicy` の 2 つ目の実装（`attachArchivePolicy`）と composite（`attachQuiescentPolicy`）を確立する。

## Decisions

### D1: `attachArchivePolicy` — awaiting-archive 専用の policy を注入点で差し替える

`checkpoint-policy.ts` に `attachArchivePolicy: CheckpointVerificationPolicy` を追加する。検査は 2 点のみ:

- `state.status === "awaiting-archive"`（不一致は `checkpointNotAttachableError("not-quiescent", ...)`）
- `state.pullRequest?.number` の存在（欠落は `checkpointNotAttachableError("missing-pr-number", ...)`）

resume 前提の checks（`resumePoint` 解決・pipeline descriptor 解決・resume step の `reads()` precheck）は課さない。`verifyCheckpoint` の generic integrity 層（journal / counter / profile / request.md / identity）は status 非依存なので `awaiting-archive` checkpoint でもそのまま通る。

**採用理由**: `checkpoint-verification-policy-split` が用意した注入点をそのまま使う。generic 層の変更ゼロ・`attachResumePolicy` の変更ゼロで新 use-case に対応できる。

**却下案**:
- `verifyCheckpoint` 本体に status 分岐を追加 — 注入点の設計意図を無視し generic 層を汚す。
- `attachResumePolicy` を引数で分岐させる — resume policy に archive の関心を混ぜる。

### D2: `attachQuiescentPolicy` — status ディスパッチの composite を `job attach` に渡す

`verifyCheckpoint` は state を内部で read してから policy を実行するため、policy 選択時点で status が既知になる。`attachQuiescentPolicy`（composite）を追加し、`ctx.state.status` を見て awaiting-resume → `attachResumePolicy` に委譲、awaiting-archive → `attachArchivePolicy` に委譲、それ以外 → `not-quiescent` で拒否する。`attach.ts` はこの composite を渡し、成功後の next-step hint を `verified.state.status` で出し分ける（awaiting-resume → `job resume <slug>` / awaiting-archive → `job archive <slug> --with-merge`）。

**採用理由**: 「status に応じて policy を選択」を、verify の単一パス構造を崩さず policy 内 dispatch で実現する。

**却下案**: `attach.ts` で state.json を先読みして policy を選ぶ — 余分な I/O・TOCTOU を招く。

### D3: `runAttachVerification` に optional `policy` 引数を追加（default: `attachResumePolicy`）

`AttachVerificationInput` に `policy?: CheckpointVerificationPolicy` を足し、`verifyCheckpoint` へ素通しする（未指定は `attachResumePolicy`）。呼び出し 3 箇所:

- `attach.ts` → `attachQuiescentPolicy`（D2）
- `archive --from-issue` rebind → `attachArchivePolicy`（D1）
- `resume-from-issue.ts` → 未指定（= `attachResumePolicy`、既存挙動そのまま）

**採用理由**: 注入点を CLI 経路まで貫通させる最小変更。resume 経路は引数を渡さないので完全に不変。

**却下案**: archive 経路だけ `verifyCheckpoint` を直接呼ぶ — fetch / OID 解決の重複、attach orchestrator の一貫性喪失。

### D4: jobId は `kind="completed"` marker から解決する

`issue-notifier.ts` に `parseCompletedJobId(body): string | null`（`kind="completed"` marker 専用 regex）を追加する。`issue-target/archive.ts` に `resolveCompletedJobId`（`resolveEscalationJobId` と対称: 全コメント走査 → completed marker 収集 → 最新 `createdAt` を採用 → 不在は `archiveFromIssueNoMarkerError`）を追加する。completed 専用 regex なので escalation marker は自然に無視される。

**採用理由**: escalation を一度も経ずに完走した job は escalation marker を持たない。`kind="completed"` marker は `awaiting-archive` を残す全 job が必ず投稿する唯一の機械可読契約である。

**却下案**:
- escalation marker を流用 — 無 escalation 完走で成立しない。
- 完走通知コメント本文の PR URL をパース — 本文は表示用で機械契約ではない（marker のみが機械可読契約）。

### D5: branch は closing PR references + 4 点照合で一意確定する

`GitHubClient` port（`kernel/github-client.ts`）に `listIssueClosingPullRequests` を追加し、adapter（`adapter/github/github-client.ts`）に GraphQL `closedByPullRequestsReferences(first:50){ nodes { number headRefName } }` 実装を足す。各候補 PR の `headRefName` を fetch → OID 解決 → `readStateJsonFromRef` → 軽量 parse し、**4 点照合**で確定する:

- `state.jobId === jobId`
- `state.issueNumber === issueNumber`
- `state.branch === headRefName`
- `state.pullRequest.number === PR.number`

closing PR 0 件 → `archiveFromIssueNoPrError`。確定 0 件 / 複数 → `archiveFromIssueUnconfirmedError`。不一致・unreadable な候補は skip する（match をブロックしない）。

resume の 3 点照合ロジック（`resolveResumeBranchFromIssue`）とは「候補源」「照合 4 点目」が異なるため別関数として実装し、`resume.ts` は無改変にする。

**採用理由**:
- 実測で PR 作成後 `linkedBranches` は空になる。`awaiting-archive` は PR 必在のため closing PR references が唯一の候補源。
- PR number を 4 点目に加えることで、同一 branch 名で異なる PR が絡む事故を排除する（resume の 3 点照合ではこのケースが発生しない）。

**却下案**:
- 既存 `listIssueLinkedBranches` を流用 — PR number が取れず 4 点照合できない。
- resume resolver を closing-PR 対応に拡張して共用 — resume は PR 未作成前提で `linkedBranches` が正しい。共用は resume テストを書き換える回帰源になる。
- `closedByPullRequestsReferences` の first:50 上限を超えた場合の補完 — 50 超の closing PR は通常の運用想定外。50 件 until exhausted のページネーションは本 request のスコープ外とし ponytail コメントで明記する。

### D6: local state が存在すれば rebind せず既存 archive へ直行する

`loadStateByJobId(repoRoot, jobId)` が返せば（= 既にローカル完走 job）rebind を経ず既存 `runArchive` へ直行する。`JOB_NOT_FOUND` のときのみ branch 解決 + rebind へ進む。issue 起点 resume の short-circuit と対称。

**採用理由**: ローカルに state がある job を remote 扱いで再取得するのは冗長かつ差異の温床。

**却下案**: 常に rebind — 既存ローカル job に対する冗長 fetch / worktree 実体化。

### D7: rebind 後は既存 archive orchestrator に無改変で接続する

`runAttachVerification({ policy: attachArchivePolicy })` で検証し、`LocalRuntime.setupWorkspace(slug, jobId, { attachCheckpoint: { branch, checkpointRef: checkpointOid }, baseBranch })` で worktree + local state を実体化する。その後は確定 slug で既存 `runArchive({ slug, withMerge, cwd, mergeWaitMs })` を呼ぶだけ。`merge-then-archive` Step 1 の `listWithSourceDirs` が実体化済み state を発見するため、archive 側に remote 特例は不要。

**採用理由**: 取り込み後の状態を「ローカル完走 job と同一」にするのが不変条件。archive 本体を触らないことで既存 archive / merge テストを無変更で維持できる（`archive-command-client-closed` ADR の client-closed 不変を継承）。

**却下案**: archive 側に「issue 起点」特例分岐 — 不変条件を壊し archive の複雑度を上げる。

### D8: CLI 面は `job archive --from-issue <n>`、slug positional と厳密 XOR

`command-registry.ts` の archive command に `"from-issue": { type: "integer", min: 1 }` を追加し、slug positional を `required: false` に変更する。handler は「slug と `--from-issue` の厳密 XOR」を強制する（両方指定・両方欠落 → exit 2）。`--from-issue` 経路は新規 `cli/archive-from-issue.ts` の `runArchiveFromIssue` に routing し、`--with-merge` / `--merge-wait-ms` をそのまま引き継ぐ。

**採用理由**: 取り込みは archive の一形態であり `job resume --from-issue` と対称の CLI 面にする。

**却下案**: `job intake` 等の新コマンド新設 — 能力は同じで学習面積だけ増える。

### D9: 新規 typed error は exit 2、resume 版と対称

`errors.ts` に 3 コードを追加し `EXIT_CODE_MAP` で `ARG_ERROR(2)` に割り当てる:

| エラーコード | 発生条件 | hint |
|---|---|---|
| `ARCHIVE_FROM_ISSUE_NO_MARKER` | `kind="completed"` marker 不在 | 手動 `job attach --branch` を案内 |
| `ARCHIVE_FROM_ISSUE_NO_PR` | closing PR 0 件 | 手動 `job attach --branch` を案内 |
| `ARCHIVE_FROM_ISSUE_UNCONFIRMED` | 確定 0 件 / 複数 / 全候補照合不一致 | 候補 PR を明示 |

**採用理由**: `RESUME_FROM_ISSUE_*` と対称の粒度。0 件 / 複数 / marker 不在で operator の次アクションが異なるため単一コードでは誤誘導する。

**却下案**: 汎用 `GITHUB_API_ERROR` で済ませる — 次アクションが判別不能になる。

### D10: `archive --from-issue` は local runtime 限定・foreground

入口で `config.runtime === "local"` を確認し、非 local は `attachRuntimeUnsupportedError` で拒否する（`resume-from-issue` と対称）。`--detach` は追加しない。

**採用理由**: rebind（worktree 実体化）は local runtime にのみ存在する能力。archive は既存どおり foreground。

## Alternatives Considered

### Alternative A: 既存 `listIssueLinkedBranches` を流用する（内部で `linkedBranches` + `closedByPullRequestsReferences` を union するが PR number を捨てる）

- **Pros**: 新規 port メソッドの追加が不要。既存 API をそのまま使える
- **Cons**: `listIssueLinkedBranches` は branch 名のみを返し PR number を失う。4 点照合の 4 点目（`pullRequest.number === PR.number`）が実装できず、同一 branch 名で異なる PR が絡む事故を排除できない
- **Why not**: `awaiting-archive` は PR 必在であり PR number が identity の一部。PR number を失うと照合の精度が 3 点止まりになり安全性が下がる

### Alternative B: resume の `resolveResumeBranchFromIssue` を closing-PR 対応に拡張して共用

- **Pros**: 重複コードが減る
- **Cons**: resume は PR 未作成前提で `linkedBranches` が正しい。共用化は resume のテストを書き換える回帰源になる。resume face の「PR 未作成前提」という不変を崩す
- **Why not**: resume face の不変を破壊するためスコープ外。重複は意図的に許容し `ponytail:` コメントで明記する

### Alternative C: completed marker の代わりに archive hint コメントの PR URL をパース

- **Pros**: 実装が単純（正規表現 1 つ）
- **Cons**: コメント本文は表示用で機械契約ではない。将来の UI 変更で壊れる
- **Why not**: marker のみが機械可読契約（`issue-target-resume-from-issue` ADR D1 と同原則）

### Alternative E: `verifyCheckpoint` に status 引数を足して policy 選択を呼び出し側に委ねる

- **Pros**: composite policy（`attachQuiescentPolicy`）が不要になる
- **Cons**: status は `verifyCheckpoint` が内部で read した state から導出されるため、呼び出し側が status を事前に知るには state を二重 read（TOCTOU）するしかない。引数として渡す status が実際の state と乖離するリスクが生まれる
- **Why not**: status は `verifyCheckpoint` が取得した state の派生値であり、外から引数として渡すのは鶏卵。policy dispatch を policy 内部で完結させることで TOCTOU を排除できる

### Alternative D: archive orchestrator に issue 起点特例分岐を追加する

- **Pros**: rebind の実体化を待たずに直接 archive 経路を走れる
- **Cons**: archive orchestrator の client-closed 不変（`archive-command-client-closed` ADR D1）を破壊する。`GitHubClient` 依存が orchestrator に侵入する
- **Why not**: 既存 ADR の核心的不変に違反する

## Consequences

### Positive

- remote runner で完走した job が `job archive --from-issue <n> --with-merge` 一発で取り込めるようになり、手動 merge + change folder 手動移動の必要がなくなる
- issue 起点 resume と対称の CLI 面 / error コード体系 / short-circuit / rebind フローが成立し、操作モデルが統一される
- `checkpoint-verification-policy-split` が用意した注入点がこれで 2 つ目の実装（`attachArchivePolicy`）を持ち、設計意図が実証される
- archive orchestrator 本体は無改変。既存 archive / merge テストはすべてそのまま green

### Negative / Known Debt

- `resolveArchiveBranchFromIssue` と `resolveResumeBranchFromIssue` で fetch → rev-parse → readState → parse の重複コードが残る（`resume.ts` を不変に保つために意図的に許容）。第 3 の locator が生まれたタイミングで共通化を検討する（`ponytail:` コメントで明記済み）
- `listIssueClosingPullRequests` は `first:50` で上限を設けており、50 超の closing PR がある issue では無声切り捨てが発生する。通常運用では 50 超は想定外だが、閾値超過は warn も出さない（`ponytail:` コメントで明記済み）
- `attachQuiescentPolicy` は `not-quiescent` に落とす status 列挙を内包するため、新たな quiescent status が追加されると policy の修正が必要になる

## References

- Request: `specrunner/changes/archive-from-issue/request.md`
- Design: `specrunner/changes/archive-from-issue/design.md`
- Related: `specrunner/adr/2026-08-20-checkpoint-verification-policy-split.md` — policy 注入点の原点
- Related: `specrunner/adr/2026-08-20-issue-target-resume-from-issue.md` — resume face（本 ADR の対称）
- Related: `specrunner/adr/2026-06-03-archive-command-client-closed.md` — client-closed 不変の継承元
