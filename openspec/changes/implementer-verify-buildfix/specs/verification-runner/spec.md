## ADDED Requirements

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
