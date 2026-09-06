# Git非依存 artifact-output profile の成立性を設計・実測する

## Meta

- **type**: new-feature
- **slug**: gitless-artifact-output
- **base-branch**: main
- **adr**: true

## 背景

SpecRunner の現在の local runtime は GitHub だけでなく、Git 自体を実行基盤として使っている。

Git は単なる公開先ではなく、少なくとも次を担っている。

- `git worktree` による実行隔離
- base revision と candidate revision の識別
- changed-files / diff の導出
- Stepごとのcommitと成果物の帰属
- commit OIDへ束縛したverification / review provenance
- branch-borne state、checkpoint、別環境からのreattach
- push / PR create / archive record / egress ledger
- rollback・resume時の未記録変更検出

既存の `--no-worktree` は「現在のrepository rootで実行する」ためのモードであり、Git非依存ではない。

一方、利用者が本当に欲しいものを次のように捉えると、Gitは必ずしも必須の入力条件ではない。

> requestとソースディレクトリを渡し、検証・レビュー済みの変更成果物を受け取る。

たとえば、展開したtarball、生成直後のプロジェクト、Git管理していない個人作業ディレクトリ、またはGitへの反映を呼び出し側で管理したい環境でもSpecRunnerを使いたい。

この方向は既存runtimeの単純なオプション追加ではなく、Gitが暗黙に提供していた保証を別の機構で置換する新しい実行profileである。全面抽象化を先行させず、最小の縦断実測で成立性と必要境界を確定する。

## 目的

`.git` を持たない入力ディレクトリに対して、Gitを起動せず、入力を破壊せずにpipelineを実行し、変更内容と検証結果をportableなartifactとして取り出せる **artifact-output profile** の契約を設計し、最小構成で実測する。

既存のGit/PR profileは維持する。Git profileの保証を曖昧に弱めて共通化するのではなく、profileごとの保証・非対応操作を明示する。

## ユーザーストーリー

### 1. Git管理されていないディレクトリを変更する

1. 利用者がrequestとsource directoryを指定する
2. SpecRunnerはsourceを隔離されたcandidate workspaceへmaterializeする
3. agent / verification / reviewはcandidateに対して実行される
4. 元のsource directoryは変更されない
5. 利用者は変更manifest、text patch、candidate成果物、検証・レビュー結果を受け取る

### 2. Gitへの反映は呼び出し側が行う

利用者の本番repositoryやVCS操作にはSpecRunnerが触れず、出力artifactを確認したうえで、呼び出し側が任意の方法で反映する。

### 3. 未追跡という概念がない入力

開始時にsource directoryに存在するファイルは、Gitのtracked / untrackedに関係なくすべてbaselineの構成要素として扱う。追加・変更・削除はbaseline snapshotとcandidate snapshotの比較で決める。

### 4. text patchだけでは表現できない変更

binary、file mode、symlink、削除を「patchに出なかったので変更なし」と扱わない。少なくともmanifestとcandidate bundleで欠落なく表現し、適用不能な変更はfail-closedまたは明示的unsupportedとする。

### 5. pipelineが停止し再開する

branch-borne checkpointを前提にしない。同一machine上で再開可能なlocal state契約を定義するか、初期profileでresumeを提供しない場合は、対応できるpipelineと停止時の成果物を明確に限定する。既存resumeが動くように見せて途中でGit前提に落ちる状態は作らない。

## 設計要求

### 1. Git非依存の定義

- source directoryはGit repository内でなくてよい
- 実行中に `git` commandを呼ばない
- 内部で暗黙に `git init` してGit依存を隠さない
- GitHub token / remote / branch / commit / PRを要求しない
- `.git` が偶然存在する入力でも、artifact-output profileではGitをauthorityとして参照しない
- 「git commandを呼ばない」の検証対象はSpecRunner自身が発行するspawn（spawnFn注入で計測可能な経路）とする。agent subprocess（Claude Code CLI / Codex）が内部で呼ぶgitは対象外
- 入力経路は `job start <slug|file>`（drafts/ または request.md のファイルパス）のみ。`--from-issue` / `--issue` はpreflightで明示的unsupportedとする
- source directoryはCLIオプション（例: `--source <dir>`）で指定する。現行はcwd = repo root前提のため、この指定方法自体が本Issueの設計対象に含まれる

### 2. workspace isolation

- source directoryを直接変更せず、隔離candidate workspaceでagentを動かす
- baseline materializationとcandidate workspaceの所有者・寿命・cleanup責務を定義する
- runtime state / baseline evidenceをagent writable領域だけに置かない
- source変更と実行中candidate変更が混線しないよう、開始時snapshot identityを固定する
- symlink traversalやworkspace外writeに対する既存sandbox境界を弱めない

### 3. snapshot / revision identity

Git commit OIDの代わりに、再計算可能なsnapshot digestでrevisionを識別する。

少なくとも以下を契約化する。

- baseline digest
- candidate digest
- path、entry kind、content digest、必要なmode情報
- 除外pathと正規化規則
- 比較中のI/O失敗・読取不能を「変更なし」に畳まないfail-closed表現
- digestがverification / reviewの対象revisionと一致すること

時刻、絶対path、directory traversal順などmachine依存値をidentityへ混ぜない。

### 4. changed-files / diff

- added / modified / deletedをsnapshot比較から導出する
- rename推定は初期必須にしない。必要ならdelete + addとして表現する
- agent / reviewerへ渡す `git diff` / `git log` 文脈をsnapshot由来の文脈へ置換する
- text diffを生成できないbinary等もchanged-filesから欠落させない
- scope判定不能は空配列へ縮退せずUNKNOWN / unavailableとしてfail-closedに扱う

### 5. artifact contract

成功時に、少なくとも次を1つの出力単位として取得できること。

- `manifest.json`: baseline/candidate digestと全変更entry
- `changes.patch`: 表現可能なtext変更のunified diff
- candidate bundleまたは同等の完全な変更payload
- verification結果
- reviewer verdict / findings
- 適用方法とunsupported entryの有無

artifactは元sourceへ自動適用しない。適用commandを同時に提供する場合も別の明示操作とし、baseline digest不一致時は上書きしない。

### 6. lifecycle / state

次を設計で明示する。

- job identityと配置
- running / halt / failure / completionの記録先
- 同一machine resumeの可否と条件
- process crash後のcandidate再利用条件
- artifact確定前後のpartial failure処理
- cleanup後に残るdurable evidence

Git profileのbranch-borne state / remote reattachと同等でない場合は、その差を仕様として表示する。暗黙の保証低下にしない。

### 7. profile capability

Git依存operationを散在するif文で無効化せず、profile capabilityとして実行前に判定する。

初期profileでは少なくとも次を明示的unsupportedとしてよい。

- push / PR create / merge
- feature branchへのarchive record
- commit採択、commit egress ledger
- branch checkpointからのremote reattach
- issue起点のunattended managed runtime
- commit OIDを必要とするoperation

pipelineを開始してからunsupported stepで初めて停止するのではなく、effective pipelineをpreflightで検証し、実行可能範囲を先に表示する。

### 8. 既存profileとの分離

- 既存local / managed Git profileのbehaviorと保証を変更しない
- Git profileをsnapshot profileへ無理に一般化しない
- 共通化は、実測で2つの実装が同じ意味を持つと確認できたpure contractに限定する
- provider runnerの分割リファクタリングを本Issueの前提にしない

## 最小実測スコープ

- 最小縦断のagentはinjected / fake runnerでよい（CIにはagent credentialが無く、実agentは検証対象のGit非依存性も保証しない）
- 最小縦断はテストfixture上で成立すればよく、CLIサブコマンドとしての完成度は必須としない

まず、Git repository外のfixtureに対する1本の同期実行で次を通す。

1. request読込
2. baseline snapshot
3. candidate workspace作成
4. agentによる追加・変更・削除
5. verification command
6. snapshot changed-files / diff導出
7. reviewerへcandidate revisionを提示
8. artifact確定
9. 元sourceが不変であることを確認

最小実測ではGitHub Issue連携、PR作成、remote reattach、複数machine resumeを含めない。

production実装へ進む前に、この縦断から以下を記録する。

- Git前提で停止したcall site
- 置換できた保証 / 置換できない保証
- 新しいruntime/profile境界
- artifact生成の時間・容量
- 大規模directoryで支配的になるコスト
- 続行 / scope縮小 / 中止の判断

## Non-goals

- Gitの再実装
- 隠れた一時repositoryの作成
- Git以外のVCS provider抽象化
- GitHub/GitLab等のmulti-forge対応
- 初回から既存Git profileと完全同等のdurabilityを提供すること
- 初回からremote resume / distributed executionを提供すること
- source directoryへの自動適用
- 既存 `--no-worktree` の意味変更
- R4 provider lifecycle refactoring
- snapshot性能の先回り最適化

## Acceptance Criteria

- [ ] ADRでartifact-output profileのauthority、revision identity、lifecycle、保証差分が定義される
- [ ] Gitが現在担う責務が「snapshotで置換 / profile固有 / 初期unsupported」に分類される
- [ ] Git repository外のfixtureで最小縦断が完走する
- [ ] 実測中にSpecRunner自身が `git` commandおよびGitHub APIを呼ばないことを機械的に検証できる（agent subprocess内部のgit呼び出しは対象外）
- [ ] 元source directoryが成功時・失敗時とも変更されない
- [ ] added / modified / deletedがmanifestへ出力される
- [ ] text patchで表現できない変更がmanifest / payloadから欠落しない
- [ ] baseline / candidate digestがartifactとverification / review recordへ束縛される
- [ ] snapshot取得・比較不能が「変更なし」として通過しない
- [ ] Git依存stepを開始前preflightで列挙し、途中まで実行してから落ちない
- [ ] 既存Git/PR profileの挙動は変わらない
- [ ] CLI / READMEで `--no-worktree` との違い、保証、unsupported operationが説明される
- [ ] 実測結果と次段階の分割Issue案が記録される
- [ ] SpecRunner verificationがgreen（PR上の既存証跡を正本とし、レビュー側で同一のtest / lint / typecheckを重複実行しない）

## Stop Conditions

以下が必要になった時点で実装を止め、観測事実・影響・選択肢をIssueへ報告する。

- artifact-output profileの内部でGit repositoryを作らないと最小縦断が成立しない
- baseline / candidate evidenceをagent writable領域だけに置く必要がある
- binary / delete / symlink等を黙って欠落させないartifact契約を定義できない
- revision不一致でもverification / reviewを有効として扱う必要がある
- changed-files不明を空配列へfail-openしないと既存pipelineを再利用できない
- Git profileの保証を弱めないと共通化できない
- runtime/profile境界ではなくcore全域への条件分岐拡散が必要になる
- remote resumeまで同時設計しないとlocal最小縦断も成立しない
- 実測コストが対象規模に対して非現実的で、incremental snapshot等の別設計が先に必要になる
