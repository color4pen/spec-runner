# Spec: job start --from-issue

## Requirements

### Requirement: job start SHALL accept --from-issue to launch a job directly from an issue body

`job start --from-issue <n>` を実行すると、システムは GitHub API で issue #n の本文を取得し、その本文を
request.md として parse して slug を得て、draft を `specrunner/drafts/<slug>/request.md` に実体化し、
通常の start を実行しなければならない（SHALL）。この起動では issue linkage（`--issue <n>` 相当）と
issue-verbatim origin（`jobState.inboxOrigin`）を自動で立てる。呼び出し側は issue 番号以外を渡さない。

#### Scenario: --from-issue が issue 本文を request として起動する

**Given** GitHub 上に、有効な request.md 形式の本文（Meta に slug / base-branch を含む）を持つ issue #42 が存在する
**And** 実行元 checkout の現在 branch が request の base-branch と一致する
**When** `job start --from-issue 42` を実行する
**Then** issue #42 の本文が `specrunner/drafts/<slug>/request.md` に転記される
**And** その draft を対象に通常の pipeline start が起動する
**And** 起動された job の state は `issueNumber = 42` かつ `inboxOrigin = true` を持つ

### Requirement: --from-issue 起動の job は issue fidelity comparator を実行してはならない

`--from-issue` で起動した job は issue 本文を byte 同一で draft に転記しているため、entrance の issue fidelity gate は
comparator（LLM 照合）を実行してはならない（MUST NOT）。gate は `jobState.inboxOrigin === true` を根拠に skip する。

#### Scenario: fidelity gate が inboxOrigin により comparator を skip する

**Given** `--from-issue` 起動により `jobState.inboxOrigin = true` の job が entrance（startStep = request-review）に到達する
**And** その job は issue にリンクしている（issueNumber != null）
**When** entrance issue fidelity gate を評価する
**Then** comparator は呼び出されず、gate は skip 理由付きで proceed する

### Requirement: --from-issue はコマンド起動時に base-branch guard を適用しなければならない

`--from-issue` 起動時、システムは実行元 checkout（repoRoot）の現在 branch を解決し、request の `base-branch` と
一致しない場合は job state を作成する前に fail-closed で停止しなければならない（MUST）。detached HEAD は不一致として扱う。
エラー文言には現在 branch と request base-branch の両方を含めなければならない。この guard は `--from-issue` 起動時のみ適用し、
positional / inbox の既存起動経路の挙動は変えない。

#### Scenario: 現在 branch が base-branch と不一致なら副作用ゼロで停止する

**Given** request base-branch が `main` の issue を対象に `--from-issue` 起動する
**And** 実行元 checkout の現在 branch が `develop` である
**When** `job start --from-issue <n>` を実行する
**Then** job state は作成されない
**And** draft は残留しない
**And** プロセスは非ゼロ exit で終了する
**And** エラー文言に `develop` と `main` の両方が含まれる

#### Scenario: detached HEAD は不一致として扱う

**Given** 実行元 checkout が detached HEAD 状態である
**When** `job start --from-issue <n>` を実行する
**Then** base-branch guard は不一致と判定し、job state を作成せず非ゼロ exit で停止する

### Requirement: --from-issue と positional / --issue は排他でなければならない

`--from-issue` と positional `<file|slug>` の同時指定、および `--from-issue` と `--issue` の同時指定は usage エラーで
拒否しなければならない（MUST）。`--from-issue` は linkage を内包するため `--issue` と併用できない。
`--detach` とは併用可能で、通常の detach 契約がそのまま成立する。

#### Scenario: --from-issue と positional の併用は usage エラー

**Given** `--from-issue 5` と positional `some-slug` が同時に与えられる
**When** `job start some-slug --from-issue 5` を実行する
**Then** usage エラーとなり、非ゼロ exit（ARG_ERROR）で終了する
**And** job state は作成されない

#### Scenario: --from-issue と --issue の併用は usage エラー

**Given** `--from-issue 5` と `--issue 6` が同時に与えられる
**When** `job start --from-issue 5 --issue 6` を実行する
**Then** usage エラーとなり、非ゼロ exit（ARG_ERROR）で終了する
**And** job state は作成されない

#### Scenario: --from-issue と --detach は併用できる

**Given** base-branch が一致し、有効な issue 本文を持つ issue を対象にする
**When** `job start --from-issue <n> --detach` を実行する
**Then** 親プロセスは job 登録完了まで待機してから return する（通常の detach 契約）
**And** 起動された job は `issueNumber` と `inboxOrigin = true` を持つ

### Requirement: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit しなければならない

`--from-issue` 起動時、GitHub API による issue 本文の取得（`getIssue()`）が失敗した場合
（issue 不存在 404・認証失敗 401・ネットワーク断等）、システムは draft 書き込みも job state 作成も行わずに
非ゼロ exit で停止しなければならない（MUST）。exit code は既存の GITHUB_API_ERROR mapping（GENERAL_ERROR = 1）に従う。

#### Scenario: fetch 失敗時に draft も job state も生成されない

**Given** GitHub API の `getIssue()` が失敗する（404 / 401 / ネットワーク断等）
**When** `job start --from-issue <n>` を実行する
**Then** 非ゼロ exit で停止する
**And** draft は生成されない
**And** job state は生成されない

### Requirement: issue 本文の request parse 失敗は副作用ゼロでエラー終了しなければならない

取得した issue 本文が request.md として parse できない場合（Meta 不備・slug 不正等）、システムは draft も job state も
作らずにエラー終了しなければならない（MUST）。

#### Scenario: parse 失敗時に draft も job state も生成されない

**Given** issue 本文が request.md として不正（必須 Meta 欠落）である
**When** `job start --from-issue <n>` を実行する
**Then** parse エラーで非ゼロ exit する
**And** draft は生成されない
**And** job state は生成されない

### Requirement: slug 占有時は既存の SlugOccupiedError 経路に乗らなければならない

`--from-issue` 起動で、対象 slug を非終端の既存 job が占有している場合、システムは新規に `job start` を実行したときと同じ
SlugOccupiedError 経路（起動時の重複ライブジョブ検査）で拒否しなければならない（MUST）。

#### Scenario: 占有 slug に対する --from-issue は既存 SlugOccupiedError 経路で拒否される

**Given** slug `foo` を非終端 job が占有している
**And** その slug を生む issue 本文を対象に `--from-issue` 起動する
**When** `job start --from-issue <n>` を実行する
**Then** 起動は既存の SlugOccupiedError 経路で拒否され、新しい job state は作成されない

### Requirement: issue → draft → start の連鎖は単一の core 関数に統合されなければならない

issue 本文から draft を実体化し start を起動する連鎖は単一の core 関数に集約され、inbox の startJob effect と
`--from-issue` の両方がその関数を呼ばなければならない（MUST）。この統合は挙動保存の refactoring であり、inbox の
既存テスト期待を書き換えてはならない。

#### Scenario: inbox と --from-issue が同一の core 関数を経由する

**Given** inbox の default startJob effect と `--from-issue` 起動の両方が存在する
**When** それぞれが issue 本文から draft 実体化と start を行う
**Then** どちらも同一の core 関数（`writeDraft` → `runRunCore(..., { inboxOrigin: true })`）を経由する
**And** inbox の既存テストは無改変で green のままである
