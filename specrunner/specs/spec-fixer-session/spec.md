# spec-fixer-session Specification

## Purpose
TBD - created by archiving change spec-fixer-iteration-loop. Update Purpose after archive.
## Requirements
### Requirement: spec-fixer セッションは標準ツールのみで作成され Custom Tools を含まない

`runSpecFixerStep` における `sessions.create` 呼び出し時、Agent には MUST 標準 toolset (`agent_toolset_20260401`) のみが結合された spec-fixer 専用 Agent が指定される。Custom Tool（`register_branch` を含む）は SHALL 一切含めない。リソースとしては SHALL 対象 GitHub リポジトリが `authorization_token` 付きでマウントされる。

#### Scenario: セッション作成パラメータ

- **WHEN** spec-fixer セッションを作成する
- **THEN** リクエストボディは `agent: { id: config.agents.specFixer.id, type: "agent" }`、`environment_id`、`resources: [{ type: "github_repository", repository: { owner, name }, authorization_token }]` を含み、`tools` プロパティに custom tool を含まない

### Requirement: spec-fixer セッションには初回メッセージとして findings 修正指示テンプレートを送る

セッション作成直後、CLI は MUST `events.send` で `user.message` 1 件を送信する。本文には change folder のパス（`openspec/changes/<slug>/`）、findings ファイルのパス（`openspec/changes/<slug>/spec-review-result-{NNN}.md`）、対象ブランチ名、修正完了後に `git commit && git push` を実行する指示、修正不能 findings は `<!-- spec-fixer-deferred: ... -->` で記録する指示を含める。ユーザー入力は SHALL `<user-request>...</user-request>` XML タグで囲み、プロンプトインジェクションを構造的に防御する。

#### Scenario: 初回メッセージ送信

- **WHEN** spec-fixer セッションが作成された直後
- **THEN** `events.send` が 1 度呼ばれ、本文に `<user-request>` と `</user-request>` の対、change folder パス、`spec-review-result` を含む findings ファイル名、ブランチ名、`commit` および `push` の文字列を含む

### Requirement: spec-fixer が修正不能と判断した findings は deferred メモで記録し retry 上限に委ねる

spec-fixer セッションが findings を「修正不能」と判断した場合、SHALL `proposal.md` または `design.md` の末尾に `<!-- spec-fixer-deferred: <finding#> <理由> -->` を残す。この deferred メモは次 iter の spec-review が change folder を読んだ際に観測される。

deferred メモの扱い:

- 次 iter の spec-review は deferred メモを確認し、当該 finding が依然として `needs-fix` 相当かを判断する
- spec-review が deferred メモを許容するか否かの判定は spec-review エージェントが行う（CLI は関与しない）
- 「修正不能」判定の基準（findings Description が抽象的すぎる / 既存 spec との矛盾を含む 等）は spec-fixer の system prompt に記載しない。spec-fixer は可能な限り修正を試みてから deferred メモを残すのみである

早期 escalation ルートは本 request ではスコープ外（design Open Questions 2 点目）。retry 上限（`SPEC_REVIEW_RETRIES_EXHAUSTED`）到達によって吸収されることを設計上の合意として固定する。無限ループは `config.pipeline.maxRetries`（既定 2）で上限が保証される。

#### Scenario: spec-fixer が deferred メモを残した場合

- **WHEN** spec-fixer が finding を修正不能と判断し `<!-- spec-fixer-deferred: #3 request.md との矛盾を含むため修正不可 -->` を design.md 末尾に追記してセッションを終了する
- **THEN** CLI は session 完了を正常扱いとし、次 iter の spec-review が deferred メモを観測して再評価を行う。deferred finding が HIGH/CRITICAL であれば spec-review は `needs-fix` を返す可能性がある

### Requirement: spec-fixer の system prompt は「修正のみ」を明記する

`buildSpecFixerSystemPrompt(input)` は MUST 以下のキーワードを含む文字列を返す: 「spec-fixer」「修正のみ」「レビュー」「方針変更」「禁止」「findings」「commit」「push」「Author-Bias Elimination」または「前回の文脈を持ちません」。

#### Scenario: system prompt 内容

- **WHEN** `buildSpecFixerSystemPrompt(input)` が呼ばれる
- **THEN** 戻り値の文字列に「spec-fixer」「修正」「findings」「commit」「push」のキーワードが含まれ、かつレビュー禁止または方針変更禁止の旨を述べる文字列が含まれる

### Requirement: spec-fixer セッションは verdict を返さない（findings 生成なし）

spec-fixer セッションは MUST verdict ファイルを生成せず、`state.steps["spec-fixer"][i].verdict` は SHALL `null` で記録される。`findingsPath` も SHALL `null` である。spec-fixer の成果物は change folder への直接編集とブランチへの push のみである。

#### Scenario: 完了時の状態

- **WHEN** spec-fixer セッションが正常完了する
- **THEN** state.steps["spec-fixer"] の末尾要素は `{ iteration, session: { id, agentId, environmentId }, verdict: null, findingsPath: null, completedAt: <ISO8601>, error: null }` の形式である

### Requirement: spec-fixer セッション完了は sessions.retrieve() ポーリングで検知する

CLI は MUST `pollUntilComplete` を `{ timeoutMs: config.specFixer?.timeoutMs ?? 600_000 }` で呼び出してポーリングを行う。完了判定は `status === "idle"`、`status === "terminated"` で異常完了と判定する。SSE は SHALL 使用しない。

#### Scenario: 正常完了の検知

- **WHEN** ポーリング中に `sessions.retrieve()` が `status: "idle"` を返す
- **THEN** `pollUntilComplete` がセッションオブジェクトを返し、state.steps["spec-fixer"] に push して runPipeline の loop body 内で次の spec-review に進む

#### Scenario: 異常完了の検知

- **WHEN** ポーリング中に `sessions.retrieve()` が `status: "terminated"` を返す
- **THEN** ポーリングを終了し、state.steps["spec-fixer"] の末尾要素の error.code を `SESSION_TERMINATED` に設定し、state.status を `failed` にして runPipeline は loop を抜ける

### Requirement: spec-fixer の push 失敗検知は次 iter の spec-review に委ねる

spec-fixer セッションは標準ツール（git）経由で `git commit && git push` を実行するが、CLI 側から push の成否を直接検証する手段はない（session 内部の標準ツール実行結果は CLI に返らない）。このため CLI は MUST push 失敗を独自エラーコード（例: `SPEC_FIXER_PUSH_INCOMPLETE`）で即時検知しない。push 失敗の検知は SHALL 次 iter の spec-review が change folder を再評価することで間接的に行われ、修正コミットが反映されていない場合に SHALL `needs-fix` または `escalation` を返す。retry 上限到達時は SHALL `SPEC_REVIEW_RETRIES_EXHAUSTED` として state.error に記録される（design D4 / D11 と整合）。

この委任方式は design D11「spec-fixer の失敗自体は次 iter の spec-review に再評価を委ねる」の明文化であり、CLI スコープ外の標準ツール内部実行を観察しないという意図的な設計決定である。

#### Scenario: push 未完了で session が idle 終了

- **WHEN** spec-fixer セッションが `status: "idle"` で完了したが push が実際には失敗していた
- **THEN** CLI は session 完了を正常扱いとし `state.steps["spec-fixer"]` の末尾要素を `{ verdict: null, findingsPath: null, error: null }` で記録する。次 iter の spec-review が change folder を再評価して `needs-fix` を返すことで push 失敗が間接的に検出される

#### Scenario: push 失敗が retry 上限まで繰り返された場合

- **WHEN** spec-fixer の push 失敗が続き retry 上限（`config.pipeline.maxRetries`）に到達する
- **THEN** `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` が記録され、ユーザーは `spec-review-result-{NNN}.md` を参照して手動対応できる

### Requirement: `runSpecFixerStep` は `src/core/steps/spec-fixer.ts` に配置される

`runSpecFixerStep` 関数は MUST `src/core/steps/spec-fixer.ts` に配置され、シグネチャは SHALL `(state: JobState, deps: PipelineDeps) => Promise<JobState>` である。`buildSpecFixerSystemPrompt` は SHALL `src/prompts/spec-fixer-system.ts` に配置され、`{ slug, branch, findingsPath }` を入力に取り system prompt 文字列を返す。

#### Scenario: ファイル配置

- **WHEN** spec-fixer step を実装する
- **THEN** `src/core/steps/spec-fixer.ts` と `src/prompts/spec-fixer-system.ts` の 2 ファイルが存在し、それぞれ `runSpecFixerStep` と `buildSpecFixerSystemPrompt` を export する

### Requirement: spec-fixer step は直前の spec-review iteration の findingsPath を入力に取る

`runSpecFixerStep` は MUST `getLatestStepResult(state, "spec-review")` で直前の spec-review StepResult を取得し、その `findingsPath` を初回メッセージの本文に埋め込む。`findingsPath` が null または StepResult が存在しない場合、SHALL state.status を `failed`、error.code を `SPEC_FIXER_NO_FINDINGS` に設定して終了する。

#### Scenario: 正常な findings 入力

- **WHEN** state.steps["spec-review"] の末尾要素の findingsPath が `openspec/changes/<slug>/spec-review-result-001.md` である
- **THEN** spec-fixer セッションへの初回メッセージ本文にそのパス文字列が含まれる

#### Scenario: findings 不在

- **WHEN** state.steps["spec-review"] が空、または末尾要素の findingsPath が null
- **THEN** state.status が `failed`、error.code が `SPEC_FIXER_NO_FINDINGS` になる

