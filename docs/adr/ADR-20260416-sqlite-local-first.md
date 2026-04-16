# ADR-20260416: ローカル開発は SQLite + Drizzle ORM で開始

## ステータス

採用

## コンテキスト

Phase 2 でユーザー認証（GitHub OAuth）とセッション管理を導入するにあたり、アプリケーション側にデータベースが必要になった。最低限のエンティティは User と User-Session 紐付けのみ。

デプロイ先は未確定。SSE ストリーミングの長時間接続要件により Vercel/Cloudflare 等のサーバーレス環境は制約があり、Fly.io/Railway 等の常駐プロセス環境か、将来的にワークフロー化して SSE を撤廃する方向を検討中。

開発環境に Docker は導入していない。

## 決定

**SQLite をローカル開発のデータベースとして採用し、Drizzle ORM 経由でアクセスする。**

### 選定理由

1. **セットアップ不要**: ファイル1つで動作。Docker も外部プロセスも不要
2. **Bun 組み込み**: `bun:sqlite` ドライバが利用可能。追加依存なし
3. **十分なデータ規模**: 現段階のエンティティ（User, Session 紐付け）は SQLite で余裕
4. **ORM による抽象化**: Drizzle ORM を挟むことで、将来 PostgreSQL に切り替える際はドライバの差し替えのみで移行可能

### データモデル（初期）

```
users
├── id (PRIMARY KEY)
├── github_id (UNIQUE)
├── github_login
├── github_avatar_url
└── created_at

user_sessions
├── id (PRIMARY KEY)
├── user_id (FK → users)
├── session_id (Managed Agents の Session ID)
├── repo (owner/name)
├── title
├── status (キャッシュ)
└── created_at
```

Managed Agents API が Session の詳細（接続リポ、チャット履歴等）を返すため、アプリ側は紐付けとキャッシュのみ保持する。

## 却下した代替案

- **PostgreSQL（Docker）**: 開発環境に Docker 未導入。Homebrew で入るが、SQLite で済む規模にはオーバースペック
- **PostgreSQL（クラウド: Neon, Supabase）**: ローカル開発にネットワーク依存を持ち込みたくない。オフライン開発ができなくなる
- **DB なし（Managed Agents API のみ）**: Session 一覧のリポフィルタが API に存在しない。全 Session を走査して `resources.list()` を呼ぶのはパフォーマンス上非現実的
- **ORM なし（直接 SQL）**: 将来の DB 切り替えが困難になる

## リスク

- **SQLite の同時書き込み制限**: 単一ユーザーのローカル開発では問題にならない。マルチユーザー環境への移行時に PostgreSQL に切り替える
- **Drizzle ORM の抽象化漏れ**: SQLite 固有の構文に依存しないよう、ORM のクエリビルダーのみ使用する
- **スキーマ移行**: Drizzle Kit のマイグレーション機能で管理。SQLite → PostgreSQL の移行時にマイグレーションの再生成が必要

## 結果

- ローカル開発でゼロ設定のデータベースが利用可能になる
- デプロイ先の決定を後回しにできる（SQLite → PostgreSQL の切り替えはドライバ変更のみ）
- Phase 2 の認証・セッション管理の実装に着手できる
