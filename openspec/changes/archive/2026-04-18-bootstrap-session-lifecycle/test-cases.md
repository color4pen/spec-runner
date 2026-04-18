# Test Cases: Bootstrap セッションライフサイクル

## Summary

- **Total**: 57 cases
- **Automated** (unit/integration/e2e): 51
- **Manual**: 6
- **Priority**: must: 35, should: 18, could: 4

## Test Cases

---

### TC-001: github-api.ts が `'use server'` ディレクティブを持たないこと

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1 — `github-api.ts` は Server Action ではない（`'use server'` ではない）

**GIVEN** `src/lib/github-api.ts` が存在する
**WHEN** ファイルの先頭を確認する
**THEN** `'use server'` ディレクティブが含まれていない

---

### TC-002: vault-actions.ts が `'use server'` ディレクティブを持たないこと

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1 — `vault-actions.ts` は `'use server'` なし。純粋な lib モジュール

**GIVEN** `src/lib/vault-actions.ts` が存在する
**WHEN** ファイルの先頭を確認する
**THEN** `'use server'` ディレクティブが含まれていない

---

### TC-003: session-completion-handler.ts が `'use server'` ディレクティブを持たないこと

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1 — `session-completion-handler.ts` は `'use server'` なし。純粋な lib モジュール

**GIVEN** `src/lib/session-completion-handler.ts` が存在する
**WHEN** ファイルの先頭を確認する
**THEN** `'use server'` ディレクティブが含まれていない

---

### TC-004: SSE route が bootstrap 固有ロジックを持たないこと

**Category**: unit
**Priority**: must
**Source**: design.md Decision 3 — bootstrap 固有ロジック（PR URL 抽出、ステータス更新など）は一切含まない

**GIVEN** `src/app/api/sessions/[id]/stream/route.ts` が存在する
**WHEN** ファイルの内容を確認する
**THEN** `handleBootstrapCompleted`・`bootstrap_pr_url`・`bootstrap_status`・`pr_pending` 等の bootstrap 固有識別子が含まれていない
**AND** `handleSessionCompleted` の呼び出しのみが含まれている

---

### TC-005: bootstrap-actions.ts から github-api.ts の関数を呼び出していること

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1 — bootstrap-actions からの直書き GitHub API 呼び出しを解消

**GIVEN** `src/lib/bootstrap-actions.ts` が存在する
**WHEN** ファイルの import と関数呼び出しを確認する
**THEN** `github-api.ts` からインポートされた関数（`getBranchExists`・`deleteBranch` 等）を使用している
**AND** `fetch` を使った GitHub API への直書き呼び出しが存在しない

---

### TC-006: session-completion-handler が role ベースで dispatch していること

**Category**: unit
**Priority**: must
**Source**: design.md Decision 7 — session.role で分岐する汎用設計

**GIVEN** `handleSessionCompleted(sessionDbId, accessToken)` が呼ばれる
**WHEN** DBのセッションの role が `'bootstrap'` である
**THEN** `handleBootstrapCompleted` が呼ばれる

---

### TC-007: session-completion-handler が未知の role に対してデフォルトハンドラを呼ぶこと

**Category**: unit
**Priority**: should
**Source**: design.md Decision 7 — default: セッションを completed に更新するだけ

**GIVEN** `handleSessionCompleted(sessionDbId, accessToken)` が呼ばれる
**WHEN** DBのセッションの role が `'implementer'`（bootstrap 以外）である
**THEN** エラーを throw せずセッションを `completed` に更新して正常終了する

---

### TC-008: createPullRequest が正常なパラメータで PR を作成すること

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.1 — `createPullRequest(token, owner, repo, params)` を実装

**GIVEN** 有効な GitHub OAuth トークン・owner・repo・head/base/title/body
**WHEN** `createPullRequest(token, owner, repo, params)` を呼ぶ
**THEN** GitHub API `POST /repos/{owner}/{repo}/pulls` が呼ばれる
**AND** 作成された PR の `html_url` と `number` が返る

---

### TC-009: getBranchExists がブランチ存在時に true を返すこと

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.4 — `getBranchExists`。404 は false を返す（throw しない）

**GIVEN** 指定ブランチが GitHub リポジトリに存在する
**WHEN** `getBranchExists(token, owner, repo, branch)` を呼ぶ
**THEN** `true` が返る

---

### TC-010: getBranchExists がブランチ不存在時に false を返すこと

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.4 — 404 は false を返す（throw しない）

**GIVEN** 指定ブランチが GitHub リポジトリに存在しない（404）
**WHEN** `getBranchExists(token, owner, repo, branch)` を呼ぶ
**THEN** 例外を throw せず `false` が返る

---

### TC-011: deleteBranch が冪等であること（404/422 を無視すること）

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.5 — 冪等（404/422 は無視）

**GIVEN** 指定ブランチが既に削除済み（404）または保護ブランチ（422）
**WHEN** `deleteBranch(token, owner, repo, branch)` を呼ぶ
**THEN** 例外を throw せず正常終了する

---

### TC-012: closePullRequest が冪等であること（既に closed なら no-op）

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.3 — 冪等（既に closed なら no-op）

**GIVEN** 指定 PR が既に `closed` または `merged` 状態
**WHEN** `closePullRequest(token, owner, repo, prNumber)` を呼ぶ
**THEN** 例外を throw せず正常終了する

---

### TC-013: findOpenPrByHead が同一 head ブランチの既存 PR を返すこと

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.6 — 冪等 PR 作成の前提チェック

**GIVEN** 指定の head ブランチに対してオープン状態の PR が既に存在する
**WHEN** `findOpenPrByHead(token, owner, repo, headBranch)` を呼ぶ
**THEN** 既存 PR の `html_url` と `number` が返る（null でない）

---

### TC-014: findOpenPrByHead が PR 未存在時に null を返すこと

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.6 — 冪等 PR 作成の前提チェック

**GIVEN** 指定の head ブランチに対してオープン状態の PR が存在しない
**WHEN** `findOpenPrByHead(token, owner, repo, headBranch)` を呼ぶ
**THEN** `null` が返る

---

### TC-015: handleBootstrapCompleted が PR 重複作成を防止すること（冪等性）

**Category**: integration
**Priority**: must
**Source**: design.md Risks — ブランチの存在確認 + 既存 PR の検索（`GET /repos/{owner}/{repo}/pulls?head={branch}`）で冪等性を担保

**GIVEN** セッション完了ハンドラが二重実行される状況
**AND** 既にオープン状態の PR が同一 head ブランチに存在する
**WHEN** `handleBootstrapCompleted` が実行される
**THEN** 新規 PR が作成されない
**AND** 既存の PR URL が `bootstrap_pr_url` として保存される

---

### TC-016: handleBootstrapCompleted がブランチ不存在時に uninitialized にロールバックすること

**Category**: integration
**Priority**: must
**Source**: design.md Decision 1 / tasks.md T-6.3 — ブランチが存在しなければ: bootstrap_status を `uninitialized` にロールバック、request を `cancelled`

**GIVEN** セッションが完了した
**AND** `openspec-bootstrap/{owner}/{repo}` ブランチが GitHub 上に存在しない
**WHEN** `handleBootstrapCompleted` が実行される
**THEN** `bootstrap_status` が `uninitialized` に更新される
**AND** request status が `cancelled` に更新される
**AND** PR は作成されない

---

### TC-017: handleBootstrapCompleted が PR 作成後 DB 更新失敗時に PR をクローズすること

**Category**: integration
**Priority**: should
**Source**: tasks.md T-6.4 — PR 作成後 DB 更新失敗時の PR クローズ（ベストエフォート）

**GIVEN** ブランチが存在し PR 作成は成功した
**AND** DB 更新（bootstrap_pr_url 保存）が失敗する
**WHEN** `handleBootstrapCompleted` がエラー処理を実行する
**THEN** 作成した PR が `closePullRequest` でクローズされる（ベストエフォート）

---

### TC-018: ensureVaultWithCredentials が vault_id null のユーザーに新規 Vault を作成すること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-3.1 — Vault 未作成なら作成し vault_id を users テーブルに保存

**GIVEN** users テーブルの対象ユーザーの `vault_id` が null である
**WHEN** `ensureVaultWithCredentials(userId, accessToken)` を呼ぶ
**THEN** `client.beta.vaults.create()` が呼ばれる
**AND** 新規 vault_id が users テーブルの対象ユーザーに保存される

---

### TC-019: ensureVaultWithCredentials が vault_id 既存ユーザーは Vault 作成をスキップすること

**Category**: integration
**Priority**: must
**Source**: design.md Decision 4 — ユーザーあたり 1 つで十分

**GIVEN** users テーブルの対象ユーザーの `vault_id` が非 null である
**WHEN** `ensureVaultWithCredentials(userId, accessToken)` を呼ぶ
**THEN** `client.beta.vaults.create()` が呼ばれない
**AND** 既存の vault_id が再利用される

---

### TC-020: ensureVaultWithCredentials が 409 時に認証情報を削除して再登録すること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-3.3 — 409 Conflict ハンドリング: credentials.list() で既存取得 → 削除 → 再登録

**GIVEN** Vault への MCP 認証情報登録が 409 Conflict を返す
**WHEN** `ensureVaultWithCredentials` の 409 ハンドリングが実行される
**THEN** `credentials.list(vaultId)` で既存認証情報が取得される
**AND** 既存認証情報が削除される
**AND** 新しい accessToken で認証情報が再登録される

---

### TC-021: Vault 認証情報の value が読み取り不可であること（書き込み専用）

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4 / proposal.md — Vault は書き込み専用。認証情報の値は読み取れない

**GIVEN** vault-actions.ts の実装
**WHEN** Vault 認証情報の操作コードを確認する
**THEN** `credentials.list()` の結果から `value`（トークン値）を読み取るコードが存在しない
**AND** 認証情報の value は登録時のみ指定される

---

### TC-022: startBootstrap が認証済みユーザーのみ実行できること

**Category**: integration
**Priority**: must
**Source**: design.md Decision 1 — 呼び出し元の Server Action が `getAuthenticatedUser()` で認証・認可を担保

**GIVEN** 認証されていないリクエスト（セッション未存在）
**WHEN** `startBootstrap(repositoryId, agentId, environmentId)` を呼ぶ
**THEN** 認証エラーが返る
**AND** Vault 作成・request 作成・session 作成は実行されない

---

### TC-023: startBootstrap が他ユーザーのリポジトリに対して IDOR を防止すること

**Category**: integration
**Priority**: must
**Source**: pipeline-context.md must-areas — IDOR防止（security=yes）

**GIVEN** 認証済みユーザー A が存在する
**AND** リポジトリがユーザー B に属する
**WHEN** ユーザー A が `startBootstrap(repositoryBId, ...)` を呼ぶ
**THEN** 操作が拒否される（403 相当のエラー）
**AND** セッション・request は作成されない

---

### TC-024: ステータス API が他ユーザーのリポジトリ情報を返さないこと（IDOR防止）

**Category**: integration
**Priority**: must
**Source**: tasks.md T-9.1 — 認証 + 所有権検証付き / pipeline-context.md must-areas — IDOR（security=yes）

**GIVEN** 認証済みユーザー A が存在する
**AND** リポジトリがユーザー B に属する
**WHEN** `GET /api/repos/{owner}/{name}/status` をユーザー A が呼ぶ
**THEN** 404 または 403 が返る
**AND** ユーザー B のリポジトリ情報が漏洩しない

---

### TC-025: ステータス API が未認証リクエストを拒否すること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-9.1 — 認証 + 所有権検証付き

**GIVEN** 認証トークンなしのリクエスト
**WHEN** `GET /api/repos/{owner}/{name}/status` を呼ぶ
**THEN** 401 が返る

---

### TC-026: ステータス API のレスポンス形状が仕様通りであること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-9.1 / design.md Decision 6 — `{ bootstrapStatus, bootstrapPrUrl, requestStatus }`

**GIVEN** 認証済みユーザーが自分のリポジトリに対してリクエストする
**WHEN** `GET /api/repos/{owner}/{name}/status` を呼ぶ
**THEN** レスポンスボディに `bootstrapStatus`・`bootstrapPrUrl`・`requestStatus` の 3 フィールドが含まれる
**AND** HTTP ステータスコードが 200 である

---

### TC-027: requests.type の CHECK 制約に `bootstrap` が含まれること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-1.2 / pipeline-context.md must-areas — データ整合性（data-model=yes）

**GIVEN** マイグレーション適用後の DB
**WHEN** `requests` テーブルに `type = 'bootstrap'` でレコードを INSERT する
**THEN** 制約違反が発生しない

---

### TC-028: sessions.role の CHECK 制約に `bootstrap` が含まれること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-1.3 / pipeline-context.md must-areas — データ整合性（data-model=yes）

**GIVEN** マイグレーション適用後の DB
**WHEN** `sessions` テーブルに `role = 'bootstrap'` でレコードを INSERT する
**THEN** 制約違反が発生しない

---

### TC-029: 既存の requests.type 値が制約変更後も有効であること

**Category**: integration
**Priority**: must
**Source**: pipeline-context.md must-areas — データ整合性（data-model=yes）/ design.md Migration Plan

**GIVEN** マイグレーション適用後の DB
**WHEN** `requests` テーブルに `type = 'new-feature'`・`'spec-change'`・`'refactoring'`・`'bugfix'` でレコードを INSERT する
**THEN** 制約違反が発生しない（既存 enum 値が保持されている）

---

### TC-030: マイグレーションが冪等であること（二重適用で破壊しないこと）

**Category**: integration
**Priority**: must
**Source**: pipeline-context.md must-areas — マイグレーション冪等性（data-model=yes）

**GIVEN** マイグレーションが一度適用済みの DB
**WHEN** 同じマイグレーションを再度適用する
**THEN** エラーが発生しない
**AND** 既存データが保持される

---

### TC-031: cancelBootstrap が bootstrapping 状態から正常にキャンセルすること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-7.3 — bootstrapping: session archive → status rollback → request cancel

**GIVEN** リポジトリの `bootstrap_status` が `bootstrapping` である
**AND** 対応するセッションがアクティブである
**WHEN** `cancelBootstrap(repositoryId)` を呼ぶ
**THEN** セッションが archive される
**AND** `bootstrap_status` が `uninitialized` に戻る
**AND** request status が `cancelled` になる

---

### TC-032: cancelBootstrap が pr_pending 状態から正常にキャンセルすること

**Category**: integration
**Priority**: must
**Source**: tasks.md T-7.3 — pr_pending: PR close + branch delete → pr_url clear → status rollback → request cancel

**GIVEN** リポジトリの `bootstrap_status` が `pr_pending` である
**AND** `bootstrap_pr_url` に PR URL が設定されている
**WHEN** `cancelBootstrap(repositoryId)` を呼ぶ
**THEN** 対応する PR が `closePullRequest` でクローズされる
**AND** `openspec-bootstrap/{owner}/{repo}` ブランチが削除される
**AND** `bootstrap_pr_url` が null にクリアされる
**AND** `bootstrap_status` が `uninitialized` に戻る
**AND** request status が `cancelled` になる

---

### TC-033: cancelBootstrap が既にキャンセル済みの場合に no-op であること

**Category**: unit
**Priority**: must
**Source**: design.md Decision 1 — 冪等性: 既にキャンセル済みなら no-op

**GIVEN** リポジトリの `bootstrap_status` が `uninitialized` である（既にキャンセル済み）
**WHEN** `cancelBootstrap(repositoryId)` を呼ぶ
**THEN** エラーが発生しない
**AND** GitHub API（PR クローズ・ブランチ削除）が呼ばれない

---

### TC-034: startBootstrap が type=bootstrap / role=bootstrap でリソースを作成すること

**Category**: integration
**Priority**: must
**Source**: design.md Decision 2 — type: 'bootstrap', role: 'bootstrap' で作成

**GIVEN** 有効な repositoryId・agentId・environmentId
**AND** 認証済みユーザーが存在する
**WHEN** `startBootstrap(repositoryId, agentId, environmentId)` を呼ぶ
**THEN** `requests` テーブルに `type = 'bootstrap'` のレコードが作成される
**AND** `sessions` テーブルに `role = 'bootstrap'` のレコードが作成される

---

### TC-035: SSE route の完了検知ロジックが session_updated + idle + end_turn で発火すること

**Category**: integration
**Priority**: should
**Source**: design.md Decision 3 — `session_updated` + `idle` + `end_turn` の組み合わせを検知

**GIVEN** SSE ストリームが受信するイベントのシミュレーション
**WHEN** `event.type === 'session_updated'` かつ `event.session.status === 'idle'` かつ直前のメッセージの `stop_reason.type === 'end_turn'` が揃う
**THEN** `handleSessionCompleted(sessionDbId, accessToken)` が一度だけ呼ばれる

---

### TC-036: SSE route の完了検知が条件未満では発火しないこと

**Category**: integration
**Priority**: should
**Source**: design.md Decision 3 — 条件の組み合わせ全てが揃ったときのみ完了とする

**GIVEN** SSE ストリームが受信するイベントのシミュレーション
**WHEN** `session_updated` + `idle` だが `end_turn` がない（または `idle` のみ）
**THEN** `handleSessionCompleted` が呼ばれない

---

### TC-037: createBoundSession が vault_id 非 null のユーザーに Vault リソースを追加すること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-4.2 — user の vault_id が非 null なら `{ type: 'vault', vault_id: vaultId }` を resources に追加

**GIVEN** users テーブルの対象ユーザーの `vault_id` が非 null である
**WHEN** `createBoundSession` が呼ばれる
**THEN** Anthropic Sessions API への呼び出しに `{ type: 'vault', vault_id: vaultId }` が resources として含まれる

---

### TC-038: createBoundSession が vault_id null のユーザーに Vault リソースを追加しないこと

**Category**: unit
**Priority**: should
**Source**: tasks.md T-4.2 — vault_id が非 null の場合のみ追加

**GIVEN** users テーブルの対象ユーザーの `vault_id` が null である
**WHEN** `createBoundSession` が呼ばれる
**THEN** Anthropic Sessions API への呼び出しに `vault` type の resources が含まれない

---

### TC-039: buildBootstrapMessage にブランチ名が含まれ PR 作成指示が含まれないこと

**Category**: unit
**Priority**: should
**Source**: tasks.md T-7.2 — ブランチ名を指示に追加。PR 作成指示を除去。commit + push のみ

**GIVEN** `buildBootstrapMessage(owner, repo, ...)` を呼ぶ
**WHEN** 生成されたメッセージを確認する
**THEN** `openspec-bootstrap/{owner}/{repo}` の形式のブランチ名が含まれる
**AND** PR 作成に関する指示（"create pull request"・"gh pr" 等）が含まれない
**AND** commit と push の指示が含まれる

---

### TC-040: request-actions の VALID_TYPES に bootstrap が含まれること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-5.1

**GIVEN** `src/lib/request-actions.ts` の `VALID_TYPES` 定数
**WHEN** 値を確認する
**THEN** `'bootstrap'` が含まれる

---

### TC-041: request-actions の ALLOWED_TRANSITIONS で reviewing から cancelled への遷移が可能であること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-5.2 — `reviewing: ['completed', 'in-progress', 'cancelled']`

**GIVEN** request status が `reviewing` の場合の状態遷移設定
**WHEN** `ALLOWED_TRANSITIONS` の `reviewing` エントリを確認する
**THEN** `'cancelled'` が遷移先として含まれる

---

### TC-042: MCP URL が末尾スラッシュなしで登録されること

**Category**: unit
**Priority**: should
**Source**: design.md Decision 4 / request.md — MCP URL は末尾スラッシュなし `https://api.githubcopilot.com/mcp`

**GIVEN** `vault-actions.ts` の認証情報登録コード
**WHEN** `mcp_server_url` の値を確認する
**THEN** `'https://api.githubcopilot.com/mcp'` が使用されている（末尾スラッシュなし）

---

### TC-043: processBootstrapSessionEvent と handleBootstrapSessionCompletedWithoutPr が削除されていること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-7.4 / T-12.1 / T-12.2 — デッドコード削除

**GIVEN** `src/lib/bootstrap-actions.ts` が存在する
**WHEN** ファイルの内容を確認する
**THEN** `processBootstrapSessionEvent` の定義が存在しない
**AND** `handleBootstrapSessionCompletedWithoutPr` の定義が存在しない

---

### TC-044: syncBootstrapPrStatus が github-api.ts の getPullRequestStatus を使うこと

**Category**: unit
**Priority**: should
**Source**: tasks.md T-12.3 — GitHub API 直書き部分を github-api.ts に委譲

**GIVEN** `syncBootstrapPrStatus` の実装
**WHEN** PR ステータス取得の呼び出しを確認する
**THEN** `github-api.ts` の `getPullRequestStatus` が呼ばれている
**AND** 直接 `fetch` で GitHub API を呼ぶコードが存在しない

---

### TC-045: ステータスポーリングが pr_pending 検知時に停止すること

**Category**: e2e
**Priority**: should
**Source**: design.md Decision 6 — 状態が pr_pending に変化したら PR URL をチャットに表示

**GIVEN** ユーザーが bootstrap を開始しセッションが完了した
**WHEN** クライアントのポーリングロジックが `bootstrapStatus === 'pr_pending'` を検知する
**THEN** ポーリングが停止する
**AND** PR URL がチャット内に表示される
**AND** `router.refresh()` が呼ばれる

---

### TC-046: キャンセルボタンが bootstrapping 状態で表示されること

**Category**: e2e
**Priority**: should
**Source**: design.md Decision 6 — キャンセルボタン: `bootstrapping` または `pr_pending` 状態で表示

**GIVEN** リポジトリの `bootstrap_status` が `bootstrapping` である
**WHEN** UI を確認する
**THEN** キャンセルボタンが表示されている

---

### TC-047: キャンセルボタンが pr_pending 状態で表示されること

**Category**: e2e
**Priority**: should
**Source**: design.md Decision 6 — キャンセルボタン: `bootstrapping` または `pr_pending` 状態で表示

**GIVEN** リポジトリの `bootstrap_status` が `pr_pending` である
**WHEN** UI を確認する
**THEN** キャンセルボタンが表示されている

---

### TC-048: キャンセルボタンが uninitialized / ready 状態では表示されないこと

**Category**: e2e
**Priority**: could
**Source**: design.md Decision 6 の反面（対象外の状態では非表示）

**GIVEN** リポジトリの `bootstrap_status` が `uninitialized` または `ready` である
**WHEN** UI を確認する
**THEN** キャンセルボタンが表示されていない

---

### TC-049: PR マージ後にリポジトリ状態が ready に更新されること

**Category**: manual
**Priority**: should
**Source**: request.md 受け入れ基準 — PR merge 後にリポ状態が ready に更新される

**GIVEN** `bootstrap_status` が `pr_pending` のリポジトリが存在する
**WHEN** GitHub 上で bootstrap PR をマージする
**THEN** リポジトリの `bootstrap_status` が `ready` に更新される（ポーリングまたは手動更新後）

---

### TC-050: Vault API の beta ヘッダが設定されていること

**Category**: manual
**Priority**: should
**Source**: design.md Risks — `client.beta.vaults` は beta API

**GIVEN** `vault-actions.ts` の実装
**WHEN** Anthropic SDK の Vault API 呼び出しを確認する
**THEN** beta 対応の SDK 呼び出し（`client.beta.vaults`）が使用されており、安定版 API ではない

---

### TC-051: bootstrap 完了フロー全体（開始〜PR URL 表示）が動作すること

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準全体

**GIVEN** GitHub OAuth でログイン済みのユーザーが存在する
**AND** bootstrap 未実施のリポジトリが登録されている
**WHEN** bootstrap を開始しエージェントが commit + push を完了する
**THEN** アプリ側で PR が自動作成される
**AND** PR URL がチャット画面に表示される
**AND** `bootstrap_status` が `pr_pending` になる

---

### TC-052: bootstrap キャンセル UI フロー（bootstrapping 状態）が動作すること

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準 — キャンセルボタンで bootstrap を中止できる

**GIVEN** `bootstrap_status` が `bootstrapping` の状態でキャンセルボタンが表示されている
**WHEN** キャンセルボタンをクリックする
**THEN** セッションが中断される
**AND** `bootstrap_status` が `uninitialized` に戻る
**AND** キャンセルボタンが非表示になる

---

### TC-053: bootstrap キャンセル UI フロー（pr_pending 状態）が動作すること

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準 — キャンセルボタンで bootstrap を中止できる

**GIVEN** `bootstrap_status` が `pr_pending` の状態でキャンセルボタンが表示されている
**WHEN** キャンセルボタンをクリックする
**THEN** GitHub 上の PR がクローズされる
**AND** ブランチが削除される
**AND** `bootstrap_status` が `uninitialized` に戻る

---

### TC-054: db:push 後に既存データが破損しないこと

**Category**: manual
**Priority**: could
**Source**: design.md Migration Plan — `bun run db:push` でスキーマ変更を DB に反映

**GIVEN** 既存の requests / sessions / repositories のデータが DB に存在する
**WHEN** `bun run db:push` でスキーマ変更（bootstrap enum 追加・vault_id カラム追加）を適用する
**THEN** 既存レコードが保持されている
**AND** 既存レコードの type/role 値が変化していない

---

### TC-055: ステータスポーリングが最大 30 回で終了すること

**Category**: unit
**Priority**: could
**Source**: design.md Decision 6 — 3 秒間隔、最大 30 回

**GIVEN** ポーリング中に状態変化がない（タイムアウトシナリオ）
**WHEN** ポーリングが 30 回実行される
**THEN** 31 回目の API 呼び出しが発生しない
**AND** タイムアウトとして処理される

---

### TC-056: getPullRequestStatus が state / merged / html_url を返すこと

**Category**: unit
**Priority**: could
**Source**: tasks.md T-2.2 — state/merged/html_url を返す

**GIVEN** GitHub 上に存在する PR 番号
**WHEN** `getPullRequestStatus(token, owner, repo, prNumber)` を呼ぶ
**THEN** レスポンスに `state`（open/closed）・`merged`（boolean）・`html_url` が含まれる

---

### TC-057: 既存 bootstrap テストの type/role 値が更新されていること

**Category**: unit
**Priority**: should
**Source**: tasks.md T-11.1 — bootstrap 関連テストの type/role 値を `'bootstrap'` に更新

**GIVEN** 既存の bootstrap 関連テストが存在する
**WHEN** テストを実行する
**THEN** `type: 'new-feature'` / `role: 'implementer'` を前提とするアサーションが存在しない
**AND** `type: 'bootstrap'` / `role: 'bootstrap'` を期待するアサーションに更新されている
