# Managed Agents 技術リファレンス

SpecRunner Phase 1 で必要な Managed Agents の技術情報をまとめる。

## 基本概念

| 概念 | 説明 |
|------|------|
| **Agent** | モデル、システムプロンプト、ツール、MCP、スキルの定義。ID で再利用可能 |
| **Environment** | コンテナテンプレート。パッケージ、ネットワーク設定を含む |
| **Session** | 実行中の Agent インスタンス。永続的なファイルシステムと会話履歴を保持 |
| **Events** | アプリと Agent 間のメッセージ（SSE でストリーミング） |

## API の使い方

### 必須ヘッダー

```
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01
anthropic-beta: managed-agents-2026-04-01
content-type: application/json
```

### 1. Agent 作成

```python
agent = client.beta.agents.create(
    name="SpecRunner",
    model="claude-sonnet-4-6",
    system="OpenSpec ワークフローを実行するエージェント。",
    tools=[{"type": "agent_toolset_20260401"}]
)
```

### 2. Environment 作成

```python
environment = client.beta.environments.create(
    name="specrunner-env",
    config={
        "type": "cloud",
        "packages": {
            "npm": ["@fission-ai/openspec"]  # OpenSpec CLI
        },
        "networking": {
            "type": "limited",
            "allowed_hosts": [
                "github.com",
                "api.github.com",
                "registry.npmjs.org"
            ],
            "allow_package_managers": True,
            "allow_mcp_servers": True
        }
    }
)
```

**注意**: パッケージは Environment 作成時に事前インストールされ、同じ Environment を使うセッション間でキャッシュされる。

### 3. Session 開始（GitHub リポジトリ付き）

```python
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    resources=[
        {
            "type": "github_repository",
            "url": "https://github.com/org/repo",
            "mount_path": "/workspace/repo",
            "authorization_token": "ghp_xxxxxxxxxxxx"
        }
    ]
)
```

### 4. メッセージ送信（SSE ストリーミング）

```python
with client.beta.sessions.events(
    session_id=session.id,
    events=[
        {
            "type": "user.message",
            "content": [{"type": "text", "text": "/opsx:propose 'Add auth feature'"}]
        }
    ],
) as stream:
    for event in stream:
        if event.type == "agent.message":
            print(event.content)
        elif event.type == "session.status":
            if event.status == "pause_turn":
                # 継続処理が必要
                pass
```

## ツール一覧

`agent_toolset_20260401` で以下が利用可能：

| ツール | 用途 |
|--------|------|
| bash | コマンド実行（`openspec` CLI） |
| read | ファイル読取 |
| write | ファイル作成 |
| edit | ファイル編集 |
| glob | パターンマッチ |
| grep | テキスト検索 |
| web_fetch | URL 取得 |
| web_search | Web 検索（$10/1000 searches） |

## GitHub 連携

公式ドキュメントでは **リポジトリマウント + GitHub MCP の併用** を推奨。

| 方法 | 用途 |
|------|------|
| **リポジトリマウント + Bash** | ファイル操作、コミット、プッシュ |
| **GitHub MCP + Vault** | API 操作（Issue、PR 検索、メタデータ） |

### 1. リポジトリマウント（ファイルアクセス）

セッション作成時に `resources` でマウント：

```python
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    resources=[
        {
            "type": "github_repository",
            "url": "https://github.com/org/repo",
            "mount_path": "/workspace/repo",
            "authorization_token": "ghp_xxxxxxxxxxxx"
        }
    ]
)
```

- リポジトリは `mount_path` にマウントされる
- 複数リポジトリは `resources` 配列に追加
- 同じリポジトリを使うセッションはキャッシュで高速起動

**Bash での Git 操作:**
```bash
cd /workspace/repo
git checkout -b feature/new-feature
# ... 編集 ...
git add .
git commit -m "feat: add feature"
git push origin feature/new-feature
```

### 2. GitHub MCP（API アクセス）

Agent 定義時に MCP サーバーを設定：

```python
agent = client.beta.agents.create(
    name="SpecRunner",
    model="claude-sonnet-4-6",
    mcp_servers=[
        {
            "type": "url",
            "name": "github",
            "url": "https://api.githubcopilot.com/mcp/"
        }
    ],
    tools=[
        {"type": "agent_toolset_20260401"},
        {"type": "mcp_toolset", "mcp_server_name": "github"}
    ]
)
```

**可能な操作（51 ツール）:**
- Issue 管理（一覧、作成、更新、コメント）
- PR 管理（作成、レビュー、マージ）
- コード検索・セキュリティスキャン
- GitHub Actions の監視
- ラベル・マイルストーン管理

### 3. 認証

**リポジトリマウント**: セッション作成時に `authorization_token` を直接指定

**GitHub MCP**: Vault で管理

```python
# 1. Vault 作成
vault = client.beta.vaults.create(
    display_name="github-vault"
)

# 2. 認証情報を追加
client.beta.vaults.credentials.create(
    vault_id=vault.id,
    type="static_bearer",
    mcp_server_url="https://api.githubcopilot.com/mcp",
    token="ghp_xxxxxxxxxxxx"
)

# 3. Session で両方を指定
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    resources=[
        {
            "type": "github_repository",
            "url": "https://github.com/org/repo",
            "mount_path": "/workspace/repo",
            "authorization_token": "ghp_xxxxxxxxxxxx"
        }
    ],
    vault_ids=[vault.id]  # MCP 用
)
```

**トークンのスコープ:**

| 操作 | 必要なスコープ |
|------|--------------|
| プライベートリポのクローン | `repo` |
| PR 作成 | `repo` |
| Issue 読取 | `repo` または `public_repo` |

**推奨**: Fine-grained PAT（細粒度トークン）を使用

### 使い分け

| 操作 | 方法 |
|------|------|
| コード編集・修正 | リポジトリマウント + Bash |
| コミット・プッシュ | リポジトリマウント + Bash |
| PR 作成 | GitHub MCP または `gh` CLI |
| Issue 一覧・検索 | GitHub MCP |
| GitHub Actions 監視 | GitHub MCP |

## セッション挙動

### ステータス遷移

```
idle → running → idle（完了）
              → rescheduling（一時エラー、自動リトライ）
              → terminated（回復不可）
```

### 永続性

- イベント履歴はサーバー側で永続化
- 会話履歴とファイルシステム状態は Session 内で永続
- 接続が切れても Session は継続（後から再接続可能）

### pause_turn

サンプリングループが反復制限（デフォルト10回）に達すると発生。`continue` メッセージで継続：

```python
if event.status == "pause_turn":
    client.beta.sessions.events(
        session_id=session.id,
        events=[{"type": "user.message", "content": [{"type": "text", "text": "continue"}]}]
    )
```

### タイムアウト

セッション自体はタイムアウトしない（無期限）。`max_turns` で無限ループを防止：

```python
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    max_turns=50
)
```

## スキル

### 制約

| 項目 | 制限 |
|------|------|
| スキル数 | 最大 20/セッション |
| name | 64文字、小文字/数字/ハイフンのみ |
| description | 1024文字 |

**注意**: ハンドオフドキュメントには「8スキル/リクエスト」とあったが、公式ドキュメントでは「20スキル/セッション」。

### アップロード

```python
with open("my_skill.zip", "rb") as f:
    skill = client.beta.skills.create(
        name="openspec-workflow",
        description="OpenSpec ワークフロースキル",
        files=f
    )
```

## 料金

### トークン課金

標準モデル価格が適用：
- Claude Sonnet: Input $3/1M tokens, Output $15/1M tokens

### 追加料金

| 項目 | 料金 |
|------|------|
| Web Search | $10/1000 searches |

### 最適化（自動適用）

- Prompt caching（キャッシュ読取は10%コスト）
- Compaction（トークン削減）

## ハンドオフドキュメントとの差分

調査で判明した差分・補足：

| 項目 | ハンドオフ | 実際 |
|------|-----------|------|
| スキル上限 | 8/リクエスト | 20/セッション |
| セッション時間課金 | $0.08/時間 | トークン課金のみ（時間課金の記載なし） |
| setup script | 言及あり | packages で宣言的に指定（スクリプト不要） |

**補足**:
- Environment の packages でパッケージを宣言的にインストールできる
- npm, pip, apt, go, gem, cargo をサポート
- ネットワークは `limited`（本番推奨）と `unrestricted`（開発用）

## Phase 1 での使用計画

### 最小構成

1. **Environment**: OpenSpec CLI (`@fission-ai/openspec`) + GitHub アクセス
2. **Agent**: システムプロンプト + agent_toolset + GitHub MCP
3. **Session**: GitHub リポジトリマウント付き

### 検証項目

- [ ] Environment で `npm install -g @fission-ai/openspec` が動くか
- [ ] Session 内で `openspec` コマンドが実行できるか
- [ ] GitHub リポジトリのクローン・コミット・Push ができるか
- [ ] SSE でイベントをストリーミング受信できるか
- [ ] pause_turn の処理が正しく動くか
