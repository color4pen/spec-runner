# Code Review Feedback — iteration 001

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

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | tests/unit/adapter/claude-code/query-one-shot.test.ts | `envOmissionViolations` は `SECRET_DENYLIST`（5 固定キー）のみを検査し、`SECRET_PATTERNS`（`*_TOKEN` 等）を対象としない。`stripSecrets` は両方除去するため実挙動への影響はないが、述語の検出範囲が strip 関数より狭い。D3 で明示的に採択されたトレードオフ。 | 将来 pattern-based leak の検出が必要になった場合に別 change で述語を拡張する。本 change では不要。 | no |
| 2 | low | testing | tests/unit/adapter/claude-code/query-one-shot.test.ts | TC-OSQ-ENV-02 の非 secret 保持アサートは `if (process.env["PATH"] !== undefined)` で条件分岐しており、PATH 不在の環境では空振りパスする。design.md Risks 欄と tasks.md T-02 が容認済みのトレードオフ。 | 決定性を上げたい場合は制御した非 secret マーカーキー（例: `SPECRUNNER_TEST_MARKER`）を設定して保持を assert する。本 change では不要。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.9

## Summary

変更スコープは設計指定の 2 ファイルに限定（`query-one-shot.ts` / `query-one-shot.test.ts`）。

`src` 変更は正味 2 行（import + `env:` プロパティ）で、設計 D1 の「インライン渡し・中間変数なし」方針に従い `CLAUDE_CODE_OAUTH_TOKEN` 注入の混入経路を構造的に排除している。

テストは TC-OSQ-ENV-01/02/03 が揃い、実捕捉テスト（ENV-02）と検出テスト（ENV-03）が `envOmissionViolations` 述語を共有することで「実挙動固定と検出機構が乖離しない」D3 の設計意図が成立している。

既存 B-6 grep 歯は追加行が `stripSecrets` を含むため自動 seam 除外され、allowlist 追加なしで green を保つ。`typecheck && test`（468 files / 6483 tests）全 green 確認済み。

受け入れ基準はすべて満たされている。
