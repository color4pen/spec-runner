# Test Cases: review-exit-contract

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration/e2e): 23
- **Manual**: 3
- **Priority**: must: 13, should: 8, could: 5

## Test Cases

### TC-001: specReviewResultNotFoundError generates hint with correct iteration suffix and commit/push guidance

**Category**: unit
**Priority**: must
**Source**: spec.md — Requirement: Result-not-found error hint factory SHALL accept iteration as a required argument; tasks.md T-1.1, T-1.3

**GIVEN** `specReviewResultNotFoundError("readme-status-section", "feat/readme-status-section", 1)` が呼び出される
**WHEN** factory が error を生成する
**THEN** hint string は `openspec/changes/readme-status-section/spec-review-result-001.md` を含む
**AND** hint string は `feat/readme-status-section` を含む
**AND** hint string は「commit + push していない可能性」を示すガイダンス（"re-run the step" または "check the agent session logs for git push errors" 相当）を含む

---

### TC-002: specReviewResultNotFoundError generates suffix -010 for iteration 10

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: Iteration suffix uses 3-digit zero padding; tasks.md T-1.3; pipeline-context.md must-areas (-010)

**GIVEN** `specReviewResultNotFoundError(slug, branch, 10)` が呼び出される
**WHEN** factory が error を生成する
**THEN** hint string は `spec-review-result-010.md` を含む（2 桁を 3 桁にゼロ埋め）

---

### TC-003: specReviewResultNotFoundError generates suffix -100 for iteration 100

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: Iteration suffix uses 3-digit zero padding; tasks.md T-1.3; pipeline-context.md must-areas (-100)

**GIVEN** `specReviewResultNotFoundError(slug, branch, 100)` が呼び出される
**WHEN** factory が error を生成する
**THEN** hint string は `spec-review-result-100.md` を含む

---

### TC-004: codeReviewResultNotFoundError generates hint with correct iteration suffix and commit/push guidance

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: codeReviewResultNotFoundError generates hint with iteration suffix; tasks.md T-1.2, T-1.3; pipeline-context.md must-areas

**GIVEN** `codeReviewResultNotFoundError("some-slug", "feat/some-slug", 3)` が呼び出される
**WHEN** factory が error を生成する
**THEN** hint string は `openspec/changes/some-slug/review-feedback-003.md` を含む
**AND** hint string は「commit + push していない可能性」を示すガイダンス（"re-run the step" または "check the agent session logs for git push errors" 相当）を含む

---

### TC-005: iteration argument is required — TypeScript compile error on omission

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: Calling factory without iteration fails type check; design.md Decision 3

**GIVEN** TypeScript ソースで `specReviewResultNotFoundError(slug, branch)` と iteration を省略して呼び出す
**WHEN** TypeScript コンパイラがチェックする
**THEN** compile error になる（iteration は required parameter であり optional にはなっていない）

---

### TC-006: code-review step declares gitWrite: true in capabilities

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: code-review step declares gitWrite capability; tasks.md T-2.1; pipeline-context.md must-areas

**GIVEN** `src/core/step/code-review.ts` の capabilities 定義を確認する
**WHEN** capabilities オブジェクトを読む
**THEN** `capabilities.gitWrite === true` である
**AND** 隣接コメントは「source code remains read-only」と「review-feedback file is committed and pushed by the agent」相当の説明を含む
**AND** 旧コメント "read-only reviewer" 相当の openspec-workflow 由来の文言を含まない

---

### TC-007: spec-review step declares gitWrite: true in capabilities

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: spec-review step declares gitWrite capability; tasks.md T-2.3

**GIVEN** `src/core/step/spec-review.ts` の capabilities 定義を確認する
**WHEN** capabilities オブジェクトを読む
**THEN** `capabilities.gitWrite === true` である
**AND** 隣接コメントは spec-review-result file の push 必須性を明示する

---

### TC-008: executor fetch path matches agent-written filename for spec-review (round-trip invariant)

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: Spec-review executor fetches with same suffix as agent message; tasks.md T-3.3; pipeline-context.md must-areas

**GIVEN** spec-review iteration N の実行設定がある
**WHEN** executor が verify で result file の fetch path を構築する
**THEN** fetch path は `openspec/changes/{slug}/spec-review-result-{NNN}.md`（NNN = N の 3 桁ゼロ埋め）になる
**AND** agent への initial message に書かれた expected filename と完全一致する

---

### TC-009: executor fetch path matches agent-written filename for code-review (round-trip invariant)

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: Code-review executor fetches with same suffix as agent message; tasks.md T-3.3; pipeline-context.md must-areas

**GIVEN** code-review iteration N の実行設定がある
**WHEN** executor が verify で result file の fetch path を構築する
**THEN** fetch path は `openspec/changes/{slug}/review-feedback-{NNN}.md`（NNN = N の 3 桁ゼロ埋め）になる
**AND** agent への initial message に書かれた expected filename と完全一致する

---

### TC-010: spec-review system prompt includes commit + push + delayed end_turn instructions

**Category**: unit
**Priority**: must
**Source**: spec.md — Scenario: Spec-review system prompt instructs commit + push + delayed end_turn; tasks.md T-4.1, T-4.2, T-4.3; pipeline-context.md must-areas

**GIVEN** spec-review agent session が起動される
**WHEN** system prompt または initial message の内容を確認する
**THEN** 「After writing the verdict and findings, commit the file to branch `{branch}` and push to origin」相当の文を含む
**AND** 「Do NOT end_turn until push is complete」相当の文を含む
**AND** `buildGitPushInstruction(branch)` が user message に embed されている

---

### TC-011: code-review initial message includes buildGitPushInstruction aligned with capability

**Category**: unit
**Priority**: should
**Source**: spec.md — Scenario: Code-review system prompt remains aligned with capability; tasks.md T-4.4, T-4.5; design.md Decision 2

**GIVEN** code-review agent session が起動される
**WHEN** initial message の構築を確認する
**THEN** initial message に `buildGitPushInstruction(branch)` 由来のテキストが含まれる
**AND** system prompt の「MUST commit and push the review-feedback file」と矛盾しない
**AND** `buildCodeReviewInitialMessage` が `branch` パラメータを受け取り `state.branch` または `deps.branch` からの値を渡す

---

### TC-012: implementer system prompt contains positive-framing workflow context in Japanese

**Category**: unit
**Priority**: should
**Source**: spec.md — Scenario: Implementer prompt mentions stage and next step; tasks.md T-5.1, T-5.2; design.md Decision 6

**GIVEN** `src/prompts/implementer-system.ts` の IMPLEMENTER_SYSTEM_PROMPT を読む
**WHEN** prompt 文言を確認する
**THEN** 「stage 3 (implementer)」「次工程: verification (build/test/lint)」「code-review」相当の workflow context を日本語で含む
**AND** 「build/test/lint は次工程に渡してください」のような positive framing で書かれている
**AND** 「Do not run tests yourself」のような否定形のみの表現は使われていない

---

### TC-013: spec-review iteration 2 produces spec-review-result-002.md in all three layers

**Category**: unit
**Priority**: should
**Source**: spec.md — Scenario: spec-review iteration 1 produces spec-review-result-001.md (iteration 2 variant); design.md Decision 3

**GIVEN** spec-review iteration 2 が起動される
**WHEN** agent initial message・executor fetch path・`specReviewResultNotFoundError(slug, branch, 2)` hint の各層を確認する
**THEN** 3 層すべてで `spec-review-result-002.md` を参照している（divergence なし）

---

### TC-014: ADR file exists with required structure

**Category**: manual
**Priority**: should
**Source**: spec.md — Scenario: ADR exists with required sections; tasks.md T-7.1 — T-7.4

**GIVEN** 本 change が適用済みである
**WHEN** `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md` を目視確認する
**THEN** ファイルが存在する
**AND** Context section が claude-code vs Managed Agents の architecture 差分を説明する
**AND** Decision section が "agent-driven push for review-side steps" を選択した旨を記述する
**AND** Consequences section が custom_tool 方式や local relay 方式を将来の選択肢として記録する

---

### TC-015: agent-output-contract spec.md exists and declares SSOT

**Category**: manual
**Priority**: should
**Source**: proposal.md — New Capabilities; request.md — 受け入れ基準

**GIVEN** 本 change が適用済みである
**WHEN** `openspec/changes/review-exit-contract/specs/agent-output-contract/spec.md` を目視確認する
**THEN** ファイルが存在する
**AND** `{step}-result-{NNN}.md` filename suffix 規約の SSOT であることが明記されている

---

### TC-016: existing 491 tests pass with zero regression

**Category**: integration
**Priority**: must
**Source**: design.md Constraints; request.md — 受け入れ基準; pipeline-context.md code-review emphasis

**GIVEN** 本 change の全コード修正が適用済みである
**WHEN** `bun test` を実行する
**THEN** 既存の 491 tests が全て PASS する（regression 0）

---

### TC-017: TypeScript typecheck passes after changes

**Category**: integration
**Priority**: should
**Source**: tasks.md T-8.2

**GIVEN** 本 change の全コード修正が適用済みである
**WHEN** `bun typecheck` を実行する
**THEN** 型エラーが 0 件で PASS する

---

### TC-018: lint passes after changes

**Category**: integration
**Priority**: should
**Source**: tasks.md T-8.2

**GIVEN** 本 change の全コード修正が適用済みである
**WHEN** `bun lint` を実行する
**THEN** lint エラーが 0 件で PASS する

---

### TC-019: spec-review agent commits and pushes result file before end_turn (E2E behavioral path)

**Category**: e2e
**Priority**: must
**Source**: spec.md — Scenario: spec-review agent writes, commits, and pushes result file before end_turn; pipeline-context.md must-areas

**GIVEN** spec-review agent session が起動される
**AND** agent が `openspec/changes/{slug}/spec-review-result-001.md` に verdict と findings を書き出す
**WHEN** agent が session を終了する
**THEN** origin branch に `spec-review-result-001.md` が push されている
**AND** executor が GitHub API から同ファイルを fetch できる（404 にならない）
**AND** agent の session event log に `git push` の呼び出しが記録されている

---

### TC-020: code-review agent commits and pushes review-feedback file before end_turn

**Category**: e2e
**Priority**: should
**Source**: spec.md — Scenario: code-review agent writes, commits, and pushes review-feedback file before end_turn

**GIVEN** code-review agent session が起動される
**AND** agent が `openspec/changes/{slug}/review-feedback-001.md` に評価結果を書き出す
**WHEN** agent が session を終了する
**THEN** origin branch に `review-feedback-001.md` が push されている
**AND** executor が GitHub API から同ファイルを fetch できる

---

### TC-021: end-to-end pipeline run completes to PR creation (dogfooding)

**Category**: manual
**Priority**: must
**Source**: request.md — 受け入れ基準; tasks.md T-8.3, T-8.4; pipeline-context.md must-areas (E2E behavioral path)

**GIVEN** `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` を実行する
**WHEN** pipeline が spec-review, code-review を含む全 step を通過する
**THEN** GitHub に PR が作成されるまで完走する（end-to-end PASS）
**AND** job state ログで spec-review agent が push してから end_turn したことを確認できる

---

### TC-022: review-side agent does not modify source code despite gitWrite capability

**Category**: e2e
**Priority**: could
**Source**: spec.md — Scenario: Source code remains read-only despite gitWrite capability; design.md Risks

**GIVEN** spec-review または code-review agent が gitWrite capability 付きで実行されている
**WHEN** agent session が終了する
**THEN** result file 以外の source code / spec file / 設定 file が変更されていない
**AND** `git diff origin/{branch}` の差分は result file のみを含む

---

### TC-023: buildGitPushInstruction used consistently across propose/fixer/review steps

**Category**: unit
**Priority**: could
**Source**: proposal.md What Changes; design.md Decision 1

**GIVEN** `buildGitPushInstruction` 関数の呼び出し箇所を grep で確認する
**WHEN** propose / fixer 系と spec-review / code-review の initial message 組み立てを比較する
**THEN** spec-review と code-review の user message 組み立てに `buildGitPushInstruction(branch)` が含まれる
**AND** propose / fixer 系と同じ関数を呼び出している（独自実装でない）

---

### TC-024: spec-fixer / code-fixer already have gitWrite and push instructions (audit)

**Category**: unit
**Priority**: could
**Source**: design.md Non-Goals（監査として確認）

**GIVEN** `src/core/step/spec-fixer.ts` と `src/core/step/code-fixer.ts` の capabilities を確認する
**WHEN** capabilities オブジェクトと push 指示を検査する
**THEN** 両 step とも `gitWrite: true` を既に宣言している
**AND** prompt に push 指示が既に含まれている

---

### TC-025: codeReviewResultNotFoundError generates suffix -010 for iteration 10

**Category**: unit
**Priority**: could
**Source**: spec.md — Scenario: Iteration suffix uses 3-digit zero padding; tasks.md T-1.3; pipeline-context.md must-areas (-010 variant for code-review)

**GIVEN** `codeReviewResultNotFoundError(slug, branch, 10)` が呼び出される
**WHEN** factory が error を生成する
**THEN** hint string は `review-feedback-010.md` を含む

---

### TC-026: spec-review-result filename SSOT — no divergence between agent message and spec

**Category**: unit
**Priority**: could
**Source**: spec.md SSOT note; design.md Decision 3 SSOT

**GIVEN** spec-review の initial message テンプレートと `agent-output-contract/spec.md` が存在する
**WHEN** 両者の expected filename 規約を比較する
**THEN** filename prefix は `spec-review-result-` で一致する
**AND** suffix 形式 `{NNN}` (3 桁ゼロ埋め) が両者で同一規約を参照している
