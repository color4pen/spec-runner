# ADR-20260427: SpecRunner = AI CI/CD Runner

## ステータス

採用

## コンテキスト

SpecRunner の位置づけが曖昧だった。「openspec-workflow の Web 版」「Managed Agents を使った開発プラットフォーム」「request を投げたら PR が出てくるアプリ」など、複数の表現が混在していた。

openspec-workflow の SKILL.md で実証した設計判断（9ステップパイプライン、Author-Bias Elimination、学習フィードバックループ）を Managed Agents 上に載せる際、対話的な UX ではなく「ジョブを投入して成果物を受け取る」モデルが自然であることが明確になった。

GitLab Runner のお守り経験から、CI/CD ランナーのメンタルモデル（ジョブ投入 → パイプライン実行 → 成果物返却 → 状態監視）がそのまま適用できることに気づいた。

## 決定

**SpecRunner は AI 開発に特化した CI/CD ランナーである。**

### 対応関係

| CI/CD の概念 | SpecRunner での実体 |
|---|---|
| ワークフロー定義 | request.md（入力）+ パイプライン定義（core） |
| トリガー | request の投入（UI or CLI） |
| ジョブ | パイプラインの各ステップ（propose, spec-review, implement, ...） |
| ランナー | Managed Agents のセッション |
| アーティファクト | PR, change folder, review-feedback |
| ログ | progress.md, decisions/ |

### 設計原則

- **Yes/No を聞かない**: request.md を書いた時点で人間の意思決定は完了。パイプラインは全自動で走り切る
- **エスカレーションのみ人間に戻る**: 3ループ超過、terminated、判断不能の場合のみ通知
- **UI は操作画面ではなくダッシュボード**: ジョブ一覧、進捗表示、エスカレーション通知、PR リンク。操作は「resume」と「cancel」のみ

## 理由

1. **メンタルモデルの明確さ**: 「開発プラットフォーム」は範囲が広すぎる。「AI CI/CD ランナー」なら何をするものか一発で伝わる
2. **既存の設計パターンの活用**: CI/CD ランナーのライフサイクル管理（ジョブ投入、状態監視、中断再開、ログ）は成熟した設計パターン。車輪の再発明が不要
3. **docker コマンド体系との親和性**: `run`, `ps`, `logs`, `stop`, `resume` — 開発者が既に知っている語彙でインターフェースを設計できる
4. **スコープの制御**: CI/CD ランナーとして定義することで、「チャット UI を作る」「対話的な要件定義を実装する」といったスコープ肥大を防げる

## 却下した代替フレーミング

- **開発プラットフォーム**: スコープが広すぎる。認証、マルチテナント、課金まで含意してしまう
- **openspec-workflow の Web 版**: openspec-workflow はスキルセットであり、SpecRunner はそれを実行するランナー。同じものの別バージョンではない
- **AI コーディングアシスタント**: Cursor や Copilot と競合するポジショニングになる。SpecRunner は対話的なコーディング支援ではない

## 参照

- ADR-20260416-app-as-orchestrator.md — SpecRunner がオーケストレーターを担う方針
- ADR-20260424-session-pipeline-design.md — 4セッション直列モデル
- openspec-workflow README.md — SKILL.md ベースのパイプライン設計
