# ADR-20260416: 技術スタック選定

## ステータス

採用

## コンテキスト

SpecRunner は Managed Agents 上で OpenSpec ワークフローを実行するアプリケーション。Phase 1 から将来の SaaS 化（Phase 5）を見据えた技術選定が必要。

## 決定

### ランタイム: Node.js

- OpenSpec が Node.js 20.19.0+ を要求
- Managed Agents の Environment が Node.js を標準サポート

### フレームワーク: Next.js (App Router)

- アプリケーション前提で開発するため、UI と API を一体で扱える Next.js を採用
- SSE ストリーミングは Route Handlers で処理（App Router では問題なし）
- Phase 5 での UI 追加がスムーズ

### SDK: @anthropic-ai/sdk

- Anthropic 公式 SDK
- TypeScript 対応
- Managed Agents API をサポート

### 言語: TypeScript

- 型安全性
- SDK との相性

## 構成

```
src/
├── app/
│   ├── api/          # Route Handlers（SSE 含む）
│   └── (ui)/         # Phase 5 で UI 追加
├── lib/
│   ├── agents/       # Managed Agents クライアント
│   └── openspec/     # OpenSpec 連携
└── types/
```

## 結果

- Phase 1 は API サーバーとして構築
- Phase 5 で UI を追加する際の書き直しが不要
- Vercel へのデプロイが容易
