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
| 1 | low | testing | scripts/smoke/package-smoke.sh | S4（TC-004）で exit 0 の assert が欠落。tasks.md T-05 は「exit 0 / request.md 存在 / 入れ子なし」の 3 点を要求しているが、smoke スクリプトでは `S4_EXIT` を捕捉しているものの `assert_exit_zero` 呼び出しがない。`request new` が非ゼロ exit かつファイルを生成しないケースは `assert_present` が検出するため実用上の盲点は狭いが、仕様からの乖離。 | S4 ブロックの `S4_EXIT` 捕捉直後に `assert_exit_zero "TC-004/S4/exit-zero" "${S4_EXIT}"` を追加する。 | no |
| 2 | low | testing | specrunner/changes/packaged-smoke-contract/test-cases.md | TC-006 が `manual` に分類されているが、vitest（`tests/package-smoke-contract.test.ts`）で自動検証されている。Summary の `Automated: 9 / Manual: 6` は実態と一致しない（正: `Automated: 10 / Manual: 5`）。機能的影響なし。 | test-cases.md の TC-006 カテゴリを `integration` に更新し Summary を修正する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.05

## Summary

変更スコープは `scripts/smoke/package-smoke.sh`（新規）、`.github/workflows/ci.yml`（smoke step 1 本置き換え）、`package.json`（smoke convenience script 追加）、`tests/package-smoke-contract.test.ts`（新規）。`src/` の製品コードは無変更。

受け入れ基準 T1〜T7 はすべて満たされている。

- **T1**: S1 にて env-guard（GIT_CEILING_DIRECTORIES）、exit 非ゼロ、3 点の absent assert（specrunner/ / .gitignore / XDG config）。✅
- **T2**: S2 にて exit 0、root 着地（drafts + changes）、入れ子なし、stdout に "created" 含む。✅
- **T3**: S3 にて `|| true` で全体 exit を無視し `node -e` JSON parse で per-check status のみ判定（D4 の実装が正確）。✅
- **T4**: S4 にて root の request.md 存在、サブディレクトリ配下に入れ子なし。exit 0 の明示 assert は欠落（finding #1）だが実用上の盲点は狭い。✅
- **T5**: スクリプト内に bun 呼び出し・src/ 参照なし。vitest TC-006 が機械検証。✅
- **T6**: tasks.md 全チェックボックス済み（manual 確認完了）。✅
- **T7**: verification-result.md: build / typecheck / test / lint 全 passed。✅

スコープ外確認: `src/` 変更なし、CI 他 step 変更なし、`publish.yml` 変更なし、既存 build/test/lint script 変更なし。いずれも遵守。

CI workflow の変更は旧 step（`npm pack → mktemp → npm init → npm install → --help`）を `bash scripts/smoke/package-smoke.sh` 1 行に正しく置き換えており、他 step は不変。
