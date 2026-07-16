# Tasks: scenario freeze と test-materialize→implement の commit 境界

実装順は T-01（型・step 名）→ T-02（step 本体）→ T-03（契約）→ T-04（配線）→ T-05（implementer 分岐）→ T-06（freeze）→ T-07（テスト）→ T-08（検証）。

## T-01: `test-materialize` の step 名と型を登録する（D1）

- [x] `src/kernel/step-names.ts` の `STEP_NAMES` に `TEST_MATERIALIZE: "test-materialize"` を追加し、`AGENT_STEP_NAMES` 配列に `"test-materialize"` を追加する（配置は test-case-gen と implementer の間が読みやすい）。
- [x] `src/kernel/agent-definition.ts:15` の `AgentStepName` union に `| "test-materialize"` を追加する（`state/schema.ts` の双方向コンパイル時ガードが両者の同期を要求するため必須）。
- [x] `bun run typecheck` が通ることを確認する（ガード不整合があればここで型エラーになる）。

**Acceptance Criteria**:
- `STEP_NAMES.TEST_MATERIALIZE === "test-materialize"`、`AGENT_STEP_NAMES` に含まれる、`CLI_STEP_NAMES` には含まれない。
- `AgentStepName` に `"test-materialize"` が代入可能。
- typecheck green。

## T-02: `TestMaterializeStep` と system prompt を実装する（D1, D3）

- [x] `src/prompts/test-materialize-system.ts` を新設する。責務: **固定済み `test-cases.md` の各 must TC を test コードに変換して書き出す。実装コード（production code）は書かない**。TC→test 変換の詳細（Scenario 由来 TC は Source の spec.md を読んで GWT を得る／非 Scenario 由来 TC は test-cases.md の GWT を使う）は現行 `src/prompts/implementer-system.ts:43-54` の該当ブロックを移設・流用する。各 test の関数名または直前コメントに TC ID を必ず記載する（verification grep のため）。tasks.md は変更しない。commit/push は CLI が行う旨と security note を含める。
- [x] `src/core/step/test-materialize.ts` を新設する。雛形は `test-case-gen.ts` / `implementer.ts`。
  - 専用 `AgentDefinition`（`name:"specrunner-test-materialize"`, `role:STEP_NAMES.TEST_MATERIALIZE`, `model:"claude-sonnet-4-6"`, `system:TEST_MATERIALIZE_SYSTEM_PROMPT`, `tools:[{type:AGENT_TOOLSET_TYPE}, toCustomToolSpec(PRODUCER_REPORT_TOOL)]`, `capabilities:{gitWrite:true}`）。
  - `kind:"agent"`, `name:STEP_NAMES.TEST_MATERIALIZE`, `completionVerdict:"success"`, `needsProjectContext:true`, `reportTool:PRODUCER_REPORT_TOOL`, `maxTurns:40`。
  - `reads()` = `[{path:design.md}, {path:tasks.md}, {path:test-cases.md}, {path:spec.md, required:false}]`（全て changeFolder 相対）。test-cases.md は本ノードの主入力（required）。
  - `writes()` = `[{path:changeFolderPath(slug), artifact:"gitState"}]`（test ファイルはプロジェクト配置規約に従い動的配置のため gitState）。
  - `outputContracts()` = `[{kind:"test-coverage", path:`${changeFolder}/test-cases.md`, policy:"halt"}]`（T-03 で kind を追加）。
  - `buildMessage()` は test framework / 配置規約を伝えるため `renderTestPlacementInstruction(deps.config.tests?.placement)`（`src/prompts/test-placement.ts`）を implementer と同様に適用する。branch 未設定時は `branchNotSetError` を投げる。
  - `resultFilePath()` = null、`parseResult()` = `NULL_PARSE_RESULT`。

**Acceptance Criteria**:
- `TestMaterializeStep.kind === "agent"`、`name === "test-materialize"`、`completionVerdict === "success"`。
- `reads()` に test-cases.md（required）と design.md/tasks.md を含み、spec.md は `required:false`。
- `writes()` は gitState のみ。
- system prompt は「test コードのみを書き production code を書かない」旨と「各 test に TC ID を記載」を含む。

## T-03: `test-coverage` OutputContract kind を追加し test-coverage.ts をリファクタする（D3）

- [x] `src/core/verification/test-coverage.ts` を挙動保存リファクタ: 既存 `runTestCoveragePhase` の「must TC 抽出→test ファイル収集→境界 grep→assertion 検査→result 構築」本体を `export async function evaluateTestCoverage(content: string, cwd: string): Promise<TestCoverageResult>` として抽出する。`runTestCoveragePhase(slug, cwd)` は test-cases.md を読み（不在なら従来どおり `skipped`）`evaluateTestCoverage` を呼ぶ薄いラッパにする。**既存の入出力・戻り値・skip/passed/failed 判定を一切変えない**。
- [x] `src/core/port/output-contract.ts` の `OutputContractKind` に `"test-coverage"` を追加し、doc コメントに「`test-coverage`: test-cases.md の各 must TC ID が少なくとも 1 つの test ファイルに（assertion 付きで）存在することを grep で検証する。test は実行しない」を追記する。
- [x] `src/core/runtime/local.ts` の `LocalRuntime.validateStepOutputs` に kind `"test-coverage"` 分岐を追加: `contract.path`（test-cases.md）を読み（不在は violation 扱い）`evaluateTestCoverage(content, cwd)` を呼び、`status === "failed"` なら `{kind, path, policy, detail: missingTcIds ∪ assertionlessTcIds}` を violations に push する。`status === "skipped"|"passed"` は violation 無し。
- [x] `src/core/runtime/managed.ts` の `ManagedRuntime.validateStepOutputs` に kind `"test-coverage"` 分岐を追加し、violation を出さず skip する（managed は local worktree を持たない best-effort、`digestArtifacts` の `hash:null` と同方針）。コメントで理由を明示する。

**Acceptance Criteria**:
- 既存 verification / test-coverage テストが**無変更で green**（挙動保存リファクタ）。
- `OutputContractKind` に `"test-coverage"` が加わる。
- Local: test-cases.md の全 must TC に test（＋assertion）が在れば violation 空、欠落があれば欠落 TC を detail に持つ violation を返す。実行はしない（red test でも存在すれば pass）。
- Managed: test-coverage contract は常に violation 空。

## T-04: STANDARD_DESCRIPTOR と transitions に test-materialize を配線する（D1, D5）

- [x] `src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR.steps` に `[STEP_NAMES.TEST_MATERIALIZE, TestMaterializeStep]` を **test-case-gen と implementer の間**に挿入し、`TestMaterializeStep` を import する。`roles` に `[STEP_NAMES.TEST_MATERIALIZE]: {role:"gate", phase:"impl"}` を追加する。registry の "Standard 13-step" コメント（`registry.ts:27, 166`）を実数（14-step）に更新する。
- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS`: `{step:TEST_CASE_GEN, on:"success", to:IMPLEMENTER}`（現 236 行）を `to:TEST_MATERIALIZE` に変更し、`{step:TEST_MATERIALIZE, on:"success", to:IMPLEMENTER}` と `{step:TEST_MATERIALIZE, on:"error", to:"escalate"}` を追加する。`TEST_CASE_GEN on error → escalate` は残す。
- [x] `FAST_TRANSITIONS` / `FAST_DESCRIPTOR` は**変更しない**（fast は test-case-gen も test-materialize も持たない）。
- [x] needs-fix 系 transition（conformance needs-fix:implementer / verification failed / code-review needs-fix）は**変更しない**（既に test-materialize を宛先にしていない）。

**Acceptance Criteria**:
- `STANDARD_DESCRIPTOR.steps` の順序が `... test-case-gen, test-materialize, implementer, ...`。
- `roles["test-materialize"] === {role:"gate", phase:"impl"}`、impl phase の creator は implementer 1 つのまま。
- `STANDARD_TRANSITIONS` に上記 3 遷移が存在し、`to === "test-materialize"` の遷移は test-case-gen 起点の 1 本のみ。
- `FAST_DESCRIPTOR.steps` は本変更前と同一。
- descriptor-input-completeness 検証で violation ゼロ（standard / fast 両方）。

## T-05: implementer を実装専用にする（standard のみ、fast 保存）（D4）

- [x] `src/core/step/implementer.ts` の `buildImplementerInitialMessage` に `testsMaterialized?: boolean` オプションを追加する。true のとき手順を「materialize 済み test（red）が worktree に在る。test ファイルを新規作成・変更せず実装コードのみを書き既存 test を green にする。契約理解のため test-cases.md と materialize 済み test を読む」に差し替える。false / 未指定のとき現行メッセージと**完全に同一**にする。
- [x] `ImplementerStep.buildMessage` で `testsMaterialized = Boolean(state.steps?.["test-materialize"]?.length)` を計算し `buildImplementerInitialMessage` に渡す（conformance 経路のメッセージ構築でも同様に渡す）。
- [x] `src/prompts/implementer-system.ts` の手順 3 を一般化する: 「テストの扱いは user message の指示に従う（materialize 済みならテストを書かない／未 materialize なら TDD でテストを先に書く）」。TC→test 変換の詳細は「未 materialize（fast 等）」経路にのみ適用する旨を明記する（詳細ブロックは T-02 で test-materialize に移設済みなので、implementer 側は未 materialize 経路の記述として残すか要約する）。
- [x] `ImplementerStep.reads()` に `{path:`${changeFolder}/test-cases.md`, required:false}` を追加する（soft、fast の input-completeness を壊さないため）。

**Acceptance Criteria**:
- `state.steps["test-materialize"]` が有るとき（standard）: implementer メッセージは「実装のみ／test を書き換えない」を含み、「テストを先に書く（TDD）」の無条件指示を含まない。
- `state.steps` に test-materialize が無いとき（fast）: implementer メッセージは本変更前と**文字列一致**（TDD 挙動保存）。
- `ImplementerStep.reads()` に `test-cases.md` が `required:false` で含まれる。

## T-06: scenario freeze を固定する（D2）

- [x] `src/prompts/test-case-gen-system.ts` に、生成する `TC-{NNN}` ID は **後続ノード（test-materialize / implementer）が再採番しない固定 scenario ID** である旨の 1 文を追記する（既存 ID 安定性ガイダンス `:155-159` の近傍。format 自体は変えない）。
- [x] scenario hash 記録は既存 lineage 経路（`commit-orchestrator.ts:217-245`）で test-case-gen の `writes()`（test-cases.md）を通じ**自動的に達成される**ことを確認する（コード追加は不要。挙動固定テストは T-07 で追加）。

**Acceptance Criteria**:
- test-case-gen prompt に固定 scenario ID（再採番禁止）の記述がある。
- test-case-gen 完了時、lineage の outputs に test-cases.md の非 null sha256 hash が載る（T-07 でテスト）。

## T-07: 受け入れ基準をテストで固定する

- [x] **freeze**: test-case-gen の lineage 記録経路で `events.jsonl` に `step:"test-case-gen"` の lineage record が append され、その outputs に `test-cases.md` の `sha256:` 非 null hash が含まれることを固定する（`src/state/__tests__/artifact-observability.test.ts` / `commit-orchestrator` 系の既存パターンを流用）。
- [x] **topology**: `STANDARD_DESCRIPTOR.steps` の順序、`roles["test-materialize"]`、impl phase creator 単一性、`SPEC_REVIEW→TEST_CASE_GEN→TEST_MATERIALIZE→IMPLEMENTER→VERIFICATION` の遷移、`FAST_DESCRIPTOR` 不変を固定する（`pipeline-roles.test.ts` / `pipeline.transitions.test.ts` / `fast-descriptor.test.ts` を更新・追加）。
- [x] **base 境界**: test-materialize ノードの commit を harness（executor + commit-push の既存テスト雛形 `tests/unit/step/executor.commit.test.ts` / `commit-and-push.test.ts`）で再現し、mock agent が `*.test.ts` を書いた後の commit の tree diff（対親）が test ファイルを 1 件以上含み、実装ソース（test 拡張子以外の src コード）を含まないことを固定する（test 実行結果ではなく tree で検証）。
- [x] **test-coverage contract**: `evaluateTestCoverage`/`LocalRuntime.validateStepOutputs` に対し、(a) 全 must TC に assertion 付き test が在れば violation 空（実行しない＝red でも可）、(b) must TC の test 欠落で violation を返す、を固定する。
- [x] **implementer 実装専用**: state に test-materialize 記録が有るとき implementer メッセージが実装専用文言を含み TDD 無条件指示を含まないこと、無いとき（fast）従来メッセージと一致すること、`reads()` の test-cases.md が soft であることを固定する。
- [x] **loop 配慮**: `STANDARD_TRANSITIONS` で `to === "test-materialize"` が test-case-gen 起点の 1 本のみ、conformance needs-fix:implementer → implementer、verification failed → build-fixer、code-review needs-fix → code-fixer が test-materialize を宛先にしないことを固定する。
- [x] **resume**: `resolveResumeStep` が `test-materialize` を verbatim に返す（allowed set に含まれる）ことを固定する。
- [x] **列挙テスト更新（新ノード挿入）**: `tests/unit/core/step/step-names.test.ts` の `ALL_STEPS` に `TestMaterializeStep` を追加、`tests/unit/step/step-io-contracts.test.ts` の対象集合に反映、`pipeline-roles.test.ts` TC-001 のステップ列挙に `test-materialize` を追加する。

**Acceptance Criteria**:
- 上記各テストが green。
- 挙動保存テスト（loop / attach / checkpoint / reverification）は**無変更**で green（更新は topology 列挙テストの新ノード反映のみ）。

## T-08: 全体検証と doc 整合

- [x] `src/core/port/step-types.ts` 等の「all 12 standard pipeline steps」コメント（`:192,203,313,323`）を実数に整合（またはコメントを step 数非依存の表現に）する。※挙動には影響しないが読者の誤認を避ける。
- [x] `bun run typecheck && bun run test` を実行し green を確認する。
- [x] `tasks.md` の全チェックボックスを `[x]` にする。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 新ノード挿入以外の回帰が無い（挙動保存テスト無変更 green）。
