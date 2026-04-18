## Context

PR #3 で bootstrap 機能を実装し、PR #4 で SSE route handler に完了検知・archive・PR 作成を応急処置として埋め込んだ。この構造は以下の問題を抱える:

1. SSE route が「イベントストリーミング」以外の責務（bootstrap 完了検知、PR 作成、DB 更新）を持つ
2. bootstrap が `type: 'new-feature'` / `role: 'implementer'` として動作し、固有の型を持たない
3. セッション完了時の処理が title 文字列のハードコード判定（`'Bootstrap openspec-workflow'`）に依存
4. マネージドエージェント環境に gh CLI がなく、エージェント内から PR を作成できない
5. GitHub REST API 呼び出しが bootstrap-actions.ts にインラインで存在

現行アーキテクチャ:
- Next.js 16 App Router + TypeScript + Bun
- @anthropic-ai/sdk（Vault, MCP, Sessions）
- SQLite + Drizzle ORM
- 3 層スキーマ: repositories → requests → sessions

## Goals / Non-Goals

**Goals:**
- bootstrap を `request.type = 'bootstrap'` / `session.role = 'bootstrap'` として型安全にモデル化する
- SSE route の責務をイベントストリーミングのみに限定する
- セッション完了時の処理を role ベースで分岐する汎用ハンドラを設計する
- GitHub REST API 操作を lib に集約し、bootstrap 以外の将来ユースケースにも対応する
- Vault を使い MCP 認証情報をマネージドエージェントに安全に渡す
- PR 作成をアプリ側に移し、エージェントは commit + push のみ行う

**Non-Goals:**
- execute-request のマルチセッション対応（設計・実装・レビューの別 role）の実装。session-completion-handler は拡張可能だが、今回は bootstrap role のみ実装する
- Vault 認証情報のローテーション。初回セットアップと 409 時の再登録のみ
- PR merge 後の自動ワークフロー起動
- リポジトリの再 bootstrap（`ready` は terminal のまま）
- webhook による PR ステータス通知（ポーリングで対応）

## Decisions

### Decision 1: レイヤー分離アーキテクチャ

4 つのモジュールに責務を分離する。

```
src/lib/
├── github-api.ts                  # GitHub REST API 操作の集約
├── vault-actions.ts               # Vault ライフサイクル管理
├── session-completion-handler.ts  # セッション完了時の role ベース分岐
├── bootstrap-actions.ts           # bootstrap 固有ロジック（既存を再設計）
├── session-actions.ts             # セッション CRUD（既存）
├── request-actions.ts             # リクエスト CRUD（既存）
└── ...
```

**`github-api.ts`** — GitHub REST API 操作の集約:
- `createPullRequest(token, owner, repo, params)`: PR 作成。head/base/title/body を受け取る
- `closePullRequest(token, owner, repo, prNumber)`: PR クローズ
- `deleteBranch(token, owner, repo, branch)`: ブランチ削除
- `getBranchExists(token, owner, repo, branch)`: ブランチ存在確認
- `getPullRequestStatus(token, owner, repo, prNumber)`: PR ステータス取得（merged/closed/open）

全関数は `token` を引数に取る純粋な API ラッパー。Server Action ではない（`'use server'` ではない）。呼び出し元の Server Action が `getAuthenticatedUser()` で認証・認可を担保する。

**代替案**: github.ts に追加する → 却下。github.ts は GitHub OAuth 用リポジトリ一覧取得のみ。REST API の PR 操作とは関心が異なる。

**`vault-actions.ts`** — Vault ライフサイクル管理（`'use server'` なし。純粋な lib モジュール）:
- `ensureVaultWithCredentials(userDbId, accessToken)`: Vault が未作成なら作成し、MCP 認証情報を登録。vault_id を users テーブルに保存して再利用。呼び出し元（bootstrap-actions.ts）が `getAuthenticatedUser()` で取得した値を渡す
- 内部: `createVault()`, `addMcpCredential(vaultId, accessToken)`, `clearAndReaddCredential(vaultId, accessToken)`
- 409 Conflict 時: 既存の認証情報を削除して再登録（Vault あたり 1 MCP URL / 1 認証情報の制限）
- MCP URL: `https://api.githubcopilot.com/mcp`（末尾スラッシュなし）
- Vault は書き込み専用。認証情報の値は読み取れない

**`session-completion-handler.ts`** — セッション完了時の role ベース分岐（`'use server'` なし。SSE API Route から呼ばれる純粋な lib モジュール）:
- `handleSessionCompleted(sessionDbId, accessToken)`: セッション DB レコードから role を取得し、role に応じた完了処理を実行。accessToken は SSE route が auth() で取得した OAuth トークン。内部の DB 更新は直接クエリを使用（`updateRequestStatus` 等の Server Action は呼ばない）
- role ごとのハンドラ: `handleBootstrapCompleted(session, request, repository)` を内部実装
- bootstrap role の完了処理:
  1. セッション status を `completed` に更新
  2. ブランチ存在確認（github-api.ts 経由）
  3. ブランチが存在すれば PR 作成（github-api.ts 経由）
  4. PR URL を repositories.bootstrap_pr_url に保存、bootstrap_status を `pr_pending` に遷移
  5. request status を `reviewing` に遷移
  6. ブランチが存在しなければ: bootstrap_status を `uninitialized` にロールバック、request を `cancelled`
- 将来の拡張: `handleImplementerCompleted`, `handleReviewerCompleted` 等を追加

**`bootstrap-actions.ts`** — bootstrap 固有ロジック（再設計）:
- `startBootstrap(repositoryId, agentId, environmentId)`: 既存を再設計
  1. Vault セットアップ（vault-actions.ts 経由）
  2. bootstrap_status を `bootstrapping` に遷移
  3. request 作成（`type: 'bootstrap'`）
  4. session 作成（`role: 'bootstrap'`）
  5. 指示メッセージ送信（commit + push まで。PR 作成指示は含めない。ブランチ名を指定）
- `cancelBootstrap(repositoryId)`: 新設
  - bootstrapping: セッション archive → bootstrap_status を `uninitialized` → request を `cancelled`
  - pr_pending: PR close + ブランチ削除 → bootstrap_pr_url クリア → bootstrap_status を `uninitialized` → request を `cancelled`
  - 冪等性: 既にキャンセル済みなら no-op

**代替案**: 全ロジックを bootstrap-actions.ts に集約 → 却下。GitHub API やセッション完了ハンドラは bootstrap 以外でも使う。責務分離により execute-request への拡張が容易になる。

### Decision 2: request type / session role の拡張

```
requests.type: 'new-feature' | 'spec-change' | 'refactoring' | 'bugfix' | 'bootstrap'
sessions.role: 'implementer' | 'reviewer' | 'fixer' | 'explorer' | 'bootstrap'
```

- DB スキーマ (schema.ts) の enum に `bootstrap` を追加
- マイグレーション: ALTER TABLE で CHECK 制約を更新（SQLite は CHECK 制約の直接変更不可のため、新テーブル作成 → データ移行 → リネーム、または pragma を使用）
- `request-actions.ts` の `VALID_TYPES` に `'bootstrap'` を追加
- `session-actions.ts` の `createBoundSession` の role 型に `'bootstrap'` を追加
- `startBootstrap` は `type: 'bootstrap'`, `role: 'bootstrap'` で作成（現在の `type: 'new-feature'`, `role: 'implementer'` から変更）

**title 文字列判定の廃止**: セッション完了ハンドラは `session.role` で分岐する。`title === 'Bootstrap openspec-workflow'` の判定は不要になる。

### Decision 3: SSE route の責務限定

SSE route (`src/app/api/sessions/[id]/stream/route.ts`) は以下のみ担当:
1. 認証・認可チェック（現行通り）
2. `client.beta.sessions.events.stream(id)` でイベントを受信
3. イベントをクライアントに SSE で転送
4. ストリーム終了（idle + end_turn 検知）時に `handleSessionCompleted(sessionDbId)` を呼び出す

bootstrap 固有ロジック（PR URL 抽出、ステータス更新など）は一切含まない。完了時の処理は session-completion-handler が role に基づいて決定する。

**完了検知のロジック**: ストリーム内で `event.type === 'session_updated'` かつ `event.session.status === 'idle'` かつ直前のメッセージの `stop_reason.type === 'end_turn'` を検知。この検知ロジック自体は SSE route 内に置く（ストリームイベントの解析はストリーム処理の一部）。検知後の「何をするか」を session-completion-handler に委譲する。

### Decision 4: Vault による MCP 認証情報管理

Vault は Anthropic Managed Agents API の機能で、マネージドエージェントに認証情報を安全に渡す仕組み。

フロー:
1. `startBootstrap` 実行時に `ensureVaultWithCredentials(user.dbId, user.accessToken)` を呼ぶ
2. users テーブルの `vault_id` が null → 新規 Vault 作成 → vault_id を保存
3. users テーブルの `vault_id` が非 null → 既存 Vault を再利用
4. MCP 認証情報を登録: `client.beta.vaults.credentials.create(vaultId, { type: 'api_key', name: 'github-mcp', value: accessToken, mcp_server_url: 'https://api.githubcopilot.com/mcp' })`
5. 409 Conflict → `client.beta.vaults.credentials.list(vaultId)` で既存を取得 → 削除 → 再登録
6. セッション作成時に Vault を resources に含める: `{ type: 'vault', vault_id: vaultId }`

**users テーブルの変更**: `vault_id` (TEXT, nullable) カラムを追加。マイグレーションで既存レコードは null のまま。

**代替案**: セッションごとに Vault を作成 → 却下。Vault 作成は API 呼び出しコストがある。ユーザーあたり 1 つで十分（MCP URL ごとに 1 認証情報の制約は、現時点では GitHub MCP のみなので問題なし）。

### Decision 5: PR 作成のアプリ側移行

エージェントは commit + push のみ。PR 作成はアプリ側で GitHub REST API 経由で行う。

理由:
- マネージドエージェント環境に gh CLI がない（検証済み）
- エージェント内から GitHub REST API を直接呼ぶにはトークンが必要だが、Vault 経由のトークンは MCP サーバーへの認証専用
- アプリ側なら OAuth トークンを直接使える

ブランチ命名規則: `openspec-bootstrap/{owner}/{repo}` — エージェント指示メッセージで指定。セッション完了後にアプリが同じ名前でブランチ存在確認 → PR 作成。

### Decision 6: クライアント側のステータス管理

- セッション完了検知後、クライアントは `/api/repos/[owner]/[name]/status` をポーリング（3 秒間隔、最大 30 回）
- レスポンス: `{ bootstrapStatus, bootstrapPrUrl, requestStatus }`
- 状態が `pr_pending` に変化したら PR URL をチャットに表示 + `router.refresh()`
- キャンセルボタン: `bootstrapping` または `pr_pending` 状態で表示。`cancelBootstrap` Server Action を呼ぶ

### Decision 7: 将来への拡張設計

session-completion-handler は role で分岐する汎用設計:

```typescript
async function handleSessionCompleted(sessionDbId: number): Promise<void> {
  const session = await getSessionWithContext(sessionDbId);
  switch (session.role) {
    case 'bootstrap':
      return handleBootstrapCompleted(session);
    case 'implementer':
      // 将来: handleImplementerCompleted(session)
      return;
    case 'reviewer':
      // 将来: handleReviewerCompleted(session)
      return;
    default:
      // デフォルト: セッションを completed に更新するだけ
      return handleDefaultCompleted(session);
  }
}
```

execute-request では設計・実装・レビューがそれぞれ別セッション（別 role）で実行される。bootstrap はその最も単純なケース（1 session、1 role）であり、パターンの起点となる。

## Risks / Trade-offs

**[Vault API の beta ステータス]** → `client.beta.vaults` は beta API。仕様変更の可能性がある。vault-actions.ts に集約しているため、変更時の影響範囲は限定的。

**[PR 作成の冪等性]** → セッション完了ハンドラが二重実行された場合、PR が重複作成される可能性がある。→ ブランチの存在確認 + 既存 PR の検索（`GET /repos/{owner}/{repo}/pulls?head={branch}`）で冪等性を担保。既に PR が存在すれば既存の PR URL を使用する。

**[外部 API + DB のロールバック]** → PR 作成成功後に DB 更新が失敗した場合、孤立 PR が発生する。→ PR クローズ処理をロールバックステップに含める。ただし、ネットワーク障害時はベストエフォート。

**[SQLite CHECK 制約の変更]** → SQLite は ALTER TABLE で CHECK 制約を直接変更できない。→ Drizzle の push コマンドはテーブル再作成で対応するが、本番データがある場合はマイグレーションスクリプトが必要。現時点ではローカル DB のみなので push で対応可能。

**[ポーリングの負荷]** → クライアントが 3 秒ごとにステータスを確認する。→ 1 ユーザーあたり 1 bootstrap なので負荷は無視可能。将来的に WebSocket/SSE 通知に移行可能。

**[Vault 認証情報の有効期限]** → OAuth トークンが失効した場合、Vault 内の認証情報も無効になる。→ startBootstrap 時に毎回認証情報を更新する（既存を削除→再登録）ことで、直近のトークンを常に反映。

## Migration Plan

1. **DB マイグレーション**:
   - users テーブルに `vault_id` カラム追加（nullable TEXT）
   - requests.type enum に `bootstrap` 追加
   - sessions.role enum に `bootstrap` 追加
   - Drizzle schema.ts を更新し `bun run db:push` で反映

2. **デプロイ順序**:
   - マイグレーション → 新モジュール追加 → bootstrap-actions 再設計 → SSE route 更新 → クライアント更新
   - 全て同一デプロイで実施可能（ローカル SQLite、単一ユーザー）

3. **ロールバック**:
   - git revert で全変更を巻き戻し可能
   - DB は vault_id カラムが null のまま残るが無害

## Open Questions

- なし（request.md で全要件が明確化されている）
