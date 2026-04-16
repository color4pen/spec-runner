# ADR-20260416: SpecRunner アプリがオーケストレーターを担う

## ステータス

採用

## コンテキスト

Claude Code の execute-request は、1 プロセス内で複数の subagent を spawn して並列実行・結果統合を行うオーケストレーションパターン。Managed Agents にはこれに相当する機能がない（1 Session = 1 Agent、Session 間通信なし）。

SpecRunner で execute-request 相当のワークフローを実現するには、オーケストレーションの責務をどこかが担う必要がある。

## 決定

**SpecRunner アプリ（Next.js）がオーケストレーターの責務を持つ。**

### アーキテクチャ

```
SpecRunner (Next.js)
├── UI: ユーザーとの対話、進捗表示
├── Orchestrator: ワークフローのステップ管理
│   ├── Session 作成・管理（role ごとに Agent を切り替え）
│   ├── Session 間のデータ受け渡し（Git branch 経由）
│   ├── レビュー結果の統合・判定
│   └── リトライ・エスカレーションの制御
├── Custom Tools: Agent → アプリへの橋
│   ├── request_review → reviewer Session 起動
│   ├── create_pr → GitHub API
│   ├── get_progress → DB 照会
│   └── ...
└── State: DB でワークフロー状態を永続管理
```

### Claude Code との対比

| 役割 | Claude Code | SpecRunner |
|---|---|---|
| オーケストレーター | 親 Agent（プロセス内） | **Next.js アプリ** |
| Sub Agent 起動 | `Agent()` で直接 spawn | Custom Tool → アプリが Session 作成 |
| ファイル共有 | 同一ファイルシステム | **Git branch** |
| 状態管理 | 会話コンテキスト内 | **アプリの DB** |
| レビューループ | 親 Agent が判定 | **アプリが verdict を解釈してループ** |

## 理由

1. **Managed Agents の制約への適応**: 1 Session = 1 Agent、Session 間通信なし、ファイルシステム分離。アプリがハブにならざるを得ない
2. **Custom Tools が橋渡しを提供**: Agent が「レビューして」→ アプリが reviewer Session を立てる → 結果を返す。SDK で完全にサポートされている
3. **状態の永続性**: アプリの DB にワークフロー状態を持つことで、Session の再起動やクラッシュに耐えられる
4. **将来の Multi-agent 対応**: Research Preview の Multi-agent が GA になった場合、オーケストレーションの一部を Managed Agents 側に移譲できる。アプリ側の抽象化が変わるだけで全体構造は維持可能

## フェーズ計画

| Phase | 内容 | オーケストレーション範囲 |
|---|---|---|
| Phase 1 | チャット UI | なし（ユーザーが手動で指示） |
| Phase 2a | interrupt + requires_action 基盤 | Agent 制御の基礎 |
| Phase 2b | Custom Tools | Agent → アプリの橋。レビュー委任が可能に |
| Phase 2c | GitHub OAuth + Vault | 認証基盤 |
| Phase 3 | execute-request 実装 | 設計 → レビュー → 実装 → 検証 → PR の自動化 |
| Phase 4 | DB + ワークフロー状態管理 | リトライ、エスカレーション、履歴 |
| Phase 5 | マルチテナント | ユーザー/Org ごとのワークフロー分離 |

## 却下した代替案

- **1 Session で全部やらせる（System Prompt に全 role を詰め込む）**: 自分で書いて自分でレビューするため品質が低下。Claude Code の GAN パターン（writer vs critic の対立構造）が再現できない
- **Research Preview の Multi-agent 待ち**: 時期不明。現在の SDK で実現可能な設計を先に固めるべき
- **外部のワークフローエンジン（Temporal, Inngest 等）を導入**: Phase 1-3 では過剰。アプリ内のシンプルなステートマシンで十分。必要になったら Phase 4 以降で検討

## リスク

- **アプリの複雑性増大**: オーケストレーションロジックが Next.js アプリに集中する。ワークフロー定義を宣言的に管理する仕組み（設定ファイル or DSL）が Phase 3 以降で必要になる可能性
- **Session 起動の遅延**: レビューのたびに新 Session を作成する。Environment のコンテナ起動時間がボトルネックになる可能性。事前に Session プールを用意する最適化が考えられる
- **Anthropic の仕様変更**: beta 期間中はプロキシの挙動やイベント構造が変わる可能性

## 結果

- SpecRunner の最終的な姿が明確になった: 「request.md を投げたら PR が出てくる」Web アプリ
- Phase 2-3 の設計方針が確定
- Custom Tools 基盤が全ての後続機能の土台になることが確定
