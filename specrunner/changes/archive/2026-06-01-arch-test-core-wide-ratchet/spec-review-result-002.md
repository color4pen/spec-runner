# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Completeness | tasks.md (T-03) | T-03 のセクションタイトルは「B-5〜B-8 call-site 制約」と謳いながら、タスク箇条書きに B-5 の項目が存在しない（B-6/B-7/B-8 のみ）。request.md 受け入れ基準「B-1〜B-8 + closure を assert する」および spec.md Scenario「all B-invariants are asserted（B-5 judgment purity 含む）」が要求する B-5 アサーションが tasks.md 上で定義されていないため、実装者は B-5 テストを書く根拠と grep パターンを持てず受け入れ基準を満たせない。design.md D5 も B-5 を call-site grep 対象として列挙しているが grep パターンは記述されていない。model.md §5 によると B-5 の現在の違反形態は「spec/rules の load を seam 化」（fs.readFile 等を判定系から排除）。 | T-03 に B-5 タスク箇条書きを追加する。grep パターンの例: `src/core/` 内の verdict / transition / spec-rules 相当ファイル（例: `src/core/pipeline/transitions.ts`, `src/core/step/spec-rules/` 等）で `readFile\|readFileSync\|readdir\|existsSync` 等の本物 I/O が直呼びされていないことを assert。もし現状の B-5 違反がゼロで green なら allowlist エントリ不要で pass する。B-5 を本 change スコープ外とする場合は request.md 受け入れ基準と spec.md Scenario の「B-5」への言及を削除し scope 外を明記する。 |
| 2 | LOW | Accuracy | tasks.md (T-03) | T-03 の B-7 テスト説明「`process.stdout.write` / `process.stderr.write` 直呼び出しを検出」において、テキスト grep で `process.stderr.write` を検索すると `src/core/finish/branch-checkout.ts:80` および `src/core/finish/preflight.ts:50` の JSDoc コメント（`/** Warning output function (defaults to process.stderr.write). */`）がヒットし false positive になる。`__tests__/` 除外は記述されているがコメント行への対処は未定義。T-01 にこれらのエントリがないため allowlist フィルタでも救われず、day-1 で B-7 テストが red になるリスクがある。 | T-03 の B-7 パターンを「関数呼び出しサイトのみにマッチさせる（例: `process\.stderr\.write\s*\(`）」と明記するか、grep 後にコメント行（先頭が `*` または `//` の行）を除外するフィルタを実装することを記述する。代替として T-01 に `src/core/finish/branch-checkout.ts`・`src/core/finish/preflight.ts` の B-7 allowlist エントリを追加する（ただし実コード違反でないため allowlist 化は不適切であり、パターン精緻化の方が望ましい）。 |

## Review Notes

### spec-review-001 findings の解消確認

- [x] Finding 1 (MEDIUM): T-02 B-3/B-4 スキャン範囲の自己矛盾 → 解消済み。tasks.md T-02 で「core 外ファイル起点のため src-wide 拡張 change に委ねる」と一本化された。
- [x] Finding 2 (MEDIUM): R1/R3/R4 allowlist 不整合 → 解消済み。request.md §2 が「本 change の allowlist は core-scoped 違反（R2/B-6/B-8）対象。R1/R3/R4 は src-wide 拡張 change で実施」と明確化された。
- [x] Finding 3 (LOW): 単一mutator の扱い未定義 → 解消済み。request.md §2 に「lifecycle 不変条件で B-# grep 対象外のため除外、後続 change で別途検討」と明記された。
- [x] Finding 4 (LOW): executor.ts 箇所数誤記 → 解消済み。tasks.md T-01 が「4 箇所」に修正された。

### セキュリティレビュー

本 change は architecture enforcement test の追加であり、auth / user input / network access を持たない。OWASP Top 10 該当なし。B-6（stripSecrets 強制）・B-7（maskSensitive 強制）の enforcement 自体がセキュリティ seam を強化する設計であり方向性は適切。
