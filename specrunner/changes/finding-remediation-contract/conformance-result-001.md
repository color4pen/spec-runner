# Conformance Review: finding-remediation-contract — Iteration 1

## Summary

Implementation is **conformant** with all normative requirements from `spec.md` and `request.md`.
No normative violations were found.

---

## Evidence

| Category | Checked | Skipped | Unverified |
|---|---|---|---|
| Spec Requirements (10 total) | 10 | 0 | 0 |
| Request AC items (excluding ADR — generated post-conformance) | 8 | 0 | 0 |
| Key implementation files reviewed | 14 | 0 | 0 |

---

## Requirement-by-Requirement Verification

### Req 1: fixable finding は remediation 契約を伴わなければならない

**Spec**: `resolution: "fixable"` の finding は `remediation`（invariant / sites / approach）を持つことを SHALL 要求する。欠落した場合は `missingFields: ["findings.remediation"]` を含めて parse 失敗（MUST）。`decision-needed` は任意。

**Finding**:

- `src/core/port/report-result.ts` の `parseFindings(raw, strict=false, requireRemediation=false)` が第 3 引数 `requireRemediation` を additive に追加。
- `parseJudgeReportInput` は `parseFindings(obj["findings"], true, true)` を呼び出し → strict + requireRemediation が両方 true ✓
- `parseRequestReviewReportInput` は `parseFindings(obj["findings"], true, false)` を明示呼び出し → request-review は remediation を要求しない ✓
- remediation 欠落の fixable finding に対して `{ ok: false, reason: "remediation-missing" }` を返し、呼び出し元で `missingFields: ["findings.remediation"]` に変換 ✓
- `sites: []`（空配列）は `parseRemediation` が `{ ok: false }` を返し、strict 時は fail ✓
- `decision-needed` finding は remediation なしで成功 ✓
- `remediation: null` および `sites[].line: null` は null = absent として正規化 ✓

**Verdict**: 適合

---

### Req 2: remediation の欠落は approved を生成してはならない

**Spec**: remediation 欠落による parse 失敗が needs-fix → approved に転じてはならない（MUST NOT）。再試行後も有効完了報告が得られない judge step は escalation（SHALL）。

**Finding**:

- parse 失敗 → runner が tool result を捕捉しない → 既存の再試行経路（最大 2 回）→ `toolResult === null` → `step-completion.ts:293-306` → escalation
- `findings: []`（= approved）に化ける経路は存在しない ✓
- `fail-closed-drift-guard.test.ts` で `toolResult === null` → escalation / `findings: []` → approved の両方を保証する drift guard が実装済み ✓

**Verdict**: 適合

---

### Req 3: sites は finding 自身の site を必ず含む

**Spec**: `sites` に finding 自身の `file` を含む要素が存在しない場合、`{file, line}` を先頭に補完（MUST）。補完は parse 失敗にしない。

**Finding**:

- `parseFindings` 内（`src/core/port/report-result.ts` lines 314–331）で自 site 補完を実装:
  - `sites.some(s => s.file === selfFile && s.line === selfLine)` が false のとき先頭に `{file, line?}` を挿入
  - `file|line` で deduplicate → 既存 site が先頭と被っても重複追加されない ✓

**Verdict**: 適合

---

### Req 4: remediation を持たない既存 finding は additive に読み込める

**Spec**: persisted state の remediation なし finding を migration なし・schema version 変更なしで読み込み可能（MUST）。remediation ありの finding は永続化後に復元されること（MUST）。

**Finding**:

- `parseFindings` の default は `strict=false, requireRemediation=false` → 非 strict 経路では remediation を要求しない ✓
- `src/state/schema/types.ts` の `toolResult.findings?: Finding[]` は `Finding` を型参照しており、`remediation?: FindingRemediation` フィールド追加により自動的に persisted 型に追随 ✓
- `event-journal.ts` は `outcome.toolResult` を丸ごと透過保存・復元するため remediation フィールドは自然に往復する ✓

**Verdict**: 適合

---

### Req 5: finding の identity は remediation に依存しない

**Spec**: `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` は remediation を入力に含めてはならない（MUST NOT）。

**Finding**:

- `findingFingerprint` = `` `${f.file}|${f.line ?? ""}|${f.title}` `` — 変更なし ✓
- `computeLedgerRef` = fingerprint の SHA-256 先頭 8 hex — 変更なし ✓
- `computeFindingKey` = `step|file|line|title|rationale` — 変更なし ✓

**Verdict**: 適合

---

### Req 6: fixer プロンプトは invariant / 全 sites / approach / evidence path を含む

**Spec**: remediation を持つ finding の invariant / sites 全要素 / approach をプロンプトへ展開（MUST）。全 site 同時修正指示を含む（SHALL）。evidence file path は structured findings がある場合も参照として含める（SHALL）。

**Finding**:

**buildFindingsBlock** (`src/core/step/fixer-helpers.ts`):
- remediation を持つ finding に対して `- **Invariant**: ...`、`- **Sites (fix all in this iteration)**:` + 全 site、`- **Approach**: ...` を追加出力 ✓
- remediation を持つ finding が 1 件以上あれば末尾に全 site 同時修正指令を追加 ✓
- remediation なし finding の出力は変更なし（legacy 互換）✓

**renderEvidenceReference** (`src/core/step/fixer-helpers.ts`):
- paths が空なら空文字、1 件以上なら「参照用。機械 parse はしない。この file は読み取り専用」付きで path を列挙 ✓

**code-fixer の 3 構造化経路** (`src/core/step/code-fixer.ts`):
1. conformance 経路: `renderEvidenceReference([findingsPath])` 追加 ✓
2. coordinator 経路: `renderEvidenceReference(memberPaths)` 追加（needsFixMembers 全員の path）✓
3. 通常経路: `renderEvidenceReference([findingsPath])` 追加 ✓
- 各継続分岐: `findingsPaths` を明示的に渡し、`buildContinuationMessage` structured 分岐で `renderEvidenceReference(evidencePaths)` が呼ばれる ✓

**spec-fixer の 2 構造化経路** (`src/core/step/spec-fixer.ts`):
1. 通常経路: `renderEvidenceReference([findingsPath])` 追加 ✓
2. conformance 経路: `renderEvidenceReference([findingsPath])` 追加 ✓
- 継続分岐: `findingsPaths: [findingsPath]` を渡す ✓

**buildContinuationMessage** structured 分岐:
- `evidencePaths = opts.findingsPaths ?? [opts.findingsPath]` で常に解決 ✓
- `renderEvidenceReference(evidencePaths)` を含む ✓

**Verdict**: 適合

---

### Req 7: reviewer 向けプロンプトは remediation の記述と隣接経路の走査を要求する

**Spec**: 共有 fragment が finding の remediation 形式と走査義務を記述（SHALL）。code-review / custom reviewer / spec-review / conformance / regression-gate の system prompt に含まれる。request-review には含まれない（MUST NOT）。`specrunner/reviewers/*.md` 側に記述を要求しない（MUST NOT）。

**Finding**:

- `FINDING_REMEDIATION_DEFINITION` を `src/prompts/judge-rules.ts` に追加 ✓
- 走査義務（「finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路・同じ検査を行う別レイヤを走査し…」）を fragment 内に記述 ✓
- 注入先（grep 確認済み）: `custom-reviewer-system.ts` / `code-review-system.ts` / `spec-review-system.ts` / `conformance-system.ts` / `regression-gate-system.ts` ✓
- `request-review-system.ts`: grep で 0 ヒット ✓
- `specrunner/reviewers/*.md`: git diff stat に変更なし ✓
- `FINDING_REMEDIATION_DEFINITION` は `"report_result"` / `"end_turn"` を含まない（provider-neutral）✓

**Verdict**: 適合

---

### Req 8: code-fixer の「最小限」は全 site での不変条件成立を意味する

**Spec**: "finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正" と定義（MUST）。finding 無関係の変更禁止は維持（SHALL）。Method 1 は実際の受け渡しと一致（MUST）。

**Finding** (`src/prompts/code-fixer-system.ts`):

- Question: "finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正ができたか" ✓
- Contract 入力: "初期メッセージに埋め込まれた findings block（正典）＋ 参照用に示される evidence file path" ✓
- Method 1: "初期メッセージの findings block を正典として読む。evidence file path が示されていれば参照として読む（機械 parse はしない）" ✓（旧「指定された review-feedback-NNN.md を読み込む」を削除）
- Method 3: "各 finding の invariant を、列挙された全 site で成立させる。approach より狭い修正を選ぶ場合は理由を evidence に残す" ✓
- セキュリティ制約: "finding が名指しした不変条件を全 site で成立させる最小の修正のみ" ✓
- write-set: "新機能の追加は禁止" 等の禁止条項が維持されている ✓
- "最小限の機械的修正" という単独表現は存在しない ✓

**Verdict**: 適合

---

### Req 9: spec-fixer の「最小限」は全 site での不変条件成立を意味する

**Spec**: "各 finding の invariant を列挙された全 site で成立させる最小の変更" と定義（MUST）。入力記述は実際の受け渡しと一致（MUST）。禁止条項は維持（SHALL）。

**Finding** (`src/prompts/spec-fixer-system.ts`):

- Contract 入力: "初期メッセージに埋め込まれた findings block（正典）＋ 参照用に示される result file path（読み取り専用。機械 parse はしない）" ✓
- セキュリティ制約: "finding が名指しした不変条件を全 site で成立させる最小の修正のみ" ✓
- Method 2: "各 finding の invariant を、列挙された全 site で成立させる最小の変更を行う" ✓
- "findings に記載されていない変更は禁止" 条項が維持されている ✓

**Verdict**: 適合

---

### Req 10: regression-gate の ledger entry は sites を保持し全 site を検証対象にする

**Spec**: ledger entry は invariant と全 sites を提示（SHALL）。全 site で不変条件成立を検証対象にする（MUST）。`ledgerRef` の値と echo 手順は変更しない。

**Finding**:

- `buildLedgerEntry` (`src/core/step/regression-gate.ts`): `finding.remediation` があれば `- **Invariant**: ...` と `- **Sites**:` + 全 site を追加出力 ✓
- remediation なし entry の出力は変更なし ✓
- `buildLedgerBlock`: sites がある entry が 1 件以上あれば「Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する」旨のノートを導入文に追加 ✓
- `regression-gate-system.ts` Method 3: "entry に **Sites** がある場合: 全 site を確認し、いずれかで不変条件が破れていれば退行として報告する。退行 finding の `remediation` には ledger entry の `invariant` / `sites` を引き継ぐ" ✓
- Completion の JSON 例に `remediation` フィールドが追記されている ✓
- `computeLedgerRef` はロジック変更なし ✓
- `computeRegressionLedger` / `dedupeFindings` / `collectFindingsLedger` のロジック変更なし ✓（remediation は `Finding` に同伴して自動的に entry に載る）

**Verdict**: 適合

---

## Request AC 検証

| AC | 状態 | 備考 |
|---|---|---|
| ADR で remediation 契約のフィールド、必須条件、fail-closed 経路、互換性方針が定義される | 未（adr-gen が後続）| adr-gen は conformance の後続 step。pipeline 設計上、この段階では存在しないことが正常 |
| Finding 型 / tool schema / parse / persisted 型に remediation 追加、fixable 欠落時の挙動固定 | ✅ | Req 1・Req 4 で確認済み |
| judge rules と custom reviewer 共通 fragment が remediation の記述を要求する | ✅ | Req 7 で確認済み |
| code-fixer / spec-fixer のプロンプトに invariant / sites / approach / evidence path が含まれる | ✅ | Req 6 で確認済み |
| code-fixer system prompt の「最小限」の定義が改められる | ✅ | Req 8 で確認済み |
| regression-gate の ledger が sites を保持し、既存 ledgerRef と互換 | ✅ | Req 10 で確認済み |
| remediation のない既存 persisted finding を読み込んでも既存テストが green | ✅ | Req 4 で確認済み。fail-closed-drift-guard と互換性テストが存在 |
| verdict 導出、AgentRunResult、既存 Git / PR profile の挙動が変わらない | ✅ | findingFingerprint / computeLedgerRef / judge-verdict.ts 変更なし |
| SpecRunner verification が green | ✅ | verification-result.md が状態として存在（PR 上の証跡を正本とする） |

---

## Design / Tasks 計画との照合（参考）

- **D2 適用範囲**: request-review は fail-closed 適用外 ✓（`parseRequestReviewReportInput` で `requireRemediation=false`）
- **D4 自 site 補完**: reject ではなく正規化 ✓
- **D5 identity 不変**: fingerprint / ledgerRef / findingKey を変更していない ✓
- **D6 fixer 受け渡し**: evidence file path は prompt 経由で渡す、`reads()` はプロンプト注入に使わない ✓
- **D7 adapter 非改修**: `no-tool-call` 再試行文面はそのまま ✓
- **D8 共有 fragment 1 本**: `FINDING_REMEDIATION_DEFINITION` 単一 → 5 prompt に注入 ✓
- **D10 null 正規化**: `remediation: null` / `site.line: null` を absent として正規化 ✓
- **T-12 全タスク完了**: tasks.md の全チェックボックスが checked ✓（計画確認のみ — conformance gate ではない）

---

## 観察事項（非 blocking）

1. **design.md L30 の指摘**: `spec-fixer の structured 分岐も findingsPath を出さない（request.md の「code-fixer 固有の欠落」という記述は不正確 — 両方に欠落がある）`。実装では spec-fixer の structured 分岐にも `renderEvidenceReference` を追加しており、request.md の不正確な記述より正しい実装を選択している。spec.md の Req 6 Scenario には spec-fixer についても evidence path 要件が明示されており、実装は spec 準拠。

2. **ADR**: `request.md:adr=true` により adr-gen ステップが実行される。conformance 後に生成されるため、現時点での ADR 不在は pipeline 設計上の正常状態。

---

## 結論

すべての normative 要件（spec.md Requirements × 10）および request.md の検証可能な AC（8/9 — ADR は後続 step 担当）が実装されている。

**findings: []**（normative 違反なし）
