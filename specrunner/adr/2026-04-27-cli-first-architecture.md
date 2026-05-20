# ADR-20260427: CLI ファースト アーキテクチャへの転換

## ステータス

提案

## コンテキスト

spec-review セッションの自動遷移を設計する過程で、Next.js モノリスの構造的限界が明確になった。

### 発見の経緯

1. **propose → spec-review の自動遷移をどう実現するか？** という問いから議論が始まった
2. 現在の SSE stream route（`/api/sessions/[id]/stream`）を分析した結果、**クライアント（ブラウザ）が接続していないとパイプラインが動かない**ことが判明した
3. Custom Tool の処理（`requires_action` → `user.custom_tool_result`）は SSE ループ内で行われており、ブラウザ接続が前提
4. `handleSessionCompleted` は fire-and-forget だが、**次セッションの SSE を消費する主体がいない**

### 問題の本質

SpecRunner は CI/CD ランナーである（ADR-20260427-specrunner-as-ai-cicd-runner）。設計原則は「request.md を書いた時点で人間の意思決定は完了。パイプラインは全自動で走り切る」。ブラウザを閉じたら止まるシステムはランナーとして壊れている。

Next.js はリクエスト-レスポンス型の Web フレームワークであり、長時間バックグラウンド処理の置き場所がない:
- API Routes は HTTP リクエストの寿命に縛られる
- fire-and-forget の async はプロセスメモリに浮いている（再起動で消失）
- Vercel にデプロイ不可（長時間プロセス前提）
- SSE のタイムアウト問題と既に戦った経験がある

### Managed Agents の実行モデル

調査で判明した重要な事実:
- **セッションは Anthropic のサーバー上で自律的に走る**。標準ツール（Bash, Read, Write, Edit, Glob, Grep）で全作業を完了できる
- **Custom Tool なしでパイプラインは成立する**。openspec-workflow と同じ「ファイル経由 verdict」— エージェントが結果ファイルをブランチに push し、オーケストレーターがそれを読む
- **`client.beta.sessions.retrieve(id)`** でセッション状態をポーリングできる（600 req/min、read endpoint）
- SSE stream は観察用であり、パイプライン実行に必須ではない

### Custom Tool の要否

| セッション | Custom Tool | 理由 |
|-----------|-------------|------|
| propose | `register_branch`（必要） | slug 生成をエージェントに委任しているため、非決定的な値をアプリに伝える必要がある |
| spec-review | 不要 | verdict は spec-review-result.md に書いてブランチに push すればよい |
| implementer | 不要 | コードを書いて push するだけ |
| code-review | 不要 | verdict は review-feedback.md に書いてブランチに push すればよい |

propose 以外のセッションは Custom Tool なしで完結する。つまり SSE stream なしで動作可能。

## 決定

**CLI ファーストで再構築する。Next.js モノリスでの検証フェーズを終了し、CLI をプライマリインターフェースとする。**

### アーキテクチャ

```
specrunner/
├── src/
│   ├── core/           # パイプラインオーケストレーション
│   │   ├── pipeline.ts   # ステー��マシン（propose → spec-review → impl → review）
│   │   ├── session.ts    # セッション作成・ポーリング・完了検知
│   │   ├── verdict.ts    # ブランチからverdict ファイルを読んでパース
│   │   └── tools.ts      # Custom Tool ハンドラ（propose 用）
│   ├── cli/            # コマンドインターフェース
│   │   ├── run.ts
│   │   ├── ps.ts
│   │   ├── logs.ts
│   │   ├── stop.ts
│   │   └── init.ts
│   ├── config/         # ~/.config/specrunner/ 管理
│   └── db/             # SQLite（ジョブ状態管理）
└── package.json
```

### パイプライン実行モデル

```
$ specrunner run request.md

1. request.md をパース
2. cwd の git remote からリポジトリ情報取得
3. propose セッション作成 + メッセージ送信
   → SSE stream 接続（register_branch Custom Tool のため）
   → セッション完了検知 → ブランチ名を DB に保存
4. spec-review セッション作成 + メッセージ送信
   → ポーリングで完了検知（Custom Tool 不要）
   → ブランチから spec-review-result.md を読む → verdict パース
5. verdict に応じて分岐:
   → approved: implementer セッション起動
   → needs-fix: ユーザーに通知（Phase 1）
   → escalation: ユーザーに通知
6. 以降同様に implementer → code-review
7. 全 approved → PR 作成
```

### 認証

- **Anthropic**: API key を `~/.config/specrunner/config.json` に保存
- **GitHub**: Device Flow OAuth（`specrunner login`）でトークン取得・保存
- ブラウザ常駐不要。初回 login 時のみブラウザを開く

### Agent / Environment 管理

- CLI が「あるべき Agent 定義」をコードとして持つ
- `specrunner init` で Agent + Environment を作成、ID を config に保存
- CLI バージョンアップ時に Agent 定義の差分を検知して自動更新
- `specrunner changelog` でバージョンノートを表示

### propose セッションの特殊性

propose のみ Custom Tool（`register_branch`）を使うため、SSE stream 接続が必要。ただし CLI プロセスが直接 stream を消費するため、ブラウザ依存は発生しない。CLI プロセス自身がオーケストレーターとして stream を読み、Custom Tool に応答する。

## 理由

1. **CI/CD ランナーのアイデンティティとの一致**: CLI プロセスがオーケストレーター。ブラウザ不要で全自動実行
2. **Managed Agents の実行モデルとの整合**: セッションは自律的に動き、完了をポーリングで検知する。SSE ���観察チャネルに過ぎない
3. **構造のシンプルさ**: プロセスが生きている = ランナーが動いている。バックグラウンドワーカーやキューの抽象化が不要
4. **Next.js の制約からの解放**: SSE タイムアウト、fire-and-forget の脆弱性、Vercel デプロイ不可 — 全て解消
5. **docker コマンド体系の自然な実現**: `run`, `ps`, `logs`, `stop` がそのまま CLI コマンドになる
6. **Web UI の後付け容易性**: CLI が動いた後に `specrunner dashboard` で観察用 Web UI を追加できる

## Next.js 実装の扱い

- **検証資産として保持**: Managed Agents SDK の使い方（セッション作成、SSE、Custom Tool）は CLI でそのまま再利用
- **切り出しではなく参照**: `src/lib/` のコードは Next.js 固有のもの（'use server', auth(), revalidatePath）と混ざっているため、CLI 用に同じパターンで書き直す
- **DB スキーマは流用可能**: Drizzle + SQLite のスキーマ定義は CLI でもそのまま使える

## リスク

- **CLI 開発の経験不足**: 初めての CLI 開発。ただし構造がシンプルなため学習コストは低い
- **Web UI の後回し**: ダッシュボード機能が後回しになる。ただし CI/CD ランナーの本質は CLI で完結する
- **propose の SSE 依存**: propose セッションのみ Custom Tool のために SSE 接続が必要。CLI プロセスが処理するため問題はないが、propose 中に CLI を kill すると stuck する可能性がある

## 参照

- ADR-20260427-specrunner-as-ai-cicd-runner.md — SpecRunner のフレーミング
- ADR-20260427-turborepo-core-cli-web.md — 元の 3 層分離構想（CLI ファース���で単純化）
- ADR-20260424-session-pipeline-design.md — 4 セッション直列モデル（パイプライン設計は維持）
- Managed Agents SDK v0.91.0 — `sessions.retrieve()` による状態ポーリング
