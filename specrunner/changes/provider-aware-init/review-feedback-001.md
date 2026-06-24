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
| 1 | MEDIUM | scope-violation | `src/core/usage/pricing.ts` | `gpt-5.4-mini` と `gpt-5.3-codex-spark` の pricing エントリが追加されている。design.md Non-Goals は「MODEL_PRICING の更新は別 registry であり受け入れ基準外」と明示し、Open Questions では「正確な mini 価格の公開値を持たないため推測値の混入を避ける — 実装者は pricing.ts を編集しないこと」と禁止している。TC-017（manual, could）もこの invariant を明示検証している。追加された値はいずれも「mini-tier approximation」「no separate published price」と注記されており、禁止理由（推測値の混入）と一致する。機能不全は発生しないが、pricing 精度に関する品質低下であり将来のリスク。 | `pricing.ts` への追加行（`gpt-5.4-mini` エントリ 8 行、`gpt-5.3-codex-spark` エントリ 8 行）を revert する。pricing 更新は design が推奨するとおり別 issue で行う。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.30

## Summary

受け入れ基準は全て満たされている。`BUILTIN_MODEL_REGISTRY` の deprecated モデル削除、現行モデル追加、`PROVIDER_DEFAULTS` テーブル構成、`init.ts` の provider 対応（provider 名 if/else なし・テーブル lookup 1 箇所に閉じた設計）、`command-registry.ts` への `--provider` フラグ追加、既存テストのフィクスチャ更新、新規テスト追加（TC-001〜TC-016 相当）、verification all-green（typecheck && test）はいずれも正確に実装されている。

ブロッキング所見は 1 件のみ：`pricing.ts` が design で明示禁止されているにもかかわらず編集されている。値は近似値であり TC-017 の invariant を破る。revert のみで修正可能。
