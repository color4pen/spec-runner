# Code Review Feedback — iteration NNN

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | security | `src/adapter/claude-code/provider-readiness-probe.ts:135` | `buildDetail` は `_tokenValue` パラメータを受け取るが一切使用しない。コメント「Never includes the token literal」は宣言のみで実装がない。SDK エラーメッセージが token 値を含む場合（例: `"401 Unauthorized: sk-ant-oauth-..."`）、`detail` にそのまま含まれる。設計 D4・タスク T-03 の「token 値を detail に含めない」要件に違反。また TC-015 のプローブテストは制御済みエラーメッセージ（token を含まない）のみ検証するため、この欠陥を検出できない。 | `buildDetail(err, tokenValue)` に token scrubbing を追加: `if (tokenValue && msg.includes(tokenValue)) msg = msg.replaceAll(tokenValue, "[REDACTED]");` を truncation より前に実施。さらにプローブテスト TC-015 に「エラーメッセージが token を含む場合でも detail に現れない」ケースを追加（`new Error(\`401 Unauthorized: \${SECRET_TOKEN}\`)` で makeFakeSdkThrowing）。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 6 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 7.90

## Summary

実装は設計（D1〜D5）に忠実で、port 境界・injection seam・managed no-op・arch allowlist の登録がすべて正確。typecheck・全テスト（564 ファイル/7737 件）・lint・coverage がすべて green。

1 件の high 所見: `buildDetail` が `_tokenValue` パラメータを受け取りながら使用せず、SDK エラーメッセージに token が含まれる場合の scrubbing を実施しない。設計とコメントが約束する「token 値を detail に含めない」の不変条件がコードレベルで強制されていない。TC-015 プローブテストは token を含むエラーメッセージを被検ケースにしていないため、この欠陥を検出できない。

その他の観点はすべて要件を満たしている:
- T1/T3: gate が `prepare()` より前に発火し、side effect が発生しないことを TC-001/TC-003/TC-006 で確認
- T2: 4 種別の distinct message/hint と hint-command-existence 歯（TC-004/TC-005）
- T4: classifier 層は正しく実装済み。probe 層（`buildDetail`）の不足が本 finding
- T5/T6: 注入 fake + `vi.mock()` で実 token 不要。managed テスト変更なし
- T7: verification-result.md で全フェーズ passed 確認済み

