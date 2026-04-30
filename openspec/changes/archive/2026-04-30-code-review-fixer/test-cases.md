# Test Cases: code-review-fixer

## Summary

- **Total**: 39 cases
- **Automated** (unit/integration/e2e): 36
- **Manual**: 3
- **Priority**: must: 17, should: 17, could: 5

## Test Cases

---

### TC-001: CodeReviewStep の kind / name / agent.role が AgentStep 規約を満たす

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Requirement: CodeReviewStep is an AgentStep; design.md D6; tasks.md 5.1–5.2

**GIVEN** `src/core/step/code-review.ts` の `CodeReviewStep` export
**WHEN** `step.kind`、`step.name`、`step.agent.role` を inspect する
**THEN** `step.kind === "agent"`
**AND** `step.name === "code-review"`
**AND** `step.agent.role === "code-review"`

---

### TC-002: CodeReviewStep の agent.name / model / tools が仕様値と一致する

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: CodeReviewStep exposes a complete AgentDefinition; tasks.md 5.2

**GIVEN** `CodeReviewStep` の `step.agent` フィールド
**WHEN** 各プロパティを inspect する
**THEN** `step.agent.name === "specrunner-code-review"`
**AND** `step.agent.model === "claude-sonnet-4-5"`
**AND** `step.agent.tools === "agent_toolset_20260401"`
**AND** `step.agent.system` が `CODE_REVIEW_SYSTEM_PROMPT` の値と一致する

---

### TC-003: CodeReviewStep は gitWrite capability を持たない（read-only）

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Requirement: CodeReviewStep; design.md D6; tasks.md 5.2

**GIVEN** `CodeReviewStep` の `step.agent.capabilities`
**WHEN** `gitWrite` フィールドを inspect する
**THEN** `step.agent.capabilities?.gitWrite` が falsy または フィールドが存在しない

---

### TC-004: CodeReviewStep.resultFilePath が zero-padded 3 桁の iteration 番号を持つパスを返す

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: CodeReviewStep.resultFilePath produces zero-padded iteration filename; tasks.md 5.3

**GIVEN** 現在の code-review iteration が 1
**WHEN** `CodeReviewStep.resultFilePath(state)` を呼ぶ
**THEN** 返り値のパスが `review-feedback-001.md` で終わる
**AND** パスが `openspec/changes/<slug>/` 配下に位置する

---

### TC-005: CodeReviewStep.parseResult が共通 helper 経由で verdict を抽出する

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: CodeReviewStep.parseResult extracts verdict via shared helper; tasks.md 5.4

**GIVEN** `- **verdict**: needs-fix` を含む review-feedback コンテンツ
**WHEN** `CodeReviewStep.parseResult(content)` を呼ぶ
**THEN** 返り値の `StepOutcome.verdict` が `"needs-fix"` である
**AND** `parseReviewVerdict` ヘルパーに委譲している（step 内に独自 regex が存在しない）

---

### TC-006: CodeFixerStep の kind / name / agent.role が AgentStep 規約を満たす

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Requirement: CodeFixerStep is an AgentStep; design.md D6; tasks.md 6.1–6.2

**GIVEN** `src/core/step/code-fixer.ts` の `CodeFixerStep` export
**WHEN** `step.kind`、`step.name`、`step.agent.role` を inspect する
**THEN** `step.kind === "agent"`
**AND** `step.name === "code-fixer"`
**AND** `step.agent.role === "code-fixer"`

---

### TC-007: CodeFixerStep が gitWrite capability = true を持つ

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: CodeFixerStep exposes gitWrite capability; design.md D6; tasks.md 6.2

**GIVEN** `CodeFixerStep` の `step.agent.capabilities`
**WHEN** `gitWrite` フィールドを inspect する
**THEN** `step.agent.capabilities.gitWrite === true`

---

### TC-008: CodeFixerStep.resultFilePath が null を返す

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: CodeFixerStep.resultFilePath returns null; design.md D7; tasks.md 6.3

**GIVEN** `CodeFixerStep` インスタンス
**WHEN** `CodeFixerStep.resultFilePath(state)` を呼ぶ
**THEN** 返り値が `null` である

---

### TC-009: CodeFixerStep.parseResult が NULL_PARSE_RESULT を返す

**Category**: unit
**Priority**: must
**Source**: step-execution-architecture/spec.md — Scenario: CodeFixerStep.resultFilePath returns null; design.md D7; tasks.md 6.4

**GIVEN** `CodeFixerStep` インスタンス
**WHEN** `CodeFixerStep.parseResult(content)` を任意の文字列で呼ぶ
**THEN** 返り値が既存の `NULL_PARSE_RESULT` 定数と同一の値である

---

### TC-010: CodeFixerStep の completionVerdict が "approved" である

**Category**: unit
**Priority**: must
**Source**: design.md D7; tasks.md 6.6; step-execution-architecture/spec.md — Requirement: CodeFixerStep

**GIVEN** `CodeFixerStep` インスタンス
**WHEN** `step.completionVerdict` または `StepExecutor` が `resultFilePath === null` 時に合成する verdict を inspect する
**THEN** 値が `"approved"` である
**AND** これにより `code-fixer --approved→ code-review` transition が発火可能になる

---

### TC-011: verification passed → code-review transition が存在する

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: verification passed routes to code-review; design.md 要件 §Pipeline 拡張; tasks.md 7.1–7.2

**GIVEN** `STANDARD_TRANSITIONS` テーブル
**WHEN** `{ step: "verification", on: "passed" }` に一致する行を探す
**THEN** `to === "code-review"` の行が存在する
**AND** `{ step: "verification", on: "passed", to: "end" }` の行が存在しない（削除済み）

---

### TC-012: code-review approved → end transition が存在する

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — 標準 transition table; design.md 要件 §Pipeline 拡張; tasks.md 7.2

**GIVEN** `STANDARD_TRANSITIONS` テーブル
**WHEN** `{ step: "code-review", on: "approved" }` に一致する行を探す
**THEN** `to === "end"` の行が存在する

---

### TC-013: code-review needs-fix → code-fixer transition が存在する

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — 標準 transition table; design.md 要件 §Pipeline 拡張; tasks.md 7.2

**GIVEN** `STANDARD_TRANSITIONS` テーブル
**WHEN** `{ step: "code-review", on: "needs-fix" }` に一致する行を探す
**THEN** `to === "code-fixer"` の行が存在する

---

### TC-014: code-fixer approved → code-review transition が存在する

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — 標準 transition table; design.md 要件 §Pipeline 拡張; tasks.md 7.2

**GIVEN** `STANDARD_TRANSITIONS` テーブル
**WHEN** `{ step: "code-fixer", on: "approved" }` に一致する行を探す
**THEN** `to === "code-review"` の行が存在する

---

### TC-015: code-review escalation → escalate transition が存在する

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — 標準 transition table; design.md 要件 §Pipeline 拡張; tasks.md 7.2

**GIVEN** `STANDARD_TRANSITIONS` テーブル
**WHEN** `{ step: "code-review", on: "escalation" }` に一致する行を探す
**THEN** `to === "escalate"` の行が存在する

---

### TC-016: LOOP_ERROR_CODES に code-review エントリが追加されており grep-no-step-name-hardcode が PASS する

**Category**: unit
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Requirement: Pipeline はループごとのエラーコードを lookup table から取得する; design.md 要件 §LOOP_ERROR_CODES 拡張; tasks.md 7.3, 7.7

**GIVEN** `LOOP_ERROR_CODES` lookup table と `tests/grep-no-step-name-hardcode.test.ts`
**WHEN** `LOOP_ERROR_CODES["code-review"]` を inspect し、grep テストを実行する
**THEN** `LOOP_ERROR_CODES["code-review"].code === "CODE_REVIEW_RETRIES_EXHAUSTED"`
**AND** `LOOP_ERROR_CODES["code-review"].message(3) === "code-review did not approve after 3 iterations"`
**AND** `LOOP_ERROR_CODES["code-review"].hint("003")` が `"review-feedback-003.md"` を含む
**AND** `grep-no-step-name-hardcode.test.ts` が PASS する（executor / pipeline に step name の hardcode が存在しない）

---

### TC-017: code-review ↔ code-fixer サイクルが maxIterations に達すると CODE_REVIEW_RETRIES_EXHAUSTED で終了する

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario: code-review ↔ code-fixer cycle terminates at maxIterations; design.md D4; tasks.md 7.6

**GIVEN** `maxIterations = 3`
**AND** code-review が連続 3 回 `needs-fix` を返す
**WHEN** loop guard が発火する
**THEN** `Pipeline.run` がエラーコード `CODE_REVIEW_RETRIES_EXHAUSTED` でエラーを raise する
**AND** `state.error.code === "CODE_REVIEW_RETRIES_EXHAUSTED"`
**AND** `state.error.message === "code-review did not approve after 3 iterations"`
**AND** `state.steps["code-review"]` 末尾要素の verdict が `"escalation"` に書き換わる

---

### TC-018: parseReviewVerdict が approved を正しく抽出する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md — Scenario: parseReviewVerdict extracts approved verdict; tasks.md 1.1, 1.3

**GIVEN** `- **verdict**: approved` を含むコンテンツ
**WHEN** `parseReviewVerdict(content)` を呼ぶ
**THEN** 返り値が `"approved"` である

---

### TC-019: parseReviewVerdict が needs-fix を正しく抽出する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md; tasks.md 1.3

**GIVEN** `- **verdict**: needs-fix` を含むコンテンツ
**WHEN** `parseReviewVerdict(content)` を呼ぶ
**THEN** 返り値が `"needs-fix"` である

---

### TC-020: parseReviewVerdict が escalation を正しく抽出する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md; tasks.md 1.3

**GIVEN** `- **verdict**: escalation` を含むコンテンツ
**WHEN** `parseReviewVerdict(content)` を呼ぶ
**THEN** 返り値が `"escalation"` である

---

### TC-021: parseReviewVerdict が verdict 行がない場合に null を返す

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md — Scenario: parseReviewVerdict returns null for missing verdict line; tasks.md 1.3

**GIVEN** verdict 行を含まないコンテンツ
**WHEN** `parseReviewVerdict(content)` を呼ぶ
**THEN** 返り値が `null` である

---

### TC-022: parseSpecReviewVerdict が parseReviewVerdict に委譲する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md — Scenario: SpecReviewStep delegates to parseReviewVerdict; design.md D5; tasks.md 1.2, 1.4

**GIVEN** 既存 `parseSpecReviewVerdict` と 新規 `parseReviewVerdict`
**WHEN** 同一コンテンツ `- **verdict**: needs-fix` で両方を呼ぶ
**THEN** 両者が `"needs-fix"` を返す
**AND** `parseSpecReviewVerdict` が `parseReviewVerdict` を内部で呼んでいる（in-step 重複 regex が存在しない）

---

### TC-023: StepName union に "code-review" と "code-fixer" が含まれる

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Requirement: StepName union includes implementation-layer steps; tasks.md 2.1

**GIVEN** `src/state/schema.ts` の `StepName` union
**WHEN** union を inspect する
**THEN** `"code-review"` および `"code-fixer"` が合法な値として含まれる
**AND** union 全体が 8 リテラル（`propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`）から成る

---

### TC-024: Pipeline.loopNames 既定値に "code-review" が含まれる

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Requirement: Pipeline.loopNames 既定値は code-review を含む; design.md D8; tasks.md 7.4

**GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
**WHEN** インスタンスの `loopNames` を inspect する
**THEN** `["spec-review", "verification", "code-review"]` を含む

---

### TC-025: CodeFixerStep.buildMessage が直近の review-feedback パスを埋め込む

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md — Scenario: CodeFixerStep buildMessage embeds latest review-feedback path; tasks.md 6.5

**GIVEN** code-review が `review-feedback-002.md` を生成済みの state
**WHEN** `CodeFixerStep.buildMessage(state, deps)` を呼ぶ
**THEN** 生成されたメッセージ文字列に `"review-feedback-002.md"` が含まれる
**AND** メッセージに `buildGitPushInstruction()` の出力相当が含まれる

---

### TC-026: CodeFixerStep.buildMessage が前段 review-feedback 不在時に CODE_FIXER_NO_REVIEW_RESULT を throw する

**Category**: unit
**Priority**: should
**Source**: step-execution-architecture/spec.md — Requirement: CodeFixerStep; tasks.md 6.8, 6.9

**GIVEN** `getLatestStepResult(state, "code-review")` が空（code-review の実行記録なし）
**WHEN** `CodeFixerStep.buildMessage(state, deps)` を呼ぶ
**THEN** `SpecRunnerError` が `CODE_FIXER_NO_REVIEW_RESULT` コードで throw される

---

### TC-027: AgentRegistry.fromSteps が code-review / code-fixer を含む 7 AgentDefinition を登録する

**Category**: unit
**Priority**: should
**Source**: agent-registry/spec.md — Scenario: fromSteps が agent step の AgentDefinition を集約する; tasks.md 8.1

**GIVEN** 7 つの agent step（propose, spec-review, spec-fixer, implementer, build-fixer, code-review, code-fixer）
**WHEN** `AgentRegistry.fromSteps([...7 steps])` を呼ぶ
**THEN** `registry.list().length === 7`
**AND** `registry.get("code-review")` が `CodeReviewStep.agent` を返す
**AND** `registry.get("code-fixer")` が `CodeFixerStep.agent` を返す

---

### TC-028: AgentRegistry のソースが無編集である（code-review / code-fixer 追加時）

**Category**: unit
**Priority**: should
**Source**: agent-registry/spec.md — Requirement: Step を追加する際の編集箇所は Step 配列のみである; tasks.md 8.4

**GIVEN** 既存 5 agent step が動く registry
**WHEN** code-review / code-fixer を steps 配列に追加して `AgentRegistry.fromSteps(steps)` で再構築する
**THEN** `registry.list().length` が 7 に増える
**AND** `src/core/registry/` および `src/core/syncer/` のソースコードに変更行が存在しない（grep / diff で確認）

---

### TC-029: code-fixer error → escalate transition が存在する

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — 標準 transition table; design.md 要件 §Pipeline 拡張; tasks.md 7.2

**GIVEN** `STANDARD_TRANSITIONS` テーブル
**WHEN** `{ step: "code-fixer", on: "error" }` に一致する行を探す
**THEN** `to === "escalate"` の行が存在する

---

### TC-030: STANDARD_TRANSITIONS テーブルが仕様に定義された全 17 行を含む

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario: Standard pipeline transitions are expressed as table rows; tasks.md 7.5

**GIVEN** `STANDARD_TRANSITIONS` 配列
**WHEN** 全行を列挙する
**THEN** propose / spec-review / spec-fixer / implementer / verification / build-fixer / code-review / code-fixer の全 transition が揃っている（spec に定義された 17 行）
**AND** `verification --passed→ end` 行が存在しない

---

### TC-031: 未知の transition で Pipeline が escalate に遷移する

**Category**: unit
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario: Unknown transition triggers escalation; tasks.md 7.5

**GIVEN** step が transition table に存在しない verdict を返す
**WHEN** `Pipeline.run` がルーティングを評価する
**THEN** run が `escalate` で終了する

---

### TC-032: AgentSyncer が code-review / code-fixer Agent を初回 init で作成する

**Category**: integration
**Priority**: should
**Source**: agent-syncer/spec.md — Scenario: code-review / code-fixer も同じ sync ロジックで sync される; tasks.md 8.1, 8.3

**GIVEN** config に `agents["code-review"]` / `agents["code-fixer"]` エントリが存在しない（初回 init）
**AND** `AgentRegistry` に code-review / code-fixer の `AgentDefinition` が登録されている
**WHEN** `AgentSyncer.syncAll()` を呼ぶ
**THEN** `client.createAgent` が code-review / code-fixer それぞれに 1 回ずつ呼ばれる
**AND** config の `agents["code-review"]` / `agents["code-fixer"]` に `{ agentId, definitionHash, lastSyncedAt }` が書き込まれる
**AND** SyncResult の各 role の action が `create` である

---

### TC-033: CODE_REVIEW_SYSTEM_PROMPT が review-standards.md の規約参照・read-only 制約を含む

**Category**: manual
**Priority**: should
**Source**: step-execution-architecture/spec.md — Requirement: CodeReviewStep; design.md D2, D6; tasks.md 3.1–3.2

**GIVEN** `src/prompts/code-review-system.ts` の `CODE_REVIEW_SYSTEM_PROMPT`
**WHEN** プロンプト内容を目視で確認する
**THEN** `.claude/rules/review-standards.md` の severity / category / verdict 規約への参照が含まれる
**AND** `git diff main...HEAD` の実行指示が含まれる
**AND** commit / push 禁止（read-only）の制約が明示されている
**AND** `review-feedback-NNN.md` への Findings table + Verdict 出力指示が含まれる

---

### TC-034: CODE_FIXER_SYSTEM_PROMPT が HIGH 必修・MEDIUM 条件付き・LOW 無視・仕様変更禁止を含む

**Category**: manual
**Priority**: should
**Source**: step-execution-architecture/spec.md — Requirement: CodeFixerStep; design.md D6; tasks.md 4.1–4.2

**GIVEN** `src/prompts/code-fixer-system.ts` の `CODE_FIXER_SYSTEM_PROMPT`
**WHEN** プロンプト内容を目視で確認する
**THEN** HIGH severity findings を必ず修正する旨が明示されている
**AND** MEDIUM severity findings は spec/設計と整合する範囲のみ修正する旨が明示されている
**AND** LOW severity findings は無視する旨が明示されている
**AND** 仕様変更・追加機能禁止が明示されている
**AND** `buildGitPushInstruction()` 経由での commit/push 指示が含まれる

---

### TC-035: parseReviewVerdict が不正形式の verdict 値に対して null を返す

**Category**: unit
**Priority**: could
**Source**: step-execution-architecture/spec.md — Requirement: parseReviewVerdict is the shared verdict extractor; tasks.md 1.3

**GIVEN** `- **verdict**: invalid-value` を含むコンテンツ（approved/needs-fix/escalation 以外）
**WHEN** `parseReviewVerdict(content)` を呼ぶ
**THEN** 返り値が `null` である

---

### TC-036: CodeReviewStep.parseResult が verdict 行なしのコンテンツで escalation フォールバックする

**Category**: unit
**Priority**: could
**Source**: step-execution-architecture/spec.md — Requirement: CodeReviewStep; tasks.md 5.4

**GIVEN** verdict 行を含まない（または不正形式の）review-feedback コンテンツ
**WHEN** `CodeReviewStep.parseResult(content)` を呼ぶ
**THEN** 返り値の `StepOutcome.verdict` が `"escalation"` である（既存 parser-failure フォールバックパス）

---

### TC-037: AgentRegistry が同一 role の重複 step 追加時に例外を throw する

**Category**: unit
**Priority**: could
**Source**: agent-registry/spec.md — Scenario: 重複 role は構築時例外になる; tasks.md 8.1

**GIVEN** 同じ `agent.role = "code-review"` を持つ 2 つの agent step
**WHEN** `AgentRegistry.fromSteps([stepA, stepB])` を呼ぶ
**THEN** `"Duplicate agent role: code-review"` を含むメッセージで例外が throw される
**AND** registry インスタンスが構築されない

---

### TC-038: Pipeline.loopNames を明示的に渡した場合は渡した値が優先される

**Category**: unit
**Priority**: could
**Source**: pipeline-orchestrator/spec.md — Requirement: Pipeline.loopNames 既定値は code-review を含む; design.md D8

**GIVEN** `Pipeline` constructor を `loopNames: ["spec-review"]` を明示渡しで呼ぶ
**WHEN** インスタンスの `loopNames` を inspect する
**THEN** `["spec-review"]` が使われる（既定値 `["spec-review", "verification", "code-review"]` は使われない）

---

### TC-039: specrunner init が code-review / code-fixer を含む 7 Agent を Anthropic に作成する（手動検証）

**Category**: manual
**Priority**: could
**Source**: design.md 受け入れ基準; tasks.md 8.1–8.2

**GIVEN** feat/code-review-fixer ブランチで `bun install` 済みの環境
**AND** Anthropic API key が設定されている
**WHEN** `specrunner init` を実行する
**THEN** Anthropic 上に `specrunner-code-review` と `specrunner-code-fixer` の 2 Agent が新規作成される
**AND** 既存 5 Agent は no-op（再作成されない）
**AND** config に code-review / code-fixer のエントリが書き込まれる
