# ADR-20260430: verification を `kind` discriminator つき CLI-resident Step として表現する

> 本 ADR は `implementer-verify-buildfix` request の design.md D1 を ADR 化したもの。Step interface に `kind: "agent" | "cli"` discriminator を導入し、verification を agent を呼ばない CLI-resident step として表現する判断を記録する。

## ステータス

accepted

## コンテキスト

PR #26（D1-D9）→ PR #28（D4-D6）→ PR #31（executor-cleanup）→ PR #34（port-tidying）の累積で、`Step` interface は `agent: AgentDefinition` を必須とし、`StepExecutor` が agent session の lifecycle（create → poll → fetch → parse → emit）を一手に管理する形に整っていた。

implementer-verify-buildfix request では、spec 層と対称な「実装 → verification ↔ build-fixer → end」の self-correct loop を pipeline state machine 上に追加する。このうち **verification** は build / typecheck / test / lint / security の 5 phase を spec-runner CLI 内で直接実行する step であり、Anthropic の Agent session を呼ばない。

既存の `Step` interface は agent session を前提としているため、agent を呼ばない step を表現する形が必要になった。同時に project memory「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」を遵守する必要がある。

### 制約

- `core/step/types.ts` の Step interface は既に 3 つの実装（propose / spec-review / spec-fixer）を持つ。互換性を保ちつつ verification を表現する必要がある
- PR #31 で達成した「executor が step **名** を hardcode 分岐しない」原則を破ってはならない（参照: `module-analysis.md` 4.3）
- `AgentRegistry.fromSteps(steps)` は registry に集約する Step のみを判別できる必要がある（agent-less step は集約対象外）

## 決定

`Step` 型を **`kind: "agent" | "cli"` discriminator つきの discriminated union** に変更する。

```ts
type Step = AgentStep | CliStep;

type AgentStep = {
  kind: "agent";
  name: StepName;
  agent: AgentDefinition;
  toolHandlers?: Map<string, ToolHandler>;
  buildMessage(state, deps): string;
  resultFilePath(state): string | null;
  parseResult(content): StepOutcome;
};

type CliStep = {
  kind: "cli";
  name: StepName;
  resultFilePath(state): string;
  parseResult(content): StepOutcome;
  run(state: JobState, deps: StepDeps): Promise<void>;
};
```

`StepExecutor.execute(step, state)` は `step.kind` で分岐し、`"agent"` は既存の session lifecycle、`"cli"` は `step.run()` を呼んで `resultFilePath` を読みに行く。`AgentRegistry.fromSteps(steps)` は `step.kind === "agent"` の Step のみを集約する。

既存 3 Step（propose / spec-review / spec-fixer）には `kind: "agent"` を mechanical に追加する。

## 却下した代替案

### 案 (i): null agent — `Step.agent` を nullable にして `agent === null` で判定

- **Pros**: Step interface の変更が最小（field の nullable 化のみ）
- **Cons**:
  - 「データ存在で実行戦略を推論する」 anti-pattern を導入する。これは project memory `learned-patterns` の「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」規律に反する
  - 型システムが agent-less step の lifecycle 経路を強制できない。`step.agent` を null check し忘れた箇所で runtime error になる
  - 後続の CLI-resident step（PR 作成 step など）でも同じ null check が散在する
- **Why not**: 既知の anti-pattern を踏むため

### 案 (iii): executor 分岐 — Step interface はそのまま、StepExecutor が step 名で hardcode 分岐

- **Pros**: Step interface の変更不要
- **Cons**:
  - PR #31 で達成した「executor は step 名を知らない」原則を破る
  - verification step を追加する際に `StepExecutor` も同時に編集する必要が出る。Step 追加の編集箇所が「Step 配列 + executor」に増える
  - 後続 CLI-resident step を追加するたびに executor が成長する（O(N) の hardcode 分岐）
  - module-analysis.md 4.3 の「step 名 hardcode 分岐がないことを grep で検証する CI test」と矛盾する
- **Why not**: PR #31 の達成を逆行させるため

### 案 (ii) の選択根拠（採択）

- **明示的 discriminator** で型システムが agent-less step の lifecycle 経路を強制できる（compile-time で `step.kind === "cli"` 経路の正当性が保証される）
- `step.kind` での分岐は **構造的分岐**（型 variant による分岐）であり、`step.name === "verification"` のような **identity による分岐** とは性質が異なる。PR #31 の原則を破らない
- 後続の CLI-resident step（PR 作成 step、cleanup hook 等）も同じ discriminator pattern で追加できる
- `AgentRegistry.fromSteps(steps)` の filter（`steps.filter((s): s is AgentStep => s.kind === "agent")`）が型安全に書ける

## 結果

### Positive

- Step variant が型レベルで分離され、agent-less step の lifecycle 経路が compile-time で保証される
- `AgentRegistry.fromSteps` が `kind === "agent"` filter で agent-less step を skip できる（型安全）
- 後続 CLI-resident step（PR 作成、cleanup hook 等）が同じ pattern で追加可能
- module-analysis.md 4.2 の cohesion / SRP 改善が型システムで強制される
- 既存 `runStepInternal` の `step.toolHandlers && step.toolHandlers.size > 0` による暗黙分岐（`executor.ts:80-85`）も将来 `kind: "propose" | "polling" | "cli"` のような明示分岐へ発展できる素地になる

### Negative

- 既存 3 Step（propose / spec-review / spec-fixer）に `kind: "agent"` を追加する mechanical 変更が必要。1 PR で全 Step を migrate する
- `Step` が discriminated union になることで、Step を扱う関数は variant の網羅性を意識する必要が出る。TypeScript の exhaustive switch で型レベル検証する

### Risks

- **risk**: Step を扱う既存コードが variant を意識せず `step.agent` 等の AgentStep field に直接アクセスする箇所が残る
  - **mitigation**: 全アクセス箇所を `step.kind === "agent"` で type narrowing する。learned-pattern 「migration の完了判定は production 経路の grep」で旧形が残らないことを保証
- **risk**: discriminator field を Step が持つことで「Step は variant を自己申告する」設計になり、将来 variant が増えると Step 側の責務が肥大化する可能性
  - **mitigation**: variant は実行戦略の本質的な分類（agent session / CLI 直接実行 / hybrid 等）に限定し、機能単位の細分化には使わない

### Known Design Debt

- `getTimeoutMs` 内の `stepName === "spec-review"` / `"spec-fixer"` 分岐（`src/core/step/executor.ts:636-642`）は PR #31 後も残存する軽微な原則違反。verification step 追加時に同形の分岐を増やさず、本 ADR の `kind` discriminator を将来同箇所にも適用すべき

## 関連 ADR

- **ADR-20260429-step-and-agent-class-architecture** — D1〜D10 で Step interface / StepExecutor / Pipeline state machine の土台を定義。本 ADR はその D1（Step interface）に variant 概念を追加する形
- **ADR-20260429-step-abstraction-implementation** — Step interface (plain TS) の実装決定。本 ADR の discriminator はこの実装の延長線上にある
- **ADR-20260429-module-architecture-style** — `core/verification/` の配置方針

## 参照

- `openspec/changes/implementer-verify-buildfix/design.md` D1 — 本 ADR の根拠
- `openspec/changes/implementer-verify-buildfix/module-analysis.md` 4.2 / 4.3 — Step 型分離の cohesion 評価と PR #31 原則保持の検証
- `openspec-workflow/requests/active/implementer-verify-buildfix/request.md` — 要件と設計分岐点の宣言
- learned-pattern「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」
- learned-pattern「migration の完了判定は production 経路の grep」
