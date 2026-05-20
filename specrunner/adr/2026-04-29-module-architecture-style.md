# ADR-20260429: Module Architecture Style — Modular Monolith + Functional Core + Hexagonal-lite

## ステータス

提案

## コンテキスト

spec-runner の core 層クラス境界を ADR-20260429-step-and-agent-class-architecture（以下「Class Architecture ADR」）で決定した（D1〜D10）。それらクラスを **どのモジュール構造に載せるか** の上位枠が未決のまま、暗黙に「現状の `src/` レイアウト」に従って成長してきた。

決定すべき範囲:

1. アプリケーション全体のスタイル（Modular Monolith / Layered / Hexagonal / Onion / Clean / DDD のいずれを採るか）
2. モジュール境界の引き方（feature folder vs capability folder / port-adapter の有無）
3. 関数とクラスの使い分けの上位ルール
4. tactical DDD の語彙をどこまで借りるか
5. ディレクトリ構造の正典化

これらが未決のままだと、Class Architecture ADR の D1〜D10 を実装する際に「`StepExecutor` をどこに置く？」「`SessionClient` は core か adapter か？」が都度議論になり、スタイルがにじむ。

### 制約

- Solo dogfood ツール（OSS 化・複数人開発を想定しない）
- TypeScript エコシステムの慣習に整合させる（Java/C# 由来の重い ceremony は避ける）
- 既存 `src/` レイアウト（`auth/ cli/ config/ core/ git/ logger/ parser/ prompts/ sdk/ state/ util/`）からの移行コストを最小化する
- 学習層 / observability の plug-in 余地を残す
- 将来の test fakes / 別 adapter（stdin/stdout テストモード等）の追加余地を残す

## 決定

### D1: スタイル定義

spec-runner のモジュールアーキテクチャを以下と定義する:

> **Modular Monolith + Functional Core, Imperative Shell + Hexagonal-lite**

短縮表記: **Layered Capability Modules**（README / コードレビュー時の呼称）

### D2: 中核となる 3 つの原則

#### Pipes & Filters を core の構造として明示

spec-runner のドメインは literally pipeline。`Step` = filter、`Pipeline` = composition、`JobState` = 流通データ。これは偶然ではなくドメインそのもの。core 層はこの構造を中心に据える。

#### Functional Core, Imperative Shell

| 層 | 性質 | 例 |
|----|------|-----|
| **Functional Core**（pure） | 副作用なし、test in vitro 容易 | Verdict 判定、ファイルパース、メッセージビルド、definitionHash 計算、transition lookup |
| **Imperative Shell**（I/O） | class、副作用あり、mock 容易 | SessionClient、GitHubClient、JobStateStore、AgentSyncer、EventBus |

テスト戦略の二層化: pure 関数は引数 / 戻り値で検証、class は依存を mock して検証。

#### Hexagonal-lite（adapter 境界だけ引く）

「domain / application / infrastructure」の 3 層厳密分離はやらない（ceremony 過多）。**外部 I/O との seam だけを adapter として明示**する。core が **interface（port）** を定義し、`adapter/` が **実装** を提供する。

### D3: tactical DDD の部分採用

以下の 4 概念のみ明示的に語彙として採用する（ADR / コメント / コードレビュー時の共通語）:

| DDD 概念 | spec-runner における適用 |
|----------|---------------------------|
| **Aggregate** | `JobState` + `StepRun[]` — 整合性境界。変更は `JobStateStore` 経由のみ |
| **Repository** | `JobStateStore`、`ConfigStore` |
| **Value Object** | `Verdict`、`StepOutcome`、`StepName`（immutable / 等価性 by value） |
| **Domain Event** | `EventBus` の `step:start` / `step:complete` / `step:error` / `verdict:parsed` / `pipeline:start` / `pipeline:complete` / `pipeline:fail` |

採用しないもの: Bounded Context、Context Map、Ubiquitous Language の整備、UseCase / Interactor / Presenter の Clean 4 層、DTO / Mapper / Assembler 多層化、DI コンテナ、Domain Service の細分化。

### D4: ディレクトリ構造

```
src/
├── core/                    # アプリケーションコア（依存先: store, util、port のみ）
│   ├── pipeline/            # Pipeline class + Transition table
│   ├── step/                # Step interface + StepExecutor + step 実装群
│   │   ├── propose.ts
│   │   ├── spec-review.ts
│   │   └── ...
│   ├── agent/               # AgentDefinition / AgentRegistry / AgentSyncer
│   ├── tool/                # ToolSpec / ToolHandler 型
│   ├── event/               # EventBus
│   └── port/                # core が要求する interface（SessionClient, GitHubClient, AnthropicClient 等）
├── adapter/                 # Port の実装（外部 SDK 依存）
│   ├── anthropic/           # 旧 sdk/ を改名集約。SessionClient / AnthropicClient 実装
│   ├── github/              # GitHubClient 実装
│   └── git/                 # 旧 git/
├── store/                   # 永続化（Repository 実装）
│   ├── job-state.ts         # 旧 state/
│   └── config.ts            # 旧 config/
├── prompts/                 # System prompts（pure data）
├── cli/                     # CLI コマンド = composition root + presentation
├── auth/                    # GitHub Device Flow（adapter/ に入れてもよい）
├── parser/                  # request.md パーサ（pure）
├── logger/
├── util/
└── errors.ts
```

### D5: 依存方向ルール

```
cli ──→ core ──→ port (interface)
         │              ↑
         │              │ implements
         ↓              │
        store ←─── adapter ──→ external SDK
```

ルール:
- **cli は唯一の composition root**: 各 class を new し、依存を組み立てる。テストでは別の合成を渡す
- **core は adapter を直接 import しない**: 必要な I/O は `core/port/` の interface として定義し、cli が adapter 実装を注入する
- **adapter は external SDK 型を core に漏らさない**: 漏れる場合は port の interface でラップして core 用の型に変換する
- **store は core/port を implements**: Repository pattern の実装側

これだけ守ると DI コンテナなしで testability が確保できる。tsyringe / typedi 等の DI コンテナは導入しない。

### D6: クラス化の判断軸（関数のまま残すルール）

クラス化する基準:
- 状態を持つ
- DI で差し替えたい
- mock したい
- lifecycle がある
- トランザクション境界を持つ

関数のまま残す:
- `parser/request-md.ts` — pure
- `prompts/*.ts` — テンプレートを返す関数
- `git/remote.ts` — pure
- `util/atomic-write.ts` — JobStateStore の内部実装に
- `core/completion.ts` — polling ロジックは pure に近いので関数で残す
- Verdict / StepName 型 — string literal union
- AgentDefinition — interface（pure data）

## 理由

1. **ドメインに対する自然さ** — pipeline ドメインに pipes & filters を当てるのは構造的に正しい。Step が filter / Pipeline が composition / JobState が流通データ、という対応が型レベルで明示される
2. **Solo dogfood に対する適切な ceremony 量** — DDD / Clean / Onion はチーム規模・ドメイン複雑度がある時に効く。spec-runner の規模では overhead が利益を上回る
3. **TypeScript エコシステムとの整合** — TS 慣習は class + interface のハイブリッド。Java/C# 出身の DDD 語彙を全面採用すると違和感が出る。tactical 4 概念だけ借りるのが TS 文化に最も馴染む
4. **将来の拡張余地を残す** — port / adapter の seam があれば、後で fakes による e2e テストや別 adapter（Claude Code mode、stdin/stdout テストモード等）を追加できる。最初から hexagonal の重い ceremony を払わずに済む

## 却下した代替案

### 案 A: フル DDD（Strategic + Tactical）

- Bounded Context / Context Map / Ubiquitous Language を整備、Application / Domain / Infrastructure 層を厳密分離
- **却下理由**: solo / 1 context / domain expert = 自分自身、という条件で strategic DDD は機能しない。tactical 4 概念のみ借りるほうが ROI が高い

### 案 B: Clean Architecture（4 層厳密）

- Entity / UseCase / Interface / Framework の 4 層を厳格に守る
- **却下理由**: UseCase 層を spec-runner で実装すると Pipeline / Step / Executor のいずれが UseCase か曖昧になる。pipes & filters が既にドメインに合っているので 4 層は冗長

### 案 C: Vertical Slice Architecture（feature folder）

- `src/features/propose/` `src/features/spec-review/` のように feature ごとに full stack を切る
- **却下理由**: spec-runner の Step / Agent / Pipeline は **横断的に対称な抽象**。feature folder にすると Step interface / Pipeline class / EventBus 等の共通基盤の置き場が曖昧になる。capability module（horizontal）のほうが対称性が型レベルで見える

### 案 D: 現状維持（フラットな `src/` 直下に capability ディレクトリ）

- 現状の `auth/ cli/ config/ core/ git/ logger/ parser/ prompts/ sdk/ state/ util/` をそのまま使う
- **却下理由**: core が肥大化して subdivide が必要 / port-adapter 境界が暗黙のまま / store の概念が `state/` `config/` に分散。70% は合っているが 30% が曖昧で、決定として正典化する価値がある

## 結果

### Positive

- core / adapter / store / cli の役割分担が型レベルで明示される
- core が SDK 型に汚染されないため、SDK 上げ替え時の影響範囲が adapter/ に閉じる
- composition root が cli/ に固定されるため、テストで別合成を渡せる（DI コンテナ不要）
- tactical DDD 4 概念により、コードレビュー時の語彙が安定する
- `core/port/` の存在により、後で fakes / mock adapter を追加する場所が明示される

### Negative / Risks

- 既存 `sdk/` `state/` `git/` の rename 移行コスト（ただし git mv 機械的）
- core/port が空っぽに見える期間（adapter 実装側のみ最初に動く）の戸惑い
- adapter 境界を意識せずに core で SDK 型を直接使うミスが起きやすい（lint rule で防げる: `eslint-plugin-boundaries` 等）

### Tracking

- 本 ADR の **D4（ディレクトリ構造）** の rename 適用は、Class Architecture ADR の D4〜D6（Agent 関連 + config migration）と同 request で実施するのが自然
- spec-fixer 実装の先行 request では `core/` の subdivide のみ適用、adapter/ store/ rename は後送り
- README に 1 段落: "**Layered Capability Modules** — modular monolith with functional core, hexagonal-lite, pipes & filters at the core. Tactical DDD: Aggregate / Repository / Value Object / Domain Event のみ採用。"

## 参照

- ADR-20260429-step-and-agent-class-architecture.md — Step / Agent / Pipeline のクラス境界（D1〜D10）。本 ADR が載せる対象
- ADR-20260429-cicd-architecture-inspirations.md — Argo / Tekton / Temporal 等からの転用パターン。port-adapter 境界に関わる Concourse Resources などはここで参照
- ADR-20260427-cli-first-architecture.md — CLI ファースト構造の根拠
- ADR-20260429-positioning-vs-gsd-and-openspec.md — Anthropic 純正 stack の positioning
- アーキテクチャ評価セッション: 2026-04-29
