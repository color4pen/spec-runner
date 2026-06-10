# Spec: job を GitHub issue に紐付け、escalation / 完走を issue コメントで通知する

## Requirements

### Requirement: job は `--issue` で GitHub issue に紐付き、状態に永続化される

`job start`（および alias `run`）は任意オプション `--issue <number>` を受け付ける SHALL。指定された
issue 番号は `JobState` の issue 番号フィールドとして永続化され、state の保存・復元（load）で保持される
MUST。`--issue` を指定しない job は issue 番号フィールドを持たず、従来どおりの挙動（通知なし）を保つ
SHALL。`--issue` の値が正の整数でない場合、CLI は引数エラーで終了する SHALL。

#### Scenario: `--issue` で起動した job の issue 番号が永続化・復元される

**Given** `specrunner job start <slug> --issue 42` で job を起動する
**When** job state が保存され、別プロセスで load される
**Then** load された `JobState` の issue 番号フィールドが `42` である

#### Scenario: `--issue` なしの job は issue 番号フィールドを持たない

**Given** `specrunner job start <slug>`（`--issue` なし）で job を起動する
**When** job state が保存される
**Then** issue 番号フィールドは未設定（undefined）であり、通知ロジックの対象外になる

#### Scenario: 不正な `--issue` 値は引数エラーになる

**Given** `specrunner job start <slug> --issue abc`（数値でない）
**When** CLI が引数を解釈する
**Then** CLI は引数エラー（exit code 2）で終了し、job を起動しない

### Requirement: `GitHubClient` port は forge 中立な issue コメント作成メソッドを持つ

`GitHubClient` port は、owner / repo / issueNumber / body を引数に取り、作成したコメントの識別子と
URL を返す issue コメント作成メソッドを提供する SHALL。port のシグネチャは GitHub 固有概念（label /
reaction 等）を含まず、forge 中立な意味論に保つ MUST。adapter はこのメソッドを既存の request
ミドルウェア（retry / rate-limit / 401 ハンドリング）経由で実装する SHALL。

#### Scenario: adapter が issue へコメントを POST する

**Given** 有効な token を持つ GitHub adapter
**When** `createIssueComment(owner, repo, issueNumber, body)` を呼ぶ
**Then** adapter は `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` を body 付きで呼び、
作成されたコメントの id と url を返す

### Requirement: escalation 遷移時に再開手順を含むコメントが書き込まれる

issue に紐付いた job が `awaiting-resume` へ遷移したとき、システムは紐付け issue に「停止した step・
停止理由（resumePoint の内容）・再開手順」を含むコメントを書き込む SHALL。再開手順は
`specrunner job resume <slug>` を含む MUST。

#### Scenario: escalation 時に理由と再開手順が issue に書かれる

**Given** `--issue 42` で起動した job が loop 上限到達で `awaiting-resume` に遷移する
**When** pipeline の terminal 収束処理が走る
**Then** `GitHubClient` の issue コメント作成メソッドが issue 42 に対して呼ばれ、その body に停止 step・
resumePoint の reason・`specrunner job resume <slug>` が含まれる

### Requirement: 完走遷移時に PR URL を含むコメントが書き込まれる

issue に紐付いた job が `awaiting-archive` へ遷移したとき、システムは紐付け issue に PR の URL を含む
完了コメントを書き込む SHALL。

#### Scenario: 完走時に PR URL が issue に書かれる

**Given** `--issue 42` で起動した job が pipeline を完走し `awaiting-archive` に遷移する（`state.pullRequest.url` が記録済み）
**When** pipeline の terminal 収束処理が走る
**Then** issue 42 に対してコメント作成メソッドが呼ばれ、その body に PR の URL が含まれる

### Requirement: コメントは種別と jobId の機械可読マーカーを含む

escalation / completed のいずれのコメントも、コメント種別（escalation / completed）と jobId を
識別できる機械可読マーカー（HTML コメント）を含む SHALL。マーカーは GitHub のレンダリング表示に
現れない形式である MUST。

#### Scenario: escalation コメントにマーカーが含まれる

**Given** escalation コメントを生成する
**When** body を構築する
**Then** body は種別が escalation であることと jobId を表す HTML コメントマーカーを含む

#### Scenario: completed コメントにマーカーが含まれる

**Given** completed コメントを生成する
**When** body を構築する
**Then** body は種別が completed であることと jobId を表す HTML コメントマーカーを含む

### Requirement: `--issue` なしの job では issue 関連 API を一切呼ばない

issue 番号フィールドを持たない job の terminal 遷移（`awaiting-resume` / `awaiting-archive`）では、
システムは issue コメント作成メソッドを含む issue 関連の API 呼び出しを一切行わない MUST。

#### Scenario: 紐付けなし job の完走で issue API が呼ばれない

**Given** `--issue` なしで起動した job が `awaiting-archive` に遷移する
**When** pipeline の terminal 収束処理が走る
**Then** `GitHubClient` の issue コメント作成メソッドは一度も呼ばれない

### Requirement: 通知は best-effort であり、失敗は job の結果に影響しない

issue コメントの書き込みが失敗（ネットワーク / 権限 / issue クローズ済み / token 失効等）した場合、
システムは警告を出力するに留め、job の最終状態（status）および CLI の exit code を変化させない MUST。
通知処理は `JobState.status` を変更してはならない MUST NOT。

#### Scenario: コメント書き込み失敗でも最終状態と exit code が不変

**Given** `--issue 42` で起動した job が `awaiting-resume` に遷移し、issue コメント作成が例外を投げる
**When** pipeline の terminal 収束処理が走る
**Then** 警告が出力されるが、job の最終 status は `awaiting-resume` のままで、pipeline は通知例外を
再 throw せず、exit code は通知なしの場合と同じである

### Requirement: 通知は CLI プロセスから両 runtime で行う

issue コメントの書き込みは local / managed の両 runtime において CLI プロセスから実行される SHALL。
agent セッションに通知を書かせてはならない MUST NOT。

#### Scenario: managed runtime でも CLI プロセスが通知する

**Given** managed runtime で `--issue 42` を付けて起動した job が terminal 状態に遷移する
**When** pipeline の terminal 収束処理が走る
**Then** 通知は CLI プロセス内の pipeline 収束処理から `GitHubClient` 経由で行われ、agent には依存しない
