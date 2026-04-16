# Managed Agents SDK 機能調査

Phase 1 完了後、SDK v0.89.0 と公式ドキュメントを網羅的に調査した結果。Phase 2 以降の機能追加計画の基礎資料。

- **調査日**: 2026-04-16
- **SDK**: `@anthropic-ai/sdk@0.89.0`
- **ドキュメント**: https://platform.claude.com/docs/en/managed-agents/

## SDK リソース全体像

```
client.beta
├── agents              ← Phase 1 で create, list のみ使用
│   └── versions        ← 未使用
├── environments        ← Phase 1 で create, list のみ使用
├── sessions            ← Phase 1 で create, list, delete, archive 使用
│   ├── events          ← Phase 1 で send, list, stream 使用
│   └── resources       ← 未使用
├── vaults              ← 未使用
├── files               ← 未使用
├── skills              ← 未使用
└── models              ← 未使用
```

---

## 未使用機能の詳細

### 1. Vault（認証情報管理）

ワークスペーススコープで認証情報を安全に保存・管理する仕組み。

**特性:**
- 書き込み専用（API レスポンスにシークレットは含まれない）
- Agent がトークンに直接アクセスできない
- MCP ツール呼び出し時にプロキシがトークンを自動注入
- マルチテナント対応（ユーザーごとに Vault を作成可能）

**認証タイプ:**

| タイプ | 用途 | トークン更新 |
|---|---|---|
| MCP OAuth2 | OAuth フロー対応の外部サービス | 自動（refresh_token） |
| Static Bearer | API キー、PAT | 手動 |

**OAuth2 の `token_endpoint_auth` 種類:**
- `none`（公開クライアント）
- `client_secret_basic`（HTTP Basic）
- `client_secret_post`（POST ボディ内）

**Session での参照:**
```typescript
await client.beta.sessions.create({
  agent: agentId,
  environment_id: envId,
  vault_ids: [vault.id],  // 複数指定可
});
```

**制限:**
- 1 MCP サーバー URL あたり 1 有効認証情報 / Vault（重複時 409 エラー）
- 最大 20 認証情報 / Vault
- `mcp_server_url` は変更不可（アーカイブ → 新規作成が必要）

**SpecRunner への示唆:**
- `.env.local` の `GITHUB_TOKEN`（PAT）を Vault + MCP OAuth2 に置き換えられる
- ユーザーが GitHub OAuth 認証 → トークンを Vault に保存 → MCP 経由で自動注入
- Phase 2 の認証基盤として中核になる

---

### 2. Custom Tools（クライアント側ツール実行）

Agent がカスタムツールを呼ぶと、Session が idle になりアプリ側に実行を委任する仕組み。

**フロー:**
```
1. Agent がカスタムツールを呼び出す
2. agent.custom_tool_use イベント発行
3. session.status_idle（stop_reason: requires_action, event_ids: [...])
4. アプリがツールを実行
5. user.custom_tool_result で結果を返す（custom_tool_use_id を指定）
6. Session が running に復帰
```

**Agent 作成時のツール定義:**
```typescript
{
  type: 'custom',
  name: 'create_github_pr',
  description: 'GitHubにPRを作成する。タイトル、ブランチ名、ベースブランチ、説明を受け取り、PRのURLを返す。',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'PR タイトル' },
      branch: { type: 'string', description: 'ソースブランチ' },
      base: { type: 'string', description: 'ターゲットブランチ' },
      body: { type: 'string', description: 'PR の説明' },
    },
    required: ['title', 'branch', 'base'],
  },
}
```

**公式ベストプラクティス:**
- ツールの説明は **3〜4 文以上**で詳細に（何をするか、いつ使うか、パラメータの意味、制限）
- 細粒度ツール（`create_pr`, `review_pr`）より **`action` パラメータ付き統合ツール**を推奨
- リソース別にプレフィックス（`db_query`, `storage_read`）
- 戻り値は opaque 参照ではなくセマンティック識別子（slug, UUID）

**SaaS API 連携の選択指針:**
- 外部サービスの呼び出し → **MCP サーバー**推奨（毎回のクライアント往復不要）
- アプリ側でのみ可能な処理 → **Custom Tools**（ローカルファイル操作、UI 操作、独自ロジック）

**SpecRunner への示唆:**
- `create_github_pr`, `trigger_ci`, `notify_slack` 等のカスタムツールを定義
- Agent が「PR 作ります」→ SpecRunner が GitHub API で PR 作成 → 結果を返す
- dogfooding の完成形: Agent がコード書く → SpecRunner が PR を作る → 全部 SpecRunner 内で完結

---

### 3. Tool Permission Policy（ツール実行の承認制御）

Agent 作成時にツールごとに承認ポリシーを設定。

| ポリシー | 挙動 |
|---|---|
| `always_allow` | 自動承認（現在の SpecRunner デフォルト） |
| `always_ask` | 呼び出し時に Session が idle → ユーザーが allow/deny を返す |

**always_ask 時のフロー:**
```
1. Agent がツール呼び出し
2. agent.tool_use イベント（evaluated_permission: 'ask'）
3. session.status_idle（stop_reason: requires_action, event_ids: [tool_use_event_id]）
4. アプリが UI でユーザーに確認
5. user.tool_confirmation（result: 'allow' | 'deny', tool_use_id, deny_message?）
6. allow → ツール実行、deny → Agent がエラーとして処理
```

**設定例:**
```typescript
{
  type: 'agent_toolset_20260401',
  default_config: {
    permission_policy: { type: 'always_allow' },
  },
  configs: [
    // bash だけ確認を求める
    {
      name: 'bash',
      permission_policy: { type: 'always_ask' },
    },
  ],
}
```

**SpecRunner への示唆:**
- bash コマンドに `always_ask` を設定すれば、`rm -rf` 等の危険操作を UI で確認できる
- Custom Tools と同じ `requires_action` フローなので、ハンドリングの基盤を共有できる
- Phase 2a の安全機能として重要

---

### 4. sessions.resources（実行中のリソース管理）

Session の実行中にリソース（ファイル、GitHub リポ）を追加・削除・更新できる。

| メソッド | 用途 |
|---|---|
| `resources.add(sessionId, params)` | ファイルリソースをセッションに追加 |
| `resources.delete(resourceId, { session_id })` | リソースを除去 |
| `resources.update(resourceId, { session_id, authorization_token })` | トークン更新 |
| `resources.list(sessionId)` | リソース一覧 |
| `resources.retrieve(resourceId, { session_id })` | 個別取得 |

**重要: `resources.update` の authorization_token 更新**
- GitHub PAT のローテーション時に Session を作り直す必要がない
- OAuth token が expire した場合に refresh して update するフロー
- Phase 2 の認証基盤で活用

**add の制限:**
- 現在ファイルリソース（`type: 'file'`）のみ追加可能
- GitHub リポジトリの動的追加は Session 作成時のみ（resources.add では不可）

---

### 5. user.interrupt（Agent 中断）

実行中の Agent を即座に停止するイベント。

```typescript
await client.beta.sessions.events.send(sessionId, {
  events: [{ type: 'user.interrupt' }],
});
```

- Session が即座に idle に戻る
- UI に「Stop」ボタンとして実装すれば暴走 Agent を止められる
- `delete` は `running` 中に不可だが、`interrupt` → `delete` で安全に削除

**SpecRunner への示唆:**
- Chat UI に Stop ボタンを追加するだけで実装可能
- 安全上の最低限の機能。Phase 2a の最初に入れるべき

---

### 6. Agent Versions

Agent を `update()` するたびにバージョンが自動インクリメント。

```typescript
// バージョン一覧
for await (const version of client.beta.agents.versions.list(agentId)) {
  console.log(version);
}

// 特定バージョンで Session 作成
await client.beta.sessions.create({
  agent: { id: agentId, type: 'agent', version: 3 },
  environment_id: envId,
});
```

**SpecRunner への示唆:**
- system prompt を改善した履歴を追える
- A/B テスト（同じ Agent の異なるバージョンで Session を作成して比較）
- ロールバック（新バージョンが壊れた時に前のバージョンを使う）

---

### 7. Skills API

Anthropic 公式スキルとカスタムスキルの管理。

**公式提供スキル:**
- `xlsx` — Excel 操作
- `docx` — Word 操作
- `pptx` — PowerPoint 操作
- `pdf` — PDF 操作

**カスタムスキル:**
- `client.beta.skills` で CRUD 可能
- バージョン管理付き
- Agent に bind（最大 20）

**SpecRunner への示唆:**
- OpenSpec CLI のワークフローをスキルとしてパッケージ化する余地
- ただし Phase 1 で `packages.npm` で CLI を入れる方法が動くことを確認済みなので、スキル化は優先度低

---

### 8. Files API

ファイルをアップロードして Session にマウント。

```typescript
// アップロード
const file = await client.beta.files.upload({ file: buffer, name: 'config.json' });

// Session にマウント
await client.beta.sessions.resources.add(sessionId, {
  type: 'file',
  file_id: file.id,
  mount_path: '/workspace/config.json',
});
```

**SpecRunner への示唆:**
- GitHub リポ以外の設定ファイル（.env, config）を Session に渡す手段
- テンプレートファイルの事前配置

---

### 9. Research Preview 機能（申請必要）

一般公開されていない機能。https://claude.com/form/claude-managed-agents から申請。

| 機能 | 説明 |
|---|---|
| **Outcomes** | ゴール駆動型 Agent。目標を定義すると Agent が自律的に達成 |
| **Multi-agent** | 複数 Agent 間の協調。タスク分割・並列実行 |
| **Memory** | Session をまたぐ永続メモリ。Agent が過去の文脈を記憶 |

---

## 運用上の制限・注意事項

### レート制限

| 操作 | 制限 |
|---|---|
| Create 系（POST） | 60 req/min（組織単位） |
| Read 系（GET） | 600 req/min（組織単位） |
| Concurrent Sessions | 無制限 |

### Environment の注意点

- **バージョン管理されない**: update 時に手動でログ記録が推奨
- **複数 Session が共有可能**: ただしコンテナは Session ごとに独立（Phase 1 で検証済み）

### ストリーミング順序

公式推奨: **SSE ストリームを開始してから**イベントを送信する。逆だとイベント取りこぼしの可能性。

---

## 機能間の依存関係

```
[user.interrupt]  ← 独立。安全上の最低限
       │
       ▼
[requires_action ハンドリング]  ← idle + stop_reason: requires_action の共通基盤
       │
       ├── [tool_confirmation UI]  (always_ask ポリシー)
       └── [custom_tools]  (クライアント側ツール実行)
              │
              └── [dogfooding: PR作成、CI連携等]

[Vault API]
       │
       └── [GitHub OAuth + Vault]  ← PAT 脱却
              │
              └── [GitHub App + installation token]

[span イベントのパース]  ← 独立
       │
       └── [token/cost tracking UI]

[resources API]  ← 独立
       │
       └── [実行中リソース管理 / トークン更新]

[Agent update + versions]  ← 独立
```

### 3 系統の分類

**A. 安全系（Agent 制御）**: interrupt → requires_action 基盤 → tool_confirmation → custom_tools
- dogfooding の前提条件
- Agent を安全に使うための最低限

**B. 認証系（PAT → OAuth → GitHub App）**: Vault → GitHub OAuth → GitHub App
- プロダクト化の前提条件
- チーム利用の基盤

**C. 可視化・便利系**: cost tracking, runtime resources, agent versioning, skills
- 単体で入れられる
- 優先度は UX 判断に依存

### 推奨順序

```
Phase 2a: user.interrupt + requires_action 基盤
Phase 2b: tool_confirmation + custom_tools（→ dogfooding 可能に）
Phase 2c: GitHub OAuth + Vault
Phase 3:  GitHub App + cost tracking + agent versioning
Phase 4+: Multi-agent / Memory / Outcomes（Research Preview）
```

## 参考リンク

- [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Agent setup](https://platform.claude.com/docs/en/managed-agents/agent-setup)
- [Sessions](https://platform.claude.com/docs/en/managed-agents/sessions)
- [Events and streaming](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Tools](https://platform.claude.com/docs/en/managed-agents/tools)
- [Skills](https://platform.claude.com/docs/en/managed-agents/skills)
- [Vaults](https://platform.claude.com/docs/en/managed-agents/vaults)
- [Environments](https://platform.claude.com/docs/en/managed-agents/environments)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [guide.md](./guide.md) — Phase 1 事前知識
- [phase1-findings.md](./phase1-findings.md) — Phase 1 検証結果
