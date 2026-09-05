# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. 背景：コードアサーションの事実確認

**`src/core/step/fixer-helpers.ts` — `buildFindingsBlock`**
- 確認: 関数は `severity/title（ヘッダ）`・`file:line`・`resolution`・`rationale`・`source` の5フィールドを出力（空行含め6要素）
- evidence file の内容・パスは含まない。CONFIRMED

**`src/core/step/code-fixer.ts` — `buildMessage`**
- 確認: structured findings が存在するとき（line 267 `if (findings && findings.length > 0)`）、`findingsBlock` を埋め込むが `findingsPath` をプロンプトに含めない（lines 269–284）
- `findingsPath` が現れるのはフォールバック経路（lines 288–303）のみ。CONFIRMED
- `buildContinuationMessage` も同様：structured findings 分岐（fixer-helpers.ts lines 115–127）に `findingsPath` なし。CONFIRMED
- `reads()` は `IoRef[]` を返し executor の入力存在検証に使用され、プロンプト注入ではない。CONFIRMED

**`src/prompts/code-fixer-system.ts` — Method 1 不一致**
- Contract セクション: `入力: specrunner/changes/<slug>/review-feedback-NNN.md`
- Method 1: 「指定された review-feedback-NNN.md を読み込む」
- しかし structured findings 分岐では user prompt にファイルパスが含まれない → 指示が成立しない。CONFIRMED

**`src/kernel/report-result.ts` — `Finding` 型**
- フィールド: `severity / resolution / file / line? / title / rationale / fixTarget? / options? / origin? / fileMissing? / ledgerRef?`
- `remediation` フィールドなし。CONFIRMED

**`src/core/step/report-tool.ts` — `findingSchema`**
- `findingSchema` (lines 75–86): severity/resolution/file/line?/title/rationale/options?/origin?/fileMissing?/ledgerRef?
- `remediation` なし。CONFIRMED

**`src/core/port/report-result.ts` — `parseFindings`**
- `parseFindings(raw, strict)` は `remediation` フィールドを読まない。CONFIRMED
- `strict=true` 時は `decision-needed` の options ≥ 2 を強制するが、remediation バリデーションはなし。CONFIRMED

**`src/state/schema/types.ts` — persisted 型**
- `toolResult` の型: `BaseReportResult & { findings?: Finding[] ... }` — `Finding` は `../../kernel/report-result.js` からインポート
- persisted 型が kernel 層の `Finding` を共有。CONFIRMED

**`src/core/pipeline/findings-ledger.ts` — fingerprint / ledgerRef**
- `findingFingerprint`: `` `${f.file}|${f.line ?? ""}|${f.title}` `` (line 180)
- `computeLedgerRef`: fingerprint を SHA-256 して先頭 8 hex 文字 (lines 247–250)
- `sites` フィールドは存在しない。CONFIRMED

**`src/prompts/judge-rules.ts`**
- finding 形式の定義なし（SEVERITY_DEFINITION / VERDICT_BLOCKING_RULES 等のみ）
- `remediation` への言及なし。CONFIRMED

**`src/prompts/custom-reviewer-system.ts` — finding フォーマット**
- Completion セクション (lines 84–94): finding JSON に severity/resolution/file/line?/title/rationale のみ
- `remediation` なし。CONFIRMED

**`code-fixer-system.ts` — 「最小限」定義**
- 「指摘事項の最小限修正のみ」（セキュリティ制約）、「各 finding を最小限の機械的修正で解消する」（Method 3）。CONFIRMED

### 2. 背景：archive evidence の事実確認

- `specrunner/changes/archive/2026-08-29-exclusion-aware-publish-prediction/`: cross-boundary-invariants-result-001〜005 が存在（5 iterations）。CONFIRMED
- `specrunner/changes/archive/2026-08-23-push-capability-preflight/`: cross-boundary-invariants-result-001〜006 が存在（6 iterations）。CONFIRMED
- `cross-boundary-invariants-result-002.md` を通読: reviewer が「保護 canon より広い不変条件」「commit-push.ts と parallel-review-round.ts の両サイト」を明記しているが、fixer prompt は rationale の 2 文のみを受け取る構造を確認。CONFIRMED

### 3. 設計要求の検証

- 設計要求 §1（Finding 型拡張）: 必須ファイル群（kernel/report-result.ts / report-tool.ts / port/report-result.ts / state/schema/types.ts）の列挙は正確。追加で設計要求に含まれていない `src/state/schema/operations.ts` にも `Finding` 関連の schema validation がある可能性があるが、同ファイルに直接 Finding フィールドを定義していないことを確認（imports only）。非ブロッカー。
- 設計要求 §2（reviewer 側）: custom-reviewer-system.ts 側で統一的に扱う設計は実装可能。
- 設計要求 §3（fixer 側）: 下記「検証できなかった項目」参照。
- 設計要求 §4（ledger 側）: `findingFingerprint` / `computeLedgerRef` の互換性維持は feasible。
- 設計要求 §5（互換性）: `parseFindings` に `strict` flag の仕組みが既にあり、additive 読取は feasible。

### 4. Acceptance Criteria の検証

- ADR 宣言（`adr: true`）あり、adr-gen が処理する。CONFIRMED
- AC に「code-fixer / spec-fixer のプロンプトに evidencefilepath が含まれる」があり、両 fixer が対象に含まれている。CONFIRMED

## 検証できなかった項目

- `src/state/schema/operations.ts` の内容（Finding を直接扱う関数があるかどうか）— 影響が小さいため優先度低
- archive の state.json に記録された実際の persisted rationale 文字列（request の引用文字列の exact match）— 文書上の主張であり、コード診断には影響しない

## Findings 詳細

### Finding F-001: §3 「spec-fixer 固有でない欠落」のコードアサーション誤り

設計要求 §3 は「spec-fixer の通常経路は既に path を含めており、この点は code-fixer 固有の欠落である」と述べている。

しかしコードを確認した結果、spec-fixer.ts (lines 173–190) も structured findings が存在する場合に `findingsPath` をプロンプトに含めない。含まれるのは `buildSpecFixerInitialMessage` を使うフォールバック経路（lines 193–198）のみで、これは code-fixer のフォールバック経路（lines 288–303）と対称的な構造である。

両 fixer とも structured findings 分岐では `findingsPath` を含まないため、「code-fixer 固有の欠落」という記述は事実と異なる。

なお、Acceptance Criteria（「code-fixer / spec-fixer のプロンプトに ... evidence file path が含まれる」）は両 fixer を正しく対象に含めているため、実装スコープに問題はない。ただし 設計要求の記述が不正確なままだと実装者が spec-fixer の structured-findings 経路への `findingsPath` 注入を見落とす可能性がある。

→ 設計要求 §3 の該当文を「code-fixer および spec-fixer は structured findings がある場合も evidence file の path をプロンプトに含める」に修正すること。
