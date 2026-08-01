# Test Cases: spec-review の周回間 context 注入

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration): 31
- **Manual**: 0
- **Priority**: must: 24, should: 7, could: 0

---

## Scenario 由来 TC（spec.md）

### TC-001: iteration ≥ 2 で前周 findings と fixer 変更 file が message に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: iteration ≥ 2 の spec-review message に前周 context を注入する > Scenario: 前周 findings と fixer 変更 file が message に含まれる

---

### TC-002: fixer 変更 file の導出は listCommitChangedFiles mock 経由のみで構成される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: iteration ≥ 2 の spec-review message に前周 context を注入する > Scenario: fixer 変更 file は機械導出のみを真実源にする

---

### TC-003: 初回 spec-review（iteration 1）に注入ブロックが含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: iteration 1 では前周 context を注入しない > Scenario: 初回 spec-review には注入ブロックが無い

---

### TC-004: 前周 fixer の commitOid が未記録の場合、注入を省略して step を正常続行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出不能時は注入を省略し step を正常続行する > Scenario: 前周 fixer の commit OID が解決できない

---

### TC-005: listCommitChangedFiles が unavailable を返す場合、注入を省略して step を正常続行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出不能時は注入を省略し step を正常続行する > Scenario: diff が unavailable

---

### TC-006: 注入ブロックに再指摘プロトコル文言と全量列挙維持が含まれ、免除文言は含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 注入ブロックは再指摘プロトコルを課し全量列挙規律を弱めない > Scenario: 再指摘プロトコル文言が注入ブロックに含まれる

---

### TC-007: 注入は state（stepRuns / journal）に永続化されず後続 step に伝播しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 注入は one-shot でその round の message にのみ載る > Scenario: 注入は state を汚さない

---

## 非 Scenario 由来 TC（tasks.md / design.md）

### TC-008: DynamicContext に priorRoundContext optional field が追加され typecheck が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: DynamicContext に priorRoundContext field を追加する > Acceptance Criteria

**GIVEN** `src/git/dynamic-context.ts` の `DynamicContext` interface に `priorRoundContext?` field が追加されている
**WHEN** `typecheck` を実行する
**THEN** `priorRoundContext?: { findings: { severity: string; resolution: string; file: string; title: string }[]; changedFiles: string[] }` が型として存在し、typecheck が green

---

### TC-009: collectDynamicContext は priorRoundContext を設定しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: DynamicContext に priorRoundContext field を追加する > Acceptance Criteria

**GIVEN** `collectDynamicContext` が呼ばれる
**WHEN** 返り値の `DynamicContext` を参照する
**THEN** `priorRoundContext` が absent（undefined）であり、既存の構築点は無改変

---

### TC-010: resolvePriorFixerOid — 末尾 spec-fixer StepRun の commitOid を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `state.steps[SPEC_FIXER]` に StepRun が複数あり末尾要素の `commitOid` が `"abc123"` である
**WHEN** `resolvePriorFixerOid(state)` を呼ぶ
**THEN** `"abc123"` を返す

---

### TC-011: resolvePriorFixerOid — spec-fixer StepRun が無い場合 null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `state.steps[SPEC_FIXER]` が空配列または未定義
**WHEN** `resolvePriorFixerOid(state)` を呼ぶ
**THEN** `null` を返す

---

### TC-012: resolvePriorFixerOid — 末尾 StepRun に commitOid が無い場合 null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `state.steps[SPEC_FIXER]` の末尾 StepRun に `commitOid` が `undefined`
**WHEN** `resolvePriorFixerOid(state)` を呼ぶ
**THEN** `null` を返す

---

### TC-013: derivePriorRoundContext — iteration 1 で null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `iteration = 1`（前周が存在しない）
**WHEN** `derivePriorRoundContext({ state, iteration: 1, cwd, runtimeStrategy })` を呼ぶ
**THEN** `null` を返す

---

### TC-014: derivePriorRoundContext — runtimeStrategy が undefined で null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `iteration = 2`、`runtimeStrategy = undefined`（managed 相当の不在）
**WHEN** `derivePriorRoundContext({ state, iteration: 2, cwd, runtimeStrategy: undefined })` を呼ぶ
**THEN** `null` を返す

---

### TC-015: derivePriorRoundContext — 前周 fixer OID あり・mock が files を返す → findings と changedFiles を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `iteration = 2`、前周 spec-fixer StepRun に `commitOid = "oid1"` が記録されており、`listCommitChangedFiles` の mock が `{ kind: "success", files: ["a.ts", "b.ts"] }` を返す
**WHEN** `derivePriorRoundContext` を呼ぶ
**THEN** `{ findings: <state 由来の前周 spec-review findings>, changedFiles: ["a.ts", "b.ts"] }` を返し、`changedFiles` が mock の返値と一致する（機械導出の検証）

---

### TC-016: buildPriorRoundContextBlock — 出力が prior-round-context XML タグで囲まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: src/core/step/prior-round-context.ts > Acceptance Criteria

**GIVEN** `findings` と `changedFiles` を持つ `PriorRoundContext`
**WHEN** `buildPriorRoundContextBlock(ctx)` を呼ぶ
**THEN** 出力が `<prior-round-context>` で始まり `</prior-round-context>` で終わる

---

### TC-017: buildPriorRoundContextBlock — findings が空配列の場合に「前周指摘なし」を明示する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D5: derivePriorRoundContext の省略契約

**GIVEN** `findings = []`、`changedFiles = ["a.ts"]` の `PriorRoundContext`
**WHEN** `buildPriorRoundContextBlock(ctx)` を呼ぶ
**THEN** 出力に前周指摘が無いことを示す文言（例: 「前周指摘なし」）が含まれる

---

### TC-018: buildPriorRoundContextBlock — changedFiles が空配列の場合に変更なし（machine-derived）を明示する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria / design.md > D5: derivePriorRoundContext の省略契約

**GIVEN** `findings = [...]`、`changedFiles = []` の `PriorRoundContext`
**WHEN** `buildPriorRoundContextBlock(ctx)` を呼ぶ
**THEN** 出力に変更ファイルが無いこと（machine-derived である旨を含む）を示す文言が含まれる

---

### TC-019: derivePriorRoundContext — changedFiles が空配列でも null でなく注入オブジェクトを返す

**Category**: unit
**Priority**: should
**Source**: design.md > D5: derivePriorRoundContext の省略契約（changedFiles が success で空配列も注入する）

**GIVEN** `iteration = 2`、前周 fixer `commitOid` あり、`listCommitChangedFiles` が `{ kind: "success", files: [] }` を返す
**WHEN** `derivePriorRoundContext` を呼ぶ
**THEN** `null` でなく `{ findings: [...], changedFiles: [] }` を返す（「変更なし」も正当な導出情報）

---

### TC-020: SpecReviewStep.prepareRoundContext — iteration ≥ 2 + mock あり → priorRoundContext を含む Partial を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: AgentStep に prepareRoundContext フックを追加し SpecReviewStep で実装する > Acceptance Criteria

**GIVEN** `iteration = 2`、`listCommitChangedFiles` の mock が変更 file 集合を返す `runtimeStrategy`
**WHEN** `SpecReviewStep.prepareRoundContext(state, cwd, runtimeStrategy)` を呼ぶ
**THEN** `{ priorRoundContext: { findings: [...], changedFiles: [...] } }` を返す

---

### TC-021: SpecReviewStep.prepareRoundContext — iteration 1 → null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: AgentStep に prepareRoundContext フックを追加し SpecReviewStep で実装する > Acceptance Criteria

**GIVEN** `iteration = 1`（前周が存在しない state）
**WHEN** `SpecReviewStep.prepareRoundContext(state, cwd, runtimeStrategy)` を呼ぶ
**THEN** `null` を返す

---

### TC-022: buildStepContext — prepareRoundContext が返す partial が input.dynamicContext にマージされる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: buildStepContext で prepareRoundContext を呼び dynamicContext にマージする > Acceptance Criteria

**GIVEN** `prepareRoundContext` を実装した fake step が `{ priorRoundContext: { findings: [], changedFiles: ["x.ts"] } }` を返す
**WHEN** `buildStepContext` を呼ぶ
**THEN** 返り値の `ctx.input.dynamicContext` に `priorRoundContext` が含まれ、元の `dynamicContext` フィールドも維持されている

---

### TC-023: buildStepContext — prepareRoundContext を持たない step では dynamicContext が無改変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: buildStepContext で prepareRoundContext を呼び dynamicContext にマージする > Acceptance Criteria

**GIVEN** `prepareRoundContext` メソッドを持たない既存の step（spec-fixer 等）
**WHEN** `buildStepContext` を呼ぶ
**THEN** `ctx.input.dynamicContext` が enrich 前と同一内容（`priorRoundContext` は absent）

---

### TC-024: buildStepContext — prepareRoundContext が reject しても例外を投げず dynamicContext は enrich 前のまま

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > Risks（buildStepContext でフックが throw した場合は best-effort）

**GIVEN** `prepareRoundContext` が `Promise.reject(new Error("fail"))` を返す fake step
**WHEN** `buildStepContext` を呼ぶ
**THEN** `buildStepContext` は例外を投げず、返り値の `ctx.input.dynamicContext` は enrich 前のまま（黙って degrade）

---

### TC-025: SpecReviewStep.buildMessage — priorRoundContext あり → message に findings・changedFiles・プロトコル文言が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: spec-review message テンプレートに前周 context ブロックを配線する > Acceptance Criteria

**GIVEN** `deps.dynamicContext.priorRoundContext` に `{ findings: [{ severity: "high", resolution: "open", file: "a.ts", title: "X" }], changedFiles: ["a.ts"] }` を設定
**WHEN** `SpecReviewStep.buildMessage(state, deps)` を呼ぶ
**THEN** message に前周 finding の severity / resolution / file / title と changedFiles の各パスと再指摘プロトコル文言（読み直し・不十分理由明示・全量列挙維持）が含まれる

---

### TC-026: SpecReviewStep.buildMessage — priorRoundContext absent → message に注入ブロックが含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: spec-review message テンプレートに前周 context ブロックを配線する > Acceptance Criteria

**GIVEN** `deps.dynamicContext.priorRoundContext` が `undefined`
**WHEN** `SpecReviewStep.buildMessage(state, deps)` を呼ぶ
**THEN** message に `<prior-round-context>` タグが含まれない

---

### TC-027: {{PRIOR_ROUND_CONTEXT}} placeholder が message に literal で残らない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: spec-review message テンプレートに前周 context ブロックを配線する > Acceptance Criteria

**GIVEN** `priorRoundContext` あり・なしどちらかで `buildMessage` を呼ぶ
**WHEN** 返り値の message 文字列を確認する
**THEN** `"{{PRIOR_ROUND_CONTEXT}}"` の literal が message に残らない（置換済み）

---

### TC-028: 既存テスト（spec-review prompt / routing / finding-recency / step-context-builder）が無改変で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: エンドツーエンドの受け入れ基準を固定し既存テストの回帰を確認する > Acceptance Criteria

**GIVEN** 既存テストファイル（`spec-review-full-enumeration-prompt.test.ts` / `spec-review-fixer-routing.test.ts` / finding-recency 系 / `step-context-builder.test.ts`）を diff ゼロのまま
**WHEN** `typecheck && test` を実行する
**THEN** 既存テストが全て green であり typecheck も green

---

### TC-029: resolvePriorFixerOid — spec-fixer が複数回実行された場合、末尾（最新）の commitOid が参照される

**Category**: unit
**Priority**: should
**Source**: design.md > Risks（prior fixer OID の取り違え — spec-review ⇄ fixer ループで最新 fixer が対象）

**GIVEN** `state.steps[SPEC_FIXER]` に 2 つの StepRun があり先頭の `commitOid` が `"old"`, 末尾が `"latest"`
**WHEN** `resolvePriorFixerOid(state)` を呼ぶ
**THEN** `"latest"` を返す（先頭の `"old"` ではない）

---

### TC-030: managed runtime 相当（listCommitChangedFiles が unavailable）でも step が正常続行する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria（runtimeStrategy / listCommitChangedFiles 不在の managed 相当 fake）/ design.md > Risks

**GIVEN** `iteration = 2`、前周 fixer `commitOid` あり、`listCommitChangedFiles` が常に `{ kind: "unavailable" }` を返す managed 相当の fake `runtimeStrategy`
**WHEN** `derivePriorRoundContext` を呼ぶ
**THEN** `null` を返し、step は正常続行する（例外なし）

---

### TC-031: getLatestJudgeFindings が空配列を返す（前周が全 approve）でも changedFiles があれば注入する

**Category**: unit
**Priority**: should
**Source**: design.md > D5: findings は空配列でも changedFiles が導出できていれば注入する

**GIVEN** `iteration = 2`、`getLatestJudgeFindings` が `[]` を返す（前周が全 approve）、`listCommitChangedFiles` が `{ kind: "success", files: ["b.ts"] }` を返す
**WHEN** `derivePriorRoundContext` を呼ぶ
**THEN** `{ findings: [], changedFiles: ["b.ts"] }` を返す（`null` ではない）

---

## Result

```yaml
result: completed
total: 31
automated: 31
manual: 0
must: 24
should: 7
could: 0
blocked_reasons: []
```
