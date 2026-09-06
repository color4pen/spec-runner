# Conformance Result — Iteration 3

**Slug**: finding-remediation-contract
**Iteration**: 3
**Reviewer**: conformance (this step)

---

## Normative items verified

### Request Acceptance Criteria

| AC | Description | Status |
|----|-------------|--------|
| AC1 | ADR で remediation 契約のフィールド、必須条件、fail-closed 経路、互換性方針が定義される | ✅ PASS |
| AC2 | `Finding` 型 / tool schema / parse / persisted 型に remediation が追加され、fixable で欠落した場合の挙動が typed error または escalation として固定される | ✅ PASS |
| AC3 | judge rules と custom reviewer 共通 fragment が remediation の記述を要求する | ✅ PASS |
| AC4 | code-fixer / spec-fixer のプロンプトに invariant、sites 全列挙、approach、evidence file path が含まれる | ✅ PASS |
| AC5 | code-fixer system prompt の「最小限」の定義が「全 site で不変条件を成立させる最小の修正」に改められる | ✅ PASS |
| AC6 | regression-gate の ledger が sites を保持し、既存 `ledgerRef` と互換である | ✅ PASS |
| AC7 | remediation のない既存 persisted finding を読み込んでも既存テストが green | ✅ PASS |
| AC8 | verdict 導出、`AgentRunResult`、既存 Git / PR profile の挙動が変わらない | ✅ PASS |
| AC9 | SpecRunner verification が green（PR 上の既存証跡を正本） | ✅ PASS (verification-result.md 存在・green) |

---

## Spec Requirements — scenario-level verification

### Requirement: fixable finding は remediation 契約を伴わなければならない

**Evidence**:
- `src/core/port/report-result.ts`: `parseFindings(raw, strict = false, requireRemediation = false)` に第3引数追加。`parseJudgeReportInput` は `parseFindings(obj["findings"], true, true)` を呼び出す。
- fixable + remediation 欠落 → `{ ok: false, reason: "remediation-missing" }` → `missingFields: ["findings.remediation"]` を返す。
- `parseRequestReviewReportInput` は `parseFindings(obj["findings"], true, false)` — request-review は remediation 不要。
- `decision-needed` finding は remediation 不要（strict + requireRemediation でも `resolution !== "fixable"` の分岐でスキップ）。
- `sites: []` → `parseRemediation` が `{ ok: false }` → strict mode では `{ ok: false }` 返却 → parse 全体失敗。

**Scenario results**: 全 5 scenarios PASS

### Requirement: remediation の欠落は approved を生成してはならない

**Evidence**:
- `fail-closed-drift-guard.test.ts`: `toolResult === null` の judge step が `escalation` になり `approved` にならないことを drift-guard テストで固定。
- `parseJudgeReportInput` が `ok: false` を返すと runner は tool result を捕捉しない → 最大 2 回再試行 → `toolResult === null` → `step-completion.ts:293-306` で escalation。
- `findings: []` は `parseFindings` が `{ ok: true, value: [] }` を返すため approved 継続は壊れない。

**Scenario results**: 両 scenarios PASS

### Requirement: sites は finding 自身の site を必ず含む

**Evidence**:
- `parseFindings` 内の D4 正規化コード: `hasSelfSite` チェック → 欠落時は `{ file: selfFile, line: selfLine }` を先頭に挿入 → `file|line` で dedupe。
- テスト: 自 site 欠落時の補完、自 site 既存時の重複なし両ケースを `remediation-parse.test.ts` で検証。

**Scenario results**: 両 scenarios PASS

### Requirement: remediation を持たない既存 finding は additive に読み込める

**Evidence**:
- `parseFindings` のデフォルト引数: `strict = false, requireRemediation = false`。非 strict mode では remediation 不在でも `finding` を採用。
- `computeLedgerRef` は `findingFingerprint(f)` = `${f.file}|${f.line ?? ""}|${f.title}` のみ使用 — remediation を含めない。
- テスト: persisted backward compatibility ケースを `remediation-parse.test.ts` に個別 `it` として収録。

**Scenario results**: 両 scenarios PASS

### Requirement: finding の identity は remediation に依存しない

**Evidence**:
- `findingFingerprint(f)` = `${f.file}|${f.line ?? ""}|${f.title}` — remediation フィールド不使用（`findings-ledger.ts:179-181`）。
- `computeLedgerRef(f)` = SHA-256(`findingFingerprint(f)`) 先頭8hex — remediation 不使用（`findings-ledger.ts:307-310`）。
- `computeFindingKey(step, f)` = `step|file|line|title|rationale` — remediation 不使用（`decision-ledger.ts:32-38`）。

**Scenario results**: PASS

### Requirement: fixer プロンプトは invariant / 全 sites / approach / evidence path を含む

**Evidence**:
- `buildFindingsBlock` (`fixer-helpers.ts:64-92`): remediation を持つ finding に `**Invariant**` / `**Sites (fix all in this iteration)**` (全 site 列挙) / `**Approach**` を追加出力。ブロック末尾に全 site 同時修正指令。remediation なし finding の出力は不変。
- `renderEvidenceReference` (`fixer-helpers.ts:102-106`): paths を受け取り「参照用。機械 parse はしない。この file は読み取り専用 — 書き換えない」付きの参照ブロックを生成。
- `code-fixer.ts`: conformance 経路 / coordinator 経路 / 通常経路の3経路全てで `renderEvidenceReference(...)` 呼び出し確認。
- `spec-fixer.ts`: conformance structured 経路 / 通常 structured 経路の2経路で `renderEvidenceReference(...)` 呼び出し確認。
- `buildContinuationMessage` (`fixer-helpers.ts:134-182`): structured findings がある分岐で `renderEvidenceReference(evidencePaths)` を含める。`findingsPaths?` additive 追加済み。
- 再現 fixture テスト (`remediation-parse.test.ts`): `commit-push.ts:584` と `parallel-review-round.ts:401` の両 site が同時出現を assertion で検証。

**Scenario results**: 全 5 scenarios PASS

### Requirement: reviewer 向けプロンプトは remediation の記述と隣接経路の走査を要求する

**Evidence**:
- `FINDING_REMEDIATION_DEFINITION` を `judge-rules.ts:113-131` に追加。走査義務（隣接関数・並列経路・同じ検査を行う別レイヤ）を明記。`report_result` / `end_turn` の文字列を含まない（fragment coverage テスト制約クリア）。
- 注入先確認: `custom-reviewer-system.ts`, `code-review-system.ts`, `spec-review-system.ts`, `conformance-system.ts`, `regression-gate-system.ts` の全て。
- 非注入先確認: `request-review-system.ts` には注入なし（`grep` で 0 件）。
- `specrunner/reviewers/` 配下への変更なし（`git diff` 確認）。
- `fragment-coverage.test.ts`: 5 judge prompts が `FINDING_REMEDIATION_DEFINITION` を含むことを個別 `it` で検証。`request-review-system.ts` 非含有を検証。

**Scenario results**: 両 scenarios PASS

### Requirement: code-fixer の「最小限」は全 site での不変条件成立を意味する

**Evidence**:
- `code-fixer-system.ts` Question: `finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正ができたか`
- 「最小限の機械的修正」という単独表現は存在しない（grep 0 件）。
- Method 1: `初期メッセージの findings block を正典として読む。evidence file path が示されていれば参照として読む（機械 parse はしない）` — `review-feedback-NNN.md` を必ず読む前提の記述を削除済み。
- Method 3: `各 finding の invariant を、列挙された全 site で成立させる。approach より狭い修正を選ぶ場合は理由を evidence に残す`
- write-set: 新機能追加禁止 / 指摘外リファクタ禁止 条項を維持。

**Scenario results**: 両 scenarios PASS

### Requirement: spec-fixer の「最小限」は全 site での不変条件成立を意味する

**Evidence**:
- `spec-fixer-system.ts` Contract 入力: `初期メッセージに埋め込まれた findings block（正典）` / `参照用に示される result file path（読み取り専用。機械 parse はしない）`
- Method 1: `初期メッセージの findings block を正典として読む。result file path が示されていれば参照として読む（機械 parse はしない）`
- Method 2: `各 finding の invariant を、列挙された全 site で成立させる最小の変更を行う`
- write-set: `findings に記載されていない変更は禁止` 条項を維持。

**Scenario results**: 両 scenarios PASS

### Requirement: regression-gate の ledger entry は sites を保持し全 site を検証対象にする

**Evidence**:
- `buildLedgerEntry` (`regression-gate.ts:52-72`): remediation を持つ entry に `**Invariant**` と `**Sites**` (全列挙) を追加出力。remediation なし entry の出力は不変。Provenance Ref の位置・値は変更なし。
- `buildLedgerBlock` (`regression-gate.ts:80-90`): Sites がある entry が存在するとき `sitesNote` を追記 — 「Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する。いずれかで破れていれば退行として報告する。」
- `regression-gate-system.ts` Method 3: 「entry に **Sites** がある場合: 全 site を確認し、いずれかで不変条件が破れていれば退行として報告する。退行 finding の `remediation` には ledger entry の `invariant` / `sites` を引き継ぐ」
- `computeLedgerRef` は変更なし (= `findingFingerprint` の SHA-256 先頭8hex)。

**Scenario results**: 両 scenarios PASS

---

## Plan divergences (design / tasks)

設計・タスクからの逸脱は観察されなかった。

- `spec-fixer.ts` についての request.md の記述（「code-fixer 固有の欠落」）は design.md D6 で訂正済みで、実装はその訂正どおり spec-fixer の structured 経路にも evidence path を含めている（tasks T-07）。実装はこの訂正された設計に準拠している。
- D5 の `dedupeFindings` / `mergeRemediation` が設計通り実装されている（finding-ledger.ts:198-264）。
- tasks の checkbox は全て ✅ 完了状態。

---

## Evidence counts

- **checked**: 42 (normative items in request / spec verified against implementation)
- **skipped**: 0
- **unverified**: 0

---

## Verdict

No findings. All normative requirements are satisfied. Verdict: **approved**.
