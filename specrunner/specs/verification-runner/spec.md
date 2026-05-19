# verification-runner Specification

## Purpose
TBD - created by archiving change implementer-verify-buildfix. Update Purpose after archive.
## Requirements

### Requirement: verification step は agent を呼ばない CLI-resident step として実装される

`VerificationStep` は MUST `Step` interface の `kind: "cli"` discriminator を持ち、`src/core/step/verification.ts` に配置される。step.name は MUST `"verification"`。`VerificationStep` は SHALL `agent` フィールドを持たない。`StepExecutor` は MUST `step.kind === "cli"` 分岐で `step.run(state, deps)` を呼び、Anthropic Managed Agents session の create / poll をスキップする。

#### Scenario: VerificationStep の kind discriminator

- **WHEN** `VerificationStep` を import する
- **THEN** `step.kind === "cli"` かつ `step.name === "verification"`
- **AND** `step.agent` プロパティが存在しない（型レベルで agent-less）

#### Scenario: StepExecutor が CLI 分岐で実行する

- **WHEN** `StepExecutor.execute(VerificationStep, state)` を呼ぶ
- **THEN** Anthropic SessionClient.create は呼ばれない
- **AND** `VerificationStep.run(state, deps)` が呼ばれる
- **AND** その後 `step.resultFilePath(state)` を読み `step.parseResult(content)` で verdict を導出する

### Requirement: verification CLI runner は build / typecheck / test / lint / security の 5 phase を fail-fast 順次実行する

`src/core/verification/runner.ts` の `runVerification(slug: string): Promise<VerificationResult>` は MUST 以下の 5 phase を配列順 `["build", "typecheck", "test", "lint", "security"]` で順次実行する。各 phase は SHALL `node:child_process.spawn` で `bun run <phase>` を子プロセスとして起動する（test phase を含む全 phase が `bun run <script>` 形式で統一される）。`bun:*` / `Bun.*` の import は MUST 使用しない。spawn は cwd を target project の repository root で実行する（per-phase timeout は本 request スコープ外）。

最初の non-zero exit code を返した phase で MUST break し、残り phase は SHALL `status: "skipped"` で記録される（fail-fast）。

#### Scenario: 全 phase passed

- **GIVEN** 5 phase すべてが exit code 0 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"passed"` であり、各 phase の status は `"passed"`

#### Scenario: typecheck failed → 後続 skipped

- **GIVEN** build phase が exit 0、typecheck phase が exit 2 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"failed"`
- **AND** build phase status は `"passed"`、typecheck phase status は `"failed"`、test/lint/security の status は `"skipped"`

#### Scenario: bun:* / Bun.* の import 禁止

- **WHEN** `src/core/verification/runner.ts` の import 文を grep する
- **THEN** `from "bun:`、`from "bun"`、`Bun.spawn` のいずれも出現しない
- **AND** `from "node:child_process"` が import されている

### Requirement: verification step は package.json scripts に存在しない phase を skipped で記録する

phase 名と対応する script 名のマッピングは MUST `src/core/verification/phases.ts` に config 化される。target project の `package.json` scripts に該当 script が存在しない phase は SHALL `status: "skipped"` で記録され、verdict 判定では `failed` に算入されない。`phases.ts` は `PHASE_SCRIPTS: Record<PhaseName, string>` を `{ build: "build", typecheck: "typecheck", test: "test", lint: "lint", security: "security" }` の単一形式で保持し、全 phase が `bun run <script>` で統一的に呼ばれる。

#### Scenario: lint script 不在

- **GIVEN** `package.json` に `lint` script が存在しない
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** lint phase の status は `"skipped"` で記録される
- **AND** verdict 判定では failed に算入されない

### Requirement: 全 phase が skipped の場合の verdict は failed とする

passed phase が 1 つも存在せず全 phase が `status: "skipped"` の場合、`runVerification` は MUST `verdict: "failed"` を返し、errorCode `VERIFICATION_NO_RUNNABLE_PHASES` を verification-result.md に記録する。この設計により build-fixer への明確なシグナルが保証され、「全 skipped = passed」という誤った経路が防止される。

#### Scenario: 全 phase skipped

- **GIVEN** `package.json` に `build` / `typecheck` / `test` / `lint` / `security` のいずれの script も存在しない
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 全 phase の status は `"skipped"` で記録される
- **AND** 結果の verdict は `"failed"` である
- **AND** `verification-result.md` に `errorCode: "VERIFICATION_NO_RUNNABLE_PHASES"` が記録される

### Requirement: verification-result.md は spec-review-result と類似の構造で出力される

`runVerification(slug)` は MUST `openspec/changes/<slug>/verification-result.md` を以下の構造で書き出す:

- 1 行目: `# Verification Result — <slug> — iter <N>`
- `## Verdict: passed` または `## Verdict: failed` の行
- `## Phase Results` の表（columns: `#`, `Phase`, `Status`, `Duration`, `Exit Code`）
- `## Phase: <phase-name>` セクションごとに stdout/stderr を fenced code block で出力

#### Scenario: verification-result.md の構造

- **WHEN** `runVerification("my-change")` が完了する
- **THEN** `openspec/changes/my-change/verification-result.md` が存在する
- **AND** 1 行目が `# Verification Result — my-change — iter ` で始まる
- **AND** `## Verdict: passed` または `## Verdict: failed` の行を 1 つ含む
- **AND** `## Phase Results` の表ヘッダー `| # | Phase | Status | Duration | Exit Code |` を含む
- **AND** 各 phase ごとに `## Phase: <phase-name>` セクションが存在する

### Requirement: VerificationStep.parseResult は verdict 行を regex 抽出する

`VerificationStep.parseResult(content)` は MUST `^## Verdict: (passed|failed)$` の regex で verdict を抽出し、`{ verdict: "passed" | "failed", findingsPath: <verification-result.md のパス> }` を返す。マッチしない場合は SHALL `verdict: null` を返し、`StepExecutor` 側で escalation 経路に乗せる。

#### Scenario: passed の抽出

- **GIVEN** content に `## Verdict: passed` の行が含まれる
- **WHEN** `VerificationStep.parseResult(content)` を呼ぶ
- **THEN** `{ verdict: "passed", findingsPath: <path> }` を返す

#### Scenario: failed の抽出

- **GIVEN** content に `## Verdict: failed` の行が含まれる
- **WHEN** `VerificationStep.parseResult(content)` を呼ぶ
- **THEN** `{ verdict: "failed", findingsPath: <path> }` を返す

#### Scenario: verdict 行 不在

- **GIVEN** content に `## Verdict:` の行が存在しない
- **WHEN** `VerificationStep.parseResult(content)` を呼ぶ
- **THEN** `{ verdict: null, findingsPath: <path> }` を返す

### Requirement: VerificationStep は AgentRegistry の集約対象から除外される

`VerificationStep` は agent を持たないため、`AgentRegistry.fromSteps([..., VerificationStep, ...])` は MUST VerificationStep を skip する。`specrunner init` は SHALL VerificationStep に対応する Agent を Anthropic に作成しない。

#### Scenario: AgentRegistry がスキップする

- **GIVEN** Step 配列に `VerificationStep` が含まれる
- **WHEN** `AgentRegistry.fromSteps(steps)` を呼ぶ
- **THEN** `registry.get("verification")` は `undefined` を返す
- **AND** registry.list() に VerificationStep の AgentDefinition は含まれない

### Requirement: verification CLI runner は build / typecheck / test / lint / security / test-coverage の 6 phase を fail-fast 順次実行する

`src/core/verification/runner.ts` の `runVerification(slug: string): Promise<VerificationResult>` は MUST 以下の 6 phase を配列順 `["build", "typecheck", "test", "lint", "security", "test-coverage"]` で順次実行する。最初の 5 phase (build / typecheck / test / lint / security) は従来通り `bun run <script>` を子プロセスとして起動する。6 番目の `test-coverage` は CLI 内部処理として実行する（package.json script を spawn しない）。

最初の non-zero exit code を返した phase で MUST break し、残り phase は SHALL `status: "skipped"` で記録される（fail-fast）。

#### Scenario: 全 6 phase passed

- **GIVEN** 5 script phase すべてが exit code 0 で終了し、test-coverage phase も passed
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"passed"` であり、phases 配列の length は 6

#### Scenario: test phase failed → test-coverage skipped

- **GIVEN** test phase が exit 1 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** test-coverage phase の status は `"skipped"`

### Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する

`src/core/verification/test-coverage.ts` の `runTestCoveragePhase(slug, cwd)` は MUST 以下の処理を行う:

1. `specrunner/changes/<slug>/test-cases.md` を読み込み、Priority: must の TC ID を抽出する
2. `tests/` 配下の `.ts` ファイルを再帰取得し、各 must TC ID が少なくとも 1 ファイルに出現するか確認する
3. TC ID の grep パターンは `TC-\d+(?:-\d+)*` 形式で、フラット型 (`TC-001`) と階層型 (`TC-10-01`) の両方を検出する
4. 未出現の must TC ID がある場合は `status: "failed"` を返し、`missingTcIds` に未実装 TC ID のリストを記録する
5. 全 must TC ID が見つかった場合は `status: "passed"` を返す
6. `stdout` に human-readable summary を生成する（例: `test-coverage: 15/18 must TCs covered\nMissing: TC-003, TC-012`）

`bun:*` / `Bun.*` の import は MUST 使用しない。`node:fs/promises` と `node:path` のみ使用する。

#### Scenario: must TC 全網羅

- **GIVEN** test-cases.md に must TC が 3 件あり、tests/ 配下に 3 件すべての TC ID が記載されている
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"passed"` であり、`missingTcIds` は空配列

#### Scenario: must TC 部分欠損

- **GIVEN** test-cases.md に must TC が 5 件あり、tests/ 配下に 2 件のみ TC ID が記載されている
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"failed"` であり、`missingTcIds` に 3 件の TC ID が含まれる

#### Scenario: must TC 0 件

- **GIVEN** test-cases.md に must TC が 0 件（should / could のみ）
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"passed"`

### Requirement: test-coverage phase は test-cases.md 不在時に skipped で記録する

`test-cases.md` が `specrunner/changes/<slug>/` に存在しない場合、test-coverage phase は SHALL `status: "skipped"` で記録される。skipped phase は verdict 判定では failed に算入されない（既存の script 不在時の skipped と同じ扱い）。

#### Scenario: test-cases.md 不在

- **GIVEN** `specrunner/changes/<slug>/test-cases.md` が存在しない
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"skipped"`
