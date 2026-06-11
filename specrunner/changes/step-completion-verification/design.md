# Design: step 完了時に宣言された契約を機械検証し、不足は follow-up で修復させる

## Context

pipeline の各 step は出力契約を宣言するが（`writes()` による出力 path、implementer prompt による `tasks.md` の `[x]` 更新）、完了時にそれを検証する機構がない。宣言は agent への指示にとどまり、履行は自己申告のまま後段へ流れる。

入力側には対称の機構が既にある: `StepExecutor` が `step.reads()` の required 入力を実行前に `RuntimeStrategy.validateStepInputs()` で検証し、欠落は `STEP_INPUT_MISSING` で halt する（`src/core/step/executor.ts` の `validateRequiredInputs`、`src/core/runtime/{local,managed}.ts`）。本変更はこの**出力側の対称**を追加する。

### 関係する実行土台（seam）

- `StepExecutor.runAgentStep`（`src/core/step/executor.ts`）の順序: `validateRequiredInputs` → `captureHeadSha` → `prepareStepArtifacts`（local は scaffold 配置）→ `runner.run()` → `finalizeStepArtifacts`（**local はここで commit + push**）→ `finalizeStep`（verdict / lineage）。出力検証は `runner.run()` 成功後・`finalizeStepArtifacts`（commit）前に差し込む。
- `RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）は runtime 差を吸収する。`validateStepInputs` は local＝worktree fs / managed＝`git cat-file -e origin/<branch>:<path>` で同一宣言 path を検証する。出力検出も同じ seam に置く。
- agent-runner には**同型の follow-up リトライ先例**がある: `report_result` 未呼び出し時に同一 session を `resume`（local: `src/adapter/claude-code/agent-runner.ts` の retry ループ / managed: `src/adapter/managed-agent/agent-runner.ts` の `executeFollowUpTurn`）し、`policy.maxAttempts` まで追撃する。出力修復もこの機構を踏襲する。
- local は agent 実行前に scaffold テンプレートを配置する（`prepareStepArtifacts` → `getOutputTemplates` / `src/templates/step-output-templates.ts`）。design / spec-review / test-case-gen / code-review / conformance は A-group scaffold を持つ。managed の `prepareStepArtifacts` は no-op（scaffold を配置しない）。

### #598 が「存在検証」では捉えられない理由

#598 は「design agent が worktree 外の絶対パスに成果物を書き、CLI が**空テンプレートを commit**、12 分後に spec-review が『artifacts が空』で escalation」した事故である。local では `design.md` 等の scaffold が agent 実行前に配置済みであり、agent が overwrite し損ねても**空 scaffold が worktree に実在する**。したがって素朴な `fs.access`（存在）検証では #598 を検出できない。検出は「実体が産出されたか＝配置済み scaffold と相違するか」で行う必要がある。

## Goals / Non-Goals

**Goals**:

- agent step 完了時（commit 前）に、宣言された出力契約を決定論で検証する出力検証層を追加する。
- produced 契約（`writes()` の file 出力が実体付きで存在）と tasks-complete 契約（`tasks.md` に未完了 `[ ]` なし）の 2 クラスを検証する。
- 応答ポリシーを契約クラスで選ぶ: tasks-complete は follow-up（予算枯渇後は halt）、produced は halt。
- 検出は入力側 `validateStepInputs` と対称の `RuntimeStrategy.validateStepOutputs` seam に置き、local / managed の対称性を保つ。
- follow-up は検証結果から計算される条件付き prompt を同一 session に追撃する（既存 follow-up 予算機構を踏襲）。
- 全契約が満たされる場合、pipeline の挙動・出力・既存テストを不変に保つ。

**Non-Goals**:

- 「`[x]` と記したが実際は未実施」の検出（conformance の責務のまま）。
- 宣言 path 外への書き込み検出（`git status` と `writes()` の突き合わせ）。
- judge step（report tool 契約 + follow-up リトライで既に守られている）および CLI step（出力は CLI が決定論で産出する）への適用。
- 検証ポリシー（`maxAttempts` 等）の config 外出し。本変更は定数とする。

## Decisions

### D1: 3 層構造（検出 / 修復 / 停止）とその配置

出力検証を次の 3 層に分離する。各層の責務と配置を固定する:

| 層 | 責務 | 配置 | コスト |
|----|------|------|--------|
| 検出 | 契約違反を観測可能な事実から判定 | `RuntimeStrategy.validateStepOutputs`（決定論・no-throw） | ゼロトークン |
| 修復 | follow-up 契約の違反を同一 session で直す | agent-runner の follow-up ループ（`resume`） | agent 1 turn（最小） |
| 停止 | 最終的に満たされない契約で halt | executor の gate（`STEP_OUTPUT_MISSING`、commit 前） | — |

executor は `runner.run()` 成功後・`finalizeStepArtifacts` 前に検出 seam を呼び、契約クラスごとの応答ポリシーを適用する。修復は agent-runner が同一 session で行い、停止は executor が `validateRequiredInputs` と同一の失敗エンベロープ（`recordFailedStepResult` + `store.fail` + `attachStateAndRethrow`）で記録する。

**Rationale**: 「why 3 層、why not 単層」— 検出に LLM を使うとゼロトークンの不変条件が崩れる。修復を executor で完結させると warm な session を失い高コストになる。検出（決定論）/ 修復（warm session）/ 停止（人間へ escalation）は要求コストが異なるため、それぞれ最も安い層に置く。

**Alternatives considered**:
- *修復を executor 駆動にし、agent-runner に `resume` プリミティブを新設*: AgentRunner port にメソッド追加が必要で、query option 再構築の重複が生じる。agent-runner に既存の `report_result` retry ループ（同型の先例）があり、その後段に積む方が surface が小さい。
- *検出も修復も agent-runner に閉じる*: 検出が RuntimeStrategy seam から外れ、入力側との対称性（architect 判断）を失う。

### D2: 契約の 2 クラスと既定ポリシー

出力契約を 2 クラスでモデル化する（port DTO、domain 非依存）:

```ts
type OutputContractKind = "produced" | "tasks-complete";
type OutputPolicy = "halt" | "follow-up";

interface OutputContract {
  kind: OutputContractKind;
  path: string;              // worktree-relative
  policy: OutputPolicy;
  scaffold?: string;         // produced: 配置済み scaffold 内容（同一性比較用、任意）
}
interface OutputViolation {
  kind: OutputContractKind;
  path: string;
  policy: OutputPolicy;
  detail: string[];          // tasks-complete: 未完了タスク名。produced: 空配列
}
interface OutputCheckResult { violations: OutputViolation[]; }
```

- **produced**（既定 policy = halt）: `writes()` の file エントリ（`artifact !== "gitState"`、`verify !== false`）から executor が自動導出する。`scaffold` は `getOutputTemplates` 由来（local のみ）。
- **tasks-complete**（既定 policy = follow-up）: step が明示宣言する。implementer のみが `tasks.md` を対象に宣言する。

**Rationale**: 「why 契約クラスで policy を選ぶ」— セッション内で修復可能なもの（取りこぼしタスク）は follow-up、続行が後段を汚すもの（実体なき commit）は halt、と契約の性質が応答を決める（architect 判断）。produced を `writes()` から自動導出することで per-step の追加宣言を tasks-complete に限定し、要件「writes() で宣言された path を検証」を最小コストで満たす。

**Alternatives considered**:
- *全 step が `outputContracts()` を明示実装*: 12 step すべてに追記が要る。`writes()` 由来の自動導出なら #598 対象（design）はゼロ追記で覆える。
- *produced を policy = follow-up にも開く*: 実体なき出力は session 内で直せる保証がなく、空 commit を許す危険。halt 固定が目的に合う。

### D3: produced 契約の検出は「scaffold と相違」で実体を判定する

produced 契約の violation は次のいずれかで判定する（Context の #598 分析より、素朴な存在では不十分）:

- file が**欠落**している、または
- 内容が**空**（trim 後 0 長）、または
- 内容が**配置済み scaffold と byte 一致**（agent が overwrite していない）。

- **LocalRuntime**: `fs.readFile(join(cwd, path))`。欠落 / 空 / `scaffold` 一致を violation とする。`scaffold` は executor が `getOutputTemplates(stepName, slug, state)` から該当 path の内容を引いて契約に載せる。
- **ManagedRuntime**: 存在は `git cat-file -e origin/<branch>:<path>`（`validateStepInputs` と同経路、stdout 非汚染）、内容は `githubClient.getRawFile(owner, repo, branch, path)`。欠落 / 空を violation とする。`scaffold` が与えられれば一致比較も行う（managed は scaffold を配置しないため通常は欠落側で捉える）。

**Rationale**: 「why scaffold 一致、why not 存在のみ」— local は agent 実行前に scaffold を配置するため、存在検証は空テンプレートを正と誤判定し #598 を素通りさせる。scaffold との byte 一致は「agent が産出しなかった」を決定論で捉える唯一の観測可能信号（commit 前は git diff が使えない）。実 work は scaffold と必ず相違するため正常経路は通過する。

**Alternatives considered**:
- *存在のみ*: #598 を検出できない（受け入れ基準「design 完了時に即検出」を満たせない）。
- *HEAD との差分で判定*: 初回 design は `design.md` が HEAD に無く、空 scaffold でも「HEAD と相違」になり捉えられない。scaffold 一致比較が正しい信号。

### D4: tasks-complete の検出と条件付き follow-up prompt（純関数）

検出ロジックの純粋部分を新規 domain モジュール（例: `src/core/step/output-verify.ts`）に集約する:

- `parseIncompleteTaskLabels(tasksMd: string): string[]` — `- [ ]`（未チェック）行のラベルを抽出する純関数。
- `buildOutputFollowUpPrompt(violations: OutputViolation[]): string` — 未完了タスク名 / 欠落 path を列挙した条件付き prompt を組む純関数（静的文ではない）。
- `producedContractsFromWrites(writes, scaffolds): OutputContract[]` — `writes()` から produced 契約を導出する純関数。
- `partitionByPolicy(result): { followUp: OutputViolation[]; halt: OutputViolation[] }` — policy で分割する純関数。

`validateStepOutputs` の tasks-complete 判定は各 runtime が file 内容を取得（local: fs / managed: getRawFile）し、`parseIncompleteTaskLabels` を呼んで violation を組む。

**Rationale**: 判定（純関数）を domain に、I/O を seam に置く（B-5 / B-8 と同方向、`verifyFindingRefs` / `judge-verdict` の分担に倣う）。prompt を検証結果から計算することで要件「条件付き prompt」を満たす。

**Alternatives considered**:
- *固定 follow-up 文を `postWorkPrompts` に積む*: 既存 `postWorkPrompts` は run 前に確定するため検証結果に依存できず、残タスク名を列挙できない。

### D5: `RuntimeStrategy.validateStepOutputs` seam（`validateStepInputs` と対称）

port に検出 seam を追加する:

```ts
validateStepOutputs(
  contracts: OutputContract[],
  cwd: string,
  branch: string | null,
): Promise<OutputCheckResult>;   // throw しない。violation を返す
```

port DTO（`OutputContract` / `OutputViolation` / `OutputCheckResult`）は `src/core/port/` 配下に置く（adapter が `OutputViolation` を型参照するため、domain ではなく port に置いて adapter→domain の back-edge を避ける）。`validateStepInputs` が throw するのに対し、本 seam は**no-throw で構造化結果を返す**: 契約クラスごとに halt / follow-up を分岐する必要があるため、停止判断は呼び出し側に委ねる。

**Rationale**: 入力側と同じ seam に置くことで local / managed の対称（同一宣言 path・runtime 差は seam 内に閉じる）を保つ。no-throw は出力側に特有のポリシー分岐（halt と follow-up の併存）に必要。

**Alternatives considered**:
- *`validateStepInputs` のように throw*: follow-up 契約を表現できず、halt と follow-up を 1 seam で扱えない。
- *managed を no-op*: 受け入れ基準「両 runtime で検証が機能」に反する。managed は git state（agent が push 済み）に対して検証できる。

### D6: 修復層 — agent-runner の同一セッション follow-up

executor は follow-up 契約（tasks-complete）がある場合に `ctx.policy.outputVerification` を組んで runner に渡す:

```ts
// AgentRunPolicy に追加（src/core/port/agent-runner.ts）
interface OutputVerificationPolicy {
  detect: () => Promise<OutputCheckResult>;   // executor が validateStepOutputs を束縛
  maxAttempts: number;                         // follow-up 予算
  buildPrompt: (violations: OutputViolation[], attempt: number) => string;
}
```

`detect` は executor が `runtimeStrategy.validateStepOutputs(followUpContracts, cwd, branch)` を束縛した closure（adapter は `() => Promise<OutputCheckResult>` としてのみ扱い、domain を知らない）。adapter は work turn ＋ `report_result` retry ＋ `postWorkPrompts` の**後段**に、`report_result` retry と同型のループを回す:

```
for attempt in 1..maxAttempts:
  result = await detect()
  if result.violations empty: break
  prompt = buildPrompt(result.violations, attempt)
  <同一 session を resume して prompt を 1 turn 送る>   // local: queryFn({ resume }) / managed: executeFollowUpTurn
  followUpAttempts++
```

- **claude-code**（`ClaudeCodeRunner.run`）: `report_result` retry ループの後にこのループを追加する。`resume: sessionId` で同一 session を継続。
- **managed-agent**（`ManagedAgentRunner`）: `runPollingStyle`（implementer 経路）の `postWorkPrompts` 後に `executeFollowUpTurn` ベースのループを追加する。
- 本ループを実装しない adapter（codex / dispatching の委譲先など）は修復が走らず、executor の gate（D7）が halt に縮退して安全側に倒れる。

**Rationale**: 「why agent-runner、why not executor」— warm な session（`report_result` retry / `postWorkPrompts` と地続き）でゼロ再 resume の修復ができ、`followUpAttempts` 計上も既存。要件「既存の follow-up 予算に乗る」「同型の先例が agent-runner に存在する」に合致する。adapter は `detect` / `buildPrompt` を closure として呼ぶのみで、`reportTool.parseInput` / `toolReportRetry.buildPrompt` を policy 経由で呼ぶ既存パターンと同型。

**Alternatives considered**:
- *修復を executor の loop ＋ runner 新 method で行う*: AgentRunner port 拡張と query option 再構築の重複を招く。

### D7: 停止層 — executor の gate と policy 構築

`StepExecutor.runAgentStep` に、`runner.run()` 成功後・`finalizeStepArtifacts`（commit）前の gate を追加する:

1. 契約を組む: `produced = producedContractsFromWrites(step.writes?.(state, deps), scaffolds)`（`getOutputTemplates` 由来 scaffold を付与）＋ `step.outputContracts?.(state, deps)`（tasks-complete）。
2. follow-up 契約を `ctx.policy.outputVerification` に載せて `runner.run()` に渡す（D6）。
3. run 後、`runtimeStrategy.validateStepOutputs(allContracts, cwd, branch)` を**直接**呼ぶ（authoritative gate）。
4. 結果を `partitionByPolicy` で分け、**halt-class の violation が 1 件でもある**、または**follow-up-class が予算後もなお残る**なら、`STEP_OUTPUT_MISSING` で停止する（`validateRequiredInputs` と同一エンベロープで state 記録 + 添付 + rethrow）。
5. violation 0 件なら `finalizeStepArtifacts` に進む。

`runtimeStrategy` 未注入、または契約 0 件のときは gate をスキップ（既存 `?.` パターン）。本 gate は agent step のみに適用する（judge / CLI step はスコープ外）。

**新規 step 宣言**: `AgentStep` に optional `outputContracts?(state, deps): OutputContract[]` を追加する。implementer のみが `[{ kind: "tasks-complete", path: <tasks.md>, policy: "follow-up" }]` を返す。`IoRef`（writes 用）に optional `verify?: boolean`（既定 true）を追加し、条件付き出力（正常経路で欠落し得る file write）を produced 契約から除外できるようにする。

**Rationale**: gate を executor 直呼びにすることで `validateStepInputs`（入力は run 前、出力は run 後・commit 前）と最大限対称になり、adapter の修復実装有無に関わらず halt を保証する（robustness）。検出が修復ループ（D6）と gate（D7）の 2 箇所で走る冗長は意図的で、D6 は best-effort 修復、D7 は最終決定の防御層という分担。local は安価な fs read、managed は契約宣言 step に限定され `validateStepInputs` と同じ fetch コスト水準。

**Alternatives considered**:
- *adapter が返す `outputCheck` を executor が解釈し、gate は I/O しない*: 冗長検出は消えるが、修復未実装 adapter（codex 等）で gate が機能せず robustness を失う。produced（follow-up なし）契約の検証も adapter 依存になる。

## Risks / Trade-offs

- [Risk] produced 契約を `writes()` 全 file エントリに既定 halt で適用し、正常経路で欠落し得る出力（条件付き write）を halt させ標準 pipeline を壊す → **Mitigation**: scaffold 配置 step（design / spec-review / test-case-gen / code-review / conformance）は scaffold 一致で、それ以外も正常経路では実体を産出する。`verify: false` opt-out を用意し、全 12 step の `writes()` を正常経路と突き合わせる監査タスク（T-07）＋全テスト green で確認する。
- [Risk] scaffold byte 一致比較が改行正規化等でズレ、実体を空 scaffold と誤判定 / 逆 → **Mitigation**: scaffold は `getOutputTemplates` の定数そのものを worktree に書く（`writeOutputTemplates`）。比較対象は同一定数。LF 前提のコードベースで byte 一致は決定論。空判定（trim 0 長）と欠落を併せて冗長に捉える。
- [Risk] managed の `validateStepOutputs` が cloud agent の push 反映前に走り false negative（欠落と誤判定） → **Mitigation**: 検証前に `git fetch origin <branch>`（`validateStepInputs` と同手順）。producer の work turn / follow-up turn 完了（agent push 済み）後に検証が走る順序を前提とする。
- [Risk] managed の per-step `git fetch` / `getRawFile` が画面出力・実行時間を変える → **Mitigation**: fetch / cat-file は stdout 非汚染。検証は出力契約を持つ agent step に限定。stdout snapshot で不変を確認（T-08）。
- [Risk] follow-up 修復ループの session resume 失敗が step を巻き込む → **Mitigation**: `report_result` retry と同じ best-effort 扱い（修復不成立でも gate が halt に縮退）。修復ループの失敗は warning に留め、最終判断は gate に委ねる。
- [Risk] 検出が D6 / D7 の 2 箇所で走る冗長 → **Mitigation**: 意図的な防御層分担として受容（D7 Rationale）。冗長コストは local＝fs read、managed＝契約宣言 step 限定。

## Open Questions

- なし（managed の ref 解決は fetch で確定。produced の判定深度は「欠落 / 空 / scaffold 一致」に固定。follow-up 予算は定数。config 外出しは Non-Goal）。
