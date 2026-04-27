# ADR-20260416: Route Groups によるレイアウト分離

**Date**: 2026-04-16
**Status**: accepted

## Context

Phase 1 はデバッグ用ダッシュボード（Agent/Environment/Session/Chat の4タブ）の単一画面だった。Phase 2 でログイン画面・リポジトリ一覧・ワークスペースというユーザー向けの画面構成に移行するにあたり、認証が必要なページと不要なページでレイアウトを分離する設計が必要になった。

Next.js App Router は Route Groups（括弧付きフォルダ）による URL に影響しないレイアウト分割を提供しており、これが認証境界の実装に適している。

## Decision

Route Groups `(auth)` と `(protected)` でレイアウトを分離する。`(protected)/layout.tsx` に認証チェックを集約し、未認証ユーザーをログインページにリダイレクトする。Phase 1 のデバッグ UI は `(protected)/debug/` に移設する。

```
src/app/
├── (auth)/login/page.tsx          # 認証不要
├── (protected)/                   # 認証必須
│   ├── layout.tsx                 # 認証チェック + 共通ヘッダー
│   ├── repos/page.tsx             # リポ一覧
│   ├── repos/[owner]/[repo]/      # ワークスペース
│   └── debug/page.tsx             # Phase 1 デバッグ UI
├── api/auth/[...nextauth]/        # Auth.js API Route
└── api/sessions/[id]/stream/      # SSE（認証ガード追加）
```

## Alternatives Considered

### Alternative 1: Middleware による認証チェック
- **Pros**: `middleware.ts` で全ルートを一括制御。matcher パターンで除外設定が容易
- **Cons**: Edge Runtime の制約で DB アクセスやNode.js API が使えない。Auth.js の session 取得がミドルウェアで安定しない場合がある
- **Why not**: `(protected)/layout.tsx` での Server Component 認証チェックの方がシンプルで、DB アクセスの制約もない

### Alternative 2: 各ページで個別に認証チェック
- **Pros**: Route Groups のような構造的制約がない
- **Cons**: 認証チェックの漏れリスクが高い。全ページに同じボイラープレートが必要
- **Why not**: DRY 原則に反する。認証漏れは HIGH severity のセキュリティ問題を引き起こす

### Alternative 3: Layout なし、HOC パターン
- **Pros**: React の伝統的パターンで馴染みがある
- **Cons**: App Router の Server Component と相性が悪い。不要な Client Component 化が必要になる
- **Why not**: App Router のネイティブ機能（Route Groups + Layout）を活用する方が自然

## Consequences

### Positive
- 認証チェックが `(protected)/layout.tsx` の1箇所に集約され、漏れのリスクが低い
- ログインページと保護ページでヘッダー・フッターなどのレイアウトを完全に分離できる
- Phase 1 デバッグ UI を `/debug` パスで認証の背後に残せる。既存コードの大幅な書き換えが不要
- 新しい保護ページの追加が `(protected)/` 配下にファイルを置くだけで完了する

### Negative
- `(protected)/page.tsx` と `app/page.tsx` の両方が `/` に解決しようとするため、リポ一覧を `/repos` に配置する必要があった（ルート `/` はリダイレクト専用）
- Route Groups が増えるとディレクトリ構造のネストが深くなる

### Risks
- API Route（`/api/`）は Route Groups の外にあるため、認証ガードを個別に追加する必要がある。SSE エンドポイントへの認証ガード追加漏れが Phase 2 のコードレビューで IDOR として検出された（修正済み）
