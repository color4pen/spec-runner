# Test Cases: local Git 実行で GitHub 連携を任意化する

## 凡例

- **Source**: `spec:<Requirement>/<Scenario>` = spec.md の Scenario 由来（GWT 省略）。それ以外は tasks.md / design.md 由来（GWT を記述）。
- **Priority**: must / should / could
- **Category**: config / state / identity / auth / pipeline / completion / lifecycle / attach / archive / display / guard / invariant / e2e

---

## 1. config — `github.enabled` の宣言と解決

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-001 | 未指定 config が `enabled: true / source: default` に解決される | config | must | spec:GitHub連携の宣言と既定値/未指定は有効 |
| TC-002 | project local が `false` を宣言すると `enabled: false / source: project-local` になる | config | must | spec:GitHub連携の宣言と既定値/project_local_で無効を宣言する |
| TC-003 | `github.enabled: "no"` (文字列) が CONFIG_INVALID で拒否される | config | must | spec:GitHub連携の宣言と既定値/不正な型は_config_error_になる |
| TC-004 | user global config だけが `false` を宣言した場合 `source: user-global` になる | config | should | T-01 AC |

### TC-004 詳細

**Given** user global config に `{"github": {"enabled": false}}` が設定され、project local config は `github.enabled` を持たない  
**When** 設定解決を行う  
**Then** `enabled: false` / `source: "user-global"` で解決される

---

## 2. state — 連携契約の job への固定

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-010 | `job start` 時に `github.enabled: false` が job state に記録される | state | must | spec:連携状態をjobに固定する/start_時の値がstateに固定される |
| TC-011 | config 変更後に resume しても job は GitHub 無効契約で動く | state | must | spec:連携状態をjobに固定する/config_を後から変えても既存_job_は移行しない |
| TC-012 | `githubIntegration` フィールドを持たない legacy state が `enabled: true` として解釈される | state | must | spec:連携状態をjobに固定する/legacy_state_は_GitHub_有効として扱われる |
| TC-013 | `enabled: false` かつ `owner` を持つ state が validation で拒否される | state | must | T-02 AC |
| TC-014 | `enabled: true` かつ `owner` が空/不在の state が validation で拒否される | state | must | T-02 AC |
| TC-015 | `requireGitHubRepository` が無効契約 state に対して `GITHUB_INTEGRATION_DISABLED` を投げる | state | must | T-02 AC |

### TC-013 詳細

**Given** `githubIntegration: { enabled: false }` かつ `repository: { owner: "acme", name: "repo" }` を持つ state JSON がある  
**When** `validateJobState` を実行する  
**Then** 検証が失敗し、job は実行されない

### TC-014 詳細

**Given** `githubIntegration: { enabled: true }` かつ `repository: {}` (owner/name 不在) を持つ state JSON がある  
**When** `validateJobState` を実行する  
**Then** 検証が失敗し、job は実行されない

### TC-015 詳細

**Given** `githubIntegration: { enabled: false }` を持つ job state がある  
**When** `requireGitHubRepository(state)` を呼ぶ  
**Then** `GITHUB_INTEGRATION_DISABLED` の `SpecRunnerError` がスローされる

---

## 3. identity — 汎用 origin identity と GitHub identity の分離

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-020 | 無効 job の state には `origin` が記録され `owner` / `name` は不在 | identity | must | spec:repository_identityは汎用originとGitHub_identityを分離する/無効_job_は_GitHub_identity_を持たない |
| TC-021 | credential を含む origin URL から userinfo が除去されて state に保存される | identity | must | spec:repository_identityは汎用originとGitHub_identityを分離する/credential_を_state_に残さない |
| TC-022 | GitHub 有効 job で owner が無い state が検証失敗する | identity | must | spec:repository_identityは汎用originとGitHub_identityを分離する/有効_job_の_identity_必須性は維持される |
| TC-023 | HTTPS / SSH / local bare が同一 digest に正規化される | identity | must | T-03 AC |
| TC-024 | `file:///tmp/x/bare.git` 形式の local remote でも安定した digest が得られる | identity | should | T-03 AC |

### TC-023 詳細

**Given** 同一 repository に対する 3 つの URL: `https://user:secret@example.com/team/repo.git` / `git@example.com:team/repo.git` / `https://example.com/team/repo`  
**When** `normalizeOriginIdentity(url)` を各 URL に適用する  
**Then** 3 つの結果は同一の `digest` を持ち、いずれの `url` にも userinfo が含まれない

### TC-024 詳細

**Given** origin URL が `file:///tmp/x/bare.git` である  
**When** `normalizeOriginIdentity(url)` を適用する  
**Then** 空でない `digest` が安定して返される（同一 URL を複数回呼んでも同じ値）

---

## 4. auth — GitHub credential の非混入

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-030 | 環境に `GH_TOKEN` があっても無効 job では token 解決・API request が 0 件 | auth | must | spec:GitHub無効jobはGitHub_credentialとGitHub_APIに一切触れない/環境に_credential_があっても解決しない |
| TC-031 | 無効 job の git fetch / push に token 注入引数が付かない | auth | must | spec:GitHub無効jobはGitHub_credentialとGitHub_APIに一切触れない/git_transport_に_token_を注入しない |
| TC-032 | 非 GitHub origin で `REMOTE_NOT_GITHUB` が発生しない | auth | must | spec:GitHub無効jobはGitHub_credentialとGitHub_APIに一切触れない/非_GitHub_origin_を拒否しない |
| TC-033 | 有効 job では token 解決順・host・API base URL が従来と同一 | auth | must | T-04 AC |
| TC-034 | `LocalRuntime` に渡る `githubToken` が `undefined`（`""` fallback なし）になる | auth | must | T-05 AC |

### TC-033 詳細

**Given** GitHub 有効設定で `job start` を実行する  
**When** `resolveJobGitHubIntegration` が呼ばれる  
**Then** token 解決順・host 解決・API base URL が変更前の `preflight` 実装と同一の結果になる

---

## 5. pipeline — 完了終端の選択

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-040 | 有効契約の `applyGitHubIntegration` が base と参照同一オブジェクトを返す | pipeline | must | spec:GitHub無効時のstandard/fastはfeature_branch出力で完了する/GitHub_有効時の終端は不変 |
| TC-041 | 無効契約の standard で `pr-create` が steps / roles / transitions から消え `adr-gen → end` になる | pipeline | must | spec:GitHub無効時のstandard/fastはfeature_branch出力で完了する/pr-createを実行せずに完了する |
| TC-042 | 無効契約の fast で `conformance approved → end` / `verification passed → end` になる | pipeline | must | spec:GitHub無効時のstandard/fastはfeature_branch出力で完了する/検証とレビューは省略されない |
| TC-043 | design-only は有効・無効で同一 descriptor になる | pipeline | must | spec:GitHub無効時のstandard/fastはfeature_branch出力で完了する/design-onlyの意味は変わらない |
| TC-044 | 無効 job で `resume --from pr-create` が exit 2 で拒否され state が変わらない | pipeline | must | spec:GitHub無効時のstandard/fastはfeature_branch出力で完了する/無効な終端の明示指定は事前に拒否される |
| TC-045 | 無効契約 pipeline の終端で `awaiting-archive` に遷移し `commitFinalState` が呼ばれる | pipeline | must | T-06 AC |

---

## 6. completion — PR 非依存の証跡と完了出力

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-050 | 無効 job 完了後に `attestation.md` が feature branch の terminal commit に含まれる | completion | must | spec:PRが無くても完了成果と証跡の所在が得られる/attestationがbranchに載る |
| TC-051 | 完了出力に feature branch / 最終 revision / 証跡パスが表示され PR URL は現れない | completion | must | spec:PRが無くても完了成果と証跡の所在が得られる/完了出力がbranchとrevisionと証跡を示す |
| TC-052 | `--json` 出力で無効 job が `result: "branch-published"` / `prUrl: null` を返す | completion | must | spec:PRが無くても完了成果と証跡の所在が得られる/機械可読出力がPRを詐称しない |
| TC-053 | attestation 書き込み失敗でも `awaiting-archive` 遷移と push は成立する | completion | must | T-07 AC |
| TC-054 | GitHub 有効 job の `--json` 出力が従来どおり `"pr-created"` を返す | completion | must | T-07 AC |
| TC-055 | `pipelineManagedPaths` への追加が agent deny path / round staging / worktree reconcile の既存テストを壊さない | completion | must | T-07 AC |

### TC-053 詳細

**Given** 無効 job が pipeline を完了し、attestation.md の書き込みが I/O エラーで失敗する  
**When** `LocalRuntime.commitFinalState` が実行される  
**Then** warn ログが出力されるが、`awaiting-archive` 遷移・final commit・push はすべて成立する

### TC-055 詳細

**Given** `pipelineManagedPaths(slug)` に `attestation.md` が追加されている  
**When** agent deny path チェック / round staging / worktree reconcile の各処理を実行する  
**Then** いずれも既存の期待値のまま通り、新規パスが意図しないサイドエフェクトを起こさない

---

## 7. lifecycle — reopen の PR gate

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-060 | 無効 job（PR 記録なし）の reopen が `awaiting-resume` に遷移し operator event が記録される | lifecycle | must | spec:GitHub無効jobのreopenはPR_gateを要求しない/PRなしでreopenできる |
| TC-061 | reopen 後の別操作 resume で pipeline が指定 step から再開される | lifecycle | must | spec:GitHub無効jobのreopenはPR_gateを要求しない/reopen後に別操作のresumeで追加修正できる |
| TC-062 | 有効 job の PR が CLOSED の場合 reopen が拒否され status が変わらない | lifecycle | must | spec:GitHub無効jobのreopenはPR_gateを要求しない/有効_job_の_PR_確認は維持される |
| TC-063 | 無効 job の reopen で GitHub token 解決と API 呼び出しが 0 件 | lifecycle | must | T-08 AC |
| TC-064 | reopen が pipeline を起動しない（遷移のみ） | lifecycle | must | T-08 AC |

### TC-064 詳細

**Given** 無効 job が `awaiting-archive` にある  
**When** `job reopen <slug> --reason "修正"` を実行する  
**Then** job が `awaiting-resume` に遷移するが、agent / pipeline step の実行は開始されない

---

## 8. archive — Git のみの 1 回完了

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-070 | 無効 job の archive が 1 回で `archived` まで到達し remote feature branch が残る | archive | must | spec:GitHub無効jobのarchiveはGitだけで1回で完了する/record_push_→_archived_→_cleanup_が1回で完了する |
| TC-071 | archive record push 失敗時に `archived` にならず cleanup も行われない | archive | must | spec:GitHub無効jobのarchiveはGitだけで1回で完了する/push_失敗時に成果物を失わない |
| TC-072 | archive 成功後に base branch が自動 merge されていない | archive | must | spec:GitHub無効jobのarchiveはGitだけで1回で完了する/base_branchは自動_merge_されない |
| TC-073 | 無効 job の `--with-merge` が record 作成前に拒否され job status が変わらない | archive | must | spec:GitHub専用の操作は副作用の前に拒否される/merge付きarchiveを事前に拒否する |
| TC-074 | 無効 job の archive で GitHub API 呼び出しと token 解決が 0 件 | archive | must | T-09 AC |
| TC-075 | `ARCHIVE_USAGE` のヘルプ文言が単相 archive 実装（1 回で complete）と一致する | archive | must | T-09 AC |

### TC-075 詳細

**Given** `ARCHIVE_USAGE` 定数または CLI help text を参照する  
**When** 記述内容を単相 archive の実装（`plain-archive.ts` の record push → archived → cleanup 順序）と照合する  
**Then** 「PR merge 後に再実行」等、実装と矛盾する案内文が存在しない

---

## 9. attach — 別 checkout からの契約復元

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-080 | 無効 job の checkpoint を別 clone から attach でき復元後も契約が無効 | attach | must | spec:別checkoutからのattachは保存済み契約を復元し不一致を拒否する/無効_job_のcheckpointを別checkoutで引き継ぐ |
| TC-081 | origin identity が異なる checkpoint の attach が拒否され worktree 等が作成されない | attach | must | spec:別checkoutからのattachは保存済み契約を復元し不一致を拒否する/repositoryが異なるcheckpointは拒否される |
| TC-082 | checkpoint が有効契約・invoker config が無効の場合 GitHub identity 照合が要求される | attach | must | spec:別checkoutからのattachは保存済み契約を復元し不一致を拒否する/invokerのconfig変更で有効jobの確認を迂回できない |
| TC-083 | 既存の attach identity 不一致 / journal 破損 / profile 不整合テストが通る | attach | must | T-10 AC |

---

## 10. guard — GitHub 専用操作の事前拒否

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-090 | config 無効時に `job start --issue 42` が handler 到達前に拒否され job / worktree が作られない | guard | must | spec:GitHub専用の操作は副作用の前に拒否される/issue起点の指定を事前に拒否する |
| TC-091 | managed × GitHub 無効で job state 作成前に不適合が通知される | guard | must | spec:GitHub専用の操作は副作用の前に拒否される/managed_runtimeとの不適合をjob作成前に通知する |
| TC-092 | GitHub 非依存コマンド群（ls / show / wait / stats / usage / request / rules / reviewers / config / guide）が無効時も credential 不要で動作する | guard | must | spec:GitHub専用の操作は副作用の前に拒否される/GitHub非依存のコマンドは影響を受けない |
| TC-093 | config 無効時に `inbox run` / `--from-issue` 系が handler 到達前に拒否される | guard | must | T-11 AC |
| TC-094 | config 有効・job 無効の組合せでも `archive --with-merge` が拒否される | guard | must | T-11 AC |
| TC-095 | 宣言のある command / flag 集合と README / help の対応表がテストで固定されている | guard | must | T-11 AC |

### TC-093 詳細

**Given** プロジェクト config が `github.enabled: false` を宣言している  
**When** `inbox run` または `job resume <slug> --from-issue` を実行する  
**Then** handler 実行前に exit 2 で拒否され、「この操作は GitHub 連携が必要」旨が表示される

### TC-094 詳細

**Given** config は `github.enabled: true` だが job の契約は `enabled: false`  
**When** `job archive <slug> --with-merge` を実行する  
**Then** archive record 作成前に拒否され、job status は変化しない

---

## 11. display — 表示と診断の実装一致

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-100 | `config effective` が GitHub 連携設定と設定元を human / JSON 双方で表示する | display | must | spec:表示と診断が実装の連携状態と一致する/config_effectiveが設定元を示す |
| TC-101 | `job show <slug>` が job に固定した連携状態を表示する | display | must | spec:表示と診断が実装の連携状態と一致する/job_showがjobの契約を示す |
| TC-102 | GitHub token が不在でも doctor が exit 0 になり GitHub 関連 check が fail しない | display | must | spec:表示と診断が実装の連携状態と一致する/doctorが不要な検査をfailにしない |
| TC-103 | 無効 job の完了出力が外部 forge の CI / branch protection / merge 承認を実施済みと表示しない | display | must | spec:表示と診断が実装の連携状態と一致する/外部_gate_を実施済みと偽らない |
| TC-104 | `job start` の開始ログに job へ固定した連携状態が 1 行出る | display | should | T-13 AC |
| TC-105 | 無効時も node / git / origin / agent provider の doctor 検査が実行される | display | must | T-12 AC |
| TC-106 | `config effective --json` に GitHub 連携状態と設定元のフィールドが含まれる | display | must | T-13 AC |

### TC-104 詳細

**Given** `github.enabled: false` の config で `job start <slug>` を実行する  
**When** 開始ログが出力される  
**Then** 「GitHub integration: disabled」または同義の行が 1 行、起動ログに含まれる

### TC-105 詳細

**Given** config が `github.enabled: false` を宣言し、GitHub token が存在しない  
**When** `doctor` を実行する  
**Then** git / origin / node / package manager / agent provider の各検査が実行され、結果が表示される

---

## 12. invariant — 不変条件と architecture

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-110 | `invariant-catalog-parity` テストが B-19 を含む ID 集合で通る | invariant | must | T-14 AC |
| TC-111 | B-19 regression guard が allowlist 外の `resolveGitHubToken` / `createGitHubClient` 呼び出しを検出する | invariant | must | T-14 AC |
| TC-112 | 既存の B-1 / B-8 / B-10 / B-17 の検査がすべて通る | invariant | must | T-14 AC |
| TC-113 | `config.runtime` の分岐が `src/core/runtime/` の外に増えていない（B-8） | invariant | must | T-05 AC |

### TC-111 詳細

**Given** `src/core/github/integration.ts` および `src/cli/github-composition.ts` 以外のファイル（allowlist に含まれない）に `resolveGitHubToken` の呼び出しを挿入する  
**When** B-19 の grep 検査テストを実行する  
**Then** テストが FAIL し、不正な呼び出し箇所が報告される

---

## 13. e2e — 実 CLI 経路の End-to-End

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-120 | bare origin 上で start → halt → resume → 完了 → archive が成立する | e2e | must | AC: GitHub credentialなし・GitHub API到達不可・非GitHub originのfixtureで成立 |
| TC-121 | fixture 実行中の GitHub API request が 0 件、token 注入が 0 件 | e2e | must | AC: GitHub無効かつcredentialが環境/保存先に存在するケースでもSpecRunnerのGitHub API呼び出しとtoken注入がゼロ |
| TC-122 | 専用 worktree の作成・step commit/push・OID binding・synthesizedCommits・egress 検査が維持される | e2e | must | AC: 専用worktree、step commit/push、commit OIDへのverification/review binding、staging/egressの安全条件が維持される |
| TC-123 | 完了時に PR 出力が無く branch / revision / 証跡パスが得られる | e2e | must | AC: standard/fast完了時にPRがなくてもarchive可能で、branch・revision・証跡の所在が得られる |
| TC-124 | 無効 job を reopen し別操作 resume で追加修正できる | e2e | must | AC: GitHub無効jobをreopenしてから別操作のresumeで追加修正できる |
| TC-125 | 別 clone から attach で契約を復元でき origin identity 不一致 checkpoint が拒否される | e2e | must | AC: 別checkoutからattach --branchでcheckpointと保存済み連携契約を復元でき、不一致checkpointは拒否される |
| TC-126 | archive 後に remote feature branch が残り base branch が変更されていない | e2e | must | AC: archiveはremote branchへ記録を残して1回で完了し、push失敗時は成果物を失わない。base branchを自動mergeしない |
| TC-127 | `GH_TOKEN` が環境変数に設定された状態でも上記 e2e が成立する | e2e | must | T-16 AC |
| TC-128 | 既存の `tests/attach/attach-resume-e2e.test.ts` 等が引き続き通る | e2e | must | T-16 AC |
| TC-129 | e2e は `runRunCore` / `runResumeCore` / `ReopenCommand.execute` / `runArchive` の実関数で駆動し、別 orchestrator を新設しない | e2e | must | AC: 上記fixtureはjob start/resume/reopen/archiveの実CLI経路と既存CommandRunnerを通して成立させる |

---

## 14. regression — 既存 GitHub 有効経路の不変

| # | Title | Category | Priority | Source |
|---|---|---|---|---|
| TC-130 | GitHub 有効 job の start → pipeline → pr-create → archive が従来と同一の結果になる | regression | must | AC: GitHub有効時のIssue/PR/reopen/merge/managedの挙動と安全確認が維持される |
| TC-131 | GitHub 有効 job の reopen で PR OPEN 確認が維持される | regression | must | T-08 AC |
| TC-132 | GitHub 有効 job の fidelity gate / issue 通知が変わらない | regression | must | T-05 AC |
| TC-133 | README / guide / CLI help の対応表が T-11 の宣言集合と一致するテストが通る | regression | must | T-15 AC |
| TC-134 | `tests/readme-quickstart.test.ts` / `tests/dead-guidance.test.ts` / hint-command-existence テストが通る | regression | must | T-15 AC |
| TC-135 | 既存の config 関連テストがすべて通る | regression | must | T-01 AC |
| TC-136 | 既存の state / store テストが通る | regression | must | T-02 AC |
| TC-137 | `getOriginInfo` の既存テストが変更なしで通る | regression | must | T-03 AC |

---

## 優先度サマリ

| Priority | 件数 |
|---|---|
| must | 59 |
| should | 3 |
| could | 0 |
| **合計** | **62** |
