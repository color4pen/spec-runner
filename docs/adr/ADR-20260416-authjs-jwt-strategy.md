# ADR-20260416: Auth.js v5 + JWT セッション戦略

**Date**: 2026-04-16
**Status**: accepted

## Context

Phase 1 PoC は認証なし・GITHUB_TOKEN 環境変数ハードコードで動作していた。Phase 2 でマルチユーザー対応するにあたり、GitHub OAuth 認証基盤の導入が必要になった。認証ライブラリの選定と、セッション管理戦略（JWT vs Database session）の決定が求められた。

SpecRunner は GitHub リポジトリを操作するアプリであり、ユーザーは必ず GitHub アカウントを持つ。OAuth で取得したアクセストークンを GitHub API 呼び出しと Managed Agents Session のリポマウントの両方に使用する。

## Decision

Auth.js（NextAuth.js）v5 を GitHub Provider + JWT セッション戦略で使用する。OAuth access_token は Auth.js の JWT コールバック経由で暗号化された JWT に格納する。

## Alternatives Considered

### Alternative 1: Lucia Auth
- **Pros**: 軽量、学習コストが低い
- **Cons**: 2024年にメンテナンス終了を宣言済み
- **Why not**: 長期メンテナンスの保証がない

### Alternative 2: 自前 OAuth 実装
- **Pros**: 依存が最小限、完全な制御
- **Cons**: OAuth フローの実装・CSRF 対策・トークンリフレッシュなどセキュリティ対応コストが高い
- **Why not**: 車輪の再発明。Auth.js が解決済みの問題群

### Alternative 3: Clerk / Auth0（SaaS 型）
- **Pros**: 管理コンソール、MFA、豊富なプロバイダ対応
- **Cons**: SaaS 依存、ローカル開発での設定が煩雑、無料枠の制約
- **Why not**: ローカル開発が主体の現段階では過剰

### Alternative 4: Database Session 戦略（JWT ではなく）
- **Pros**: セッション無効化が即座に可能、JWT サイズ問題なし
- **Cons**: Auth.js の Drizzle Adapter が必要で、Auth.js 管理のテーブル構造に縛られる
- **Why not**: 独自スキーマ（requests 中心モデル）で管理したいため、Auth.js のアダプタ主導のスキーマ設計は避けたかった。JWT で軽量に保ち、ユーザー管理は Drizzle ORM で独自に行う

## Consequences

### Positive
- Next.js App Router との統合が公式サポートされており、設定が簡潔
- GitHub Provider は Auth.js で最も成熟したプロバイダの一つであり、安定性が高い
- `repo` scope の OAuth トークンでリポ一覧取得と Session マウントを一石二鳥で実現
- ユーザーデータのスキーマを Auth.js に縛られず自由に設計できる

### Negative
- OAuth access_token を JWT に格納するため、JWT ペイロードサイズが大きくなる
- JWT ではセッション即時無効化ができない（トークン期限切れまで有効）
- Auth.js v5 は比較的新しく、エコシステムのドキュメントが v4 前提のものが多い

### Risks
- OAuth トークンの有効期限切れ時にリフレッシュトークンフローが必要になる可能性がある。GitHub OAuth App のトークンは無期限だが、GitHub App に移行した場合は対応が必要
- 将来トークンを DB に移す場合は Drizzle Adapter への切り替えが発生する。JWT → Database session への移行は Auth.js の設定変更で対応可能

### Known Design Debt
- Production コードが `better-sqlite3`、テストが `bun:sqlite` とドライバが不一致（Drizzle ORM の抽象化で現時点は問題なし）
- debug 用 Server Action（`archiveSession` / `deleteSession`）が `actions.ts` に混在しており、`debug-actions.ts` への分離が望ましい
