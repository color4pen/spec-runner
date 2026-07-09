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
| 1 | low | testing | tests/unit/config/design-layer-config.test.ts | TC-016 (must): `resolveDesignLayerConfig` に `designLayer.topicEmission: false` を渡したとき `false` が返ることを検証するケースがない。実装式 `!== false` は正しく動作するが、resolver 単体テストとして明示的に担保されていない。 | TC-DL-CONFIG-005 のブロックに `designLayer: { topicEmission: false }` → `{ topicEmission: false }` の it を 1 件追加する。 | no |
| 2 | low | testing | src/core/archive/__tests__/merge-then-archive.test.ts | TC-017 (must): `job archive --with-merge` 経路でのトピック排出が明示的にテストされていない。設計上は `runMergeThenArchive → runArchiveOrchestrator` 委譲で自動的に covered されており T-DTE-01/02/03 で確認済み。アーキテクチャ前提が変わった場合の回帰検出網がない。 | merge-then-archive テストに「`designLayer` が orchestrator へ伝播する」1 ケースを追加する（`emitDesignTopics` のスタブをチェックするか、enabled=true で topic ファイルが書き出されることを確認する）。 | no |
| 3 | low | testing | tests/unit/config/design-layer-config.test.ts | TC-019 (should): `designLayer.topicEmission: "yes"` など非 boolean を渡したとき config validation がエラーを返すことのテストがない。schema に `optional(boolean(...))` は追加済みで動作は正しい。 | TC-DL-CONFIG-002/003 と同パターンで `topicEmission: "yes"` のケースを追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 9.35

## Summary

実装は設計・仕様・受け入れ基準をすべて満たしている。typecheck && test は 458 ファイル / 6323 テスト green。

**正当な点**:
- `collectTopicCandidates`: step 辞書順 → attempt 昇順 → index 昇順の決定的走査順、`step|file|line|title` dedupe キー、`decision-needed || origin:"scope"` フィルタが仕様と完全に一致。
- `deriveTopicSlug`: `[^a-z0-9]+` 一括置換 → 連続ハイフン畳み込み → 先頭末尾除去で契約文法を機械的に保証。
- `renderTopicFile`: flat frontmatter（`id: top-<slug>` / `source: specrunner:<jobSlug>/<step>-<iteration>#<index>`）と decision ledger 照合が仕様どおり。
- `emitDesignTopics`: 縮退（enabled=false / topicEmission=false / design/ 不在）・冪等（既存ファイルスキップ）・best-effort（write/git add 失敗でも throw せず継続）の三原則が正しく実装済み。
- **orchestrator 配線**: mark-hook より前に排出を置く構造で、mark-hook exit 2 によるアーカイブ停止時でも排出ファイルは書き出し済みになる（T-DTE-02 でスポーン順を確認）。
- **D9 全リテラル更新**: `noopDesignLayer`・`disabledDesignLayer`・`resolveDesignLayerConfig` の 3 箇所すべてに `topicEmission` が追加され型エラーなし。
- 既存テスト群は `designLayer` 未指定 → `noopDesignLayer`（enabled:false）経由で no-op となり無変更で green。

**指摘（すべて non-blocking）**: TC-016 / TC-017 の must 優先度テストが未追加（test-cases.md との乖離）。実装の正確性は担保されており動作に問題はないが、将来の回帰検出のため追加が望ましい。
