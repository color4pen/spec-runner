# Tasks: local Git 実行で GitHub 連携を任意化する

> 実装順序は T-01 → T-16。T-01〜T-05 が基盤（宣言 / state / identity / composition）、
> T-06〜T-10 が振る舞い（終端 / 証跡 / lifecycle）、T-11〜T-14 が境界と診断、
> T-15〜T-16 が文書と e2e。
> 既存の GitHub 有効経路の挙動・出力は変更しないこと（変更した場合は既存テストが落ちるので、
> 落ちたテストを「期待値の更新」で通してはならない）。

## T-01: config に `github.enabled` を追加し、解決と設定元追跡を実装する

- [x] `src/config/schema/types.ts` の `GitHubHostConfig` に `enabled?: boolean` を追加し、既定値（未指定 = true）を JSDoc で明記する
- [x] `src/config/schema/validation.ts` の `github` セクションに `enabled` の boolean 検証を追加する（型不正は既存の `CONFIG_INVALID` 経路に載せる）
- [x] `src/config/github-integration.ts` を新規作成し、`resolveGitHubIntegrationConfig(config): { enabled: boolean }` を実装する（`config.github?.enabled ?? true`）
- [x] 同ファイルに `traceGitHubIntegration(loadResult): { enabled: boolean; source: "project-local" | "user-global" | "default" }` を実装する（`loadConfigWithSourceMetadata` が返す `projectLocal.migrated` / `userGlobal.migrated` の raw layer を優先順に見る）
- [x] 既存の `resolveGitHubHost` / `resolveGitHubApiBaseUrl`（`src/config/github-host.ts`）には触れない

**Acceptance Criteria**:
- `github.enabled` 未指定の config が `{ enabled: true, source: "default" }` に解決される
- project local だけが `false` を宣言した場合 `source` が `"project-local"`、user global だけが宣言した場合 `"user-global"` になる
- `{"github": {"enabled": "no"}}` が config 検証で拒否される
- 既存の config 関連テストがすべて通る

## T-02: job state に連携契約と汎用 origin identity を追加する

- [x] `src/state/schema/types.ts` に `RepositoryOrigin { url: string; digest: string }` を追加する
- [x] `RepositoryInfo` を `owner?: string; name?: string; origin?: RepositoryOrigin` に変更し、各フィールドの意味（owner/name は GitHub API identity、origin は forge 非依存 identity）を JSDoc に書く
- [x] `JobState` に `githubIntegration?: { enabled: boolean }` を追加し、「start 時に固定、legacy 不在 = 有効」を JSDoc に書く
- [x] `src/state/github-integration.ts` を新規作成し、`getGitHubIntegration(state): { enabled: boolean }`（不在 → `{ enabled: true }`）と `requireGitHubRepository(state): { owner: string; name: string }`（契約が無効 or identity 不在なら `GITHUB_INTEGRATION_DISABLED` の `SpecRunnerError`）を実装する
- [x] `src/state/schema/operations.ts` の `validateJobState` に意味規則を追加する: 契約が不在 or `enabled === true` → `owner` / `name` は非空文字列必須、`enabled === false` → `owner` / `name` は不在必須かつ `origin` 必須
- [x] `src/store/job-state-store.ts` の `create` / `buildInitialJobState` が `repository`（origin 含む）と `githubIntegration` をそのまま保存できるようにする
- [x] `src/errors.ts` に `GITHUB_INTEGRATION_DISABLED` / `GITHUB_INTEGRATION_REQUIRED` / `GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME` を追加し、`EXIT_CODE_MAP` に arg-error として登録する

**Acceptance Criteria**:
- `githubIntegration` を持たない既存の state ファイルが従来どおり読め、`getGitHubIntegration` が `{ enabled: true }` を返す
- `enabled: false` かつ `owner` を持つ state が validation で拒否される
- `enabled: true`（および契約不在）かつ `owner` が空/不在の state が validation で拒否される
- `requireGitHubRepository` が無効契約の state に対して `GITHUB_INTEGRATION_DISABLED` を投げる
- 既存の state / store テストが通る

## T-03: `src/git/remote.ts` を汎用 origin と GitHub origin に分ける

- [x] `getOriginUrl(cwd): Promise<string>` を追加する（`git remote get-url origin` の実行と `NOT_GIT_REPO` / origin 未設定の判別のみ。GitHub 形状は見ない）
- [x] `normalizeOriginIdentity(remoteUrl): RepositoryOrigin` を純関数として追加する: userinfo 除去 → scheme / port 除去 → 末尾 `.git` と末尾スラッシュ除去 → host 小文字化 → `host/path` 形（host が無い local path はパスのみ）に正規化し、SHA-256 を `digest` にする
- [x] 既存 `getOriginInfo(cwd, host)` を `getOriginUrl` + `parseRemoteUrl` の合成に書き換える（外部から見た挙動・error code は不変）
- [x] `parseRemoteUrl` の signature と `REMOTE_NOT_GITHUB` の意味は変更しない

**Acceptance Criteria**:
- `https://user:secret@example.com/team/repo.git` と `git@example.com:team/repo.git` と `https://example.com/team/repo` が同一の `digest` に正規化される
- 正規化結果に userinfo が含まれない
- `file:///tmp/x/bare.git` のようなローカル remote でも digest が安定して得られる
- `getOriginInfo` の既存テスト（`tests/git-remote.test.ts` 等）が変更なしで通る
- 非 GitHub origin で `getOriginUrl` が成功し、`getOriginInfo` は従来どおり `REMOTE_NOT_GITHUB` を投げる

## T-04: GitHub 連携の解決 seam（core）と client composition（CLI）を新設する

- [x] `src/core/github/integration.ts` を新規作成し、`resolveJobGitHubIntegration({ config, cwd, env, enabled })` を実装する
  - `enabled === false`: token を解決せず、GitHub host も参照せず、`{ enabled: false, origin }` を返す
  - `enabled === true`: 既存どおり `resolveGitHubToken(env, { host })` と GitHub origin 解析を行い、`{ enabled: true, token, tokenSource, host, apiBaseUrl, repository: { owner, name }, origin }` を返す
  - adapter（`src/adapter/**`）を import しない（B-1）
- [x] `src/cli/github-composition.ts` を新規作成し、上記 union から `{ enabled, githubClient: GitHubClient | null, githubToken: string | undefined, repository, origin }` を作る。`createGitHubClient(fetch, token, apiBaseUrl)` は enabled 分岐の内側だけで呼ぶ
- [x] `src/core/preflight.ts` を書き換える: config 読み込み後に `resolveGitHubIntegrationConfig` で契約を決め、`resolveJobGitHubIntegration` を呼ぶ。`PreflightResult` の `githubToken` / `githubTokenSource` / `repo` を、契約と identity を含む構造に置き換える（無効時に token フィールドを持たない形にする）
- [x] `src/cli/run.ts` / `src/cli/bootstrap.ts` / `src/cli/attach.ts` / `src/cli/archive.ts` / `src/cli/reopen.ts` の個別 token 解決・client 構築を `src/cli/github-composition.ts` 経由に統一する
- [x] `src/cli/bootstrap.ts` は job state から契約を受け取る signature に変更する（config からは決めない）

**Acceptance Criteria**:
- 契約が無効のとき `resolveGitHubToken` と `createGitHubClient` が 1 度も呼ばれない（spy で検証）
- 契約が無効のとき、環境に `GH_TOKEN` / `GITHUB_TOKEN` が設定されていても上記が成立する
- 契約が有効のときの token 解決順・host 解決・API base URL は従来と同一
- `resolveGitHubToken` の全 call site に `host`、`createGitHubClient` の全 call site に baseUrl 引数がある（B-10 の既存テストが通る）

## T-05: runtime 層を nullable client 対応にし、managed 不適合を宣言点で拒否する

- [x] `LocalRuntimeOptions.githubClient` を `GitHubClient | null` に、`githubToken` を `string | undefined` に変更し、`createTransportAuth({ token })` に `undefined` を渡せるようにする（`""` fallback をやめる）
- [x] `LocalRuntime.buildDeps` が `deps.githubClient` を `GitHubClient | null`、`deps.owner` / `deps.repo` を optional として配布するよう `src/core/types.ts` の `PipelineDeps` と `src/core/port/step-context.ts` を更新する
- [x] `src/core/runtime/factory.ts` の `createRuntime` を「契約付き」の signature に変更し、`config.runtime === "managed"` かつ契約が無効なら `GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME` を throw する（B-8: runtime 分岐はここだけ）
- [x] `src/core/command/runner.ts` の fidelity gate 呼び出しを更新する: client が null かつ `issueNumber` が設定されている場合は fail-closed（halt）、`issueNumber` が無ければ従来どおり gate 不発
- [x] `src/core/notify/issue-notifier.ts` の `NotifyCtx` を client / owner / repo が無い場合に no-op となる形にする（GitHub 無効 job で warn を出さない）
- [x] `src/core/step/pr-create.ts` の既存 null チェック（`githubClient is required`）はそのまま残す（到達しないことを D6 が保証する）

**Acceptance Criteria**:
- GitHub 無効の LocalRuntime が構築でき、`buildTransportAuthArgs` に渡る token が `undefined` である
- managed × GitHub 無効で `job start` / `job resume` が job state 作成・worktree 作成の前に拒否される
- `config.runtime` の分岐が `src/core/runtime/` の外に増えていない（B-8 の既存テストが通る）
- GitHub 有効 job の fidelity gate / issue 通知の挙動が変わらない

## T-06: pipeline 終端を契約で選択する

- [x] `src/core/pipeline/apply-github-integration.ts` を新規作成し、`applyGitHubIntegration(descriptor, contract)` を実装する
  - `enabled === true` → base をそのまま返す（参照同一）
  - `enabled === false` → `steps` から `pr-create` を除去、`to: "pr-create"` の transition をすべて `to: "end"` に書き換え、`step: "pr-create"` の transition 行と `roles["pr-create"]` を除去
- [x] `src/core/pipeline/run.ts` の `buildPipelineForJob` / `runPipeline` の合成列に、`applyScopeConfig` の後・`composeReviewerDescriptor` の前として組み込む（入力は `getGitHubIntegration(jobState)`）
- [x] `src/core/resume/resolve-step.ts` の `buildAllowedStepSet` に契約を渡し、無効時は許可集合から `pr-create` を外す。`src/core/command/resume.ts` の呼び出しを更新する
- [x] `src/core/command/pipeline-run.ts` の descriptor 事前検証（`validateDescriptorInputCompleteness`）が、契約適用後の descriptor に対して行われるようにする

**Acceptance Criteria**:
- 有効契約で `applyGitHubIntegration` が base と参照同一のオブジェクトを返す
- 無効契約の standard descriptor で `adr-gen` の success / skipped が `end` に向き、`pr-create` が steps / roles / transitions から消える
- 無効契約の fast descriptor で `conformance approved` と `verification passed`（conformance 済み guard 付き）が `end` に向く
- design-only は有効・無効で同一 descriptor になる
- 無効 job で `resume --from pr-create` が exit 2 で拒否され、state が変更されない
- 無効契約の pipeline が終端で `awaiting-archive` に遷移し、`commitFinalState` が呼ばれる

## T-07: PR 非依存の証跡と完了出力を実装する

- [x] `src/core/attestation/` に、既存の `buildAttestation` を使って Markdown 文書を描画する renderer を追加する（PR コメント renderer とテンプレートを共有し、コメント側の出力は変えない）
- [x] `specrunner/changes/<slug>/attestation.md` の path helper を `src/util/paths.ts` に追加し、`pipelineManagedPaths(slug)` に含める
- [x] `LocalRuntime.commitFinalState` で、status が `awaiting-archive` かつ契約が無効のときのみ attestation を書き出してから既存の staging / commit / push に進む（書き込み失敗は warn のみで続行）
- [x] `src/core/command/runner.ts` の `handleResult` を更新し、無効契約の `awaiting-archive` では PR 行の代わりに branch / 最終 revision（`state.synthesizedCommits` の最終 OID。無ければ行を出さない）/ 証跡パス（存在するときのみ）を出力する
- [x] `src/core/command/run-result.ts` に `"branch-published"` を追加し、`branch` / `revision` / `githubIntegration` フィールドを additive に追加する（`schemaVersion` は 1 のまま、GitHub 有効時の出力は不変）

**Acceptance Criteria**:
- 無効 job の完了後、`attestation.md` が feature branch の terminal commit に含まれる
- attestation 書き込みに失敗しても `awaiting-archive` 遷移と push は成立する
- 完了出力に PR URL・PR 作成成功の文言が現れない
- `--json` 出力で無効 job が `result: "branch-published"` / `prUrl: null` を返し、有効 job は従来どおり `"pr-created"` を返す
- `pipelineManagedPaths` の追加が agent deny path / round staging / worktree reconcile の既存テストを壊さない

## T-08: reopen の PR gate を契約に紐づける

- [x] `src/core/command/reopen.ts` の PR gate（`state.pullRequest` 必須 / client 必須 / PR OPEN 確認）を `getGitHubIntegration(state).enabled === true` の場合のみ実行するようにする
- [x] status gate・`--reason` 必須・operator event を遷移の前に append する順序・`allowReopen: true`（B-17）の call site 限定は変更しない
- [x] `src/cli/reopen.ts` で job state を先に解決し、契約が無効なら GitHub client を構築しない（token 解決も行わない）
- [x] PR 照会に使う owner/name は `requireGitHubRepository` 経由にする

**Acceptance Criteria**:
- 無効 job（PR 記録なし）を reopen すると `awaiting-resume` に遷移し、operator event が journal に記録される
- 無効 job の reopen で GitHub token 解決と API 呼び出しが 0 件である
- 有効 job の PR MERGED / CLOSED / client 不在の fail-closed 挙動が従来どおり維持される
- reopen が pipeline を起動しないことが維持される

## T-09: archive を契約対応にし、help の不一致を直す

- [x] `src/cli/archive.ts` で job state から契約を解決し、無効なら push 認証用 token の best-effort 解決を行わない
- [x] 無効 job に対する `--with-merge` / `--merge-wait-ms` を、archive record 作成前に `GITHUB_INTEGRATION_REQUIRED` で拒否する（exit 2）
- [x] `src/core/archive/plain-archive.ts` の record → transition → cleanup の順序・push 失敗時の非遷移／非 cleanup・`deleteRemoteBranch: false` は変更しない
- [x] 完了時の案内文を契約で分岐する（有効: PR merge の案内。無効: remote feature branch が保存されていること・統合は利用者が行うこと・`archived` は base branch への merge 済みを意味しないこと）
- [x] `ARCHIVE_USAGE` の「PR merge 後に再実行して archived を完了する」という記述を、現行の単相 archive 実装（1 回で record push → archived → cleanup）に合わせて訂正し、GitHub 無効時の契約を追記する

**Acceptance Criteria**:
- 無効 job の `job archive <slug>` が 1 回で `archived` まで到達し、remote feature branch が残る
- push 失敗時に `archived` にならず cleanup も行われない（既存テストで確認）
- 無効 job の `--with-merge` が record 作成前に拒否され、job status が変わらない
- 無効 job の archive で GitHub API 呼び出しと token 解決が 0 件である
- `ARCHIVE_USAGE` の記述が実装（単相完了）と一致する

## T-10: attach で契約を復元し、identity 照合を契約で分岐する

- [x] `src/core/attach/verify-checkpoint.ts` の入力 `expectedRepo` を `{ github?: { owner, name }; origin: RepositoryOrigin }` に拡張する
- [x] identity 検証を契約で分岐する: checkpoint の契約が有効（または不在）→ GitHub owner/name 一致を要求（期待値が無ければ `checkpointNotAttachableError` で fail-closed）。無効 → `state.repository.origin.digest` の一致を要求（origin 不在は not attachable）
- [x] jobId / branch / slug / journal 整合 / profile 自己整合 / policy 検証の既存順序と条件は変更しない
- [x] `src/core/attach/orchestrator.ts` の signature を新しい期待値型に合わせる（fetch → rev-parse → read → verify の順序は不変）
- [x] `src/cli/attach.ts`: fetch/read 用の transport は invoker config の契約で構成し、検証後の materialize / LocalRuntime は **checkpoint の契約**で構成する。invoker config が無効でも checkpoint が有効なら GitHub identity 照合を要求する

**Acceptance Criteria**:
- 無効 job の checkpoint を別 clone から attach でき、復元後の job 契約が無効のままである
- origin identity が異なる checkpoint の attach が拒否され、worktree / sidecar / job state が作成されない
- checkpoint が有効契約なのに invoker config が無効な場合、GitHub identity 照合が要求され、満たせなければ拒否される
- 既存の attach / checkpoint 検証テスト（identity 不一致・journal 破損・profile 不整合）が通る

## T-11: command registry に capability を宣言し、dispatch と job の 2 段で拒否する

- [x] `src/cli/command-registry.ts` の `CommandSpec` に `requiresGitHub?: boolean`、`FlagDef` に `githubOnly?: true` を追加する
- [x] 宣言を付ける: `job start --issue` / `job start --from-issue` / `job resume --from-issue` / `job archive --from-issue` / `job archive --with-merge` / `job archive --merge-wait-ms` / `inbox run`
- [x] `resolveEffectiveRequiresRepo` と同型の解決関数を追加し、`bin/specrunner.ts` の dispatch（`worktreeGuard` / `requiresRepo` の直後）でプロジェクト config の契約を評価して拒否する（exit 2、`GITHUB_INTEGRATION_REQUIRED`、設定箇所を hint に含める）
- [x] job を対象にする操作は handler 内で job 契約による 2 段目の拒否を行う（T-09 の `--with-merge` はここに含む）
- [x] help 出力に GitHub 連携必須である旨を表示する（`githubOnly` フラグと `requiresGitHub` による dispatch-level 拒否で実装）

**Acceptance Criteria**:
- config 無効時に `job start <slug> --issue 42` が handler 到達前に拒否され、job state / worktree が作成されない
- config 無効時に `inbox run` / `--from-issue` 系が同様に拒否される
- config 有効・job 無効の組合せでも `archive --with-merge` が拒否される
- 宣言のある command / flag の集合と、README / help の対応表が一致することをテストが固定する
- GitHub 非依存の command（`job ls` / `show` / `wait` / `stats` / `usage` / `request` / `rules` / `reviewers` / `config` / `guide` / `job cancel` / `job prune` / `doctor repair`）は無効時も従来どおり動作する

## T-12: doctor の検査集合を契約で切り替える

- [x] `src/cli/doctor.ts` で契約を解決し、無効なら `resolveGitHubToken` と `createGitHubClient` を呼ばない（`DoctorContext` の GitHub 関連フィールドは null / 非構築のまま）
- [x] `src/core/doctor/checks/index.ts` に GitHub 依存の check 群（`github-token-present` / `github-token-valid` / `github-client-id` / `github-origin`）を分離し、契約に応じて選択する
- [x] `src/core/doctor/checks/repo/` に汎用の origin 検査（origin が設定されていること）を追加し、無効時に `github-origin` の代わりに実行する
- [x] doctor 出力に「GitHub integration: disabled（設定元）」と、そのため実施しない検査があることを表示する

**Acceptance Criteria**:
- 無効かつ token 不在の環境で `doctor` が exit 0 になり、GitHub 関連 check が fail しない
- 無効時に doctor が GitHub token 解決と GitHub API 呼び出しを行わない
- 無効時も node / package manager / git / origin / agent provider の検査が実行される
- 有効時の doctor 出力と exit code が従来と同一である

## T-13: `config effective` と `job show` / 起動ログに連携状態を表示する

- [x] `src/cli/config-effective.ts` の出力（human / JSON 双方）に、解決した GitHub 連携状態と設定元を追加する
- [x] `src/cli/job-show.ts` の `printJobState` に、job に固定された連携状態を表示する行を追加する
- [x] `job start` の開始ログ（`PipelineRunCommand.prepare` の `logInfo`）に、その job に固定した連携状態を出力する
- [x] 無効 job の `job show` / `job ls` が存在しない PR の確認や案内を行わないことを確認する（`getGitHubIntegration` により enabled=false job は PR フィールドなし → 既存の null/undefined ガードで安全）

**Acceptance Criteria**:
- `config effective --json` に GitHub 連携状態と設定元のフィールドが含まれる
- `job show <slug>` が有効 / 無効の別を表示し、legacy state では有効と表示される
- 起動ログに job へ固定した連携状態が 1 行出る
- 既存の `config effective` / `job show` の出力形式テストが更新後の期待値と一致する

## T-14: architecture 不変条件 B-19 と関連ドキュメントを追加する

- [x] `architecture/model.md` §4 に B-19（GitHub credential / client の構築を composition seam に限定する）を追加する
- [x] `architecture/conformance.md` の (A) 表に B-19 の行を追加する
- [x] `tests/unit/architecture/core-invariants.test.ts` に `describe("B-19: ...")` を追加し、`resolveGitHubToken` / `createGitHubClient` の呼び出しが `src/core/github/integration.ts` / `src/cli/github-composition.ts`（＋ `login` / `credentials` / `doctor` の allowlist）以外に現れないことを grep 検査する
- [x] `architecture/components.md` の archive（client-closed）/ attach / GitHubClient / composition-root 記述、`domain-model.md` の repository identity、`dynamic-model.md` の完了終端を、Git の authority と任意 GitHub 連携の境界に合わせて更新する
- [x] `architecture/divergence-status.md` に必要な差分があれば追記する

**Acceptance Criteria**:
- `invariant-catalog-parity` テストが B-19 を含む ID 集合で通る
- B-19 の regression guard（allowlist 外に呼び出しを注入すると検出される）がテストで示される
- 既存の B-1 / B-8 / B-10 / B-17 の検査がすべて通る
- architecture ドキュメントの記述が実装（無効経路の終端・identity・archive 契約）と一致する

## T-15: README / docs / guide / CLI help を実装に一致させる

- [x] `README.md` に GitHub 連携任意化の節を追加する: 設定例（`.specrunner/config.json` の `github.enabled: false`）、対応表（対応 / GitHub 連携が必要）、「GitHub 非依存 ≠ Git 非依存」（Git repository・origin・worktree・commit は必要）
- [x] `docs/configuration.md` の GitHub セクションに `github.enabled` を追加する（既定値・設定層・GHES host 設定との関係）
- [x] `specrunner guide` に GitHub 無効運用を扱う記述を追加する（`merge` topic に、無効経路では外部 merge gate が存在しないこと・`archived` が merge 済みを意味しないことを明記）
- [x] CLI help（`ARCHIVE_USAGE`）は実装（単相 archive 完了・GitHub-disabled path）と一致済み（T-09 で更新済み）

**Acceptance Criteria**:
- README の対応表が T-11 の宣言集合と一致する（テストで固定）
- README / guide に「pipeline 内部検証は同一だが、外部 forge の CI / branch protection / merge 承認は無効経路には存在しない」旨が書かれている
- `tests/readme-quickstart.test.ts` / `tests/dead-guidance.test.ts` / `hint-command-existence` 系のテストが通る
- CLI help の archive 案内が単相 archive 実装と一致する

## T-16: 実 CLI 経路の e2e fixture を追加する

- [x] bare origin（`git init --bare`）を remote に持つ一時 repository の fixture を用意する。origin は非 GitHub 形式であり、`.specrunner/config.json` に `github.enabled: false` を書く
- [x] 環境に `GH_TOKEN` / `GITHUB_TOKEN` を設定した状態でも成立することを条件に含める
- [x] `runRunCore`（`job start`）→ halt → `runResumeCore`（`job resume`）→ 完了 → `ReopenCommand.execute`（`job reopen`）→ `runResumeCore` → `runArchive`（`job archive`）を **実関数で** 駆動する。別の orchestrator / probe を新設しない
- [x] mock は外部 provider に限定する（agent SDK の query seam、verification command 実行）。git / state / pipeline / CommandRunner は実物を使う
- [x] `globalThis.fetch` を spy し、GitHub API への request が 0 件であることを assert する
- [x] git 呼び出しを記録し、`extraheader` 等の token 注入引数が 1 度も付かないことを assert する
- [x] 専用 worktree の作成、step commit/push、commit OID への binding、`synthesizedCommits` 台帳、egress 検査が維持されていることを assert する
- [x] 完了時に PR 出力が無く、branch / revision / 証跡パスが得られることを assert する
- [x] 別 clone から `runAttach`（`job attach --branch`）で checkpoint と契約を復元でき、origin identity 不一致の checkpoint が拒否されることを assert する
- [x] archive 後に remote feature branch が残り、base branch に自動 merge が起きていないことを assert する

**Acceptance Criteria**:
- start → halt/resume → 完了 → archive が非 GitHub origin・credential 不要の fixture 上で成立する
- fixture 実行中の GitHub API request が 0 件、token 注入が 0 件である
- attach による契約復元と不一致 checkpoint の拒否が検証される
- archive 後に remote branch が保存され、base branch が変更されていない
- 既存の e2e / 統合テスト（`tests/attach/attach-resume-e2e.test.ts` 等）が引き続き通る
