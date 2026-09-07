# local Git実行でGitHub連携を任意化する

## Meta

- **type**: new-feature
- **slug**: optional-github-integration
- **base-branch**: main
- **adr**: true

## 背景

本来の要求は「GitHubと連携しなくてもSpecRunnerを実行できる」ことであり、Git自体を不要にすることではない。#1115 / #1122 はその境界を誤って拡張したもので、#1124でrevert済み。本Issueはそのsnapshot / artifact-output実装を再導入しない。

Git repository、worktree、branch、commit OID、差分検査、commit台帳、branch-borne checkpointは既存の実行基盤として維持する。GitHubを使わないことと、Git remoteを使わないことも別である。本Issueの初期範囲は **local runtime + 利用可能なorigin remote**。remote不要化やローカルbase branchへの自動mergeは含めない。

## 目的

プロジェクト設定でGitHub連携を無効にすると、GitHub token・gh login・GitHub API・GitHub形式のrepository URLを要求せず、requestファイルから既存pipelineを実行し、通常のGit remote上のfeature branchへ検証・レビュー済みの変更と記録を届けられること。

GitHub連携が有効な既存jobの挙動は維持する。GitHub連携なしでも通常のstart / resume / reopen / attach / archiveというjob lifecycleを使えるようにする。

## 再調査で確認した現状

調査基準: main `6c37dc52027be8ff6f6a699a73e5a959b9ea7cfa`。

- `src/core/preflight.ts`: GitHub tokenを無条件に解決し、`getOriginInfo`でGitHub形式のoriginを要求。
- `src/cli/bootstrap.ts` / `src/core/runtime/factory.ts`: resumeを含む初期化でGitHubClient/tokenを必須化。
- `src/git/remote.ts`: Git remote確認とGitHub owner/name抽出が混在。
- `src/git/transport-auth.ts`: tokenなしなら通常のGit transportへ通過できる。fetch/push自体はGitHub APIではない。ただしtokenを渡すとHTTPS originに注入するため、host制約だけ外して既存token解決を残してはならない。
- `src/core/pipeline/types.ts` / `registry.ts`: standard / fastの終端はpr-create固定。design-onlyは別の終端を持つ。
- `src/core/step/pr-create.ts`: PR API呼び出しとattestationコメント投稿を実行。
- `src/core/attach/orchestrator.ts`: checkpoint取得・検証は既にGitのみ。主な結合はCLIの認証初期化とrepository identity。
- `src/core/command/reopen.ts`: recorded PR必須かつOPEN確認必須。job lifecycleとGitHub公開状態が結合。
- `src/core/archive/plain-archive.ts`: 既にGitHub API非依存で、record commit/push → archived → cleanupを1回で実行する。PR mergeを待たない。CLI helpの「merge後に再archive」は実装と不一致なので、本Issueで触れる案内は現行実装を基準に直す。
- `src/core/runtime/managed.ts` / managed-agent adapter: GitHub経由のファイル取得やsessionへのrepository/token渡しがあり、localとは別の依存。
- `src/state/schema/types.ts`: repository identityがowner/name必須。GitHubなしで架空のowner/nameを埋めて済ませてはならない。

したがって、Git transport/provider層だけの修正では成立しない。既存のconsumer-owned capabilityを活用し、構成・認証・公開終端・job lifecycleのGitHub依存を分離する。

## ユーザーストーリー

### 1. GitHubを使わずrequestファイルから実行する

利用者は通常のGit repositoryとoriginを用意し、GitHub連携を無効に設定する。GitHub credentialがない環境でも `job start <slug|file>` が専用worktreeを作成し、既存の設計・実装・検証・レビューを実行する。

stepごとのcommit/pushとcommit OIDに基づく証跡は維持する。完了時にはPRを作らず、feature branch・最終revision・結果/証跡の所在を表示し、archive可能な状態になる。存在しないPRのURLや「PR作成成功」を捏造しない。

### 2. halt後に再開・完了後に追加修正する

`job resume <slug>` と既存のoperator入力を利用できる。完了後・archive前は `job reopen <slug> --reason ...` で再開可能な状態に戻し、別操作のresumeで追加修正する。

GitHub無効jobのreopenにPR存在・OPEN確認は要求しない。既存のstatus gate、reason必須、journal記録、reopenとresumeの責務分離は維持する。GitHub有効jobのPR安全確認は残す。

### 3. 別checkoutからcheckpointを引き継ぐ

push済みのquiescent checkpointを `job attach --branch <branch>` で取得できる。GitHub IssueやDevelopmentリンクは使わない。repository/job/branch identity、journal整合性、resume入力の検証は維持する。

### 4. Gitだけでarchiveを完了する

`job archive <slug>` はfeature branchへarchive recordをcommit/pushし、archived遷移とcleanupを行う。remote feature branchを保存し、後続の統合は利用者が行う。base branchへの自動mergeはしない。

push失敗時はarchive完了にせず、未送信の成果物・記録をcleanupで失わない。archivedは「mainへmerge済み」を意味しない。

### 5. GitHub専用操作の指定ミスにすぐ気付く

GitHub無効設定でIssue起点オプションやPR mergeを指定すると、job/worktree作成前に「この操作はGitHub連携が必要」と具体的に通知する。黙って無視したり途中まで実行してから止まったりしない。

## 設計要求

### 1. 宣言とjob単位の固定

プロジェクトの `.specrunner/config.json` で `github.enabled: false` を宣言する。未指定はtrueとして既存互換を維持する。

- `runtime: local` はagent実行基盤、`github.enabled` は外部連携。別の軸として扱う。
- start時の解決値をbranch-borne job stateへ保存し、resume / reopen / attach / archiveはそのjobの値を使う。
- configを後から変えても、既存jobを暗黙に別モードへ移行しない。既存stateで宣言がないjobはGitHub有効として扱う。
- attachではcheckpointから保存済み契約を復元する。既存のGitHub有効jobに必要な確認を、invoker側config変更だけで迂回できないようにする。
- config schema、state schema/validation、必要なcheckpoint整合性検証へ反映する。
- 初期対応にCLI一時上書きflagやrequest本文の宣言を増やすことは必須としない。

### 2. GitとGitHubの認証・identityの分離

- GitHub無効jobではGitHub credentialを解決・検証せず、GitHubClientを構築・呼び出ししない。環境にGH_TOKEN/GITHUB_TOKENや保存済みcredentialがあっても同じ。
- Git remoteの認証は通常のSSH/credential helper等に委ねる。GitHub tokenを非GitHub originへ注入しない。
- originはGitHub hostやowner/repo形状に固定しない。通常のGit transportとして扱い、特定forgeのAPI互換性は要求しない。
- generic repository identityとGitHub API用owner/nameを区別する。checkpoint照合を削除せず、別checkoutでも照合できる契約と既存state互換を定義する。remote URLに含まれるcredentialをstate/logへ保存しない。
- GitHub無効はGit transport無効ではない。fetch/push、base revision選択、worktree隔離、commit台帳・egress検査を一括no-opにしない。

### 3. 完了契約

- standard / fastではGitHub無効時にpr-createを実行せず、同じ検証・レビューを経たfeature branch出力として完了する。
- GitHub APIを呼ばないためだけに新しいagent stepや別の弱いpipelineを作らない。既存構成点で公開終端を選択する。
- design-only等、元からPR終端ではないprofileの意味は変えない。
- terminal state/checkpointのcommit/push、完了出力、attestationの利用可能性を維持する。PRコメントへの投稿がなくても証跡を参照できること。
- `resume --from pr-create` 等、無効な終端の明示指定は実行前に拒否する。

### 4. コマンド契約

| コマンド/オプション | GitHub無効jobでの契約 |
|---|---|
| job start <slug\|file> / run alias | 対応 |
| job resume <slug> | 対応 |
| job reopen <slug> --reason ... | 対応。job lifecycleの条件を用い、PR gateはGitHub有効jobに限定 |
| job attach --branch | 対応。既存のGit checkpoint検証を維持 |
| job archive <slug> | 対応。record push → archived → cleanup、remote branchは保存 |
| job ls/show/wait/stats、usage | 対応。存在しないPRの確認や案内を行わない |
| job cancel/prune、doctor repair | 既存のGitベース操作と安全条件を維持。GitHub credentialは要求しない |
| request *、rules/reviewers、config、guide | 維持 |
| --detach / --json / --prompt / --prompt-file / --force / --apply-canon / --adopt-commits / --wontfix / --wontfix-reason | 既存の意味・排他条件を維持 |
| --no-worktree | 既存の意味を維持。GitHub非依存化の必須条件にしない |
| start --issue、start/resume/archive --from-issue、inbox run | GitHub連携が必要として事前拒否 |
| archive --with-merge / --merge-wait-ms | GitHub連携が必要として事前拒否 |
| login | GitHub用の明示コマンドとして残すが、GitHub無効jobの前提にしない |
| managed runtimeでGitHub無効 | 初期範囲外。job作成前に不適合を通知 |

command registry/helpと実際のcapability判定が食い違わないようにする。将来追加されるGitHub専用commandが暗黙に実行されない境界を定義する。汎用の巨大なGitProviderやruntime facadeを新設して全責務を集めない。

### 5. 利用者への表示・文書

- `config effective` に解決したGitHub連携設定と設定元を表示。
- `job show` / 開始ログにjobへ固定した連携状態を表示。
- `doctor` はGitHub無効時にGitHub token/API/host検査を不要扱いとする。Git・origin・agent実行の必要条件は検査する。
- README / guide / CLI helpに対応表と設定例、GitHub非依存とGit非依存の違いを記載。
- architectureのcomponents / domain / dynamic model等を、Gitのauthorityと任意のGitHub連携の境界に追従させる。
- GitHub有効経路だけにあるCI/branch protection/merge gateを、無効経路でも実施済みと表示しない。pipeline内部の検証は維持し、外部forge上のmerge承認・CIとは区別する。

## Non-goals

- .git不要化、git initの隠蔽、snapshot revisionへの置換
- worktree廃止、既存--no-worktreeの意味変更
- origin不要化、fetch/pushの無条件省略
- base branchへの自動merge、branch protectionの代替実装
- GitLab MR等のmulti-forge API対応
- managed runtimeのGitHub非依存化
- 検証・レビューの省略、新しいagent step、reopenからの自動resume
- #1104のIssue本文同期機能の実装
- #1122のartifact-outputコードの復活

## Acceptance Criteria

- [ ] GitHub credentialなし・GitHub API到達不可・非GitHub originのfixtureで、local start → halt/resume → 完了 → archiveが成立する
- [ ] 上記fixtureは `job start` / `job resume` / `job reopen` / `job archive` の実CLI経路と既存CommandRunnerを通して成立させる。別のorchestratorやprobeを新設して成立させることは不可
- [ ] GitHub無効かつcredentialが環境/保存先に存在するケースでも、SpecRunnerのGitHub API呼び出しとtoken注入がゼロ
- [ ] 専用worktree、step commit/push、commit OIDへのverification/review binding、staging/egressの安全条件が維持される
- [ ] standard/fast完了時にPRがなくてもarchive可能で、branch・revision・証跡の所在が得られる
- [ ] GitHub無効jobをreopenしてから別操作のresumeで追加修正できる
- [ ] 別checkoutからattach --branchでcheckpointと保存済み連携契約を復元でき、不一致checkpointは拒否される
- [ ] archiveはremote branchへ記録を残して1回で完了し、push失敗時は成果物を失わない。base branchを自動mergeしない
- [ ] GitHub専用オプション/managedとの不適合が副作用前に通知される
- [ ] 設定変更による既存jobの暗黙移行がなく、legacy stateはGitHub有効の契約を保つ
- [ ] GitHub有効時のIssue/PR/reopen/merge/managedの挙動と安全確認が維持される
- [ ] config effective / job show / doctor / README / guide / architectureが実装と一致する
- [ ] SpecRunner内で必要な検証を実行し、その証跡をPRへ提示する。レビュー側では同じtest/lint/typecheckを重複実行しない

## Stop Conditions

Gitの保証を弱める、無効jobにGitHub APIを要求する、成果物消失につながるcleanupを許容する、または上記Non-goalsへ範囲を広げないと成立しない場合は、実装を止めて観測事実と必要な選択を報告する。

規模の都合でコマンド契約表やAcceptance Criteriaの一部を落とす必要が生じた場合も、黙って範囲を縮小せず、落とした行とその理由をIssueへ報告して停止する。
