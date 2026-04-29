# spec-review-session Specification

## Purpose
TBD - created by archiving change 2026-04-29-spec-review-pipeline. Update Purpose after archive.
## Requirements
### Requirement: spec-review セッションは標準ツールのみで作成される

`sessions.create` 呼び出し時、Agent には MUST 標準 toolset (`agent_toolset_20260401`) のみが結合された Agent が指定される。Custom Tool は SHALL 含めない。リソースとしては SHALL 対象 GitHub リポジトリが `authorization_token` 付きでマウントされる。

#### Scenario: セッション作成パラメータ

- **WHEN** spec-review セッションを作成する
- **THEN** リクエストボディは `agent: { id, type: "agent" }`、`environment_id`、`resources: [{ type: "github_repository", repository: { owner, name }, authorization_token }]` を含み、`tools` プロパティに custom tool を含まない

### Requirement: spec-review セッションには初回メッセージとして system prompt 派生のテンプレートを送る

セッション作成直後、CLI は MUST `events.send` で `user.message` 1 件を送信する。本文には change folder のパス（`openspec/changes/<slug>/`）、request type、有効化された opt-in フラグ、verdict ファイルの出力先パス（`openspec/changes/<slug>/spec-review-result-{NNN}.md`、`{NNN}` は 1-origin iteration の 3 桁ゼロ埋め）、verdict 行のフォーマット指示を含める。ユーザー入力は SHALL `<user-request>...</user-request>` XML タグで囲み、プロンプトインジェクションを構造的に防御する。

#### Scenario: 初回メッセージ送信（iteration ごとのファイル名）

- **WHEN** iter=2 の spec-review セッションが作成された直後
- **THEN** `events.send` が 1 度呼ばれ、本文に `<user-request>` と `</user-request>` の対、change folder パス、`spec-review-result-002.md` の文字列、`- **verdict**:` のフォーマット指示が含まれる

### Requirement: spec-review セッションは architect + spec-reviewer の役割を 1 セッションで担う

system prompt は MUST architect 観点（feasibility / architecture）と spec-reviewer 観点（completeness / consistency）の両方を 1 セッションで実施するよう指示する。修正の提案は SHALL 行わない（次 request の spec-fixer に委譲）。verdict は `approved` / `needs-fix` / `escalation` の 3 値のいずれかを返す。

#### Scenario: system prompt 内容

- **WHEN** `buildSpecReviewSystemPrompt(input)` が呼ばれる
- **THEN** 戻り値の文字列に「architect」「spec-reviewer」「verdict」「approved」「needs-fix」「escalation」「Findings」のキーワードが含まれる

#### Scenario: 修正提案を含まない

- **WHEN** spec-review エージェントが needs-fix verdict を出す
- **THEN** spec-review-result.md には findings の Description と How to Fix のみが書かれ、エージェントが change folder のファイルを直接編集してコミットすることはない

### Requirement: spec-review セッション完了は sessions.retrieve() ポーリングで検知する

CLI は MUST `pollUntilComplete`（`src/core/completion.ts:58`）を `{ timeoutMs: config.specReview.timeoutMs }` で呼び出してポーリングを行う。完了判定は `status === "idle"`（`isProposeComplete` と同一）、`status === "terminated"` で異常完了と判定する。SSE は SHALL 使用しない。

#### Scenario: 正常完了の検知

- **WHEN** ポーリング中に `sessions.retrieve()` が `status: "idle"` を返す
- **THEN** `pollUntilComplete` がセッションオブジェクトを返し、次フェーズ（verdict ファイル取得）に進む

#### Scenario: 異常完了の検知

- **WHEN** ポーリング中に `sessions.retrieve()` が `status: "terminated"` を返す
- **THEN** ポーリングを終了し、state.status を `failed`、error.code を `SESSION_TERMINATED` に設定する

### Requirement: spec-review セッションは独立した timeout を持つ

spec-review セッションのポーリングは MUST propose と独立した timeout（default 10 分）を持つ。timeout を超えたら SHALL `error.code = "SESSION_TIMEOUT"` で failed にする。

#### Scenario: timeout 超過

- **WHEN** spec-review ポーリング開始から 10 分を超えてもセッションが完了しない
- **THEN** state.status を `failed`、error.code を `SESSION_TIMEOUT` に設定し、`Spec-review session timed out after 10 minutes.` を stderr に出力する

### Requirement: verdict ファイルは GitHub API で取得し行頭マッチでパースする

セッション完了後、CLI は MUST `deps.githubClient.getRawFile(owner, repo, branch, path): Promise<string | null>` を呼び（404 は 1 秒間隔で最大 3 回までリトライしてから null を返す `GitHubClient` port の adapter 実装に委譲する。401 は `GITHUB_TOKEN_EXPIRED` を throw する）、戻り値の文字列に対して `/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m` でパースする。最初にマッチした verdict 行を採用する（first-write-wins）。`iteration` は SHALL 1-origin で findings ファイル名のサフィックス（`spec-review-result-{NNN}.md`、3 桁ゼロ埋め）に対応する。

#### Scenario: iteration ごとに別ファイル

- **WHEN** iter=1 の spec-review が完了し、続いて iter=2 の spec-review が完了する
- **THEN** `state.steps["spec-review"][0].findingsPath` が `openspec/changes/<slug>/spec-review-result-001.md`、`state.steps["spec-review"][1].findingsPath` が `openspec/changes/<slug>/spec-review-result-002.md` であり、それぞれ独立した verdict ファイルとして記録される

#### Scenario: approved

- **WHEN** verdict ファイルに `- **verdict**: approved` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `approved` になり、state.status は `success`

#### Scenario: needs-fix

- **WHEN** verdict ファイルに `- **verdict**: needs-fix` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `needs-fix` になり、stdout に findings サマリが出力される（loop プリミティブが次 iter の判定に使う）

#### Scenario: escalation

- **WHEN** verdict ファイルに `- **verdict**: escalation` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `escalation` になり、loop プリミティブは fixer を起動せずに loop を抜ける

### Requirement: verdict ファイル不在時のフェイルセーフ

`deps.githubClient.getRawFile` が null を返した（adapter 内部のリトライ後も 404）場合、CLI は MUST state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` に設定する。verdict 行がパースできない場合は SHALL state.steps["spec-review"] 末尾要素の verdict を `escalation`、stderr に `Spec-review verdict could not be parsed; treating as escalation.` を出力する。リトライ回数（最大 3 回）と間隔（1 秒）は `GitHubClient` port の getRawFile 実装の内部仕様であり、本 Requirement では呼び出し側の挙動のみを定義する。loop プリミティブから見ると `escalation` verdict の挙動と同じく fixer を起動せずに loop を抜ける。

#### Scenario: ファイル 404 (リトライ後も null)

- **WHEN** `deps.githubClient.getRawFile` が null を返す（adapter 内部リトライをすべて消費した後）
- **THEN** state.status が `failed`、error.code が `SPEC_REVIEW_RESULT_NOT_FOUND` になる

#### Scenario: verdict 行が無い

- **WHEN** verdict ファイルは存在するが verdict 行がパースできない
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `escalation` になり、stderr に warning メッセージが出力される（state.status は `success` のまま）。loop プリミティブは fixer を起動せずに loop を抜ける

