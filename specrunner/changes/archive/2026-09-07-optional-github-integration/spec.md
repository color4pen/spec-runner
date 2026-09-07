# Spec: local Git 実行で GitHub 連携を任意化する

## Requirements

### Requirement: GitHub 連携の宣言と既定値

The system SHALL read the project configuration key `github.enabled` from `.specrunner/config.json` (deep-merged over the user global config) and MUST treat an absent value as `true`, so that existing projects keep the current GitHub-integrated behavior without editing any configuration.

#### Scenario: 未指定は有効

**Given** プロジェクトの config に `github.enabled` が書かれていない
**When** 設定解決を行う
**Then** 解決された GitHub 連携状態は `enabled: true` になり、設定元は `default` として報告される

#### Scenario: project local で無効を宣言する

**Given** `.specrunner/config.json` に `{"github": {"enabled": false}}` が書かれている
**When** 設定解決を行う
**Then** 解決された GitHub 連携状態は `enabled: false` になり、設定元は `project-local` として報告される

#### Scenario: 不正な型は config error になる

**Given** `.specrunner/config.json` に `{"github": {"enabled": "no"}}` が書かれている
**When** 設定を読み込む
**Then** `CONFIG_INVALID` の検証エラーになり、job は開始されない

---

### Requirement: 連携状態を job に固定する

The system SHALL record the GitHub integration contract resolved at `job start` into the branch-borne job state, and every subsequent lifecycle operation (`resume` / `reopen` / `attach` / `archive` / `show`) MUST use the recorded value instead of re-resolving the configuration. A job state without the recorded field MUST be interpreted as GitHub-enabled.

#### Scenario: start 時の値が state に固定される

**Given** config が `github.enabled: false` を宣言している
**When** `job start <slug>` が job state を作成する
**Then** job state に GitHub 連携が無効である契約が記録される

#### Scenario: config を後から変えても既存 job は移行しない

**Given** GitHub 無効として開始され halt した job がある
**And** その後 config が `github.enabled: true` に変更された
**When** `job resume <slug>` を実行する
**Then** その job は引き続き GitHub 無効の契約で実行され、GitHub credential も GitHub API も要求されない

#### Scenario: legacy state は GitHub 有効として扱われる

**Given** GitHub 連携の宣言を持たない既存の job state がある
**When** その job の連携契約を解決する
**Then** 契約は `enabled: true` になり、GitHub 有効 job と同じ確認が適用される

---

### Requirement: GitHub 無効 job は GitHub credential と GitHub API に一切触れない

When the job contract is GitHub-disabled, the system MUST NOT resolve a GitHub token, MUST NOT construct a GitHub API client, MUST NOT issue any GitHub API request, and MUST NOT inject any token into git transport commands — even when `GH_TOKEN` / `GITHUB_TOKEN` or a stored credentials file is present in the environment.

#### Scenario: 環境に credential があっても解決しない

**Given** 環境変数 `GH_TOKEN` が設定され、credentials ファイルにも token が保存されている
**And** job 契約が GitHub 無効である
**When** `job start` から完了までの pipeline を実行する
**Then** GitHub token の解決は 1 度も行われず、GitHub API への HTTP request は 0 件である

#### Scenario: git transport に token を注入しない

**Given** job 契約が GitHub 無効である
**When** pipeline が fetch / push を実行する
**Then** git の呼び出しに `http.<scope>.extraheader` 等の認証注入引数は付かず、認証は環境の SSH / credential helper に委ねられる

#### Scenario: 非 GitHub origin を拒否しない

**Given** origin が GitHub 形式ではない Git remote（例: ローカル bare repository）である
**And** job 契約が GitHub 無効である
**When** `job start <slug>` を実行する
**Then** `REMOTE_NOT_GITHUB` は発生せず、job は専用 worktree を作成して pipeline を開始する

---

### Requirement: repository identity は汎用 origin と GitHub identity を分離する

The system SHALL record a forge-neutral repository origin identity (a credential-stripped normalized origin URL and its digest) for every newly created job, and MUST NOT store fabricated GitHub `owner` / `name` values for GitHub-disabled jobs. GitHub `owner` / `name` MUST be present exactly when the job contract is GitHub-enabled.

#### Scenario: 無効 job は GitHub identity を持たない

**Given** job 契約が GitHub 無効である
**When** job state が作成される
**Then** state の repository には汎用 origin identity が記録され、GitHub の owner / name は記録されない

#### Scenario: credential を state に残さない

**Given** origin URL が `https://user:secret@example.com/team/repo.git` である
**When** 汎用 origin identity を導出する
**Then** 記録される URL に userinfo（`user:secret`）は含まれない

#### Scenario: 有効 job の identity 必須性は維持される

**Given** job 契約が GitHub 有効である
**And** job state の repository に owner が無い
**When** その state を検証する
**Then** state 検証は失敗し、job は実行されない

---

### Requirement: GitHub 無効時の standard / fast は feature branch 出力で完了する

When the job contract is GitHub-disabled, the standard and fast pipelines SHALL terminate without executing the `pr-create` step, while keeping every other step, review loop, and gate identical, and the job MUST reach `awaiting-archive` with the terminal state committed and pushed to the feature branch.

#### Scenario: pr-create を実行せずに完了する

**Given** job 契約が GitHub 無効で pipeline profile が standard である
**When** conformance が承認され adr-gen が完了する
**Then** pipeline は `pr-create` を実行せずに終了し、job status は `awaiting-archive` になる

#### Scenario: 検証とレビューは省略されない

**Given** job 契約が GitHub 無効で pipeline profile が fast である
**When** pipeline を実行する
**Then** implementer / verification / code-review / conformance は GitHub 有効時と同じ順序と条件で実行される

#### Scenario: design-only の意味は変わらない

**Given** pipeline profile が design-only である
**When** GitHub 無効・有効それぞれで pipeline を構成する
**Then** どちらも design step のみを持ち、終端は変わらない

#### Scenario: 無効な終端の明示指定は事前に拒否される

**Given** GitHub 無効 job が awaiting-resume である
**When** `job resume <slug> --from pr-create` を実行する
**Then** pipeline を開始する前に usage エラーで拒否され、job state は変更されない

#### Scenario: GitHub 有効時の終端は不変

**Given** job 契約が GitHub 有効である
**When** pipeline descriptor を構成する
**Then** descriptor は変換前と同一であり、終端は `pr-create` のままである

---

### Requirement: PR が無くても完了成果と証跡の所在が得られる

When a GitHub-disabled job completes, the system SHALL make the attestation available as a branch-borne artifact in the change folder and MUST report the feature branch, the final pushed revision, and the location of the evidence. The system MUST NOT print a pull request URL or claim that a PR was created for such a job.

#### Scenario: attestation が branch に載る

**Given** GitHub 無効 job が `awaiting-archive` に到達する
**When** terminal state が feature branch に commit / push される
**Then** `specrunner/changes/<slug>/attestation.md` が同じ checkpoint に含まれ、別 checkout から参照できる

#### Scenario: 完了出力が branch と revision と証跡を示す

**Given** GitHub 無効 job が完了した
**When** 完了出力を表示する
**Then** feature branch 名・最終 revision・証跡ファイルの所在が表示され、PR の URL や「PR 作成成功」は表示されない

#### Scenario: 機械可読出力が PR を詐称しない

**Given** GitHub 無効 job が完了した
**When** `--json` の terminal contract を出力する
**Then** `result` は PR 作成を意味する値ではなく branch 公開を意味する値になり、`prUrl` は `null` である

---

### Requirement: GitHub 無効 job の reopen は PR gate を要求しない

For a GitHub-disabled job, `job reopen <slug> --reason ...` SHALL transition `awaiting-archive` to `awaiting-resume` without requiring a recorded pull request or a PR-state query, while keeping the status gate, the mandatory reason, the operator journal record, and the separation between reopen and resume unchanged. For a GitHub-enabled job the existing PR safety checks MUST remain.

#### Scenario: PR なしで reopen できる

**Given** GitHub 無効 job が `awaiting-archive` で、PR は記録されていない
**When** `job reopen <slug> --reason "追加修正"` を実行する
**Then** job は `awaiting-resume` に遷移し、operator event が journal に記録される

#### Scenario: reopen 後に別操作の resume で追加修正できる

**Given** GitHub 無効 job が reopen によって `awaiting-resume` になっている
**When** `job resume <slug> --from implementer` を実行する
**Then** pipeline が指定 step から再開され、reopen 自体は pipeline を起動していない

#### Scenario: 有効 job の PR 確認は維持される

**Given** GitHub 有効 job が `awaiting-archive` で、記録された PR が CLOSED である
**When** `job reopen <slug> --reason "..."` を実行する
**Then** reopen は拒否され、job status は `awaiting-archive` のままである

---

### Requirement: GitHub 無効 job の archive は Git だけで 1 回で完了する

For a GitHub-disabled job, `job archive <slug>` SHALL push the archive record to the feature branch, transition the job to `archived`, and run cleanup in a single invocation without querying GitHub. The remote feature branch MUST be preserved, the base branch MUST NOT be merged automatically, and a push failure MUST NOT result in `archived` or in cleanup of unpushed artifacts.

#### Scenario: record push → archived → cleanup が 1 回で完了する

**Given** GitHub 無効 job が `awaiting-archive` である
**When** `job archive <slug>` を実行する
**Then** archive record が feature branch へ push され、job は `archived` になり、worktree が cleanup され、remote feature branch は残る

#### Scenario: push 失敗時に成果物を失わない

**Given** GitHub 無効 job の archive record push が失敗する
**When** `job archive <slug>` を実行する
**Then** job は `archived` にならず cleanup も行われず、escalation が報告される

#### Scenario: base branch は自動 merge されない

**Given** GitHub 無効 job の archive が成功した
**When** base branch を確認する
**Then** base branch には自動 merge が行われておらず、統合は利用者の操作に委ねられている

---

### Requirement: 別 checkout からの attach は保存済み契約を復元し不一致を拒否する

`job attach --branch <branch>` SHALL restore the GitHub integration contract recorded in the checkpoint and MUST verify repository identity against that contract: GitHub `owner`/`name` for GitHub-enabled checkpoints, and the forge-neutral origin identity for GitHub-disabled checkpoints. A checkpoint whose identity does not match MUST be rejected without creating any local state.

#### Scenario: 無効 job の checkpoint を別 checkout で引き継ぐ

**Given** GitHub 無効 job の quiescent checkpoint が origin の branch に push されている
**And** 同じ repository の別 checkout から実行する
**When** `job attach --branch <branch>` を実行する
**Then** checkpoint が検証されて worktree が作成され、復元された job 契約は GitHub 無効のままである

#### Scenario: repository が異なる checkpoint は拒否される

**Given** GitHub 無効 job の checkpoint が別 repository の origin identity を持つ
**When** `job attach --branch <branch>` を実行する
**Then** attach は拒否され、worktree も sidecar も job state も作成されない

#### Scenario: invoker の config 変更で有効 job の確認を迂回できない

**Given** checkpoint に記録された job 契約は GitHub 有効である
**And** invoker 側の config は `github.enabled: false` を宣言している
**When** `job attach --branch <branch>` を実行する
**Then** GitHub identity の照合が要求され、照合できない場合 attach は拒否される

---

### Requirement: GitHub 専用の操作は副作用の前に拒否される

When the resolved GitHub integration is disabled, the system SHALL reject GitHub-only commands and options before creating any job, worktree, or state — specifically `job start --issue`, `--from-issue` on start / resume / archive, `inbox run`, `archive --with-merge`, `archive --merge-wait-ms`, and the managed runtime — with a message that names the required GitHub integration. Such options MUST NOT be silently ignored.

#### Scenario: issue 起点の指定を事前に拒否する

**Given** プロジェクト config が GitHub 無効を宣言している
**When** `job start <slug> --issue 42` を実行する
**Then** job state も worktree も作成されずに拒否され、GitHub 連携が必要である旨が示される

#### Scenario: merge 付き archive を事前に拒否する

**Given** job 契約が GitHub 無効である
**When** `job archive <slug> --with-merge` を実行する
**Then** archive record の作成前に拒否され、job status は変わらない

#### Scenario: managed runtime との不適合を job 作成前に通知する

**Given** config が `runtime: managed` かつ GitHub 無効を宣言している
**When** `job start <slug>` を実行する
**Then** job state 作成前に不適合が通知され、pipeline は開始されない

#### Scenario: GitHub 非依存のコマンドは影響を受けない

**Given** プロジェクト config が GitHub 無効を宣言している
**When** `job ls` / `job show` / `job wait` / `job stats` / `usage` / `request *` / `rules` / `reviewers` / `config` / `guide` を実行する
**Then** いずれも GitHub credential を要求せず、存在しない PR の確認も案内も行わない

---

### Requirement: Git の実行保証は GitHub 連携の有無に関わらず維持される

The system SHALL preserve, for GitHub-disabled jobs, the dedicated worktree, per-step commit and push, verification / review binding to commit OIDs, the synthesized-commit ledger, and the egress check. Disabling GitHub MUST NOT disable git transport or turn these safeguards into no-ops.

#### Scenario: step ごとの commit と push が行われる

**Given** GitHub 無効 job が pipeline を実行している
**When** step が完了する
**Then** その step の成果は commit されて origin の feature branch へ push され、commit OID が台帳に記録される

#### Scenario: egress 検査が維持される

**Given** GitHub 無効 job の push 範囲に台帳外の commit が含まれる
**When** egress 検査が実行される
**Then** 検査は失敗として扱われ、push は成立しない

---

### Requirement: 表示と診断が実装の連携状態と一致する

The system SHALL show the resolved GitHub integration and its configuration source in `config effective`, show the contract fixed to the job in `job show` and in the start log, and MUST treat GitHub token / API / host checks as not required in `doctor` when the integration is disabled, while still checking git, origin, and agent execution prerequisites.

#### Scenario: config effective が設定元を示す

**Given** `.specrunner/config.json` が `github.enabled: false` を宣言している
**When** `config effective` を実行する
**Then** GitHub 連携が無効であることと、設定元が project local config であることが表示される

#### Scenario: job show が job の契約を示す

**Given** GitHub 無効として開始された job がある
**When** `job show <slug>` を実行する
**Then** その job に固定された GitHub 連携状態が表示される

#### Scenario: doctor が不要な検査を fail にしない

**Given** プロジェクト config が GitHub 無効を宣言し、GitHub token が存在しない
**When** `doctor` を実行する
**Then** GitHub token / API / host の検査は実施されず fail にもならず、git・origin・agent 実行の必要条件は検査される

#### Scenario: 外部 gate を実施済みと偽らない

**Given** GitHub 無効 job が完了した
**When** 完了出力と案内を確認する
**Then** pipeline 内部の検証結果は示されるが、外部 forge 上の CI / branch protection / merge 承認が実施されたとは表示されず、`archived` が base branch への merge 済みを意味しないことが区別されている
