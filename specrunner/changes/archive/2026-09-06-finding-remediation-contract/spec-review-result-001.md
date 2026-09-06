# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/finding-remediation-contract/request.md` — 背景・設計要求・Acceptance Criteria を全文通読
- `specrunner/changes/finding-remediation-contract/design.md` — D1〜D10 全決定事項・リスク・Migration Plan・Open Questions を全文通読
- `specrunner/changes/finding-remediation-contract/spec.md` — 全 Requirement / Scenario を全文通読
- `specrunner/changes/finding-remediation-contract/tasks.md` — T-01〜T-12 全タスクを通読
- `specrunner/changes/finding-remediation-contract/test-cases.md` — 全 TC を通読

### 確認したソースファイル

| ファイル | 確認内容 |
|---|---|
| `src/kernel/report-result.ts` | `Finding` 型の現状（remediation フィールドなし）を確認。lines 40–99 |
| `src/core/step/report-tool.ts` | `findingSchema` / `conformanceFindingSchema` の現状を確認。lines 75–86, 153–165 |
| `src/core/port/report-result.ts` | `parseFindings(raw, strict=false)` の現シグネチャ（第 3 引数なし）を確認。lines 178–244。`parseJudgeReportInput`（line 348）、`parseCodeReviewReportInput`（lines 378–392）、`parseConformanceReportInput`（lines 422–428）、`parseRequestReviewReportInput`（lines 448–490）の実装と委譲構造を確認 |
| `src/core/step/fixer-helpers.ts` | `buildFindingsBlock`（lines 60–73）・`buildContinuationMessage`（lines 101–139）の現状を確認。structured 分岐に findingsPath が出ないことを確認 |
| `src/core/step/code-fixer.ts` | structured findings があるときに findingsPath をプロンプトに含めない 3 経路を確認。lines 200–284 |
| `src/core/step/spec-fixer.ts` | structured 分岐（lines 173–191）に findingsPath が含まれないことを確認（request.md の「code-fixer 固有の欠落」は不正確で両方に欠落あり — design が正確に訂正している） |
| `src/prompts/code-fixer-system.ts` | 「最小限の機械的修正」「指定された review-feedback-NNN.md を読み込む」の現状を確認。lines 1–65 |
| `src/core/pipeline/findings-ledger.ts` | `findingFingerprint`（line 180）、`computeLedgerRef`（lines 247–250）の実装を確認 |
| `src/core/decision/decision-ledger.ts` | `computeFindingKey`（lines 32–38）の実装を確認 |
| `src/core/step/regression-gate.ts` | `buildLedgerEntry`（lines 50–61）に sites 概念がないことを確認 |
| `src/core/step/step-completion.ts` | `toolResult === null` かつ `isJudgeStep` → `escalation`（lines 293–306）を確認。fail-closed 不変条件の根拠を検証 |
| `src/prompts/judge-rules.ts` | `FINDING_REMEDIATION_DEFINITION` が未定義であることを確認（lines 1–65） |

### 検証した設計上の主張

1. **fail-closed が approved を生成しない不変条件**: `step-completion.ts:295-299` で `isJudgeStep && toolResult === null → verdict = "escalation"` を確認。D3 の根拠が実装に裏付けられている。

2. **委譲構造による `requireRemediation` の伝播**: `parseCodeReviewReportInput`（line 381）と `parseConformanceReportInput`（line 425）がそれぞれ `parseJudgeReportInput` に委譲していることを確認。T-03 で `parseJudgeReportInput` を `parseFindings(obj.findings, true, true)` に変更すれば、委譲先の両関数に自動伝播する。

3. **identity 不変**: `findingFingerprint` = `file|line|title`、`computeLedgerRef` = その SHA-256 先頭 8 hex、`computeFindingKey` = `step|file|line|title|rationale`。いずれも remediation を含んでおらず、D5 の「identity を変えない」方針が実装と一致している。

4. **additive 読取の安全性**: `event-journal.ts` の `outcome.toolResult` は丸ごと透過保存・復元されるため（design 表より）、remediation は新規 job で自動的に永続化され、既存 job では不在のまま読める。型レベルの optional（`remediation?: FindingRemediation`）により既存 `Finding` 値がそのまま型検査を通る。

5. **`parseFindings` 既存呼び出し互換**: T-03 は `parseFindings(raw, strict=false, requireRemediation=false)` として第 3 引数を additive に追加する。`parseRequestReviewReportInput`（line 469）は現状 `parseFindings(obj["findings"], true)` — 第 3 引数なし = `false`。変更後も D2 の「request-review には適用外」が成立する。

6. **coordinator 経路の findingsPath 欠落**: `code-fixer.ts` lines 200–207 の structured 分岐が `findingsPath` を出力しないことを確認。T-06 で修正対象。

7. **spec-fixer の findingsPath 欠落**: `spec-fixer.ts` lines 173–191 の structured 分岐も同様。request.md の「code-fixer 固有の欠落」という記述は design が訂正済みで T-07 が対処している。

### ADR 要件の確認

request.md の `adr: true` によりパイプラインに adr-gen step が含まれる。design.md が D1〜D10 と Open Questions（Q1〜Q4）を詳細に記述しており、ADR 生成の素材として十分。Q1（必須化の適用範囲）は ADR での最終確定を明示しており、設計者の意図が明確。

### spec.md と design.md / tasks.md の整合性

- 全 Requirement の各 Scenario を design.md の該当 D-番号 および tasks.md の T-番号に追跡確認。
- spec.md の Requirement と tasks の間に主要な見落としは見つからない。
- 以下の 2 点は検証中に発見した不整合（詳細は Findings 詳細参照）。

---

## 検証できなかった項目

- `src/adapter/managed-agent/agent-runner.ts` / `src/adapter/codex/strict-schema.ts` の managed / codex runtime 側での schema 通過可否（D10 の「`toOpenAIStrictSchema` が remediation を nullable 化・再帰変換する」）は動的実行なしには検証できなかった。design で "Stop Condition 5 は発火しない" と述べられており、TC-T02-02 が変換を実行テストするため実装時の確認に委ねる。
- `src/prompts/spec-fixer-system.ts` の現状（T-08 変更対象）を読まなかった。ただし T-08 の Acceptance Criteria と TC-T08-03 が十分具体的なため実装判断に必要な情報は揃っている。
- `src/prompts/custom-reviewer-system.ts` / `code-review-system.ts` / `spec-review-system.ts` / `conformance-system.ts` / `regression-gate-system.ts` の現状を個別確認しなかった。ただし T-04 の注入先と AC が明示されているため、実装への影響は特定されている。

---

## Findings 詳細

### F-001: spec.md に spec-fixer system prompt 変更の Requirement が欠けている

**対象**: `specrunner/changes/finding-remediation-contract/spec.md`

spec.md の § "code-fixer の「最小限」は全 site での不変条件成立を意味する" には code-fixer の system prompt 変更を規定する 2 つの Scenario（code-fixer system prompt が全 site 成立を最小限の定義とする、code-fixer system prompt の入力記述が実際の受け渡しと一致する）がある。

しかし spec-fixer system prompt の同等の変更（T-08 で `SPEC_FIXER_SYSTEM_PROMPT` に全 site 成立の記述と findings-正典・result-file-参照の記述を追加）を対象とする Requirement が spec.md に存在しない。TC-T08-03（`SPEC_FIXER_SYSTEM_PROMPT` の assertion）と T-08 の AC（`SPEC_FIXER_SYSTEM_PROMPT` に全 site 成立記述が含まれる）は tasks.md にあるが、spec.md の形式的な要件として表現されていない。

影響: spec.md が不完全なため、spec-review ↔ spec-fixer のループで spec-fixer system prompt に関する回帰が検出されにくくなる。実装は T-08 で適切に規定されているため機能的な欠落は生じないが、spec.md の正典としての完全性が損なわれる。

### F-002: test-cases.md TC-T04-03 が buildCustomReviewerSystemPrompt の containment 検証を含めていない

**対象**: `specrunner/changes/finding-remediation-contract/test-cases.md`

TC-T04-03 は以下の 4 つの定数に対して `FINDING_REMEDIATION_DEFINITION` の full-text containment を検証する:
- `CODE_REVIEW_SYSTEM_PROMPT`
- `SPEC_REVIEW_SYSTEM_PROMPT`
- `CONFORMANCE_SYSTEM_PROMPT`
- `REGRESSION_GATE_SYSTEM_PROMPT`

一方 T-04 の Acceptance Criteria は `buildCustomReviewerSystemPrompt(anyDef)` を先頭に列挙しており、TC-T04-03 の対象に含まれていない。

TC-S-18（"custom reviewer の system prompt が remediation を要求する"）が custom reviewer プロンプトを別途カバーしているため実害は限定的だが、TC-T04-03 が T-04 の AC を完全に反映していない。実装者が TC-T04-03 のみを参照してテストを書いた場合、`buildCustomReviewerSystemPrompt` の containment チェックが漏れる。

### F-003: 非 strict モードで malformed remediation を持つ finding の silent-drop 挙動を確認するテストケースが欠如している

**対象**: `specrunner/changes/finding-remediation-contract/test-cases.md`

D3 と T-03 は以下の分岐を規定している:
- non-strict（persisted 読取）かつ remediation 不在 → finding を通常通り採用（remediation なし）
- non-strict かつ remediation が存在するが不正形 → silent-drop（finding は採用、remediation は不在）

TC-T03-03 は「non-strict + remediation 不在 → 成功」をカバーしている。しかし「non-strict + malformed remediation 存在（例: `sites: []` や `invariant: ""`）→ finding は採用されるが remediation は不在」の正常系 TC が存在しない。

この挙動は backward compat の中核的な保証（"persisted state / events に remediation のない finding が存在する。読取は additive に扱う"）に対応する non-strict 側の変形ケースである。TC が欠如しているため、実装者が誤って non-strict でも malformed remediation → finding 全体を reject する実装を書いた場合に検出できない。
