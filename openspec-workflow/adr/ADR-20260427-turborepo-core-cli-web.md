# ADR-20260427: turborepo 構成 — core / cli / web の3層分離

## ステータス

提案

## コンテキスト

現在の SpecRunner は Next.js のモノリシックなアプリケーションとして構築されている。Server Actions にドメインロジック、API Routes に SSE ストリーミング、React コンポーネントに UI が混在している。

開発を進める中で以下の問題が顕在化した：

1. **Next.js の制約との戦い**: SSE の接続タイムアウト、Server Actions の `'use server'` 制約、Turbopack のキャッシュ破損。これらは SpecRunner のドメインではなく Next.js のインフラ制約
2. **CLI の必要性**: ドメインロジックの検証に UI は不要。ジョブの投入・状態確認・ログ確認は CLI で十分
3. **docker コマンド体系の発見**: `run`, `ps`, `logs`, `stop`, `resume` というインターフェースが自然に導出された。これは CLI と Web の両方から叩ける共通の抽象
4. **Docker Desktop の教訓**: CLI と UI を後から統合すると中途半端になる。最初からインターフェースを切っておく必要がある

## 決定

**turborepo でモノレポ化し、packages/core + apps/cli + apps/web の3層に分離する。**

### 構成

```
specrunner/
├── packages/
│   └── core/                    # ドメインロジック + Managed Agents API 接続
│       ├── pipeline/            # パイプラインのステートマシン
│       ├── agents/              # Managed Agents API アダプター
│       ├── state/               # ジョブ状態管理（SQLite）
│       ├── events/              # SSE イベントパーサー、Custom Tool ハンドラ
│       └── index.ts             # 公開インターフェース
├── apps/
│   ├── cli/                     # docker ライクな CLI
│   │   └── commands/            # run, ps, logs, stop, resume
│   └── web/                     # Next.js ダッシュボード
│       ├── app/                 # App Router ページ
│       └── api/                 # core を呼ぶ薄い API Routes
└── turbo.json
```

### core の公開インターフェース

```typescript
// packages/core/index.ts
export interface SpecRunner {
  // ジョブライフサイクル
  run(request: RequestInput): Promise<JobHandle>;
  stop(jobId: string): Promise<void>;
  resume(jobId: string): Promise<JobHandle>;

  // 状態照会
  list(): Promise<JobStatus[]>;
  status(jobId: string): Promise<JobStatus>;
  logs(jobId: string): AsyncIterable<LogEntry>;

  // イベント
  onProgress(jobId: string, callback: (step: StepProgress) => void): Unsubscribe;
  onEscalation(jobId: string, callback: (escalation: Escalation) => void): Unsubscribe;
}
```

### CLI コマンド体系

```
specrunner run <request-path>     # ジョブ投入（--detach でバックグラウンド）
specrunner ps                     # 実行中ジョブ一覧
specrunner logs <job-id>          # ジョブログ（-f でフォロー）
specrunner stop <job-id>          # ジョブ停止
specrunner resume <job-id>        # ジョブ再開
specrunner status <job-id>        # ジョブ詳細状態
```

### Web の役割

- core の状態 DB を読むダッシュボード
- ジョブ一覧 + 進捗表示 + エスカレーション通知 + PR リンク
- 操作は `resume` と `cancel` のみ
- request.md の投入フォーム（フリーテキスト + type 選択）

## 理由

1. **ドメインロジックの独立**: core は Next.js にも CLI にも依存しない。Managed Agents API の変更は core 内で吸収される
2. **検証速度**: CLI でドメインロジックを直接叩けるため、UI 構築を待たずに Managed Agents との接合部を検証できる
3. **UI の後付け容易性**: core のインターフェースが安定していれば、Web はいつでも追加・変更できる
4. **Next.js 制約の局所化**: SSE タイムアウト等の問題は apps/web 内に閉じる。core はそれを知らない
5. **並行開発**: CLI と Web を独立して進められる

## 移行戦略

現在のモノリシック Next.js から段階的に移行する：

1. **Phase 1（現在）**: Next.js モノリスで Managed Agents との接合部を検証
2. **Phase 2**: `src/lib/` のドメインロジックを `packages/core/` に切り出し。Next.js は core を import する
3. **Phase 3**: `apps/cli/` を追加。core の検証を CLI で高速化
4. **Phase 4**: Next.js を `apps/web/` に移動。turborepo 構成完成

Phase 1 が完了してから Phase 2 に進む。今は Managed Agents の API 挙動を固めることが優先。

## リスク

- **早すぎる抽象化**: Phase 1 で API 挙動が変わると、core のインターフェースも変わる。切り出しが早すぎると手戻りが増える
- **turborepo の学習コスト**: モノレポツールの設定・ビルド・依存管理に時間を取られる可能性
- **個人開発の複雑性増大**: 3パッケージの保守は1人では重い。CLI が本当に必要になるまで Phase 3 は延期してもよい

## 参照

- ADR-20260427-specrunner-as-ai-cicd-runner.md — SpecRunner のフレーミング（AI CI/CD ランナー）
- ADR-20260424-session-pipeline-design.md — 4セッション直列モデル（core の pipeline/ に相当）
- Docker CLI reference — コマンド体系の参照元
