# Design: scenario freeze と test-materialize→implement の commit 境界

## Context

現状の pipeline には「test は在るが実装が無い」base コミットが存在しない。原因は 2 点:

- `implementer` が **test コードと実装を同一ノード・同一コミットに混ぜて書く**（`src/prompts/implementer-system.ts:41` "各タスクを実装する（TDD: テストを先に書く）"、コミットは node 終端で 1 回）。
- ステップは node 終端で **1 回だけ** commit する（`src/core/step/executor.ts:433` の非 round 分岐が `finalizeStepArtifacts`→`commitAndPush`（`src/core/step/commit-push.ts:36`、`git add -A`→`commit "${step.name}: ${slug}"`→push）を commitMutex 下で 1 回呼ぶ）。1 ノード内に複数の内部 commit 境界を作る seam は無い。

ADR-20260716 D4（assurance profile 境界、ratify 済み）はこの R3 として、**test scenario の固定**と **test materialize（= base）→ implement（= candidate）の commit 境界**を要求する。本 request はこれを **既存の 1 ノード 1 コミットモデルのまま二ノード分割（Option A）** で実装する。R4（gate が base/candidate OID で test を実行し `BiteEvidence` を機械生成）は本境界の上に乗るが、本 request では実装しない。

現状コードの前提（調査で確認済み）:

- **test-case-gen**（`src/core/step/test-case-gen.ts`）: 散文の test scenario（`test-cases.md`）を生成、コードは書かない（`src/prompts/test-case-gen-system.ts:147` "Write test SCENARIOS only. Do NOT write test code."）。`writes()` = `${changeFolder}/test-cases.md`。各 scenario は `### TC-{NNN}` heading の安定 ID を持つ（`src/prompts/test-case-gen-system.ts:155-159`、"TC IDs MUST be unique ... stable enough to grep reliably"）。
- **implementer**（`src/core/step/implementer.ts`）: `reads()` = tasks.md + spec.md（+ conformance result）、`writes()` = `[{path:changeFolder, artifact:"gitState"}, {path:tasks.md, verify:false}]`。プロンプトで test（TC ID 付き）＋実装を書き、CLI が 1 コミット。`completionVerdict:"success"`。**FAST_DESCRIPTOR でも共有される**（`src/core/pipeline/registry.ts:123`）。
- **verification の TC-ID grep**（`src/core/verification/test-coverage.ts`）: `runTestCoveragePhase(slug, cwd)` が `test-cases.md` から must TC ID を抽出（`extractMustTcIds`）し、プロジェクト全体の `*.test.ts` 等を境界厳密 grep して各 must TC の test 存在＋assertion 存在を検証する。**test を実行しない**（test 実行は verification の別 phase）。
- **artifact hash 記録**: step 完了時に `CommitOrchestrator.finalizeStep`（`src/core/step/commit-orchestrator.ts:217-245`）が `step.writes()` / `step.reads()` を `deps.runtimeStrategy.digestArtifacts`（`src/core/runtime/local.ts:822`、`sha256:`）で digest し、`LineageRecord`（`src/store/event-journal.ts:93`）を `events.jsonl` へ best-effort append する（state.json には materialize しない）。events.jsonl は change folder に在り `git add -A` で branch-borne になる。
- **transitions**（`src/core/pipeline/types.ts:223`）: `SPEC_REVIEW→TEST_CASE_GEN→IMPLEMENTER→VERIFICATION`。needs-fix は `CONFORMANCE →(needs-fix:implementer)→ IMPLEMENTER`、`VERIFICATION failed→BUILD_FIXER`、`CODE_REVIEW needs-fix→CODE_FIXER`。
- **step 追加の型系**: `src/kernel/step-names.ts`（`AGENT_STEP_NAMES` 配列 + `STEP_NAMES` 定数）と `src/kernel/agent-definition.ts:15`（`AgentStepName` union）は `state/schema.ts` の双方向コンパイル時ガードで同期される。両方に追記が要る。

## Goals / Non-Goals

**Goals**:

- 固定済み `test-cases.md`（安定 ID ＋ branch-borne hash）を作り、後続（R4）の tamper 検知の基点にする。
- test-case-gen と implementer の間に `test-materialize` ノードを挿入し、**base コミット（test は在る／実装は無い）** と **candidate コミット（実装）** の 2 つの commit 境界を作る。
- `implementer` を実装専用にする（STANDARD topology）。verification の TC-ID grep は materialize 済み test に対して従来どおり成立させる。
- needs-fix ループを implement に戻し、test-materialize は test-case-gen の後に一度だけ走らせる。
- checkpoint/resume を跨いで固定 scenario と base/candidate 履歴を保持する。

**Non-Goals**（スコープ外）:

- **R4**: base/candidate OID での test 実行と `BiteEvidence` 生成、bite strategy の category 別ロジック。本 request は commit 境界と freeze を作るのみ。
- **R2**: minimumAssurance floor / protected paths。
- **R6**: fast profile / assurance 値に基づく工程分岐。FAST の topology は変えない。standard の topology を `test-case-gen→test-materialize→implement→verification` に変えるだけで profile 値は参照しない。
- 同一 session composite（内部多重コミット）の新実行 primitive。既存の 1 ノード 1 コミットモデルで二ノードとして実現する。

## Decisions

### D1: `test-materialize` を新規 agent step（role: gate / phase: impl）として test-case-gen と implementer の間に挿入する

- `src/kernel/step-names.ts` に `TEST_MATERIALIZE: "test-materialize"` を追加（`STEP_NAMES` ＋ `AGENT_STEP_NAMES` 配列）。`src/kernel/agent-definition.ts:15` の `AgentStepName` union に `| "test-materialize"` を追加（双方向ガード同期のため両方必須）。
- `src/core/step/test-materialize.ts` を新設。雛形は `test-case-gen.ts` / `implementer.ts`。専用 `AgentDefinition`（`capabilities.gitWrite:true`、`AGENT_TOOLSET_TYPE` ＋ `PRODUCER_REPORT_TOOL`）、`completionVerdict:"success"`、`needsProjectContext:true`（test framework / 配置規約の理解に必要）。
- `STANDARD_DESCRIPTOR`（`src/core/pipeline/registry.ts:30`）の `steps` に `[STEP_NAMES.TEST_MATERIALIZE, TestMaterializeStep]` を **test-case-gen と implementer の間**に挿入（descriptor-input-completeness validator は steps 順に `available` を積むため、test-cases.md を produce する test-case-gen より後・consume する自ノードの前でなければならない）。`roles` に `{role:"gate", phase:"impl"}` を追加。
- **Rationale**: role を `creator` にすると `PipelineDescriptor` 不変条件「各 phase に creator は 1 つ」（`registry.ts:98` / `pipeline-roles.test.ts` TC-002）に反する（impl phase の creator は implementer）。test-case-gen が既に impl phase の `gate` である前例に倣い、test-materialize も `gate` とする。
- **Alternatives considered**: 同一 session の内部多重コミット primitive を新設（却下: foundation 級、本 request の射程を超える。別途 attended ADR が要る）。

### D2: 安定 scenario ID は既存の `TC-{NNN}` を用い、request の "SC-XXX" はこれを指すものとする（並行 ID namespace を新設しない）

- `test-cases.md` の各 scenario は既に `### TC-{NNN}` heading の安定・一意・grep 可能な ID を持つ（`test-case-gen-system.ts:155-159`）。これを **固定 scenario ID**（request の "SC-XXX"）として扱う。
- freeze の実体は **`test-cases.md` の content hash を test-case-gen 境界で branch-borne に記録すること**であり、これは既存の lineage 経路（`commit-orchestrator.ts:217-245` → `digestArtifacts` → `appendLineage` → `events.jsonl`）で **test-case-gen の `writes()`（= test-cases.md）を通じて自動的に達成される**。本 request は (a) この自動記録を挙動固定テストで lock し、(b) test-materialize/implementer が ID を再採番しない（immutable 前提）ことを prompt と入出力契約で担保する。
- **Rationale**: 新たに `SC-` prefix を導入すると、(1) verification の TC-ID grep（`extractMustTcIds` の `TC-\d+` 正規表現）を変える必要が生じ req3「TC-ID grep が従来どおり成立」と挙動保存に反する、または (2) test が SC/TC の 2 系統 ID を二重に持つ冗長を招く。req2「各 test に ID を埋め込む」と req3「verification の TC-ID grep が成立」を同時に非冗長で満たす唯一の解は **埋め込む ID ＝ grep する ID ＝ TC-{NNN}** であり、"SC-XXX ≡ TC-{NNN}" と解すのが request の意図（stable・greppable・frozen）に忠実。
- **Alternatives considered**: 独立した `SC-{NNN}` namespace を新設（却下: verification grep 変更 or 二重 ID の冗長。R4 の tamper 基点は ID prefix でなく test-cases.md hash なので `SC-` prefix は R4 にも不要）。

### D3: test-materialize の verdict は「各 must TC に対応する test が存在する」を契約とし、test の pass は要求しない

- 新 `OutputContract` kind `"test-coverage"` を追加（`src/core/port/output-contract.ts`）。test-materialize の `outputContracts()` が `{kind:"test-coverage", path:<test-cases.md>, policy:"halt"}` を宣言する。
- `src/core/verification/test-coverage.ts` を挙動保存リファクタ: grep 本体を `evaluateTestCoverage(testCasesContent: string, cwd: string): Promise<TestCoverageResult>` として抽出し、`runTestCoveragePhase(slug, cwd)` はファイル読込後にこれを呼ぶ薄いラッパにする（既存 verification テストは無変更で green）。
- `LocalRuntime.validateStepOutputs`（`src/core/runtime/local.ts:842`）に kind `"test-coverage"` 分岐を追加: `contract.path` の test-cases.md を読み `evaluateTestCoverage(content, cwd)` を呼び、`status === "failed"`（must TC の test 不在 or assertion 不在）なら violation を返す。executor の output-gate（`executor.ts:401-416`）は kind 非依存で policy により halt する。`ManagedRuntime.validateStepOutputs` は test-coverage を skip（violation 空）とする（`digestArtifacts` が managed で `hash:null` を返すのと同じ best-effort 方針。本 request の dogfooding は local runtime）。
- **重要**: `evaluateTestCoverage` は test ID の存在 ＋ `expect(`/`assert(` の存在のみを見る **grep** であり、**test を実行しない**。実装が無く red の test でも「ID ＋ assertion が在る」なら契約は満たされる ＝ base 境界が保たれる。
- **Rationale**: 実装前に test を pass させると「先に実装を書く」ことになり base 境界（test 在り／実装無し）が消える。存在契約（grep）と pass 要求（execution）を分離する。既存 test-coverage grep を再利用し新規判定ロジックを増やさない。
- **Alternatives considered**: test-materialize で test を pass させる（却下: base 境界が消える）。契約を張らず下流 verification の grep のみに委ねる（却下: test-materialize が test を 1 件も産まなくても base コミットが成立し境界が無意味化する）。policy を `follow-up`（同一 session 再プロンプト）にする案は将来の改良として Open Questions に置き、初版は明示的な `halt` とする。

### D4: implementer を STANDARD で実装専用にする（materialize 済み test の有無で初期メッセージを分岐、FAST は無変更）

- `buildImplementerInitialMessage`（`src/core/step/implementer.ts:51`）に `testsMaterialized: boolean` を追加。true のとき手順から「テストを書く」責務を外し「materialize 済み test（red）が worktree に在る。test ファイルを新規作成・変更せず、実装コードのみを書き既存 test を green にする。契約理解のため test-cases.md と materialize 済み test を読むこと」を指示する。false のとき従来どおり TDD 手順（`src/prompts/implementer-system.ts` の現行挙動）。
- `ImplementerStep.buildMessage` は `testsMaterialized = Boolean(state.steps?.["test-materialize"]?.length)` を計算して渡す。**STANDARD は test-materialize が必ず先行するので true、FAST は test-materialize が存在せず常に false**（＝ FAST の TDD 挙動は完全保存）。
- `IMPLEMENTER_SYSTEM_PROMPT`（`src/prompts/implementer-system.ts`）の手順 3 を「テストの扱いは user message の指示に従う（materialize 済みならテストを書かない／未 materialize なら TDD）」と一般化する。TC→test 変換の詳細は未 materialize 経路にのみ適用。
- `ImplementerStep.reads()` に `{path:<test-cases.md>, required:false}` を追加（soft）。**soft である理由**: FAST には test-cases.md を produce する upstream が無く、required にすると descriptor-input-completeness validator が FAST で violation を出す（`descriptor-input-completeness.ts:172` は `required===false` を skip）。code-review が test-cases.md を soft read する前例（`test-cases-decouple.test.ts` T-07-1）に倣う。soft read により implementer の lineage inputs に test-cases.md hash が載り、freeze の連続性（D2）が記録される。
- **Rationale**: implementer は STANDARD/FAST 両方で共有される。system prompt を静的に「実装のみ」に固定すると FAST で誰も test を書かなくなり回帰する。分岐点を `state.steps["test-materialize"]` の有無に置くことで FAST を無改変で保存し、STANDARD のみ実装専用化する。
- **Alternatives considered**: FAST 用に別 implementer step を複製（却下: 重複と保守負債）。system prompt を無条件に実装専用化（却下: FAST 回帰）。

### D5: needs-fix ループは implement に戻し、test-materialize は test-case-gen の後に一度だけ走る

- transitions（`src/core/pipeline/types.ts:236, 241`）を変更: `TEST_CASE_GEN success → TEST_MATERIALIZE`、`TEST_MATERIALIZE success → IMPLEMENTER`、`TEST_MATERIALIZE error → escalate` を追加/差し替え。
- **既存 needs-fix transition は無変更で正しい**: `CONFORMANCE needs-fix:implementer → IMPLEMENTER`、`VERIFICATION failed → BUILD_FIXER`、`CODE_REVIEW needs-fix → CODE_FIXER` はいずれも test-materialize を宛先にしない。test-materialize に戻る唯一の遷移は「test-case-gen 再入（scenario 作り直し）」だが、それは spec 系の既存経路で本 request では変えない。
- 不変条件として「`to === TEST_MATERIALIZE` の transition は `step === TEST_CASE_GEN` の 1 本のみ」をテストで固定する。
- **Rationale**: scenario は固定済みなので needs-fix で test-materialize を再実行すると固定 scenario が壊れ hash 連続性が崩れる。implement へ戻す。
- **Alternatives considered**: needs-fix で test-materialize から再実行（却下: freeze 崩壊）。

### D6: checkpoint/resume は既存挙動のまま継続する（追加の永続化を設けない）

- base/candidate コミットは branch-borne（commit 済み）なので resume で自然に継続する。固定 scenario の hash は events.jsonl（branch-borne）に載る。state.json への materialize は行わない（lineage の journal 専有方針を維持）。
- resume 解決（`src/core/resume/resolve-step.ts`）は step 名を verbatim に返す汎用実装で、`AGENT_STEP_NAMES` に test-materialize を足せば allowed set に自動的に含まれる。test-materialize は loop step でないため `handleExhausted` / `LOOP_ERROR_CODES` の追加は不要。
- **Rationale**: 「LLM session に state を持たせない／truth は branch」の設計原理に沿う。commit 済みなら追加の state 記録は要らない。
- **Alternatives considered**: base/candidate OID を state.json に記録（却下: R4 の関心事。本 request は journal/commit の既存経路で足りる）。

## Risks / Trade-offs

- [Risk] implementer は FAST と共有 → 実装専用化が FAST の TDD を壊す。→ Mitigation: 分岐を `state.steps["test-materialize"]` 有無に限定（D4）。FAST 経路の TDD 保存を明示テストで固定する。
- [Risk] `test-coverage` output contract が managed runtime で評価不能。→ Mitigation: managed は skip（violation 空）。本 request の受け入れは local runtime dogfooding が前提。managed 対応は R4 以降で別途。
- [Risk] `evaluateTestCoverage` がプロジェクト全体の test ファイルを走査（dogfooding 時は spec-runner 自身の数千テスト）。→ Mitigation: verification が既に同一走査を行っており性能特性は既知・許容範囲。新規コストは生じない。
- [Risk] base コミットの「実装が無い」ことの機械検証は「実装」の定義に依存。→ Mitigation: 受け入れテストは「base コミットの tree diff（対親）に test ファイルが 1 件以上あり、実装ソース（test 拡張子以外の src 変更）が無い」ことを固定する（test 実行結果ではなく tree で検証）。
- [Risk] topology 列挙テスト（`pipeline-roles.test.ts` TC-001、`step-io-contracts.test.ts`、`step-names.test.ts`）はノード追加で更新が要る。→ これは「新ノード挿入」そのものであり回帰ではない。挙動保存テスト（loop / attach / checkpoint）は無変更で green を維持する。

## Open Questions

- test-coverage contract の policy を初版 `halt` とするが、`follow-up`（同一 session に不足 must TC の test 追加を再プロンプト）へ将来昇格するか（`tasks-complete` の前例あり）。→ 初版は halt、R4 実装時に再評価。
- test-materialize の `maxTurns` / `model`。初版は `model = claude-sonnet-4-6`（test-case-gen / implementer と同じ）、`maxTurns = 40`（test コード生成のみで implementer の 60 より小、test-case-gen の 15 より大）を既定とし、`.specrunner/config.json` の step-config で上書き可能とする。
