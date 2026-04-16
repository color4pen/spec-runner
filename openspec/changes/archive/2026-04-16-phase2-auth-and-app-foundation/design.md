## Context

Phase 1 で Next.js 16 (App Router) + Managed Agents SDK によるチャット UI の PoC が完成している。現在の構成は認証なし・DB なし・単一ユーザー前提で、Server Actions が直接 Managed Agents API を呼び出す。GITHUB_TOKEN は環境変数でハードコードされている。

ADR-20260416-sqlite-local-first により SQLite + Drizzle ORM の方針が、ADR-20260416-app-as-orchestrator によりアプリがオーケストレーターを担う方針がそれぞれ決定済み。

## Goals / Non-Goals

**Goals:**
- GitHub OAuth でログイン/ログアウトし、OAuth トークンで GitHub API を利用できる
- SQLite + Drizzle ORM でユーザーと Session 紐付けを永続管理できる
- ユーザー向けの画面構成（ログイン → リポ一覧 → ワークスペース）に移行する
- 既存の Server Actions・SSE エンドポイントに認証ガードを追加する
- Phase 1 デバッグ UI を認証の背後に残す

**Non-Goals:**
- 他の OAuth プロバイダ（Google 等）のサポート
- デプロイ環境の構築（ローカル開発で動作すれば十分）
- ワークフロー自動化（Custom Tools、オーケストレーション）
- テストフレームワークの導入（別リクエストで対応）
- マルチテナント対応（Org 管理、権限分離）

## Decisions

### 1. Auth.js v5 + GitHub Provider

**決定**: Auth.js（NextAuth.js）v5 を使用し、GitHub Provider でログインする。

**理由**:
- Next.js App Router との統合が公式にサポートされている
- GitHub Provider が OAuth App / GitHub App の両方に対応
- Session 管理（JWT / Database session）を Auth.js が提供
- `repo` scope で OAuth トークンを取得すれば、リポ一覧取得と Session へのリポマウントの両方に使える

**代替案**:
- Lucia Auth: 軽量だが、2024年にメンテナンス終了を宣言
- 自前実装: OAuth フローの実装・セキュリティ対応のコストが高い
- Clerk/Auth0: SaaS 依存。ローカル開発では過剰

**Auth.js Session 戦略**: JWT。理由: DB セッション管理は Auth.js のアダプタが必要だが、今回は SQLite + Drizzle で独自のユーザー管理を行うため、JWT で軽量に保つ。OAuth トークンは JWT の `account` コールバック経由で取得し、encrypt された JWT に格納する。

### 2. SQLite + Drizzle ORM（bun:sqlite ドライバ）

**決定**: Drizzle ORM で `bun:sqlite` ドライバを使用する。

**理由**:
- Bun 組み込みの SQLite ドライバで追加依存なし
- Drizzle ORM が `bun:sqlite` を公式サポート
- ADR-20260416-sqlite-local-first で方針決定済み

**スキーマ**:
- `users`: id, github_id (UNIQUE), github_login, github_avatar_url, created_at
- `user_sessions`: id, user_id (FK), session_id, repo, title, status, created_at, updated_at

**マイグレーション**: Drizzle Kit の `drizzle-kit generate` + `drizzle-kit migrate` で管理。DB ファイルは `data/spec-runner.db` に配置し .gitignore に追加。

### 3. App Router のルーティング設計

**決定**: Route Groups でレイアウトを分離する。

```
src/app/
├── (auth)/                 # 認証不要のページ
│   └── login/
│       └── page.tsx        # ログイン画面
├── (protected)/            # 認証必須のページ
│   ├── layout.tsx          # 認証チェック + 共通レイアウト
│   ├── page.tsx            # リポジトリ一覧（デフォルトページ）
│   ├── repos/[owner]/[repo]/
│   │   └── page.tsx        # ワークスペース画面
│   └── debug/
│       └── page.tsx        # Phase 1 デバッグ UI（移設）
├── api/
│   ├── auth/[...nextauth]/
│   │   └── route.ts        # Auth.js API Route
│   └── sessions/[id]/stream/
│       └── route.ts        # SSE（認証ガード追加）
├── layout.tsx              # Root Layout
└── page.tsx                # → (auth)/login にリダイレクト
```

**理由**:
- Route Groups で認証有無のレイアウト分離が自然に実現できる
- `(protected)/layout.tsx` で一箇所の認証チェックに集約できる
- Phase 1 デバッグ UI を `/debug` に移設し、認証の背後に配置

### 4. GitHub API 連携: OAuth トークン利用

**決定**: Auth.js の JWT コールバックで取得した OAuth access_token を使い、GitHub REST API（Octokit）でリポジトリ一覧を取得する。Managed Agents Session 作成時の `authorization_token` にも同じトークンを使用する。

**理由**:
- 環境変数の GITHUB_TOKEN が不要になる（ユーザーの OAuth トークンに置き換わる）
- リポジトリ一覧取得と Session マウントで同一トークンを使えるため一貫性がある
- `repo` scope を要求することで、ユーザーがアクセス可能なリポのみ表示される

**代替案**:
- GitHub App（Installation Token）: App の設定が複雑。個人開発のローカル環境には過剰
- Personal Access Token をユーザー入力: UX が悪い。OAuth で自動取得する方が良い

### 5. Session 紐付けの設計

**決定**: Session 作成時に `user_sessions` テーブルにレコードを書き込み、一覧表示は DB からのクエリで実現する。Managed Agents API の `sessions.list()` は補助的に使用（ステータス同期のみ）。

**理由**:
- Managed Agents API の `sessions.list()` はユーザーフィルタやリポフィルタを持たない
- 全 Session を走査して resources を取得するのはパフォーマンス上非現実的
- DB にリポ情報・ユーザー紐付けを持つことで、即座にフィルタリングできる

**ステータスキャッシュ**: `user_sessions.status` に Managed Agents の Session ステータスを定期的にキャッシュ。初回表示時は DB の値を使い、ユーザーが明示的にリフレッシュした場合のみ API から再取得する。

## Risks / Trade-offs

- **OAuth トークンの JWT 格納**: JWT のペイロードサイズが大きくなる。ただし Auth.js の encrypt で保護されるため、トークンが平文で露出するリスクは低い → 将来的にトークンを DB に移す場合は Drizzle Adapter に切り替える
- **SQLite の同時書き込み制限**: ローカル開発では問題にならない → マルチユーザー環境移行時に PostgreSQL に切り替え（ADR で合意済み）
- **Auth.js v5 の安定性**: v5 は比較的新しいバージョン → Next.js App Router を公式サポートしており、GitHub Provider は最も成熟したプロバイダの一つ
- **OAuth scope の拡大リスク**: `repo` scope は広い権限を持つ → ユーザーに対して必要な権限の説明を表示する。将来的に GitHub App に移行すれば fine-grained permission が使える
- **Phase 1 コードとの共存**: 既存の Server Actions を認証対応に修正する必要がある → 認証ガードをユーティリティ関数として切り出し、既存関数の先頭に追加する形で最小限の変更に留める
