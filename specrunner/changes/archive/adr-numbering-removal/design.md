# Design: ADR Numbering Removal

## Summary

ADR ファイル命名から連番 (`ADR-NNNN-`) prefix を廃止し、`{YYYY-MM-DD}-{slug}.md` 形式に変更する。

## Problem

並列 finish 時に各 worktree が `ls specrunner/adr/ | max+1` で独立採番するため、同一番号の ADR が複数生成される。PR #307/#308/#309 で `ADR-0001` が 3 重衝突、PR #315/#317 で `ADR-0004` が 2 重衝突し、現在 main 上に同番号の ADR が並んでいる。

根本原因: 採番が **分散環境で非アトミック** であり、並列 worktree で構造的に衝突する。

## Design Decision

### 連番廃止 + date-slug 形式への移行

**新形式**: `specrunner/adr/{YYYY-MM-DD}-{slug}.md`

- 連番を完全廃止し、date + slug の組合せでユニーク性を担保
- 同日同 slug は request slug のユニーク性により実質発生しない
- 採番ロジック (`ls` + max+1) を prompt から削除

### 代替案: 分散ロック / UUID 採番

検討したが不採用:
- **分散ロック**: ロックサーバーの運用コスト。spec-runner のジョブ隔離モデル (worktree) と相性が悪い
- **UUID 接尾辞**: `ADR-0001-abc123-...` は可読性が低下し、連番のメリットも失う
- **timestamp ベース連番**: ms 精度でも並列で衝突する可能性あり

→ 連番のメリット (短い参照 ID、目次生成) が spec-runner では未使用のため、廃止が最もシンプル。

## Change Scope

### 1. Prompt 変更 (`src/prompts/adr-gen-system.ts`)

- L46: 命名規則 `ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` → `{YYYY-MM-DD}-{slug}.md`
- L48-49: 採番手順 (`ls` + max+1) を削除し、date + slug のみで一意決定する旨に書き換え

### 2. 既存 ADR リネーム (`specrunner/adr/`)

5 件を `git mv` で新形式にリネーム:

| 旧 | 新 |
|---|---|
| `ADR-0001-2026-05-18-prompt-fragment-registry.md` | `2026-05-18-prompt-fragment-registry.md` |
| `ADR-0002-2026-05-18-validation-rule-interface.md` | `2026-05-18-validation-rule-interface.md` |
| `ADR-0003-2026-05-18-one-shot-query-wrapper.md` | `2026-05-18-one-shot-query-wrapper.md` |
| `ADR-0004-2026-05-19-baseline-header-consistency-check.md` | `2026-05-19-baseline-header-consistency-check.md` |
| `ADR-0004-2026-05-19-spec-review-baseline-pull-model.md` | `2026-05-19-spec-review-baseline-pull-model.md` |

### 3. ADR 内部の自己言及参照クリーンアップ

grep で検出済みの 2 件:
- `ADR-0003-...one-shot-query-wrapper.md` L1: `# ADR-0001: queryOneShot...` → `# queryOneShot...`
- `ADR-0004-...baseline-header-consistency-check.md` L1: `# ADR-0004: Baseline Header...` → `# Baseline Header...`

### 4. スコープ外の参照

- `src/core/step/code-review.ts:83` の `ADR-20260430-review-exit-contract` は openspec-workflow 側の ADR 参照であり、spec-runner の `specrunner/adr/` 命名とは無関係。touch しない。
- `specrunner/changes/archive/` および `specrunner/requests/merged/` 内の歴史的参照は touch しない。

## Risk

- **低**: 変更箇所が prompt テキスト 1 ファイル + ADR ファイル rename のみ。ビジネスロジックのコード変更なし。
- テストへの影響: `tests/core/pipeline/pipeline.test.ts` に ADR 命名関連のアサーションなし。ADR 命名固有の unit test は存在しない。
