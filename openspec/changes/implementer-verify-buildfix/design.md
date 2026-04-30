# Design — implementer / verification / build-fixer step 追加

## Context

PR #26（D1-D9）→ PR #28（D4-D6）→ PR #31（executor-cleanup）→ PR #34（port-tidying）の累積で、SpecRunner の Step / Pipeline / Agent / port 抽象は完全に整った。`Step` interface は `agent: AgentDefinition` を必須とし、`StepExecutor` が agent session の lifecycle（create → poll → fetch → parse → emit）を一手に管理している。

現在の pipeline は spec 層 3 step（propose / spec-review / spec-fixer）で完結し、`spec-review --approved→ end` で停止する。本 request はこの後を継ぐ実装層 3 step（implementer / verification / build-fixer）を追加する。

constraints:

- **Managed Agents SDK**: `SessionCreateParams` は `system` 上書き不可、Custom Tool は Agent レベル定義 → role-specific 出し分け不可。implementer / build-fixer をそれぞれ独立 Agent として登録（spec-fixer と同じ規律）
- **bun runtime 規律**: `bun:*` / `Bun.*` の import を禁止する project memory 規律。verification CLI runner は `node:child_process` を使用する
- **既存挙動の保持**: spec 層の挙動は不変、既存テスト regression 0 件
- **後続 request の橋渡し**: code-review / code-fixer / PR 作成は別 request に分離。本 request では `verification --passed→ end` で停止し、transition table の構造は後続書き換え可能に保つ

## Goals / Non-Goals

**Goals:**

- spec 層と対称な実装層 self-correct loop（implementer → verification ↔ build-fixer）を Pipeline state machine 上で動かす
- verification を **agent を呼ばない CLI-resident step** として `Step` interface 内で表現する（明示的 discriminator で宣言、データ存在の暗黙推論ではない）
- implementer / build-fixer agent を `specrunner init` で Anthropic に作成し、AgentRegistry が agent-less Step を skip する
- `verification ↔ build-fixer` cycle に max 3 iterations の loop guard を適用
- 5 phase（build / typecheck / test / lint / security）を fail-fast で順次実行、結果を `verification-result.md` に出力

**Non-Goals:**

- code-review step / code-fixer step（後続 request）
- PR 作成 step（後続 request）
- 学習層 EventBus subscriber 実装、cost ledger（別系統）
- E2E 実機検証（self-hosting 完成までまとめて保留）
- verification の phase 並列実行（fail-fast 順次で十分）
- implementer による branch 切り替え（branch は propose で register 済み、同 branch に commit + push）

## Decisions

### D1: verification の Step interface 適合方法 — `kind: "agent" | "cli"` discriminator を Step に追加

**選択肢**:

- (i) **null agent**: `Step.agent` を nullable にし、`agent === null` で agent-less と判定
- (ii) **interface 拡張**: `Step` interface に `kind` discriminator field を追加し、union type で `AgentStep | CliStep` を表現
- (iii) **executor 分岐**: Step interface はそのまま、`StepExecutor` が step 名で hardcode 分岐

**選択: (ii) interface 拡張 — `kind: "agent" | "cli"` discriminator**

**根拠**:

- learned-pattern 「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」に準拠。null agent は (i) の anti-pattern
- (iii) は `StepExecutor` が step 名を知ることになり、PR #31 で達成した executor の step 非依存性を破る
- (ii) は型システムが agent-less step の lifecycle 経路を強制でき、新たな CLI-resident step を追加する際も同じ pattern が再利用可能（後続の PR 作成 step 等）

**実装形態**:

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
  run(state: JobState, deps: StepDeps): Promise<void>; // CLI が直接実行
};
```

`StepExecutor.execute(step, state)` は `step.kind` で分岐し、`"agent"` は既存の session lifecycle、`"cli"` は `step.run()` を呼んで `resultFilePath` を読みに行く。`AgentRegistry.fromSteps(steps)` は `step.kind === "agent"` の Step のみを集約する。

### D2: verification CLI runner の shell 実行方式 — `node:child_process.spawn`

**選択肢**: bash spawn / `Bun.spawn` / `node:child_process`

**選択: `node:child_process.spawn`**

**根拠**: project memory 「`bun:*` / `Bun.*` の import を禁止」規律。Bun runtime 上で動かすが API は node 互換層を使う。`spawn` は stream 単位の stdout/stderr 取得が容易で、phase ごとの出力を `verification-result.md` に追記しやすい。

**実装形態**: `src/core/verification/runner.ts` の `runVerification(slug: string): Promise<VerificationResult>` が、`["build", "typecheck", "test", "lint", "security"]` を順次 spawn し、各 phase の `{ phase, status: "passed" | "failed" | "skipped", stdout, stderr, durationMs }` を集約。最初の failed で残り phase を skipped とする（fail-fast）。全 phase は `bun run <script>` 形式（package.json scripts 経由）で統一呼び出しし、`bun test` 固定は使用しない（target project の test runner を尊重するため）。

### D3: verification の 5 phase 順序 — fail-fast 順次実行

**選択肢**: fail-fast 順次 / 並列実行

**選択: 順次 (build → typecheck → test → lint → security)**

**根拠**:

- build が失敗すれば typecheck も成立しない（依存関係）
- 並列にしても CI 時間短縮効果は CLI-resident step では薄く（ローカル開発機の resource 競合のほうが大きい）
- fail-fast で「最初の壊れた layer」を build-fixer に渡すほうが修正対象が明確（layered fix）
- security は静的解析であり最後に回しても問題ない

**実装形態**: 配列順 `["build", "typecheck", "test", "lint", "security"]` を `for ... of` で順次 spawn。最初の non-zero exit で break し、残りは `status: "skipped"` で記録。verdict は `passed`（全 phase passed）または `failed`（1 つ以上 failed）。

### D4: `verification-result.md` の format

**選択**: `spec-review-result.md` と類似の `## Verdict` + `## Phase Results` 構造を踏襲

```markdown
# Verification Result — <slug> — iter <N>

## Verdict: passed | failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 12.3s | 0 |
| 2 | typecheck | failed | 4.1s | 2 |
| 3 | test | skipped | — | — |
...

## Phase: build

```
<stdout/stderr>
```

## Phase: typecheck

```
<stdout/stderr>
```
```

`parseResult` は `## Verdict: (passed|failed)` を regex 抽出（spec-review と同じパターン）。

### D5: build-fixer / implementer は独立 Agent — system prompt 衝突回避

**根拠**: PR #22 の「同一 Agent を異なる role で使うと system prompt と user message が矛盾する」failure pattern を構造的に回避（spec-review が propose Agent を流用していた anti-pattern を D4-D6 で解消したのと同じ規律）。

**実装形態**:

- `src/prompts/implementer-system.ts` → `IMPLEMENTER_SYSTEM_PROMPT`（「spec / tasks.md を読み実装、git commit + push まで実行、テストも追加」）
- `src/prompts/build-fixer-system.ts` → `BUILD_FIXER_SYSTEM_PROMPT`（「mechanical な build/test/lint/typecheck エラー修正のみ。仕様変更や設計判断は行わない。verification-result.md に記載された failed phase の error log を読み修正、git commit + push」）

両者とも `agent_toolset_20260401` + `capabilities.gitWrite = true`。custom tool は不要（branch register は propose 済み）。

### D6: implementer の git push — 既存 branch に commit + push

**根拠**: branch は propose step で `register_branch` 経由で register 済み（`state.branch`）。implementer は同 branch に commit + push を行うのみ。新 branch 作成は不要。

**実装形態**: implementer system prompt に `state.branch` を埋め込み、「checkout 済みの該当 branch で作業し commit + push」を明示。CLI 側からの push 検証は spec-fixer と同じく行わない（次 step の verification が build-fail で間接的に検知）。

### D7: loop guard — `verification ↔ build-fixer` に max 3 iterations

**選択**: 既存 `Pipeline.runInternal` の loopName / maxIterations を拡張し、`verification ↔ build-fixer` cycle にも適用

**根拠**: spec-review ↔ spec-fixer と同じ `SPEC_REVIEW_RETRIES_EXHAUSTED` パターンを踏襲。`VERIFICATION_RETRIES_EXHAUSTED` 等の error code を新設し、`state.error` に記録。max 3 は spec 層と同じ default。

**実装形態**: `Pipeline.runInternal` の loop 検出ロジックは「同じ step に N 回入った」を検出する汎用形にし、loop name は transition table から推論（`verification` ⇔ `build-fixer` 双方向 transition の存在で cycle を識別）。具体的には、現在の `loopName === "spec-review"` hardcode を transition table から導出する形にリファクタする。`maxIterations` は既存設定を共有（`config.pipeline.maxRetries`）。

### D8: AgentRegistry — agent-less Step を skip

**根拠**: 既存 spec 「Step を追加する際の編集箇所は Step 配列のみ」を維持。agent-less Step は registry 集約対象外として skip するロジックを `AgentRegistry.fromSteps` に追加。型レベルでは `step.kind === "agent"` の filter で実現（D1 の discriminator を活用）。

**実装形態**:

```ts
static fromSteps(steps: Step[]): AgentRegistry {
  const agentSteps = steps.filter((s): s is AgentStep => s.kind === "agent");
  // 既存ロジックで agentSteps から AgentDefinition を集約
}
```

config schema の `agents: Record<StepName, AgentRecord>` も agent-less role を持たない（StepName union のうち agent step のみが agent record を持つ）。型を厳密化するなら `AgentStepName = Exclude<StepName, "verification">` を導入する。

### D9: Verdict / StepName 型拡張

**選択**: `Verdict` union に `"passed" | "failed" | "success" | "error"` を追加、`StepName` union に `"implementer" | "verification" | "build-fixer"` を追加。

- `passed` / `failed` — verification 用
- `success` / `error` — implementer / build-fixer の「verdict ファイルを生成しないが完了した」状態用（spec-fixer の `null` verdict とは別、loop transition で必要なため明示）

`spec-fixer` の verdict は `null` のまま保持（既存挙動維持）。implementer / build-fixer は session 終了 = success、例外 = error として `StepExecutor` 内で導出する（agent step の lifecycle 内で）。

### D10: parseResult の `null` verdict 整合性

`spec-fixer` は `parseResult` が `{ verdict: null, findingsPath: null }` を返し、`StepExecutor` 側で session 完了をもって success と扱う設計（既存）。implementer / build-fixer も同じパターンを踏襲し、`resultFilePath` は `null` を返す。`Step` interface の `resultFilePath` 戻り値型は既に `string | null` のため変更不要。

### D11: module-architect — 3 step 共通 helper の抽出可能性

**3 step 間で共通化候補**:

- implementer / build-fixer は両方 git push を伴う agent step → buildMessage 内の「git commit + push 指示」テンプレを `src/prompts/git-push-instruction.ts` に切り出す
- verification phase 名と script 名の対応 → `src/core/verification/phases.ts` に config 化（全 phase を `bun run <script>` で統一呼び出し。`bun test` 固定は使用しない）

module-architect の analysis を `openspec/changes/implementer-verify-buildfix/module-analysis.md` に出力し、tasks.md 冒頭タスクとして「helper 抽出」を入れる。

## Risks / Trade-offs

- **[Risk] verification CLI runner が project の package.json scripts に強依存** → Mitigation: phase 名と script 名を `phases.ts` で config 化し、欠損 script は `status: "skipped"` で記録（fail にしない）。実 project の package.json に `build` / `typecheck` / `test` / `lint` / `security` script の存在確認は受け入れ基準のチェックに含める
- **[Risk] D1 の `kind` discriminator 導入で既存 Step 全件に `kind: "agent"` 追加が必要** → Mitigation: 1 PR で全 Step を migrate（propose / spec-review / spec-fixer に `kind: "agent"` を追加）。learned-pattern 「migration の完了判定は production 経路の grep」で旧形が残らないことを保証
- **[Risk] build-fixer の retry が無限ループ化** → Mitigation: max 3 iterations の loop guard。`VERIFICATION_RETRIES_EXHAUSTED` で escalate
- **[Risk] implementer が tasks.md の途中で終了** → Mitigation: 本 request スコープでは検知しない。次 step の verification が build-fail で間接検知（spec-fixer の push 失敗と同じ委任方式）。tasks.md の完了判定は後続 request で導入検討
- **[Risk] verification phase が長時間化（test phase）で session timeout 超過** → Mitigation: verification は agent を呼ばないため SDK timeout の対象外。`runVerification` 自体に独立 timeout を設けるかは Open Question
- **[Risk] `Verdict` union 拡張で既存 transition table の網羅性が崩れる** → Mitigation: TypeScript の exhaustive switch で型レベル検証。テストで全 `Verdict` 値が transition table のどこかにマッチすることを assert
- **[Risk] D8 の `AgentStepName` 型導入で既存 config schema を破壊変更** → Mitigation: 型は厳密化するが runtime データ形式（`agents: Record<string, AgentRecord>`）は不変。既存 config ファイルは migrate 不要

## Migration Plan

1. `src/core/step/types.ts` に `kind` discriminator を追加し、既存 3 Step に `kind: "agent"` を追加（型エラーを潰すだけの mechanical 変更）
2. `src/state/schema.ts` の `Verdict` / `StepName` union を拡張（exhaustive switch エラーを各所で潰す）
3. `src/prompts/{implementer,build-fixer}-system.ts` を新設
4. `src/core/verification/{runner,phases}.ts` を新設、unit test を追加
5. `src/core/step/{implementer,verification,build-fixer}.ts` を新設、unit test で Step interface 適合性を検証
6. `src/core/agents/registry.ts` の `fromSteps` を `kind === "agent"` filter に変更
7. `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を拡張、loop guard ロジックを汎用化
8. `src/cli/init.ts` の `AgentRegistry.fromSteps([...])` 引数に新 Step を追加
9. `src/cli/run.ts` の `Pipeline` constructor に渡す `steps` Map に新 3 step を追加
10. `tests/unit/cli/init.test.ts` の AgentRegistry 期待値を更新（implementer / build-fixer の 2 Agent 追加）
11. integration test: spec-review approved → implementer → verification → end の遷移を mock で検証
12. ADR を `openspec-workflow/adr/` に出力（D1 と D5 を ADR 化対象として明示）

**Rollback**: feature flag は不要（Pipeline transition table の置換のみで切り替わる）。problem 発覚時は STANDARD_TRANSITIONS の `spec-review --approved→ implementer` を `→ end` に戻すだけで spec 層完結 pipeline に縮退できる。

## Open Questions

1. **verification 自体の timeout**: agent session ではないため SDK timeout が効かない。`runVerification` に独立 timeout（例: 30 分）を設けるか、phase 単位で設けるか。本 request では phase 単位で「実行ログを stream し続ければ実質 timeout なし」とし、明示的 timeout は後続 request に委ねる
2. **module-architect の 3 step 共通 helper 抽出粒度**: tasks.md の冒頭タスクで実施するが、抽出しすぎると Step 単位の独立性が壊れる。analysis 結果を見て判断
3. **build-fixer が「修正不能」と判断した場合の deferred メモ運用**: spec-fixer は `<!-- spec-fixer-deferred: ... -->` で記録するが、build-fixer は verification の verdict ファイルが「mechanical 修正可能性」を判定する base になる。本 request では deferred メモは導入せず、retry 上限到達 = escalation で吸収する
4. **VerificationStep の `kind: "cli"` の `run()` メソッドが `EventBus` を直接触るか、StepExecutor 経由か**: lifecycle event 発火の責務を `StepExecutor` に集約するため、`run()` は単に「実行 + ファイル書き出し」のみ責務とし、`step:start` / `step:complete` 発火は `StepExecutor` 側に残す
