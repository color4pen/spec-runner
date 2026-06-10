# Spec: inbox auto-fire

## Requirements

### Requirement: inbox run は 1 回の走査と発火で終了し、自身の状態を持たない

`specrunner inbox run` SHALL perform a single scan-and-fire pass and then exit. The command MUST NOT spawn a resident process and MUST NOT read or write any state file of its own; all collision and idempotency decisions MUST be derived solely from job state (issue linkage, status, PID liveness) and GitHub issue/comment data.

#### Scenario: 走査して終了する

**Given** 承認ラベル付き issue も awaiting-resume の job も存在しない
**When** `specrunner inbox run` を実行する
**Then** 何も発火せずに正常終了し、inbox 専用の状態ファイルはディスク上に作成されない

#### Scenario: dry-run は計画のみ表示し発火しない

**Given** 起動対象・再開対象が存在する
**When** `specrunner inbox run --dry-run` を実行する
**Then** 起動・再開・差し戻しの計画が表示され、job の起動・再開・コメント投稿はいずれも行われない

### Requirement: 承認ラベル付き・未紐付け issue から job を起動する

inbox run SHALL detect open issues that carry the configured approve label and are not linked to any existing job, take the issue body as a request.md, validate it, and on success start a job linked to the issue via the issue number.

#### Scenario: 承認ラベル付き・未紐付け issue から起動する

**Given** 承認ラベルが付いた open issue があり、その issue 番号に紐付く job が 1 件も存在しない
**And** issue 本文が request.md として妥当である
**When** `specrunner inbox run` を実行する
**Then** その issue 番号に紐付いた job が起動される

#### Scenario: 紐付け済み issue は二度起動しない（冪等性）

**Given** ある issue 番号に紐付く job が既に存在する（status を問わない）
**When** 同じ issue を承認ラベル付きのまま `specrunner inbox run` を再度実行する
**Then** その issue からは新たな job を起動しない

### Requirement: 不正な issue 本文を validate エラーとして差し戻す

When the body of an approved, unlinked issue fails request.md validation, inbox run SHALL post a comment carrying the validation error to that issue and MUST NOT create a job for it.

#### Scenario: request.md として不正な issue 本文を差し戻す

**Given** 承認ラベル付き・未紐付け issue の本文が request.md として不正である
**When** `specrunner inbox run` を実行する
**Then** validate エラーを含むコメントがその issue に投稿される
**And** その issue に紐付く job は作られない

### Requirement: awaiting-resume の job を /resume コメントで再開する

inbox run SHALL, for each job with status `awaiting-resume` linked to an issue, resume the job when the linked issue has a `/resume` comment that is newer than the latest escalation marker comment for that job and is authored by a collaborator-or-higher. The text following `/resume` SHALL be passed as the resume prompt.

#### Scenario: /resume コメントで再開し本文を resumePrompt として渡す

**Given** issue に紐付いた awaiting-resume の job があり、その issue に最新 escalation マーカーより新しい collaborator 以上の `/resume <text>` コメントがある
**When** `specrunner inbox run` を実行する
**Then** その job が再開され、`/resume` に続く本文が resumePrompt として渡される

#### Scenario: resumePrompt のパース

**Given** `/resume` の後に空白と複数行のテキストが続く `/resume` コメント
**When** inbox run が resumePrompt を抽出する
**Then** 先頭の `/resume` トークンを除いた残り全体（改行を含む）を trim した文字列が resumePrompt になる
**And** `/resume` の後にテキストがない場合 resumePrompt は空（追加指示なし）になる

### Requirement: 再開は escalation マーカーの時刻と権限とマーカーで発火を絞る

inbox run MUST ignore `/resume` comments that are older than (or equal to) the latest escalation marker comment for the job, comments whose author is not OWNER / MEMBER / COLLABORATOR, and comments that contain the specrunner notification marker (the bot's own comments). Re-escalation MUST append a new escalation marker so that a previously consumed `/resume` comment does not fire again.

#### Scenario: escalation マーカーより古いコメントでは再開しない

**Given** awaiting-resume の job の紐付け issue に、最新 escalation マーカーより古い `/resume` コメントしかない
**When** `specrunner inbox run` を実行する
**Then** その job は再開されない

#### Scenario: 権限のない author のコメントでは再開しない

**Given** 最新 escalation マーカーより新しい `/resume` コメントの author_association が COLLABORATOR / MEMBER / OWNER のいずれでもない
**When** `specrunner inbox run` を実行する
**Then** その job は再開されない

#### Scenario: bot 自身のコメントでは再開しない

**Given** 紐付け issue にある新しいコメントが specrunner 通知マーカーを含む（bot 自身のコメント）
**When** `specrunner inbox run` を実行する
**Then** そのコメントは resume コマンドとして解釈されず、job は再開されない

#### Scenario: 再 escalation 後は古い /resume が再発火しない

**Given** 一度 `/resume` で再開された job が再び escalation し、新しい escalation マーカーコメントが追記された
**When** 新しい `/resume` コメントを追加せずに `specrunner inbox run` を実行する
**Then** 以前消費した `/resume` コメントでは再開されない

### Requirement: 1 回の inbox run で新規起動する job 数の上限を config で制御する

inbox run SHALL start at most `inbox.maxStartsPerRun` new jobs in a single run, taking the value from config (with a documented default), and the `--limit` flag SHALL override it. Resume firings are not bounded by this limit.

#### Scenario: 起動上限が効く

**Given** 承認ラベル付き・未紐付け issue が上限より多く存在する
**When** `specrunner inbox run` を実行する
**Then** 起動される新規 job 数は上限を超えない

### Requirement: 承認ラベル名は config で設定可能で既定を持つ

The approve label SHALL be configurable via `inbox.approveLabel` and SHALL default to `specrunner-approved` when unset.

#### Scenario: 既定の承認ラベル

**Given** config に `inbox.approveLabel` が設定されていない
**When** inbox run が承認ラベルを解決する
**Then** `specrunner-approved` が承認ラベルとして使われる

### Requirement: issue 紐付けのない既存 job に影響しない

inbox run MUST NOT change the behavior of jobs that are not linked to an issue. Start scanning operates only on issues; resume scanning operates only on issue-linked awaiting-resume jobs.

#### Scenario: 紐付けのない awaiting-resume job は触らない

**Given** issueNumber を持たない awaiting-resume の job が存在する
**When** `specrunner inbox run` を実行する
**Then** その job は再開されず、状態も変更されない

### Requirement: GitHubClient port を forge 中立な意味論で拡張する

The GitHubClient port SHALL expose, with forge-neutral semantics, (a) listing open issues that carry a given label (excluding pull requests) and (b) listing the comments of an issue including each comment's author association and creation time. Both operations SHALL traverse pagination to return complete results.

#### Scenario: ラベルで open issue を取得する（PR を除外）

**Given** あるラベルが付いた open issue と、同じラベルが付いた pull request が存在する
**When** ラベルによる issue 検索を呼ぶ
**Then** issue は結果に含まれ、pull request は除外される

#### Scenario: コメント一覧が author_association と作成時刻を含む

**Given** 複数ページにまたがるコメントを持つ issue
**When** issue コメント一覧を呼ぶ
**Then** 全ページのコメントが、各コメントの author_association と作成時刻とともに返る
