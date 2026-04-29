# ADR-20260429: CI/CD アーキテクチャ参考実装と転用パターン

## ステータス

提案

## コンテキスト

spec-runner は ADR-20260429-positioning-vs-gsd-and-openspec で **"Argo Workflows on Anthropic"** を概念モデルとして宣言済み。Class Architecture ADR / Module Architecture Style ADR で内部構造を決定したが、**先行する CI/CD / workflow engine 実装からどのパターンを借りるか** が未決のまま、Class Architecture ADR の Inspirations 節として暫定的に記録されていた。

実装エンジンが対等な領域は外部に多数の先行実装があり、車輪を再発明する必要はない。本 ADR は転用候補と採用ロードマップを正典化する。

### 制約

- spec-runner の runtime model は **LLM session per step**（container ベースではない）
- Solo dogfood / 個人ツールであり、企業向け OSS 機能（matrix builds / runner pool 等）は不要
- TypeScript で書く（YAML DSL の流入を最小化）
- Class Architecture ADR の D1〜D10 を前提とした拡張設計

## 決定

### 直接参照する 5 システムと転用パターン

#### 1. Argo Workflows ★最優先

ADR-20260429-positioning で概念モデル元として宣言済み。最も多くのパターンを借りる。

| パターン | spec-runner への適用 | 適用先 |
|----------|---------------------|--------|
| **Exit handlers** | pipeline 完了 / 失敗時の cleanup hook | EventBus に `pipeline:complete` / `pipeline:fail` を追加し subscriber 化 |
| **Retry strategies**（limit / duration / backoff / retryPolicy） | `Pipeline.maxIterations` 単独より豊か。step 別 / verdict 別の retry policy を宣言 | Class Architecture ADR D3 の Pipeline class を拡張 |
| **Suspend / resume** | 長時間 pipeline の中断と再開 | 既存 resume-session の延長線。mid-step resume の設計時に参照 |
| **Memoization** | 入力ハッシュが同じ task は skip | spec-fixer の「同じ findings に対する再実行」guard として応用可 |

#### 2. Tekton ★Results 契約が直接効く

| パターン | spec-runner への適用 | 適用先 |
|----------|---------------------|--------|
| **Task results 契約** | 各 Step が typed inputs/outputs を宣言、downstream が consume | Class Architecture ADR D1 の Step interface を typed 化 |
| **Workspaces** | 共有 filesystem | git branch として既に実現済み |
| **TaskRun / Pipeline 分離** | 定義 vs インスタンス | Step / StepRun として既に整合 |

Step interface 拡張案:
```typescript
interface Step {
  readonly inputs: ReadonlyArray<ArtifactRef>;
  readonly outputs: ReadonlyArray<ArtifactRef>;
  // ...既存フィールド（Class Architecture ADR D1）
}

interface ArtifactRef {
  kind: "change-folder" | "spec-review-result" | "code" | "review-feedback" | "pr";
  path: string | ((state: JobState) => string);
}
```
これにより graph validator（「implementer の inputs は spec-review の outputs に含まれているか」を静的検証）が書ける。

#### 3. Temporal ★Durable execution と Signals

| パターン | spec-runner への適用 | 適用先 |
|----------|---------------------|--------|
| **Durable execution** | mid-step crash からの replay 可能性 | resume 設計の参考。現状 spec-runner は state ファイルからの再開はあるが mid-step resume は未設計 |
| **Signals** | 走行中 workflow への外部入力 | escalation 時の人間判断待ち流路（`specrunner signal <jobId> --resolve approved`） |
| **Versioning** | workflow 定義変更時の in-flight job 扱い | transition table 変更時の挙動設計 |

Signals は v0.7 マイルストーン候補。escalation を「自動失敗終了」ではなく「ユーザ判断待ち」にできる設計余地を残す。

#### 4. GitHub Actions ★Composite Action

| パターン | spec-runner への適用 | 適用先 |
|----------|---------------------|--------|
| **Composite Action** | 複数 step を 1 つの再利用可能 step にまとめる | 将来「`review` step が `security-reviewer` + `code-reviewer` + `pattern-reviewer` を並列起動」する Composite Step の参考 |
| **Conditional expressions** | `if:` での条件分岐 | transition table で既に表現済み。expression syntax は採用しない |
| **Reusable workflows** | 別 workflow の呼び出し | 現状不要、将来 multi-request orchestration が必要になった時 |

#### 5. Dagster ★Asset-based モデリング

| パターン | spec-runner への適用 | 適用先 |
|----------|---------------------|--------|
| **Asset lineage** | 「Task が何をするか」ではなく「何の Asset を生むか」で pipeline を組む | 学習層の観測単位を asset 化（change folder / spec-review-result.md / code / review-feedback.md / PR） |
| **Asset materialization events** | asset 生成のイベント化 | EventBus subscriber が asset 単位で集計 |

学習層実装（v1 milestone）と同期で検討。観測単位が asset になると、何度 spec-fixer が走っても「最終 PR を生むのに必要な precursor の lineage」が一貫して追跡できる。

### 中程度の参考

| システム | 借りるパターン | 適用先 |
|----------|---------------|--------|
| **Concourse** | Resources の check / in / out 抽象 | adapter/ 層の port 設計、git branch / GitHub PR の typed external resource 化 |
| **Jenkins Declarative Pipeline** | declarative + scripted ハイブリッド | 基本は transition table、escape hatch として imperative も許す設計 |
| **Prefect / Airflow** | Sensors / Triggers | request.md ファイル変更検知での自動起動（v1 以降） |

### 採用しないパターン（spec-runner に合わない）

| パターン | 不採用理由 |
|----------|-----------|
| **Container-per-step**（Tekton / Drone / GHA / Argo） | spec-runner の step executor は LLM session であって container ではない。runtime レベルで関係ない |
| **Matrix builds** | 同じ request の variant 並列実行は不要 |
| **Runner pool / agent pool** | CLI プロセスが直接 orchestrator。pool 抽象は不要 |
| **YAML DSL 中心**（GHA / Tekton / Argo の YAML） | solo / TypeScript で書くほうが型安全。transition table はコードの const 配列で十分。YAML loader 導入は外部公開する時のみ |
| **Cluster-native CRD**（Tekton / Argo） | k8s 前提のものは subset を借りるのみ。runtime model は流用しない |
| **GHA expression syntax**（`${{ ... }}`） | 重い。条件分岐は transition table で機械的に表現する方針 |

### 採用ロードマップ

| 採用パターン | 実施タイミング | 関連 Decision |
|-------------|---------------|---------------|
| Tekton Task results（typed inputs/outputs） | spec-fixer 実装と同 request | Class Architecture ADR D1 拡張 |
| Argo Retry strategies（step 別 retry policy） | spec-fixer 実装と同 request | Class Architecture ADR D3 拡張 |
| Argo Exit handlers（EventBus subscriber） | EventBus 予約席と同時 | Class Architecture ADR D7 拡張 |
| Argo Memoization（findings ハッシュ） | spec-fixer 実装後の最適化 request | 新規 |
| GHA Composite Step | code-review 実装時に並列 reviewer が必要になった時 | 新規 |
| Temporal Signals（escalation 解決） | v0.7 milestone | 新規 |
| Dagster Asset lineage | 学習層実装（v1）と同期 | 新規 |
| Concourse Resources | adapter/ 層の port 設計が成熟した時 | Module Architecture Style ADR D4 拡張 |

### 参照点として README / コードコメントで使う表現

> "spec-runner draws conceptual patterns from **Argo Workflows** (composition, retry, exit handlers), **Tekton** (typed task results), **Temporal** (durable execution, signals), **Dagster** (asset lineage), and **GitHub Actions** (composite steps). Runtime model is独自（LLM session per step）。"

## 理由

1. **車輪の再発明を避ける** — workflow engine 領域は 10 年以上の蓄積がある。設計判断を独立に行うとほぼ確実に既知の落とし穴に踏む
2. **概念モデル（Argo Workflows on Anthropic）と実装の整合** — positioning ADR で宣言したモデルから具体パターンを継承することで、長期的に positioning がぶれない
3. **採用タイミングを明示することで scope creep を防ぐ** — 「この機能はいつ入れる？」の判断が一覧化される。spec-fixer 実装で何を入れて何を入れないかが事前に決まる
4. **不採用パターンを正典化** — 「YAML DSL を導入しないか？」「runner pool が必要か？」のような議論が再発した時、本 ADR を引けば判断根拠が即出る

## 結果

### Positive

- 採用パターンの実施タイミングが Class Architecture ADR / Module Architecture Style ADR の Decision 番号と紐付いて追跡可能
- 不採用パターンの根拠が明示され、後の議論コストが下がる
- 外部参考実装と spec-runner の差分（特に runtime model = LLM session per step）が明示される

### Negative / Risks

- ロードマップは現時点の見込みであり、実装が進むと優先順位が変わる可能性がある（その時は本 ADR を更新）
- 「採用ロードマップ」と Class Architecture ADR の Tracking が二重管理になる懸念。**本 ADR が採用パターンの正典、Class Architecture ADR は実装スコープの正典**として責務分離する

### Tracking

- spec-fixer 実装 request: Tekton Task results + Argo Retry strategies + Argo Exit handlers を Class Architecture ADR D1/D3/D7 拡張として組み込む
- 学習層実装（v1）request: Dagster Asset lineage を採用
- v0.7 milestone: Temporal Signals の研究と試作
- 各採用が完了するごとに本 ADR の「採用ロードマップ」テーブルに完了日を追記する

## 参照

- ADR-20260429-step-and-agent-class-architecture.md — Step / Agent / Pipeline のクラス境界。本 ADR の採用パターン適用先
- ADR-20260429-module-architecture-style.md — Module Architecture Style。port-adapter 境界の決定
- ADR-20260429-positioning-vs-gsd-and-openspec.md — "Argo Workflows on Anthropic" の概念モデル元
- Argo Workflows: https://argoproj.github.io/workflows/
- Tekton: https://tekton.dev/
- Temporal: https://temporal.io/
- GitHub Actions: https://docs.github.com/actions
- Dagster: https://dagster.io/
- Concourse: https://concourse-ci.org/
- アーキテクチャ評価セッション: 2026-04-29
