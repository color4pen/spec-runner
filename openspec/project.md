# SpecRunner

OpenSpec ワークフローを Claude Managed Agents 上で実行する Web アプリケーション。

## Stack

- **Runtime**: Bun 1.3.x
- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: React 19 + Tailwind CSS 4
- **API**: @anthropic-ai/sdk v0.89.0 (Managed Agents beta)
- **Lint**: ESLint 9
- **Test**: なし（未導入）

## Architecture

- Server Actions + Server Components（API Route は SSE のみ）
- Managed Agents API を Server Actions 経由で操作
- SSE ストリーミングで Agent のレスポンスをリアルタイム表示

## Directory Structure

```
src/
├── app/          # Next.js App Router pages
│   ├── _components/  # Client Components
│   └── api/      # API Routes (SSE only)
└── lib/          # Server Actions, SDK client
openspec/
├── changes/      # Change proposals
└── specs/        # Specifications
docs/
└── adr/          # Architecture Decision Records
```
