# agent-output-contract Specification

## Purpose
TBD - created by archiving change review-exit-contract. Update Purpose after archive.
## Requirements

### Requirement: Review-side agents SHALL push result file to origin before end_turn

Review-side agents (spec-review, code-review) SHALL write the result file to the agent workspace, then commit it to the target branch, and SHALL push to origin before issuing `end_turn`. They MUST NOT end the session until the push completes successfully. This requirement is dictated by the Anthropic Managed Agents constraint: the workspace is not visible to the orchestrator, and agent-driven push is the only available delivery channel.

#### Scenario: spec-review agent writes, commits, and pushes result file before end_turn
- **WHEN** spec-review agent が `openspec/changes/{slug}/spec-review-result-{NNN}.md` に verdict と findings を write した
- **THEN** agent は同 file を branch に `git add` + `git commit` し、`git push origin {branch}` を実行する
- **AND** push が成功するまで `end_turn` しない

#### Scenario: code-review agent writes, commits, and pushes review-feedback file before end_turn
- **WHEN** code-review agent が `openspec/changes/{slug}/review-feedback-{NNN}.md` に評価結果を write した
- **THEN** agent は同 file を branch に `git add` + `git commit` し、`git push origin {branch}` を実行する
- **AND** push が成功するまで `end_turn` しない

#### Scenario: Source code remains read-only despite gitWrite capability
- **WHEN** review 系 agent が gitWrite capability を持って実行されている
- **THEN** agent は result file 以外の source code / spec file / 設定 file を modify してはならない
- **AND** prompt が "Do NOT modify any source files other than the result file" を明示する

### Requirement: Review-side step capability SHALL declare gitWrite: true

Review-side step modules (`src/core/step/spec-review.ts`, `src/core/step/code-review.ts`) SHALL declare `gitWrite: true` in their capabilities object. The accompanying comment MUST state that the source code stays read-only while the result file is committed and pushed by the agent, and MUST NOT copy openspec-workflow's "read-only reviewer" wording (which assumes claude-code local execution).

#### Scenario: code-review step declares gitWrite capability
- **WHEN** `src/core/step/code-review.ts` が agent session 起動 config を生成する
- **THEN** capabilities object は `{ gitWrite: true }` を含む
- **AND** 隣接コメントは「review-feedback file is committed and pushed by the agent. Source code remains read-only (enforced by prompt).」相当の説明を持つ

#### Scenario: spec-review step declares gitWrite capability
- **WHEN** `src/core/step/spec-review.ts` が agent session 起動 config を生成する
- **THEN** capabilities object は `{ gitWrite: true }` を含む
- **AND** 隣接コメントは spec-review-result file の push 必須性を明示する

### Requirement: Review-side result filenames SHALL follow `{step}-result-{NNN}.md` suffix convention

Result files produced by review-side agents SHALL include a 3-digit zero-padded iteration suffix `-{NNN}` (1-based). The step prefix MUST be fixed: `spec-review-result-` for spec-review and `review-feedback-` for code-review (to preserve existing naming). The filename written by the agent, the path fetched by the executor, and the path embedded in error hints MUST all follow the identical convention.

> **SSOT note**: `agent-output-contract` capability は `{step}-result-{NNN}.md` filename suffix 規約の単一の真実源 (SSOT)。`spec-review-session` capability はこの規約を重複定義せず、本 capability を cross-reference する。

#### Scenario: spec-review iteration 1 produces spec-review-result-001.md
- **WHEN** spec-review iteration 1 が起動される
- **THEN** agent への initial message に書かれる expected filename は `openspec/changes/{slug}/spec-review-result-001.md`
- **AND** executor が verify で fetch する filename も同一
- **AND** `specReviewResultNotFoundError(slug, branch, 1)` が生成する hint も同一 filename を含む

#### Scenario: code-review iteration 2 produces review-feedback-002.md
- **WHEN** code-review iteration 2 が起動される
- **THEN** agent への initial message に書かれる expected filename は `openspec/changes/{slug}/review-feedback-002.md`
- **AND** executor が verify で fetch する filename も同一
- **AND** `codeReviewResultNotFoundError(slug, branch, 2)` が生成する hint も同一 filename を含む

#### Scenario: Iteration suffix uses 3-digit zero padding
- **WHEN** iteration 番号 N (1 ≤ N ≤ 999) が与えられる
- **THEN** filename suffix は `String(N).padStart(3, '0')` で計算され `-001`, `-010`, `-100` の形式になる

### Requirement: Result-not-found error hint factory SHALL accept iteration as a required argument

The `specReviewResultNotFoundError` factory and the new `codeReviewResultNotFoundError` factory SHALL accept `(slug, branch, iteration)` as required arguments and MUST compute the iteration suffix dynamically from the `iteration` parameter inside the hint message. The `iteration` argument MUST NOT be optional, to prevent the hardcoded-suffix regression observed in dogfooding-001.

#### Scenario: specReviewResultNotFoundError generates hint with iteration suffix
- **WHEN** `specReviewResultNotFoundError("readme-status-section", "feat/readme-status-section", 1)` が呼び出される
- **THEN** 返される error の hint string は `openspec/changes/readme-status-section/spec-review-result-001.md` を含む
- **AND** branch 名 `feat/readme-status-section` を含む
- **AND** hint は「If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors」相当の commit + push 不足を疑うガイダンスを含む

#### Scenario: codeReviewResultNotFoundError generates hint with iteration suffix
- **WHEN** `codeReviewResultNotFoundError("some-slug", "feat/some-slug", 3)` が呼び出される
- **THEN** 返される error の hint string は `openspec/changes/some-slug/review-feedback-003.md` を含む

#### Scenario: Calling factory without iteration fails type check
- **WHEN** TypeScript で `specReviewResultNotFoundError(slug, branch)` のように iteration を省略する
- **THEN** compile error になる（iteration は required parameter）

### Requirement: Review system prompts SHALL include explicit commit/push instructions

`SPEC_REVIEW_SYSTEM_PROMPT` (or its initial message template) and `CODE_REVIEW_SYSTEM_PROMPT` SHALL contain explicit instructions describing the order: write result file, commit, push to origin, then `end_turn`. The user message construction MUST embed the same `buildGitPushInstruction(branch)` shape used by propose / fixer steps.

#### Scenario: Spec-review system prompt instructs commit + push + delayed end_turn
- **WHEN** spec-review agent session が起動される
- **THEN** system prompt または initial message は「After writing the verdict and findings, commit the file to branch `{branch}` and push to origin」相当の文を含む
- **AND** 「Do NOT end_turn until push is complete」相当の文を含む

#### Scenario: Code-review system prompt remains aligned with capability
- **WHEN** code-review agent session が起動される
- **THEN** system prompt は既存の "MUST commit and push the review-feedback file" 文を維持する
- **AND** capability 宣言 (`gitWrite: true`) と矛盾しない

### Requirement: Implementer system prompt SHALL describe pipeline workflow context positively

`implementer-system.ts` SHALL present the agent with a positive-framing workflow context describing the pipeline stage (stage 3: implementer) and MUST clarify that build / test / lint is handed off to the next-stage verification step. Role-boundary guidance MUST be written as a positive "hand off to verification" framing rather than a negative "do not run tests" framing. The appended text MUST match the language of the existing `IMPLEMENTER_SYSTEM_PROMPT` (Japanese). Example: 「あなたは pipeline の stage 3 (implementer) です。次工程: verification (build/test/lint), その次: code-review。build/test/lint は次工程に渡してください」

#### Scenario: Implementer prompt mentions stage and next step
- **WHEN** implementer agent session が起動される
- **THEN** system prompt は「stage 3 (implementer)」「次工程: verification (build/test/lint)」「その次: code-review」相当の workflow context を日本語で含む
- **AND** 「build/test/lint は次工程に渡してください」のような positive framing で書かれ、「Do not run tests yourself」のような否定形のみの表現は使わない

### Requirement: ADR SHALL document the deviation from openspec-workflow's orchestrator-driven commit

An ADR file `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md` SHALL be generated, and it MUST record the architecture difference between the reference implementation (openspec-workflow on claude-code, local execution, orchestrator commit) and SpecRunner (Anthropic Managed Agents, remote workspace, agent push), structured as Context / Decision / Consequences / Alternatives.

#### Scenario: ADR exists with required sections
- **WHEN** 本 change 適用後に `openspec-workflow/adr/` を確認する
- **THEN** `ADR-20260430-review-exit-contract-managed-agents.md` が存在する
- **AND** Context section が claude-code vs Managed Agents の architecture 差分を説明する
- **AND** Decision section が "agent-driven push for review-side steps" を選択する
- **AND** Consequences section が「将来 custom_tool 方式や local relay 方式に移行する選択肢」を alternative として記録する

### Requirement: Executor result-fetch path SHALL match agent-written filename

The path the executor builds when fetching the result file via the GitHub API SHALL be computed from the same convention (`{step}-result-{NNN}.md`) used to compose the expected filename in the agent's initial message. Any divergence between the two paths MUST NOT be permitted.

#### Scenario: Spec-review executor fetches with same suffix as agent message
- **WHEN** spec-review iteration N の verify で executor が GitHub から fetch する
- **THEN** fetch path は `openspec/changes/{slug}/spec-review-result-{NNN}.md` (NNN = N の 3 桁ゼロ埋め) になる
- **AND** agent への initial message に書かれた expected filename と完全一致する

#### Scenario: Code-review executor fetches with same suffix as agent message
- **WHEN** code-review iteration N の verify で executor が GitHub から fetch する
- **THEN** fetch path は `openspec/changes/{slug}/review-feedback-{NNN}.md` (NNN = N の 3 桁ゼロ埋め) になる
- **AND** agent への initial message に書かれた expected filename と完全一致する

### Requirement: Findings Format table SHALL include `Fix` column

The Findings table produced by review-side agents SHALL include a `Fix` column as a mandatory column. The `Fix` column indicates whether the code-fixer step should automatically resolve the finding. The mandatory columns SHALL be: `#`, `Severity`, `Category`, `File`, `Description`, `How to Fix`, `Fix`. The `Fix` column values are `yes` (this finding should be fixed by the code-fixer in the current PR) or `no` (pre-existing issue, intentional design decision, or separate scope; code-fixer SHALL ignore). The reviewer agent determines the `Fix` value for each finding based on context (whether the issue was introduced by the current change, whether it requires design changes, etc.).

#### Scenario: Finding with Fix: yes is targeted by code-fixer

- **GIVEN** a review-feedback file contains a finding with `Fix: yes`
- **WHEN** code-fixer reads the review feedback
- **THEN** code-fixer includes that finding in its fix targets

#### Scenario: Finding with Fix: no is ignored by code-fixer

- **GIVEN** a review-feedback file contains a finding with `Fix: no`
- **WHEN** code-fixer reads the review feedback
- **THEN** code-fixer does not attempt to fix that finding

#### Scenario: Backward compatibility — missing Fix column yields zero fixable count

- **GIVEN** a review-feedback file produced by a legacy reviewer that has no `Fix` column in the Findings table
- **WHEN** `parseFixableFindings()` is called on the file content
- **THEN** the function returns 0
- **AND** the verdict is `approved` (not `approved-with-fixes`)
