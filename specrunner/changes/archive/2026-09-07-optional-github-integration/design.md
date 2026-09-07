# Design: local Git 実行で GitHub 連携を任意化する

## Context

SpecRunner は現在、**Git を使うこと**と **GitHub と連携すること**を分離していない。request.md → PR の pipeline を前提に、CLI の初期化・repository identity・完了終端・job lifecycle のすべてが GitHub を必須依存として扱っている。

調査で確認した結合点（request.md の現状分析および本 design で追加確認した箇所）:

| 箇所 | 結合の内容 |
|---|---|
| `src/core/preflight.ts` | `resolveGitHubToken` を無条件に解決し、`getOriginInfo(cwd, host)` で GitHub 形式の origin を要求する |
| `src/cli/bootstrap.ts` | resume 系初期化で token 解決 → `createGitHubClient` → `createRuntime` を無条件に実行 |
| `src/cli/run.ts` / `src/cli/attach.ts` / `src/cli/archive.ts` / `src/cli/reopen.ts` / `src/cli/doctor.ts` | それぞれ独立に token 解決と client 構築を行っている（composition が 6 箇所に散在） |
| `src/core/runtime/factory.ts` | `createRuntime(config, cwd, githubClient, repo, sessionClient, githubToken)` — client と token が必須引数 |
| `src/core/runtime/local.ts` | `LocalRuntimeOptions.githubClient` が必須。`buildDeps` が `deps.githubClient / owner / repo / githubToken` を配布し、`createTransportAuth({ token })` に token を渡す |
| `src/git/remote.ts` | `getOriginInfo` が「git repo / origin の存在確認」と「GitHub owner/name 抽出」を 1 関数で行い、非 GitHub host は `REMOTE_NOT_GITHUB` で失敗する |
| `src/git/transport-auth.ts` | token があれば HTTPS origin に extraheader 注入。token 未指定なら `[]`（素の git transport） |
| `src/core/pipeline/registry.ts` / `types.ts` | standard / fast の終端が `PrCreateStep` 固定（`STANDARD_TRANSITIONS` / `FAST_TRANSITIONS` の `to: PR_CREATE` 行）。design-only は `to: "end"` |
| `src/core/step/pr-create.ts` | PR 作成 API 呼び出しと attestation コメント投稿。attestation の render は `src/core/attestation/*`（純関数）だが、**唯一の出力先が PR コメント** |
| `src/core/command/runner.ts` | `deps.githubClient.getIssue` を fidelity gate に渡し、terminal で `notifyJobTerminal(state, deps)` を呼ぶ。完了出力は `state.pullRequest?.url` があれば PR を表示 |
| `src/core/command/run-result.ts` | `awaiting-archive` → `result: "pr-created"` 固定（PR がなくても "pr-created" と名乗る） |
| `src/core/command/reopen.ts` | recorded PR 必須 ＋ GitHub API による OPEN 確認（client が無ければ fail-closed で拒否） |
| `src/core/archive/plain-archive.ts` | 既に GitHub API 非依存（record push → archived → cleanup を 1 回で完了）。ただし `src/cli/archive.ts` が push 認証用に token を best-effort 解決し、`ARCHIVE_USAGE` の案内文（「PR merge 後に再実行」）が実装と食い違っている |
| `src/core/attach/orchestrator.ts` / `verify-checkpoint.ts` | 検証は Git のみ。ただし `expectedRepo: {owner, name}` を要求し、CLI 側（`src/cli/attach.ts`）が token 解決と `getOriginInfo` を必須化している |
| `src/state/schema/types.ts` | `RepositoryInfo` が `owner: string; name: string` 必須。GitHub API identity と汎用 repository identity が同一 |
| `src/core/runtime/managed.ts` / managed-agent adapter | `githubClient.getRawFile` 等でファイルを取得し、session に repository/token を渡す。local とは別種の依存 |

一方で **Git 側の基盤はすでに forge 非依存**である。`transport-auth` は token 無しなら素通しし、fetch/push は通常の git transport で行われる。branch-borne state・commit 台帳（`synthesizedCommits`）・egress 検査・worktree 隔離・checkpoint 検証は GitHub API を使わない。

したがって本変更は「Git を外す」変更ではなく、**GitHub 連携という外部依存を、宣言された job 単位の契約として分離する**変更である。

制約:

- 既存の GitHub 有効 job の挙動・安全確認は不変でなければならない。
- 既存 state（宣言を持たない）は GitHub 有効として解釈する。
- architecture の不変条件（B-1 domain↛adapters / B-8 `config.runtime` 分岐集約 / B-10 host↔token 束縛 / B-9 status 単一 mutator）を壊さない。
- 受け入れ条件は「実 CLI 経路と既存 CommandRunner を通す」ことを要求しており、検証用の別 orchestrator を新設してはならない。

## Goals / Non-Goals

**Goals**:

- プロジェクト設定 `.specrunner/config.json` の `github.enabled: false` で GitHub 連携を無効化でき、未指定時は true（既存互換）。
- GitHub 無効 job では GitHub credential を解決せず、GitHub API client を構築せず、GitHub API を 1 回も呼ばず、非 GitHub origin へ token を注入しない（環境に GH_TOKEN 等があっても同じ）。
- start 時に解決した連携状態を branch-borne job state へ固定し、resume / reopen / attach / archive はその値で動く。config 変更で既存 job が暗黙に別モードへ移らない。
- standard / fast は GitHub 無効時に pr-create を実行せず、同じ検証・レビューを経た feature branch 出力として `awaiting-archive` に到達し、archive できる。
- Git の保証（専用 worktree・step commit/push・commit OID への verification/review binding・commit 台帳・egress 検査・checkpoint 検証）はすべて維持する。
- PR コメントが無くても attestation（証跡）を参照でき、完了出力が branch・最終 revision・証跡の所在を示す。存在しない PR を捏造しない。
- GitHub 専用オプション（`--issue` / `--from-issue` / `inbox run` / `archive --with-merge` / managed runtime との併用）は副作用の前に拒否する。
- `config effective` / `job show` / `doctor` / README / guide / CLI help / architecture が実装と一致する。

**Non-Goals**（request.md の Non-goals をそのまま引き継ぐ）:

- `.git` 不要化 / git init の隠蔽 / snapshot revision への置換（#1115・#1122 の再導入は行わない）。
- worktree 廃止、`--no-worktree` の意味変更。
- origin 不要化、fetch/push の無条件省略。base branch への自動 merge、branch protection の代替実装。
- GitLab MR 等 multi-forge API 対応（汎用 forge port を新設しない）。
- managed runtime の GitHub 非依存化（初期範囲外。不適合を事前通知するのみ）。
- 検証・レビューの省略、新しい agent step の追加、reopen からの自動 resume。
- #1104 の issue 本文同期、#1122 の artifact-output コードの復活。

## Decisions

### D1: 宣言は config の `github.enabled`、権威は job state の `githubIntegration`

- `SpecRunnerConfig.github` に `enabled?: boolean` を追加する（`github` セクションは既存の host / apiBaseUrl と同じ場所）。未指定は `true`。
- `job start` 時に config から解決した値を、branch-borne job state の新フィールド `githubIntegration: { enabled: boolean }` に記録する。
- resume / reopen / attach / archive / job show は **config を再解決せず** job state の値を読む。
- state に `githubIntegration` が無い（legacy）場合は `{ enabled: true }` として解釈する。

**Rationale**: 「宣言」と「job に固定された契約」を別レイヤに置かないと、config を後から変えるだけで実行中 job の安全確認（PR gate・identity 照合）を迂回できてしまう。既存の `profile` / `reviewers` / `pipelineId` / `noWorktree` が同じ「start 時に決めて state に凍結する」形をとっており、`state/profile.ts` の `getProfile()`（絶対値が無ければ標準値）という前例がある。`runtime: local|managed` に相乗りしないのは、agent 実行基盤と外部連携が独立の軸だから（local + GitHub 有効 / local + GitHub 無効 の 2 通りが必要）。

**Alternatives considered**:
- `runtime` enum に値を足す（例 `local-nogithub`）→ 2 軸を 1 軸に潰し、将来 managed × 無効の組合せが表現できない。B-8 の分岐集約点にも外部連携の意味が混ざる。却下。
- CLI の一時上書き flag（`--no-github`）→ request.md が「初期対応に必須としない」と明記。job 固定の権威が曖昧になるため初期範囲外。
- request.md Meta での宣言 → request は「何を作るか」であり実行環境の宣言ではない。却下。

### D2: 解決 seam を「config resolver」と「state accessor」の 2 つに固定する

- `src/config/github-integration.ts`（新規、`github-host.ts` と同層）:
  - `resolveGitHubIntegrationConfig(config): { enabled: boolean }` — 未指定は enabled。
  - `traceGitHubIntegration(loadResult): { enabled: boolean; source: "project-local" | "user-global" | "default" }` — `loadConfigWithSourceMetadata` が返す 2 層の raw layer から設定元を判定する（`config effective` 用）。
- `src/state/github-integration.ts`（新規、`state/profile.ts` と同型）:
  - `getGitHubIntegration(state): { enabled: boolean }` — フィールド不在は `{ enabled: true }`。

**Rationale**: 「どこから読むか」を 2 関数に集約すると、`config.github?.enabled` の直接参照が散らばらず、B-8 と同種の grep 検査（D9 の B-19）で境界を守れる。`state/profile.ts` の `getProfile` と対称にすることで、legacy 解釈のルールが 1 箇所に閉じる。

**Alternatives considered**: 各 call site で `config.github?.enabled !== false` を書く → 判定の言い換えが増え、legacy 解釈（state 不在 = 有効）と config 解釈（未指定 = 有効）が混ざる。却下。

### D3: 認証と client 構築を「core の解決」と「CLI の composition」に分け、無効時は到達させない

- core 側（adapter 非依存）: `src/core/github/integration.ts`（新規）に
  `resolveJobGitHubIntegration({ config, cwd, env, enabled })` を置き、戻り値を判別可能な union にする。
  - `{ enabled: false; origin: RepositoryOrigin }` — token を解決せず、GitHub host も参照しない。
  - `{ enabled: true; token; tokenSource; host; apiBaseUrl; repository: { owner; name }; origin }` — 既存の `resolveGitHubToken(env, { host })` と GitHub origin 解析を、この 1 箇所からのみ呼ぶ。
- CLI 側（composition root）: `src/cli/github-composition.ts`（新規）が上記 union を受け取り
  `{ githubClient: GitHubClient | null, githubToken: string | undefined, repository, origin, enabled }` を返す。`createGitHubClient(fetch, token, apiBaseUrl)` の呼び出しは **enabled === true の分岐内のみ**。
- `preflight` / `bootstrap` / `attach` / `archive` / `reopen` / `doctor` は自前の token 解決・client 構築をやめ、この seam を通す。
- transport auth は無効時に `createTransportAuth({ token: undefined, cwd })` で構築する（`buildTransportAuthArgs` は token 不在で `[]` を返すため、素の git transport = SSH / credential helper に委ねられる）。`LocalRuntime` は `githubToken` を `""` ではなく `undefined` で保持できるようにする。

**Rationale**: B-1（core ↛ adapters）を守るため、adapter を触る composition は CLI 側に置かざるを得ない。一方 token 解決とホスト解決は core にあり preflight から使われる。2 分割は既存の層構造をなぞる最小形であり、「巨大な GitProvider / runtime facade を新設しない」という要求とも整合する。B-10（全 `resolveGitHubToken` に host、全 `createGitHubClient` に baseUrl）は call site が減るだけで維持される。

**Alternatives considered**:
- 汎用 `ForgeProvider` port を新設して GitHub/none を実装で切り替える → 未使用の抽象を増やし（`model.md` §1 の non-goal）、multi-forge 対応と誤解される。却下。
- `GitHubClient` の全メソッドが throw する no-op 実装を注入して型を非 null に保つ → 「呼ばない」ことを型で表現できず、誤って呼んだときに初めて壊れる。`githubClient: GitHubClient | null` にして consumer 側で明示的に扱う方が fail-loud。却下（ただし D5 の `requireGitHubRepository` と同様、GitHub 専用 consumer は明示 throw で統一する）。

### D4: `src/git/remote.ts` を「汎用 origin」と「GitHub origin」に分ける

- 追加: `getOriginUrl(cwd): Promise<string>` — git repo / origin 未設定の判定（`NOT_GIT_REPO` / `ORIGIN_NOT_CONFIGURED`）だけを行い、生の remote URL を返す。
- 追加: `normalizeOriginIdentity(remoteUrl): RepositoryOrigin` — credential（userinfo）を除去し、scheme / port / 末尾 `.git` / 末尾スラッシュを落として `host/path`（host 無しの local path はパスのみ）に正規化した `url` と、その SHA-256 を `digest` として返す純関数。
- 既存 `getOriginInfo(cwd, host)` は「GitHub 形式要求」の意味を維持したまま `getOriginUrl` + `parseRemoteUrl` の合成として残す（既存の error code / test を壊さない）。GitHub 有効経路のみが呼ぶ。

**Rationale**: 汎用 identity は「origin があること」しか要求してはならず、GitHub owner/repo 形状の要求は GitHub 経路の関心である。関数を分けることで、無効経路が `REMOTE_NOT_GITHUB` を経由し得ないことが構造で保証される。正規化で scheme と port を落とすのは、同一 repository を machine A が HTTPS、machine B が SSH で clone しているケースで attach の identity 照合が誤って失敗しないようにするため（Risk 参照）。

**Alternatives considered**: `parseRemoteUrl` の host 制約だけ外す → request.md が明示的に禁止（token 解決を残したまま host 制約を外すと非 GitHub host へ token を注入し得る）。却下。

### D5: repository identity を「汎用 origin identity」と「GitHub API identity」に分離する

- `RepositoryInfo` を次の形にする:
  - `owner?: string` / `name?: string` — **GitHub API identity**。GitHub 有効 job でのみ存在する。
  - `origin?: RepositoryOrigin`（`{ url: string; digest: string }`）— 汎用 identity。新規 job では有効・無効を問わず常に記録する。
- 型を optional にしたうえで、`validateJobState` に意味規則を入れる:
  - `githubIntegration` 不在（legacy）または `enabled === true` → `owner` / `name` は非空文字列必須。
  - `enabled === false` → `owner` / `name` は不在必須（架空値を書けない）、`origin` 必須。
- GitHub 専用 consumer 用に `requireGitHubRepository(state): { owner, name }` を用意し、契約違反時は `GITHUB_INTEGRATION_DISABLED` の `SpecRunnerError` を投げる。既存 consumer（reopen の PR 照会 / issue notifier の compare URL / resume の bootstrap 引数）はこの funnel を通す。
- state / log に remote URL の credential を書かないことは、`normalizeOriginIdentity` が userinfo を落とすことで担保する。

**Rationale**: 「架空の owner/name を埋めない」ことを型と validation の両方で表す。optional 化は producer（既存の `repository: {owner,name}` 構築）に対して後方互換であり、consumer 側だけが明示的な扱いを強制される。consumer は本変更で GitHub 専用と判定した 6 箇所しかなく（`state.repository.owner|name` の非 test 参照は 6 件）、型エラーが出る場所がそのまま「GitHub 専用の境界」になる。

**Alternatives considered**:
- `owner`/`name` を必須のまま空文字列 sentinel にする → 型上は "ある" ので consumer が無検査で GitHub API に渡せてしまい、空 owner で API を叩く事故が型で防げない。却下。
- `RepositoryInfo` を discriminated union にする（`{kind:"github",...} | {kind:"git",...}`）→ 既存 state の JSON 形（`{owner,name}`）に `kind` が無く、読み取り時の正規化が全 consumer に波及する。additive な optional 拡張より互換コストが高い。却下。

### D6: 完了終端は既存の descriptor 合成点で選択する（新 step / 新 pipeline を作らない）

- `src/core/pipeline/apply-github-integration.ts`（新規）に `applyGitHubIntegration(descriptor, contract): PipelineDescriptor` を置く。
  - `contract.enabled === true` → `descriptor` をそのまま返す（参照同一。ゼロオーバーヘッド）。
  - `contract.enabled === false` → `steps` から `pr-create` を除去し、`to: PR_CREATE` の transition 行をすべて `to: "end"` に書き換え、`step: PR_CREATE` の行と `roles[PR_CREATE]` を除去した新 descriptor を返す。
- 適用点は `buildPipelineForJob` / `runPipeline` の既存合成列（`getPipelineDescriptor` → `applyScopeConfig` → **`applyGitHubIntegration`** → `composeReviewerDescriptor`）。入力は `deps.config` ではなく **jobState**（`getGitHubIntegration(jobState)`）。
- design-only は元から `pr-create` を含まないため、変換は恒等になる（profile の意味を変えない）。
- `resume --from pr-create` は `buildAllowedStepSet` に契約を渡して許可集合から `pr-create` を外し、実行前に usage エラー（exit 2）で拒否する。
- 変換後は `adr-gen success/skipped → end`（standard）、`conformance approved → end` / `verification passed(conformance 済) → end`（fast）になり、`Pipeline` の既存 terminal 処理が `running → awaiting-archive` 遷移 + `commitFinalState`（checkpoint push）を行う。**terminal 処理そのものには一切手を入れない**。

**Rationale**: `applyScopeConfig` が「descriptor をデータとして変換する」前例を既に作っており、同じ形に載せれば pipeline engine・state machine・step 定義に触らずに終端だけを選べる。step を足さない・pipeline id を足さないので、`config effective` / prompts / registry / resume の step 名空間も無傷。

**Alternatives considered**:
- `standard-nogithub` / `fast-nogithub` pipeline id を追加 → 「別の弱い pipeline を作らない」に反し、profile が 2 倍に増える。却下。
- `PrCreateStep` に skipWhen を持たせて "skipped" verdict を返す → step は実行され state に記録が残り、「PR 作成 step を通った」ように見える。descriptor から消す方が honest。却下。
- 変換入力を `deps.config` にする → config を変えると実行中 job の終端が変わり、D1 の「暗黙移行禁止」に反する。却下。

### D7: PR が無いときの証跡は branch artifact として残す

- `specrunner/changes/<slug>/attestation.md` を新しい pipeline-managed artifact とする（`pipelineManagedPaths(slug)` に追加。既存の state.json / events.jsonl / usage.json / pr-create-result.md と同じ扱い＝ agent は書けず、terminal commit で staging される）。
- 生成は `LocalRuntime.commitFinalState` の中、git staging の直前。条件は **status が `awaiting-archive` かつ job 契約が無効** のときのみ。内容は既存の純関数 `buildAttestation({ journalContent, usage })` + render（PR コメント用 renderer を Markdown 文書 renderer と共有できる形に切り出す）で作る。書き込み失敗は warn のみ（terminal 遷移と push を止めない）。
- 完了出力（`src/core/command/runner.ts` の `handleResult`）は、契約が無効な `awaiting-archive` のとき PR 行の代わりに branch / 最終 revision / 証跡の所在を出す。最終 revision は `state.synthesizedCommits` の最終 OID（finalize commit）を使い、無ければ revision 行を出さない（捏造しない）。
- `RunResultContract`（`--json`）は `schemaVersion: 1` のまま `result` に `"branch-published"` を追加し、`branch` / `revision` / `githubIntegration` を additive に追加する。GitHub 有効 job の出力は 1 byte も変えない（`"pr-created"` / `prUrl` はそのまま）。

**Rationale**: 「attestation の利用可能性を維持する」ためには、PR コメント以外の到達可能な場所が要る。events.jsonl / usage.json は既に branch に載っているので、そこから導出した文書を同じ checkpoint commit に載せれば、別 checkout からも `git show` で参照できる。CLI step も agent step も増やさず、既存の terminal seam に相乗りするのが最小。

**Alternatives considered**:
- 新しい CLI step（`branch-publish`）を descriptor に足す → step 名空間・resume の `--from` 候補・prompts の pipeline map まで波及し、「新 step を作らない」要求の趣旨に反する。却下。
- attestation を出さず「events.jsonl を読めば導出できる」とする → 「証跡の所在を示す」要求を満たすには利用者に導出手順を強いる。却下。
- 全 job（有効も）で attestation.md を出す → 既存 job の成果物が変わる（本 Issue は既存挙動維持が条件）。Open Question に送る。

### D8: job lifecycle の GitHub gate は job 契約でのみ発火する

- **reopen**: status gate（`awaiting-archive` のみ）・`--reason` 必須・operator event の先行 append・`allowReopen` opt-in（B-17）は不変。`state.pullRequest` 必須と PR OPEN 確認は `getGitHubIntegration(state).enabled === true` のときだけ実行する。CLI（`src/cli/reopen.ts`）は job state を先に解決し、無効なら client を構築しない。
- **archive**: plain archive（record push → archived → cleanup）は現状のまま。`src/cli/archive.ts` は job state から契約を読み、無効なら push 認証用 token の best-effort 解決も行わない。`--with-merge` / `--merge-wait-ms` は無効 job で副作用前に拒否する（exit 2）。push 失敗時に archived にしない・cleanup しない既存の安全条件は不変。`deleteRemoteBranch: false` も不変（remote branch 保存）。
- **attach**: 検証は Git のみのまま。`verifyCheckpoint` の `expectedRepo` を `{ github?: {owner,name}; origin: RepositoryOrigin }` に拡張し、
  - checkpoint の契約が有効（または `githubIntegration` 不在の legacy）→ **GitHub identity の一致を要求**する。invoker 側 config が無効でも緩めない。GitHub identity を invoker 側で作れない場合は `checkpointNotAttachableError`（fail-closed）。
  - checkpoint の契約が無効 → `state.repository.origin.digest` と invoker 側 origin digest の一致を要求する。
  - 不一致・identity 不在はいずれも既存と同じ「local state を一切作らずに拒否」。
  - fetch/read までの transport は invoker 側 config の契約で構成し、検証後の materialize / 以降の runtime は **checkpoint の契約**で構成する（invoker config で job の契約を上書きしない）。

**Rationale**: gate の発火条件を job 契約に紐づけることで、「config を変えて invoker 側から安全確認を外す」経路を塞ぐ。reopen と resume の責務分離（reopen は遷移のみ）は変えない。

**Alternatives considered**: reopen で「PR が state に無ければ gate skip」とする → GitHub 有効 job が pr-create 前に awaiting-archive になり得ないとは限らず、gate の意味が状態依存で揺れる。契約で判定する方が明示的。却下。

### D9: command capability の境界を registry に宣言し、dispatch と job の 2 段で拒否する

- `CommandSpec` に `requiresGitHub?: boolean` を、flag 定義に `githubOnly?: true` を追加する（help 表示にも反映）。宣言対象は `start --issue` / `start|resume|archive --from-issue` / `inbox run` / `archive --with-merge` / `archive --merge-wait-ms`。`login` / `credentials set` は宣言しない（GitHub 用の明示コマンドとして残るが、GitHub 無効 job の前提にはしない）。
- **dispatch gate**（`bin/specrunner.ts`、`worktreeGuard` / `requiresRepo` と同じ位置）: プロジェクト config の契約が無効なら、宣言のある command / flag を handler 実行前に拒否する（exit 2、「この操作は GitHub 連携が必要」＋設定箇所の提示）。job も worktree も作られない。
- **job gate**（handler 内）: 既存 job を対象にする操作（`archive --with-merge` など）は、config が有効でも **job 契約が無効なら**拒否する。
- **registry 整合の歯**: 宣言集合とドキュメントの対応表が一致することをテストで固定し、宣言の無い新規 GitHub 専用 command が黙って通らないようにする。
- **B-19（新規 architecture 不変条件）**: `resolveGitHubToken` / `createGitHubClient` の呼び出しが D3 の 2 モジュール（＋ `login` / `credentials` / `doctor` の allowlist）以外に現れないことを grep 検査で固定する。`architecture/model.md` §4 と `architecture/conformance.md` (A) 表に B-19 を追加し、`invariant-catalog-parity` の ID 一致を保つ。

**Rationale**: 「registry/help と実際の capability 判定が食い違わない」を満たすには、判定の入力が registry の宣言そのものである必要がある。dispatch gate だけでは既存 job の契約を見られず、job gate だけでは worktree 作成前に止められないため 2 段にする。B-19 は「将来追加される GitHub 専用 command が暗黙に実行されない境界」を機械的に守る歯。

**Alternatives considered**: 各 handler 冒頭で個別に判定 → 宣言と実装が二重管理になり、help と実挙動が乖離する（まさに request が禁じた状態）。却下。

### D10: doctor は契約に応じて検査集合を選ぶ

- 契約が無効のとき: `github-token-present` / `github-token-valid` / `github-client-id` / `github-origin` を検査集合から外し、doctor 自身も token 解決と client 構築を行わない。
- 代わりに汎用の `git-origin`（origin が設定されていること）を検査する。`git` / repo / agent 実行系（node / package manager / provider aliveness）の検査は不変。
- 出力に「GitHub integration: disabled（設定元）」を明示し、外した検査を「不要」として提示する（fail や warn にしない）。

**Rationale**: doctor が「必要条件の診断」である以上、必要でないものを fail にしてはならない。一方で外したことを黙らせないために表示する。

### D11: managed × GitHub 無効の拒否は `createRuntime` に置く

- `createRuntime` は `config.runtime === "managed"` かつ契約が無効なら `SpecRunnerError`（`GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME`）を投げる。start / resume ともに job state 作成・worktree 作成の前に到達する。

**Rationale**: B-8 は「`config.runtime` の分岐を `createRuntime` 以外（domain / CLI）に作らない」ことを grep で強制している。preflight や CLI に managed 判定を足すと不変条件違反になる。既存の唯一の分岐点で拒否すれば、新しい分岐も allowlist 追加も不要。

### D12: 表示・文書・architecture を実装に追従させる

- `config effective`: 解決した `github.enabled` と設定元（project-local / user-global / default）を human / JSON 双方に出す。
- `job show` / 起動ログ: job に固定された連携状態を表示する。
- CLI help: `ARCHIVE_USAGE` の「PR merge 後に再実行」という記述を現行の単相 archive 実装に合わせて訂正し、GitHub 無効時の完了形（record push → archived → cleanup、remote branch 保存、統合は利用者）を追記する。
- README / `docs/configuration.md` / `specrunner guide`: 対応表・設定例・「GitHub 非依存 ≠ Git 非依存」の区別を記述する。archived は「main に merge 済み」を意味しないこと、CI / branch protection / merge 承認は GitHub 有効経路の外部 gate であり無効経路では実施されない（が pipeline 内部の検証は同一）ことを明記する。
- `architecture/components.md`（archive / attach / GitHubClient / composition-root 記述）、`domain-model.md`（RepositoryInfo と job 契約）、`dynamic-model.md`（完了終端の 2 形）を Git の authority と任意 GitHub 連携の境界に合わせて更新する。ADR は adr-gen に委ねる（本 design では ADR の path / ファイル名を指定しない）。

## Risks / Trade-offs

- **[origin 正規化が過剰に一致する / 足りない]** → scheme・port・userinfo・`.git` を落として `host/path` に正規化するため、同一 host・同一 path の別 forge を区別しない。identity 照合は「別 checkout で同じ repository を指しているか」の確認であり、security boundary ではない（Git の checkpoint 検証本体は commit OID と journal 整合で担保）。逆に正規化不足だと HTTPS clone と SSH clone で attach が誤って拒否されるため、過少一致より過剰一致側に倒す。正規化規則は純関数として単体テストで固定する。
- **[`githubClient: GitHubClient | null` の波及]** → 非 null 前提の consumer が silent に壊れる恐れ。`requireGitHubRepository` / 明示 null 分岐に funnel し、`notifyJobTerminal` は client 不在なら no-op（issue 連携は GitHub 有効時のみ）、fidelity gate は client 不在かつ issueNumber ありなら fail-closed（halt）とする。型エラーが出る箇所をすべて列挙して潰す。
- **[descriptor 変換の誤適用]** → 有効 job から pr-create が消えると PR が作られなくなる。`applyGitHubIntegration` は enabled 時に **base を参照同一で返す**契約とし、参照同一性と transition 表の完全一致をテストで固定する。
- **[attestation 書き込み失敗で完了が壊れる]** → best-effort（warn のみ）。完了出力は「ファイルが存在するときだけ」証跡パスを表示する。terminal 遷移・push・archive は attestation の有無に依存しない。
- **[`pipelineManagedPaths` への追加の副作用]** → agent の deny path・round staging の partition・worktree reconcile が同じリストを参照する。追加は「pipeline が書き agent が書かない」ファイルとして意味的に整合するが、各 consumer への影響をテストで確認する。
- **[legacy state の解釈揺れ]** → `githubIntegration` 不在 = 有効、を `getGitHubIntegration` 1 箇所に閉じる。validation で「不在 or enabled なら owner/name 必須」を強制し、legacy state が無効契約として読まれないようにする。
- **[検証の近道（別 orchestrator の新設）]** → 受け入れ条件で明示的に禁止されている。e2e は `runRunCore` / `runResumeCore` / `ReopenCommand` / `runArchive` の実関数を bare origin fixture 上で駆動し、mock は外部 provider（agent SDK query seam・verification command 実行）に限定する。
- **[architecture 歯の破壊]** → B-10（host/baseUrl 引数）は call site が減っても維持、B-8（runtime 分岐）は `createRuntime` 内に置く、B-19 追加時は `invariant-catalog-parity` の ID 集合（model.md §4 / conformance.md / core-invariants.test.ts）を同時更新する。
- **[GitHub 無効経路の検証が「CI 済み」に見える]** → 完了出力・README・guide で「pipeline 内部検証は同一」「外部 forge の CI / branch protection / merge 承認は無効経路には存在しない」を分けて記述する。archived が merge 済みを意味しないことも同じ場所に書く。

## Open Questions

- attestation.md を GitHub 有効 job でも常時生成するか（証跡形式の統一 vs 既存成果物の不変）。初期実装は無効 job 限定とし、統一は別 Issue の判断に委ねる。
- `RunResultContract` に `branch` / `revision` / `githubIntegration` を additive 追加するにあたり、`schemaVersion` を 1 のまま据え置く方針でよいか（既存 consumer は `schemaVersion === 1` を前提にしている）。本 design は据え置きを採用する。
- origin identity を `RepositoryOrigin.url`（正規化済み・credential 除去済み）として state に保存することの是非。digest のみに絞ると `job show` / 失敗メッセージでの可読性が落ちるため、本 design は両方保存する。
- 複数 remote（origin 以外）や origin 差し替え時の identity 更新ポリシーは初期範囲外（origin 固定）。

## Migration Plan

- state / config ともに **additive な optional フィールドのみ**を追加する。既存 state ファイルの書き換え（migration）は行わない。
- 既存 state（`githubIntegration` 不在）は GitHub 有効契約として読まれ、`owner` / `name` は従来どおり必須として検証される。
- 新規 job は有効・無効を問わず `repository.origin` を記録する。無効 job のみ `owner` / `name` を持たない。
- ロールバック: 本変更を revert しても、追加された optional フィールドは旧コードから無視されるだけで読み取り互換が壊れない（ただし revert 後は無効 job を実行できないため、無効 job は archive 済みにしてから戻す運用を README に注記する）。
