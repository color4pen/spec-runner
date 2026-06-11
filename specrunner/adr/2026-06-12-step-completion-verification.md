# Step 完了時の出力契約機械検証：3 層構造（検出 / 修復 / 停止）とポリシー分岐

**Date**: 2026-06-12
**Status**: accepted

## Context

`2026-06-04-step-io-contracts` ADR は step の I/O 宣言（`reads()` / `writes()`）と入力側事前検証（`RuntimeStrategy.validateStepInputs`）を確立した。同 ADR の Known Debt として「宣言された `writes` の事後検証（出力が宣言通り書かれたかの照合）は対象外」と明示的に defer されていた。

出力側の検証不在は 2 形態の実害として観測された。(1) design agent が worktree 外の絶対パスに成果物を書き、CLI が空テンプレートを commit し、12 分後に spec-review が「artifacts が空」で escalation した（#598）。(2) implementer のタスク完了は 3 step 後の conformance（LLM judge）が初めて検査する構造で、チェック漏れの発見が全工程 1 周分遅れる。

local runtime では agent 実行前に scaffold テンプレートが配置済みであるため（`step-output-template-injection` ADR）、agent が overwrite し損ねても「空 scaffold が worktree に実在する」。したがって素朴な存在検証（`fs.access`）では #598 を検出できない。

## Decision

### D1: 3 層構造（検出 / 修復 / 停止）の分離と配置

出力検証を 3 層に分離し、各層の責務と配置を固定する。

| 層 | 責務 | 配置 | コスト |
|----|------|------|--------|
| 検出 | 契約違反を観測可能な事実から判定 | `RuntimeStrategy.validateStepOutputs`（決定論・no-throw） | ゼロトークン |
| 修復 | follow-up 契約の違反を同一 session で直す | agent-runner の follow-up ループ（`resume`） | agent 1 turn |
| 停止 | 最終的に満たされない契約で halt | executor の gate（`STEP_OUTPUT_MISSING`、commit 前） | — |

executor は `runner.run()` 成功後・`finalizeStepArtifacts`（commit）前に検出 seam を呼び、契約クラスごとの応答ポリシーを適用する。停止は `validateRequiredInputs` と同一の失敗エンベロープ（`recordFailedStepResult` + `store.fail` + `attachStateAndRethrow`）で記録する。

**Rationale**: 検出に LLM を使うとゼロトークンの不変条件が崩れる。修復を executor で完結させると warm な session を失い高コストになる。検出（決定論）/ 修復（warm session）/ 停止（人間へ escalation）は要求コストが異なるため、それぞれ最も安い層に置く。

### D2: 出力契約を 2 クラスでモデル化し、クラスごとに既定ポリシーを固定する

```ts
type OutputContractKind = "produced" | "tasks-complete";
type OutputPolicy        = "halt" | "follow-up";

interface OutputContract {
  kind:      OutputContractKind;
  path:      string;        // worktree-relative
  policy:    OutputPolicy;
  scaffold?: string;        // produced: 配置済み scaffold 内容（byte 一致比較用）
}
interface OutputViolation {
  kind:   OutputContractKind;
  path:   string;
  policy: OutputPolicy;
  detail: string[];         // tasks-complete: 未完了タスク名。produced: 空配列
}
interface OutputCheckResult { violations: OutputViolation[]; }
```

- **produced**（既定 policy = halt）: `writes()` の file エントリから executor が自動導出。`scaffold` は `getOutputTemplates` 由来。
- **tasks-complete**（既定 policy = follow-up）: step が明示宣言。implementer のみが `tasks.md` を対象に宣言する。

**Rationale**: セッション内で修復可能なもの（取りこぼしタスク）は follow-up、続行が後段を汚すもの（実体なき commit）は halt と、契約の性質が応答を決める。produced を `writes()` から自動導出することで per-step の追加宣言を tasks-complete に限定し、新規追記ゼロで #598 対象 step を覆える。

### D3: produced 契約の検出は「scaffold と byte 一致」で実体産出を判定する

produced 契約の violation 判定基準:

- file が**欠落**している、または
- 内容が**空**（trim 後 0 長）、または
- 内容が**配置済み scaffold と byte 一致**（agent が overwrite していない）。

local は scaffold テンプレートを agent 実行前に配置する（`step-output-template-injection` ADR）ため、素朴な存在検証は空テンプレートを正と誤判定する。scaffold との byte 一致は「agent が産出しなかった」を決定論で捉える唯一の観測可能信号（commit 前は git diff が使えない）。実 work は scaffold と必ず相違するため正常経路は通過する。

managed は scaffold を配置しないため欠落 / 空で捉える（scaffold 一致比較はオプション）。

### D4: `RuntimeStrategy.validateStepOutputs` seam（`validateStepInputs` と対称・no-throw）

```ts
validateStepOutputs(
  contracts: OutputContract[],
  cwd:       string,
  branch:    string | null,
): Promise<OutputCheckResult>;   // throw しない。violation を返す
```

`validateStepInputs` と同じ seam に置くことで local / managed の対称（runtime 差は seam 内に閉じる）を保つ。本 seam は **no-throw で構造化結果を返す**: halt / follow-up ポリシー分岐が必要なため、停止判断は executor に委ねる（`validateStepInputs` が throw するのと異なる設計）。

port DTO（`OutputContract` / `OutputViolation` / `OutputCheckResult`）は `src/core/port/` 配下に置き、adapter → domain の back-edge を避ける。

### D5: 修復は agent-runner の同一セッション follow-up ループ（`report_result` retry と同型）

`AgentRunPolicy` に `outputVerification` を追加し、executor が closure として渡す:

```ts
interface OutputVerificationPolicy {
  detect:       () => Promise<OutputCheckResult>;
  maxAttempts:  number;
  buildPrompt:  (violations: OutputViolation[], attempt: number) => string;
}
```

adapter は work turn + `report_result` retry + `postWorkPrompts` の**後段**に修復ループを回す。`detect` は executor が `runtimeStrategy.validateStepOutputs` を束縛した closure であり、adapter は domain を知らない。local は `queryFn({ resume: sessionId })`、managed は `executeFollowUpTurn` で同一 session を継続する。

**Rationale**: `report_result` 未呼び出し時の retry ループと同型の先例が agent-runner に存在する。warm な session でゼロ再 resume の修復ができ、`followUpAttempts` 計上も既存機構に乗る。executor で完結させると AgentRunner port 拡張と query option 再構築の重複を招く。

### D6: 検出純関数を domain モジュール（output-verify.ts）に集約する

判定ロジックの純粋部分を `src/core/step/output-verify.ts` に集約する:

- `parseIncompleteTaskLabels(tasksMd: string): string[]` — `- [ ]` 行のラベルを抽出
- `buildOutputFollowUpPrompt(violations: OutputViolation[]): string` — 検証結果から条件付き prompt を組む
- `producedContractsFromWrites(writes, scaffolds): OutputContract[]` — `writes()` から produced 契約を導出
- `partitionByPolicy(result): { followUp: OutputViolation[]; halt: OutputViolation[] }` — policy で分割

判定（純関数）を domain に、I/O を seam に置く分担は `verifyFindingRefs` / `judge-verdict` の先例と同方向。

## Alternatives Considered

### Alternative 1: 修復を executor 駆動にし、agent-runner に `resume` プリミティブを新設する

executor が修復ループを制御し、AgentRunner port に `resume(prompt: string): Promise<AgentRunResult>` を追加する。

- **Pros**: executor で検出と修復が完結し、ループ制御が一箇所に集まる
- **Cons**: AgentRunner port に新メソッドが必要で、query option 再構築の重複が生じる。`report_result` retry ループ（同型の先例）が agent-runner 内に存在するため、既存パターンから乖離する
- **Why not**: agent-runner に同型の先例があり、その後段に積む方が surface が小さく warm session の活用と整合する（D5）

### Alternative 2: produced 契約の検出に存在確認のみ使う

`fs.access` で file の存在を確認し、存在すれば通過とする。

- **Pros**: 実装が最小
- **Cons**: local は agent 実行前に scaffold を配置するため、存在検証は空テンプレートを正と誤判定し #598 を素通りさせる
- **Why not**: D3 の scaffold byte 一致比較が「agent が産出しなかった」を捉える唯一の決定論的信号（D3）

### Alternative 3: HEAD との diff で実体を判定する

`git diff HEAD -- <path>` で変更があれば実体産出と判断する。

- **Pros**: scaffold との明示比較が不要
- **Cons**: 初回 design は `design.md` が HEAD に存在せず、空 scaffold でも「HEAD と相違」になり捉えられない
- **Why not**: scaffold 一致比較が正しい信号。HEAD diff は初回 step で機能しない（D3）

### Alternative 4: managed の `validateStepOutputs` を no-op にする

managed は git state アクセスが必要なため、no-op で安全側に倒す。

- **Pros**: 実装が最小で managed の fetch を回避できる
- **Cons**: 受け入れ基準「両 runtime で検証が機能」に反する。managed は agent push 済みの git state に対して検証できる
- **Why not**: `validateStepInputs` と同じ seam に置き、両 runtime で symmetric に検証する（D4）

### Alternative 5: 検出を修復ループに内包し、executor の gate を排除する

adapter の修復ループが全契約（produced 含む）を担い、executor は gate を持たない。

- **Pros**: 冗長な二重検出（D6/gate と修復ループ）が消える
- **Cons**: 修復未実装の adapter（codex 等）で gate が機能せず、robustness を失う。produced（follow-up なし）契約の検証も adapter 依存になる
- **Why not**: gate を executor 直呼びにすることで adapter の実装有無に関わらず halt を保証する防御層を確保する（D1）

## Consequences

### Positive

- #598（空テンプレート commit）が scaffold byte 一致比較により決定論的に、かつゼロトークンで commit 前に検出される
- implementer の取りこぼしタスクが 3 step 後の conformance を待たず、同一セッション follow-up で修復される
- 出力側検証が入力側 `validateStepInputs` と対称に `RuntimeStrategy` seam に置かれ、両 runtime の一貫性が保たれる
- `step-io-contracts` ADR の Known Debt（`writes` 事後検証の defer）が解消される

### Negative

- 検出が D5（修復ループ）と gate（executor 直呼び）の 2 箇所で走る冗長が生じる（意図的な防御層分担として受容）
- managed の per-step `git fetch` / `getRawFile` により出力契約を持つ step のネットワーク I/O が増える（`validateStepInputs` と同水準）
- `AgentRunPolicy` に `outputVerification` フィールドが追加され、adapter 実装に修復ループが必要になる（未実装 adapter は gate halt に安全縮退する）

### Known Debt / Deferred

- `verify: false` opt-out（条件付き write を produced 契約から除外）の全 step 監査は実装タスクとして対応済みだが、将来の新規 step 追加時の確認プロセスは未規定
- follow-up 予算（`maxAttempts`）の設定値は定数（config 外出しは Non-Goal）

## References

- Request: `specrunner/changes/step-completion-verification/request.md`
- Design: `specrunner/changes/step-completion-verification/design.md`
- Spec: `specrunner/changes/step-completion-verification/spec.md`
- Related: `specrunner/adr/2026-06-04-step-io-contracts.md`（入力側 validateStepInputs と I/O 宣言の先行確立）
- Related: `specrunner/adr/2026-05-27-step-output-template-injection.md`（scaffold 配置パターン。D3 の前提）
- Related: `specrunner/adr/2026-05-22-intra-step-follow-up-prompt.md`（follow-up 機構の先行確立）
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（AgentRunner port 設計）
- Implementation: `src/core/port/output-contract.ts`・`src/core/port/runtime-strategy.ts`・`src/core/step/output-verify.ts`・`src/core/step/executor.ts`・`src/core/runtime/local.ts`・`src/core/runtime/managed.ts`・`src/adapter/claude-code/agent-runner.ts`・`src/adapter/managed-agent/agent-runner.ts`
