# Tasks: reviewer finding remediation contract

実装順は T-01 → T-12。T-01〜T-03 が契約の土台、T-04 が reviewer 側、T-05〜T-08 が fixer 側、
T-09 が regression-gate、T-10〜T-12 がテストと検証。

## T-01: `Finding` に remediation 契約を追加する

- [x] `src/kernel/report-result.ts` に `RemediationSite { file: string; line?: number }` を追加する（worktree-relative path、意味は既存 `Finding.file` / `Finding.line` と同一である旨を doc comment に書く）
- [x] `src/kernel/report-result.ts` に `FindingRemediation { invariant: string; sites: RemediationSite[]; approach: string }` を追加する
- [x] `Finding` に `remediation?: FindingRemediation` を追加する。doc comment に「`resolution: "fixable"` の live tool call では必須（強制は parse 層）／persisted な旧 finding では不在が正常」「identity（fingerprint / ledgerRef / findingKey）には寄与しない」を明記する
- [x] `src/core/port/report-result.ts` の型 re-export（`Finding` / `DecisionOption` と同じ行）に `FindingRemediation` / `RemediationSite` を追加する
- [x] `src/state/schema/types.ts` / `src/state/helpers.ts` の `toolResult` 型が `Finding` を型参照していること（= 追加作業不要であること）を確認し、必要ならコメントで追随根拠を残す

**Acceptance Criteria**:
- `bun run typecheck` が green
- `FindingRemediation` / `RemediationSite` が `src/kernel/report-result.ts` から export され、`src/core/port/report-result.ts` からも import 可能
- `Finding` の既存フィールドの型・optionality が 1 つも変わっていない

## T-02: report tool schema と description に remediation を追加する

- [x] `src/core/step/report-tool.ts` に `remediationSchema = object({ invariant: string(), sites: array(object({ file: string(), line: optional(number()) })), approach: string() })` を追加する
- [x] `findingSchema` に `remediation: optional(remediationSchema)` を追加する（REQUEST_REVIEW と共有されるため optional のままにする）
- [x] `conformanceFindingSchema` にも同じフィールドを追加する
- [x] `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` の description に remediation の形式と「`resolution: "fixable"` では必須。sites には同じ不変条件を共有する全経路を列挙する」旨を追記する
- [x] `REQUEST_REVIEW_REPORT_TOOL` の description は変更しない（remediation を要求しない — design D2）

**Acceptance Criteria**:
- `toCustomToolSpec(JUDGE_REPORT_TOOL)` の `input_schema` に `findings[].remediation`（`invariant` / `sites[].file` / `sites[].line` / `approach`）が現れる
- `toOpenAIStrictSchema(toJSONSchema(object(JUDGE_REPORT_TOOL.zodSchema)))` が例外なく変換され、`remediation` が nullable 化され、`sites` の items が再帰変換されている
- `REQUEST_REVIEW_REPORT_TOOL.description` が変更前と同一文字列
- 既存の `src/core/step/__tests__/report-tool-evidence-schema.test.ts` が green

## T-03: parse 層で remediation を検証・正規化する

- [x] `src/core/port/report-result.ts` に `parseRemediation(raw): { ok: true; value: FindingRemediation } | { ok: false }` を追加する
  - `null` / `undefined` は「不在」として扱い、呼び出し側が判断する（`{ ok: false }` と区別できるよう、不在判定は呼び出し側で行う）
  - `invariant` / `approach` は非空文字列（trim 後）でなければ不正
  - `sites` は配列かつ 1 件以上。各要素は `file` が非空文字列、`line` は number / 不在 / null（null は不在に正規化）
- [x] `parseFindings` の signature を `parseFindings(raw, strict = false, requireRemediation = false)` に拡張する。戻り値の失敗形を `{ ok: false; reason?: "remediation-missing" }` に拡張する（既存呼び出し側は変更不要）
- [x] 検証規則を実装する:
  - `remediation` が存在して不正形 → `{ ok: false }`（resolution を問わない）
  - `strict && requireRemediation && resolution === "fixable"` かつ remediation 不在 → `{ ok: false, reason: "remediation-missing" }`
  - それ以外で整形式なら `finding.remediation` に設定、不正形かつ非 strict なら silent-drop（`options` と同じ扱い）
- [x] 自 site 正規化（design D4）: 採用した remediation の `sites` に `site.file === finding.file` の要素が無い場合、`{ file: finding.file, line: finding.line }` を先頭に挿入する。`file|line` で重複排除する
- [x] `parseJudgeReportInput` を `parseFindings(obj["findings"], true, true)` に変更し、`reason === "remediation-missing"` のときのみ `missingFields: ["findings.remediation"]`、それ以外は従来どおり `["findings"]` を返す
- [x] `parseCodeReviewReportInput` / `parseConformanceReportInput` は `parseJudgeReportInput` 委譲のままで要求が伝播することを確認する
- [x] `parseRequestReviewReportInput` は `parseFindings(obj["findings"], true, false)` に明示変更する（挙動不変、意図を明示）

**Acceptance Criteria**:
- `parseJudgeReportInput({ok:true, evidence, findings:[fixable without remediation]})` が `{ ok: false, missingFields: ["findings.remediation"] }` を返す
- `parseJudgeReportInput` が decision-needed（options 2 件）＋ remediation なしで成功する
- `parseFindings(persistedFindingsWithoutRemediation)`（引数なし = 非 strict）が成功する
- `sites: []` / `invariant: ""` / `approach: ""` / `sites: [{file: ""}]` がいずれも parse 失敗になる
- `remediation: null` / `sites[].line: null` が絶対に例外を投げず、null が「不在」として正規化される
- `parseRequestReviewReportInput` は fixable + remediation なしで成功する

## T-04: judge contract fragment を追加し reviewer prompt に注入する

- [x] `src/prompts/judge-rules.ts` に `FINDING_REMEDIATION_DEFINITION` を追加する。内容:
  - 形式（`remediation: { invariant, sites: [{file, line?}], approach }`）と `resolution: "fixable"` での必須条件
  - 走査義務: 「finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路・同じ検査を行う別レイヤを走査し、成立していない箇所をすべて sites に列挙する」
  - 「sites には finding 自身の file:line を含める」「1 site しかない場合は、走査したうえで 1 件である旨を rationale か evidence file に記す」
  - 実例（同一不変条件を共有する 2 site を列挙した最小例）
  - provider-neutral（`report_result` / `end_turn` の文字列を含めない — 既存 fragment coverage テストの制約）
- [x] `src/prompts/custom-reviewer-system.ts` の Completion に `${FINDING_REMEDIATION_DEFINITION}` を注入し、finding の JSON 例に `remediation` を追記する
- [x] `src/prompts/code-review-system.ts` に同様の注入と JSON 例更新を行う
- [x] `src/prompts/spec-review-system.ts` に同様の注入と JSON 例更新を行う（sites は spec.md / design.md / tasks.md 上の箇所を指す旨を fragment 側の一般記述で賄う）
- [x] `src/prompts/conformance-system.ts` の Resolution 定義付近に注入する
- [x] `src/prompts/regression-gate-system.ts` に注入し、退行 finding の JSON 例に `remediation` を追記する（ledger entry の invariant / sites を引き継ぐ旨も記述）
- [x] `src/prompts/request-review-system.ts` は変更しない
- [x] `specrunner/reviewers/*.md` は変更しない（reviewer 定義側に記述を要求しない）

**Acceptance Criteria**:
- `buildCustomReviewerSystemPrompt(anyDef)` / `CODE_REVIEW_SYSTEM_PROMPT` / `SPEC_REVIEW_SYSTEM_PROMPT` / `CONFORMANCE_SYSTEM_PROMPT` / `REGRESSION_GATE_SYSTEM_PROMPT` が `FINDING_REMEDIATION_DEFINITION` を全文含む
- `REQUEST_REVIEW_SYSTEM_PROMPT` は `FINDING_REMEDIATION_DEFINITION` を含まない
- `FINDING_REMEDIATION_DEFINITION` は `report_result` / `end_turn` を含まない
- `specrunner/reviewers/` 配下に diff が無い
- 既存の `src/prompts/__tests__/fragment-coverage.test.ts` / `prompt-skeleton-drift-guard.test.ts` が green

## T-05: `buildFindingsBlock` と継続プロンプトを remediation 対応にする

- [x] `src/core/step/fixer-helpers.ts` の `buildFindingsBlock` に、remediation を持つ finding のみ以下を追加出力する:
  - `- **Invariant**: <invariant>`
  - `- **Sites (fix all in this iteration)**:` と、その下に `  - <file>:<line>`（line 不在時は `<file>`）を sites の件数ぶん
  - `- **Approach**: <approach>`
- [x] remediation を持たない finding の出力は 1 文字も変えない（legacy 互換）
- [x] ブロック内に remediation を持つ finding が 1 件以上ある場合のみ、ブロック末尾に全 site 同時修正指令を追加する:
  「列挙された全 site を同一イテレーションで修正すること。approach より狭い修正を選ぶ場合は、その理由を出力（evidence）に残すこと。」
- [x] `src/core/step/fixer-helpers.ts` に `renderEvidenceReference(paths: string[]): string` を追加する（0 件なら空文字。1 件以上なら「参照用。機械 parse はしない」旨を添えて path を列挙）
- [x] `buildContinuationMessage` の structured findings 分岐に `renderEvidenceReference([opts.findingsPath])` を挿入する（fallback 分岐は現状維持）
- [x] `buildContinuationMessage` の opts に複数 path を渡せるよう `findingsPaths?: string[]` を additive に追加し、未指定時は `[findingsPath]` にフォールバックする

**Acceptance Criteria**:
- remediation 付き finding 1 件を渡すと、ブロックに invariant / 全 site / approach / 全 site 同時修正指令が現れる
- remediation なし finding 1 件のみを渡したときのブロック文字列が、変更前の実装と完全一致する（既存 `fixer-reviewer.test.ts` が無改変で green）
- `buildContinuationMessage` の structured 分岐の出力に findings path が含まれる
- `renderEvidenceReference([])` が空文字を返す

## T-06: code-fixer の全 structured 経路に evidence path を含める

- [x] `src/core/step/code-fixer.ts` の conformance 経路（structured 分岐）に conformance result path の evidence 参照を追加する
- [x] coordinator 経路（`isCoordinatorLoopActive` かつ aggregatedFindings > 0）に、needs-fix member **全員**の result path を列挙した evidence 参照を追加する
- [x] 通常経路（structured findings あり）に active reviewer の result path の evidence 参照を追加する
- [x] 各経路の継続分岐（`buildContinuationMessage` 呼び出し）に、coordinator 経路では member 全員の path を `findingsPaths` として渡す
- [x] 既存 fallback 経路（findings 空）の文言は変更しない
- [x] 「Do NOT modify the review-feedback file itself」に相当する制約が structured 経路にも効くよう、evidence 参照文言に「この file は読み取り専用。書き換えない」を含める

**Acceptance Criteria**:
- structured findings がある 3 経路すべてで、`buildMessage` の戻り値に対応する result file path が含まれる
- coordinator 経路で needs-fix member が 2 件のとき、両方の result path が現れる
- findings 空の fallback 経路の出力文字列が変更前と一致する
- `src/core/step/__tests__/fixer-reviewer.test.ts` / `fixer-push-capability.test.ts` が green

## T-07: spec-fixer の structured 経路に evidence path を含める

- [x] `src/core/step/spec-fixer.ts` の通常 structured 分岐に spec-review result path の evidence 参照を追加する
- [x] conformance structured 分岐に conformance result path の evidence 参照を追加する
- [x] 継続分岐（`buildContinuationMessage`）は T-05 の変更により path を含むことを確認する
- [x] fallback（`buildSpecFixerInitialMessage`）は変更しない

**Acceptance Criteria**:
- spec-fixer の structured 分岐 2 経路の戻り値に対応する result file path が含まれる
- fallback 経路の出力文字列が変更前と一致する

## T-08: fixer system prompt の「最小限」定義と入力記述を改める

- [x] `src/prompts/code-fixer-system.ts`:
  - Question / 役割記述の「最小限の修正」を「finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正」に改める
  - Contract の **入力** を「初期メッセージに埋め込まれた findings（正典）＋ 参照用に示される evidence file path」に改める（`review-feedback-NNN.md` を必ず読む前提の記述を削除）
  - Method 1 を「初期メッセージの findings block を正典として読む。evidence file path が示されていれば参照として読む（機械 parse はしない）」に改める
  - Method 3 の「各 finding を最小限の機械的修正で解消する」を「各 finding の invariant を、列挙された全 site で成立させる。approach より狭い修正を選ぶ場合は理由を evidence に残す」に改める
  - write-set の禁止条項（新機能追加・指摘外の大規模リファクタ・設計判断・console.log・git 操作）は維持する
  - セキュリティ制約の役割記述も新しい「最小限」の定義に合わせる
  - step 固有 evidence 要求に「修正した site を全列挙する」「approach より狭い修正を選んだ場合はその理由」を追加する
- [x] `src/prompts/spec-fixer-system.ts`:
  - Contract 入力に「初期メッセージの findings が正典、result file path は参照」を追記する
  - Method 2 を「各 finding の invariant を、列挙された全 site で成立させる最小の変更を行う」に改める
  - 「findings に記載されていない変更は禁止」条項は維持する

**Acceptance Criteria**:
- `CODE_FIXER_SYSTEM_PROMPT` に「最小限の機械的修正」という単独表現が存在しない
- `CODE_FIXER_SYSTEM_PROMPT` に全 site での不変条件成立を指す定義が含まれ、かつ「新機能の追加は禁止」条項が残っている
- `CODE_FIXER_SYSTEM_PROMPT` の Method 1 が「指定された review-feedback-NNN.md を読み込む」ではなくなっている
- `SPEC_FIXER_SYSTEM_PROMPT` に全 site 成立の記述が含まれる
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`（5 セクション構成 / COVERAGE_GATE_INTEGRITY 共有 / write-set 宣言）が green

## T-09: regression-gate の ledger entry と prompt に sites を載せる

- [x] `src/core/step/regression-gate.ts` の `buildLedgerEntry` に、remediation を持つ entry のみ `- **Invariant**:` と `- **Sites**:`（全列挙）を追加する。Provenance Ref 行の位置と値は変更しない
- [x] remediation を持たない entry の出力は変更しない
- [x] `buildLedgerBlock` の導入文に「Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する」旨を追加する
- [x] `src/prompts/regression-gate-system.ts` の Method に「entry に Sites がある場合、全 site を確認し、いずれかで破れていれば退行として報告する」「退行 finding の remediation には ledger entry の invariant / sites を引き継ぐ」を追加する
- [x] `computeRegressionLedger` / `collectFindingsLedger` / `collectSpecReviewLedger` / `dedupeFindings` / `findingFingerprint` / `computeLedgerRef` のロジックは変更しない（remediation は `Finding` に同伴して自動的に entry に載る）

**Acceptance Criteria**:
- remediation 付き finding が ledger に載ったとき、`buildMessage` の出力に invariant と全 site が現れる
- 同じ finding の `computeLedgerRef` が remediation の有無で不変
- remediation なし finding のみの ledger block 出力が変更前と一致する
- `src/core/pipeline/__tests__/findings-ledger.test.ts` / `src/core/step/__tests__/regression-gate-step.test.ts` が green

## T-10: 契約・互換性・fail-closed のテストを追加する

- [x] parse テスト（`src/core/port/__tests__/` に新規ファイル）: remediation あり / なし（fixable）/ なし（decision-needed）/ sites 空 / 不正形 / `null` / `sites[].line: null` / 自 site 補完（欠落時・既存時）/ request-review 適用外
- [x] fail-closed drift guard（`src/core/step/__tests__/`）: `toolResult === null` の judge step が `escalation` になり `approved` にならないこと、および `findings: []` は従来どおり `approved` になること
- [x] 互換性テスト: remediation を持たない persisted finding fixture から `computeRegressionLedger` / `dedupeFindings` / `buildProvenanceIndex` が従来どおり動作すること
- [x] 永続化ラウンドトリップ: remediation 付き finding を含む toolResult を state に記録 → event journal fold で復元 → remediation が同一であること
- [x] identity テスト: remediation の有無で `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` が不変であること
- [x] 再現 fixture: `cross-boundary-invariants-result-002` の F-001 を remediation 付き finding として表現したテスト fixture を作り（invariant = 「exclusion filter より前に全 changed path に write-scope 検査を適用する」、sites = `src/core/step/commit-push.ts:584` と `src/core/pipeline/parallel-review-round.ts:401`、approach = evidence file の推奨）、code-fixer の `buildMessage` 出力に **両 site が同時に現れる**ことを assertion で検証する
- [x] prompt テスト（snapshot ではなく assertion）: `buildFindingsBlock` の invariant / sites / approach / 全 site 指令、code-fixer / spec-fixer `buildMessage` の evidence path

**Acceptance Criteria**:
- 上記すべてのケースが個別の `it` として存在し green
- 再現 fixture テストが `commit-push.ts` と `parallel-review-round.ts` の両文字列の同時出現を検証している
- fail-closed drift guard が「remediation 欠落 → approved」を検出したら fail する形になっている

## T-11: 既存テスト・fixture の追随更新

- [x] `parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseConformanceReportInput` に fixable finding を渡している既存テストを洗い出し（`src/core/port/__tests__/`, `tests/unit/core/port/`, `src/core/step/__tests__/judge-verdict.test.ts`, `tests/spec-review-step.test.ts`, `tests/adapter/codex/strict-schema.test.ts`, `src/adapter/codex/__tests__/agent-runner-completion-report.test.ts` ほか）、remediation を追加するか、非 strict 経路であることを確認する
- [x] 非 strict（persisted 読取）を模したテストには remediation を**追加しない**（互換性の証拠として残す）
- [x] 更新したテスト数と、remediation なし fixture を読むテスト数を数えて記録する（PR 実測値）

**Acceptance Criteria**:
- `bun run test` が green
- remediation を持たない persisted finding を扱うテストが 1 件以上残っており、それが green

## T-12: 検証と PR 実測値の計測

- [x] `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` を実行し green を確認する
- [x] PR 本文用の実測値を収集する:
  - 変更した schema / parse / prompt / ledger のファイル数と行数（`git diff --stat` から）
  - remediation を要求する reviewer / judge step の数（judge rules fragment を注入した prompt の数 + `specrunner/reviewers/` の定義数）
  - fixer プロンプトに追加された行数（finding 1 件・sites 2 件のときの実測）
  - 追加・変更したテスト数
  - 既存 persisted finding fixture（remediation なし）の読込テスト数
- [x] 計測結果を `specrunner/changes/finding-remediation-contract/` 配下の作業メモまたは PR 本文素材として残す

**Acceptance Criteria**:
- 4 コマンドすべて exit 0
- 上記 5 項目の実測値がすべて数値として揃っている
- verdict 導出 / `AgentRunResult` / Git・PR profile に関する既存テストが 1 件も変更されていない
