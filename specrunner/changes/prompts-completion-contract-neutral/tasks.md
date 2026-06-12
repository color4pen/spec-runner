# Tasks: agent prompt の完了契約文言を provider 非依存にする

> 方針は design.md（D1–D5）を参照。完了機構名 `report_result` とターン語 `end_turn` を
> `src/prompts/` の共有 prompt 表層から排除し、中立表現に統一する。
> `src/adapter/` / `src/core/step/report-tool.ts` / `src/errors.ts` は **触らない**。

## 正準中立トークン（実装で固定する文字列）

以下を `src/prompts/fragments.ts` に定義し、各 prompt から参照する（T-01）。テストもこの定数を import して固定する。

- `COMPLETION_REPORT_LINE` = `作業が完了したら、完了結果を報告してください。`
- `COMPLETION_NO_EARLY_STOP_LINE` = `完了結果を報告せずに作業を終えないでください。`
- `COMPLETION_DIRECTIVE`（producer フッター。上記 2 行から合成して 1 文 1 ソースを保つ）:

  ```
  ## Completion

  作業が完了したら、完了結果を報告してください。
  - 正常完了: `{ok: true}`
  - 自発的失敗（実行不能等）: `{ok: false, reason: "理由"}`

  完了結果を報告せずに作業を終えないでください。
  ```

## 対象 prompt（14 ファイル）とテスト対象シンボル

| ファイル | exported シンボル（テスト対象） |
|----------|-------------------------------|
| design-system.ts | `DESIGN_SYSTEM_PROMPT`, `DESIGN_INITIAL_MESSAGE_TEMPLATE` |
| implementer-system.ts | `IMPLEMENTER_SYSTEM_PROMPT` |
| test-case-gen-system.ts | `TEST_CASE_GEN_SYSTEM_PROMPT`, `buildTestCaseGenInitialMessage(...)` |
| code-fixer-system.ts | `CODE_FIXER_SYSTEM_PROMPT` |
| build-fixer-system.ts | `BUILD_FIXER_SYSTEM_PROMPT` |
| spec-fixer-system.ts | `SPEC_FIXER_SYSTEM_PROMPT` |
| adr-gen-system.ts | `ADR_GEN_SYSTEM_PROMPT` |
| conformance-system.ts | `CONFORMANCE_SYSTEM_PROMPT` |
| code-review-system.ts | `CODE_REVIEW_SYSTEM_PROMPT` |
| spec-review-system.ts | `SPEC_REVIEW_SYSTEM_PROMPT`, `buildSpecReviewInitialMessage(...)` |
| regression-gate-system.ts | `REGRESSION_GATE_SYSTEM_PROMPT` |
| request-review-system.ts | `REQUEST_REVIEW_SYSTEM_PROMPT`, `buildRequestReviewInitialMessage(...)` |
| custom-reviewer-system.ts | `buildCustomReviewerSystemPrompt(snapshot)` |
| judge-rules.ts | `VERDICT_BLOCKING_RULES`（`PIPELINE_RULES` 経由で review 系へ展開） |

---

## T-01: 中立完了文言の定数を fragments.ts に追加する

- [x] `src/prompts/fragments.ts` に `COMPLETION_REPORT_LINE` / `COMPLETION_NO_EARLY_STOP_LINE` / `COMPLETION_DIRECTIVE` を export 定数として追加する（上記「正準中立トークン」の文字列で定義。`COMPLETION_DIRECTIVE` は 2 行定数から合成）
- [x] `COMPLETION_DIRECTIVE` 内に `report_result` / `end_turn` / `tool を呼び出して` / `turn を終了` が現れないこと

**Acceptance Criteria**:
- `fragments.ts` から 3 定数が export される
- `COMPLETION_DIRECTIVE` は `## Completion` 見出し・`{ok: true}` / `{ok: false, reason: "理由"}` の双方・`COMPLETION_REPORT_LINE` / `COMPLETION_NO_EARLY_STOP_LINE` を含む
- 3 定数いずれも `report_result` と `end_turn` を含まない

## T-02: producer 系 8 prompt のフッターを中立化する

対象: design / implementer / test-case-gen / code-fixer / build-fixer / spec-fixer / adr-gen / conformance。
8 ファイルの末尾フッターは現在いずれも以下で同一:

```
## Completion

作業完了時は必ず `report_result` tool を呼び出してください。
- 正常完了: `{ok: true}`
- 自発的失敗（実行不能等）: `{ok: false, reason: "理由"}`

tool を呼ばずに turn を終了しないでください。
```

- [x] 各ファイルの BASE 文字列末尾から上記フッターを除去し、`buildSystemPrompt(BASE, [...既存fragments, COMPLETION_DIRECTIVE])` の **最後の fragment** として `COMPLETION_DIRECTIVE` を append する（既存の `COMMIT_DISCIPLINE` / `PIPELINE_RULES` の後ろ）
- [x] `fragments.ts` から `COMPLETION_DIRECTIVE` を import する

**Acceptance Criteria**:
- 8 prompt の出力末尾に `COMPLETION_DIRECTIVE` が含まれる
- 8 prompt から `作業完了時は必ず` / `tool を呼び出して` / `tool を呼ばずに turn を終了` が消えている
- 既存 fragment（COMMIT_DISCIPLINE / PIPELINE_RULES）の内容・順序は維持される

## T-03: judge 系 4 prompt の完了文言を中立化する

対象: code-review / spec-review / regression-gate / custom-reviewer。findings ブロックは step 固有のため維持し、導入文と締め文のみ中立化する。

- [x] `## Completion` 直下の `作業完了時は必ず \`report_result\` tool を呼び出してください。` を `${COMPLETION_REPORT_LINE}` 参照に置換する
- [x] フッター末尾の `tool を呼ばずに turn を終了しないでください。` を `${COMPLETION_NO_EARLY_STOP_LINE}` 参照に置換する
- [x] regression-gate の本文 2 箇所も中立化する:
  - `You MUST call \`report_result\` before ending your turn.` → `You MUST report your completion result before finishing.`
  - `call \`report_result\` with \`ok: true, findings: []\` immediately.` → `report your completion result with \`ok: true, findings: []\` immediately.`
- [x] 各ファイルで `fragments.ts` から必要な定数を import する
- [x] findings JSON 形式・severity / resolution 定義・`DECISION_NEEDED_DEFINITION` / `OBSERVATION_DEFINITION` の参照は **変更しない**

**Acceptance Criteria**:
- 4 prompt の完了セクションに `COMPLETION_REPORT_LINE` と `COMPLETION_NO_EARLY_STOP_LINE` が含まれる
- 4 prompt から `report_result` が消えている（judge-rules 由来の `VERDICT_BLOCKING_RULES` は T-05 で中立化済みであること）
- findings 報告指示（`severity` / `resolution` / `findings`）は維持される

## T-04: request-review prompt と初期メッセージを中立化する

`request-review-system.ts` は producer/judge 共通フッターを持たないため個別に置換する。

- [x] system prompt 本文:
  - `Call report_result with { ok: true, verdict: ... }`（手順 5）→ `Report your completion result with { ok: true, verdict: ... }`
  - `After writing the result file, call \`report_result\` with the \`findings\` array:` → `After writing the result file, report your completion result with the \`findings\` array:`
  - `Do NOT end_turn until you have:` / `Called report_result with the findings array` → `Do NOT finish until you have:` / `Reported your completion result with the findings array`
- [x] `buildRequestReviewInitialMessage` 出力:
  - `6. Call report_result with { ok: true, verdict: ... }` → `6. Report your completion result with { ok: true, verdict: ... }`
  - `ファイルを worktree に書き出したら report_result を呼んで end_turn してください。` → `ファイルを worktree に書き出したら、完了結果を報告して作業を終えてください。`
- [x] JSDoc コメント（`calls the report_result tool to declare its verdict`）も整合のため `reports its completion result to declare its verdict` に更新する（モデル非提示のため任意だが一貫性のため実施）

**Acceptance Criteria**:
- `REQUEST_REVIEW_SYSTEM_PROMPT` と `buildRequestReviewInitialMessage(...)` 出力に `report_result` / `end_turn` が含まれない
- 完了報告（verdict + findings 配列）の指示は意味として維持される

## T-05: VERDICT_BLOCKING_RULES の完了機構参照を中立化する（意味は不変）

- [x] `src/prompts/judge-rules.ts` の `VERDICT_BLOCKING_RULES`:
  - `**Verdict blocking rules (derived by CLI from report_result findings)**:` → `**Verdict blocking rules (derived by CLI from the reported findings)**:`
  - `markdown の verdict 行と \`report_result\` findings が矛盾した場合、` → `markdown の verdict 行と報告された findings が矛盾した場合、`
- [x] blocking 判定行（`decision-needed` → `escalation`、`critical`/`high` → `needs-fix`、それ以外 → `approved`、`findings 由来の導出が優先`）は **一字も変えない**

**Acceptance Criteria**:
- `VERDICT_BLOCKING_RULES` に `report_result` が含まれない
- `VERDICT_BLOCKING_RULES` に `decision-needed` / `escalation` / `needs-fix` / `needs-discussion` / `findings 由来の導出が優先` が引き続き含まれる
- `DECISION_NEEDED_DEFINITION` / `OBSERVATION_DEFINITION` は無変更

## T-06: 残存する end_turn 用語をすべて中立化する

T-02〜T-04 で消えなかった `end_turn`（本文・チェックリスト・初期メッセージ）を中立語（`作業を終える` / `セッションを終了する` / `finish`）に置換する。意味は保持する。

- [x] `design-system.ts`: 本文・`## 完了条件`・`## Completion Checklist (MUST: end_turn 前に self-check)` 見出し・`session を終了（end_turn）`・各チェック項目、および `DESIGN_INITIAL_MESSAGE_TEMPLATE` の `Do not end_turn until all files are written.` を中立化する。line 57 は `\`report_result\` を ok:false + reason で呼んで報告し、end_turn すること。` を `完了結果を ok:false + reason で報告し、作業を終えること。` に置換する
- [x] `implementer-system.ts`: `実装が完了したら end_turn する` → `実装が完了したら作業を終える`
- [x] `code-fixer-system.ts` / `build-fixer-system.ts` / `spec-fixer-system.ts`: `修正が完了したら end_turn する` → `修正が完了したら作業を終える`
- [x] `adr-gen-system.ts`: `理由を述べて end_turn してください:` → `理由を述べて作業を終えてください:`
- [x] `test-case-gen-system.ts`: `Do NOT end_turn until the file is written` → `Do NOT finish until the file is written`、`buildTestCaseGenInitialMessage` 出力の `ファイルを worktree に書き出したら end_turn してください。` → `ファイルを worktree に書き出したら作業を終えてください。`
- [x] `spec-review-system.ts`: `Do NOT end_turn until the file is written` → `Do NOT finish until the file is written`、`buildSpecReviewInitialMessage` の `gitPushInstruction`（`ファイルを worktree に書き出したら end_turn してください。`）を中立化する

**Acceptance Criteria**:
- T-02 表の全 exported シンボル（system prompt 定数・template・builder 出力）に `end_turn` が含まれない
- 各置換は元の意味（「全ファイル生成まで終わるな」「完了したら終える」等）を保持する
- Claude SDK の `stop_reason: "end_turn"`（`src/adapter/` 配下）は **変更しない**

## T-07: fragment-coverage テストに neutrality 断言を追加する

- [x] `src/prompts/__tests__/fragment-coverage.test.ts` に describe ブロックを追加し、14 ファイル表の全 exported シンボル（system prompt 定数 + `buildCustomReviewerSystemPrompt(makeMinimalReviewerSnapshot())` + 4 つの初期メッセージ template / builder 出力）について以下を断言する:
  - `report_result` を含まない（`not.toContain("report_result")`）
  - `end_turn` を含まない（`not.toContain("end_turn")`）
  - 旧導入文 `作業完了時は必ず` と旧締め文 `tool を呼ばずに turn を終了` を含まない
- [x] producer 系 8 prompt が `COMPLETION_DIRECTIVE` を含むことを断言する
- [x] judge 系 4 prompt が `COMPLETION_REPORT_LINE` と `COMPLETION_NO_EARLY_STOP_LINE` を含むことを断言する
- [x] `VERDICT_BLOCKING_RULES` が `report_result` を含まないことを断言する（既存の content 断言は維持）

**Acceptance Criteria**:
- 追加テストが green
- 対象 prompt のいずれかに `report_result` / `end_turn` を再混入させると当該テストが fail する（neutrality を機械固定できている）

## T-08: 既存 prompt テストを中立文言に追従させる

- [x] `src/prompts/__tests__/custom-reviewer-system.test.ts` の `it("contains report_result tool requirement")`（`expect(prompt).toContain("report_result")`）を、中立完了文言の存在断言に更新する（例: `COMPLETION_REPORT_LINE` または `COMPLETION_NO_EARLY_STOP_LINE` を `toContain`）。テスト名も実態に合わせて更新する
- [x] このテストファイルの他の断言（VERDICT_BLOCKING_RULES / read-only reviewer / severity / resolution / slot 注入）は変更しない

**Acceptance Criteria**:
- `custom-reviewer-system.test.ts` が green
- claude-code **runtime** テスト（`src/adapter/claude-code/__tests__/transient-error.test.ts` の `Agent did not call report_result` 断言、`agent-runner-transient-retry.test.ts` / `agent-redirect-integration.test.ts` の `stop_reason: "end_turn"`）は **無変更**

## T-09: 検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] claude-code 経路の既存 runtime テストが **無変更**で green であることを確認する（diff に `src/adapter/claude-code/__tests__/` の変更が含まれないこと）

**Acceptance Criteria**:
- `typecheck && test` が green
- `src/adapter/` / `src/core/step/report-tool.ts` / `src/errors.ts` に差分がない
- 受け入れ基準（design.md Goals）3 点をすべて満たす
