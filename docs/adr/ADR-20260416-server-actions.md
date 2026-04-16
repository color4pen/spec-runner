# ADR-20260416: API Routes から Server Actions への移行

## ステータス

採用

## コンテキスト

Phase 1 の初期実装では REST API Routes（`/api/agents`, `/api/sessions` 等）で CRUD を構築していたが、Next.js App Router には Server Actions + Server Components というより適切なパターンが存在する。

## 決定

CRUD 操作を Server Actions に移行し、API Route は SSE ストリーミング（`EventSource` が HTTP エンドポイントを要求するため）のみに限定する。

### Server Actions（`src/lib/actions.ts`）

- `listAgents()`, `createAgent()` — Agent の一覧・作成
- `listEnvironments()`, `createEnvironment()` — Environment の一覧・作成
- `listSessions()`, `createSession()`, `archiveSession()`, `deleteSession()` — Session 管理
- `sendMessage()` — メッセージ送信
- `listSessionEvents()` — 過去イベント取得

### API Route（残存）

- `GET /api/sessions/[id]/stream` — SSE ストリーミング（EventSource 必須）

### ページ構成

- `src/app/page.tsx` — Server Component。初期データを SDK から直接取得
- `src/app/_components/dashboard.tsx` — Client Component。UI インタラクション

## 理由

1. **型安全性**: fetch + JSON シリアライズの境界が消え、SDK の型がそのまま使える
2. **コード量削減**: route.ts + fetch + NextResponse.json の往復が不要
3. **ローカル Map 不要**: SDK の `.list()` が真実を返すので、アプリ側に状態を持つ必要がない
4. **`revalidatePath`**: mutation 後に Server Component を再実行し、最新データで再レンダリング

## 却下した代替案

- **全部 API Routes**: Next.js 16 App Router では Server Actions が推奨。外部クライアント（CLI 等）から叩く要件が出たら、その時に API Route を追加すればよい
- **全部 Server Actions（SSE 含む）**: EventSource は HTTP エンドポイントしか受け付けないため不可

## 結果

- API Route が 7 本 → 1 本に削減
- `src/lib/store.ts`（インメモリ Map）を廃止
- ページリロードやサーバー再起動後もデータが消えない（SDK が真実を返す）
