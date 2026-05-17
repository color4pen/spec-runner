# AgentStepName を Exclude 黒リストからホワイトリスト列挙方式に反転し型 system で gate する

## Meta

- **type**: refactoring
- **slug**: agent-step-name-whitelist
- **base-branch**: main
- **date**: 2026-05-17
- **author**: color4pen
- **issue**: #277

## 背景

`src/state/schema.ts:18-22` の `AgentStepName` 定義が黒リスト方式:

```typescript
/**
 * AgentStepName excludes CLI-resident steps (verification, pr-create, delta-spec-validation) from StepName.
 * Used to constrain AgentRegistry and config schema to agent-only roles.
 */
export type AgentStepName = Exclude<StepName,
  typeof STEP_NAMES.VERIFICATION
  | typeof STEP_NAMES.PR_CREATE
  | typeof STEP_NAMES.DELTA_SPEC_VALIDATION>;
```

新規 deterministic step (= CliStep) を追加するたびに Exclude リストへの追加忘れで型ホールが発生する。

### 観測した失敗

- PR #274 (`delta-spec-path-validation-hook`): 新規 deterministic step `delta-spec-validation` 追加時、Exclude リスト追加を忘れた → `config.agents.delta-spec-validation` を書けてしまう型ホール
- code-review iter 1 で指摘 → code-fixer iter 1 で追加されたが、これは「規律で防いだ」だけで構造としては脆い

過去にも `openspec-workflow/learned-patterns.md:818` 等でプロセス側補強の試みあり (= ドキュメント / レビュー規律) だが、構造で防げていない。

### 現状の step kind 構造分析 (module-architect 評価結果)

step.kind は既に discriminated union として 1st class 化済み:

- `src/core/step/types.ts:74-214` で `AgentStep.kind: "agent"` / `CliStep.kind: "cli"`
- `src/core/step/executor.ts:81` で `if (step.kind === "cli")` 分岐
- `src/core/agent/registry.ts:27` で `steps.filter((s): s is AgentStep => s.kind === "agent")`

つまり**ランタイム / 実装層では AI step と deterministic step は既に別扱い**。**唯一の構造的欠落は型レベル名前集合の黒リスト方式** (`schema.ts:22`)。

関連 issue: #277

## 目的

`AgentStepName` を黒リスト (Exclude) からホワイトリスト (列挙) 方式に反転し、新 step 追加時に「AI / CLI どちらか」を型 system が強制する構造にする。

派生効果として `config.agents` のキー型を `AgentStepName` に締めることで、deterministic step に AI 設定 (model / maxTurns 等) を書けない型 gate も獲得する (= 過去の人間規律補強の置き換え)。

## 設計判断

1. **採用案: ホワイトリスト列挙 (module-architect 評価で 6 軸全て優位)**
   - `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` を別配列で列挙
   - `AgentStepName = typeof AGENT_STEP_NAMES[number]` で派生
   - 新 step 追加時に「どちらの配列に入れるか」を型 system が強制

2. **不採用案 1: 現状維持 + 1 行追加** — 同じ事故が再発、構造的に防げない

3. **不採用案 2: step kind を config schema 構造分離まで波及** — step.kind は既に 1st class なので追加価値小、移行コスト大 (= ~200-400 行 + migration、user config 破壊的変更)

4. **既存参照の後方互換**:
   - `STEP_NAMES` object 形は維持 (= `STEP_NAMES.DESIGN` 等 30+ 箇所の参照は無傷)
   - 論理関係としては `AGENT_STEP_NAMES` + `CLI_STEP_NAMES` の union が `STEP_NAMES` の value 集合と一致する。ただし TypeScript literal type を維持するため、実装は要件 1 の明示宣言形式 (`STEP_NAMES = { DESIGN: "design", ... } as const`) に従う (= `Object.fromEntries` で合成すると literal type が消失して `{ [x: string]: string }` に劣化するため使用しない)

5. **`config.agents` キー型の締め込み**:
   - 現状: `agents: Record<string, AgentRecord>` (任意 string キー)
   - 改: `agents: Partial<Record<AgentStepName, AgentRecord>>` (= AgentStepName のみキーに許可)
   - これにより `config.agents.delta-spec-validation` が型エラーになる

6. **test の方針**:
   - 「`AGENT_STEP_NAMES` と `CLI_STEP_NAMES` が disjoint」「union が `STEP_NAMES` のキー集合と一致」を型レベル + runtime test で検証
   - 全 AgentStep / CliStep instance の `name` field が対応配列に含まれることも検証 (= 実装と定数の整合)

7. **既存 doctor check の確認**: `doctor` 系で AgentStepName を参照している箇所があれば、新型定義で coverage が崩れないか確認

## 要件

### 1. `step-names.ts` を配列分離方式に再構成

`src/core/step/step-names.ts`:

```typescript
export const AGENT_STEP_NAMES = [
  "design",
  "spec-review",
  "spec-fixer",
  "delta-spec-fixer",
  "test-case-gen",
  "implementer",
  "build-fixer",
  "code-review",
  "code-fixer",
] as const;

export const CLI_STEP_NAMES = [
  "verification",
  "pr-create",
  "delta-spec-validation",
] as const;

// 後方互換: 既存 STEP_NAMES.<KEY> 参照を保つため object 形で再構成
export const STEP_NAMES = {
  DESIGN: "design",
  SPEC_REVIEW: "spec-review",
  // ... 全 entry を明示宣言で残す
} as const;
```

`STEP_NAMES` の object key は **既存と完全一致** させる (= 30+ 箇所の参照変更なし)。

### 2. `schema.ts` の AgentStepName 派生方法を変更

`src/state/schema.ts:18-22`:

```typescript
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, STEP_NAMES } from "../core/step/step-names.js";

export type StepName = typeof STEP_NAMES[keyof typeof STEP_NAMES];
export type AgentStepName = typeof AGENT_STEP_NAMES[number];
export type CliStepName = typeof CLI_STEP_NAMES[number];
```

`Exclude<StepName, ...>` 黒リストを廃止。

### 3. `config/schema.ts` の agents キー型を締める

`src/config/schema.ts:91` 周辺:

```typescript
// Before
agents: Record<string, AgentRecord>;

// After
agents: Partial<Record<AgentStepName, AgentRecord>>;
```

`agents` を直接編集する経路 (= init / managed setup / migrate) も型整合性を確認。

### 4. AgentRegistry / Syncer の整合確認

`src/core/agent/registry.ts:27` の `steps.filter((s): s is AgentStep => s.kind === "agent")` は既に kind 分岐済なので影響なし。

`src/core/agent/syncer.ts:145` 等で `config.agents` を読む箇所が AgentStepName 型に依存していれば型整合性 OK。

### 5. test (4 本)

`tests/unit/core/step/step-names.test.ts` (新規 or 既存追加):

- TC: `AGENT_STEP_NAMES` と `CLI_STEP_NAMES` が **disjoint** (= 重複なし) を runtime + type level で検証
  - runtime: `AGENT_STEP_NAMES.every(n => !CLI_STEP_NAMES.includes(n as any))` が true
  - type: `Extract<AgentStepName, CliStepName>` が `never` であることを assertion type で確認
- TC: 両配列の union が `STEP_NAMES` のキー集合と一致 (= 漏れ / 余りなし)
  - runtime: `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].sort()` が `Object.values(STEP_NAMES).sort()` と一致
- TC: 全 AgentStep instance の `name` が `AGENT_STEP_NAMES` に含まれる
  - registered agent step 一覧を取得 (= `src/core/pipeline/run.ts` の steps map から AgentStep だけ抽出) し、各 `step.name` が `AGENT_STEP_NAMES` に含まれることを assert
- TC: 全 CliStep instance の `name` が `CLI_STEP_NAMES` に含まれる
  - 同様に CliStep だけ抽出して assert

### 6. type-level assertion

`tests/unit/core/step/step-names.test.ts` 内で型エラーで防ぐべきパターンの assertion test:

```typescript
// Should compile: AgentStepName accepts "design"
const _agentOk: AgentStepName = "design";

// Should NOT compile: AgentStepName rejects "delta-spec-validation"
// @ts-expect-error - delta-spec-validation is a CliStep, not allowed in AgentStepName
const _agentBad: AgentStepName = "delta-spec-validation";

// Should NOT compile: config.agents rejects CliStep key
// @ts-expect-error - config.agents key must be AgentStepName
const _configBad: SpecrunnerConfig["agents"] = { "delta-spec-validation": {} };
```

`@ts-expect-error` ディレクティブで型 system が違反を検出することを保証。

### 7. 既存参照のコンパイル整合性

`grep -rn "AgentStepName\b" src/ tests/` で全参照箇所を確認し、新定義 (= ホワイトリスト) で型エラーが出ないことを確認。

加えて `grep -rn "config\.agents" src/ tests/` も実行し、`agents` キー型変更による波及 (= `getAgentId.ts` / `migrate.ts` / `managed.ts` / `AgentSyncer` 等) のコンパイル整合性を確認する。最終的な型エラー有無は受け入れ基準の `bun run typecheck` で一括検証されるが、中間検証として変更スコープを過小評価しないよう grep 二点で網羅する。

エラーが出る場合は個別対処 (= 型 cast / 修正)。

### 8. spec authority への反映

`specrunner/specs/pipeline-orchestrator/spec.md:280-291` 周辺を MODIFIED で更新:

- L281 の旧記述 `export type AgentStepName = Exclude<StepName, "verification" | "pr-create">` を「`AgentStepName` is derived from `AGENT_STEP_NAMES` whitelist, not from `StepName` exclude」(= 要件 2 のホワイトリスト方式) に書き換え
- L286-291 の Scenario「AgentStepName does not include "pr-create"」を再構成:
  - 名前を「AgentStepName accepts only agent-resident steps」等に rename
  - L291 の `propose` を `design` に rename (旧名残存の修正)
  - L291 の agent-resident step 一覧に `delta-spec-fixer` / `test-case-gen` を追加 (現状未掲載)
  - NOT assignable 側に `pr-create` に加え `delta-spec-validation` も含める (#274 で追加された CliStep を反映)
- 新規 Scenario を 2 件追加:
  - 「新 CliStep を追加するとき `AGENT_STEP_NAMES` に追加しないと型エラーになる」
  - 「`config.agents` に CliStep を書こうとすると型エラーになる (= `Partial<Record<AgentStepName, AgentRecord>>` による gate)」

該当 capability の延長で済むため新規 capability は立てない。

## スコープ外

- step kind を config schema 構造分離まで波及 (= `agents:` と `cli-steps:` を別 record にする) — module-architect 評価で投資対効果悪いと判断、別 issue で扱う
- AgentStep / CliStep の class hierarchy 再設計 — 既に discriminated union として 1st class
- 既存 user config の migration — 後方互換維持のため不要
- `STEP_NAMES` 定数の参照置換 (= `STEP_NAMES.DESIGN` → `AGENT_STEP_NAMES[0]` 等) — 後方互換維持

## 受け入れ基準

- [ ] `src/core/step/step-names.ts` に `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` 配列が export される
- [ ] `STEP_NAMES` object 形は維持され、既存 `STEP_NAMES.<KEY>` 参照が無傷で動く
- [ ] `src/state/schema.ts` の `AgentStepName` がホワイトリスト方式 (= `typeof AGENT_STEP_NAMES[number]`) で定義されている
- [ ] `CliStepName` も同様に定義され export されている
- [ ] `src/config/schema.ts` の `agents` キー型が `Partial<Record<AgentStepName, AgentRecord>>` に締められている
- [ ] `config.agents.delta-spec-validation` (or 他 CliStep 名) を書こうとすると型エラーになる (= `@ts-expect-error` test で保証)
- [ ] 新規 test 4 本 (disjoint / union / agent step 整合 / cli step 整合) + type-level assertion test が pass
- [ ] `grep -rn "AgentStepName\b" src/ tests/` の全参照箇所がコンパイル整合
- [ ] 既存 spec authority に新型定義が反映されている (MODIFIED or ADDED)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
