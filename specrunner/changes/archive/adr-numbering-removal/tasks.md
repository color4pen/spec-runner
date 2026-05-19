# Tasks: ADR Numbering Removal

## Task 1: Prompt 命名規則の書き換え ✅

**File**: `src/prompts/adr-gen-system.ts`

1. L46 の命名規則を変更:
   - 旧: `` `specrunner/adr/ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` ``
   - 新: `` `specrunner/adr/{YYYY-MM-DD}-{slug}.md` ``
2. L48-49 の採番手順を削除・置換:
   - 旧: `- NNNN: 4 桁連番。\`specrunner/adr/\` 配下の既存 ADR を \`ls\` して最大番号 + 1 を採番（0 件なら 0001）`
   - 新: 削除（NNNN 行自体を消す）
3. L50 の slug 説明行はそのまま残す（YYYY-MM-DD 行も残す）

**検証**: `bun run typecheck` が green

## Task 2: 既存 ADR ファイルのリネーム ✅

**Dir**: `specrunner/adr/`

以下 5 件を `git mv` で実行:

```bash
git mv specrunner/adr/ADR-0001-2026-05-18-prompt-fragment-registry.md specrunner/adr/2026-05-18-prompt-fragment-registry.md
git mv specrunner/adr/ADR-0002-2026-05-18-validation-rule-interface.md specrunner/adr/2026-05-18-validation-rule-interface.md
git mv specrunner/adr/ADR-0003-2026-05-18-one-shot-query-wrapper.md specrunner/adr/2026-05-18-one-shot-query-wrapper.md
git mv specrunner/adr/ADR-0004-2026-05-19-baseline-header-consistency-check.md specrunner/adr/2026-05-19-baseline-header-consistency-check.md
git mv specrunner/adr/ADR-0004-2026-05-19-spec-review-baseline-pull-model.md specrunner/adr/2026-05-19-spec-review-baseline-pull-model.md
```

## Task 3: ADR 内部の自己言及参照クリーンアップ ✅

grep で検出済みの 2 件を修正:

1. **`specrunner/adr/2026-05-18-one-shot-query-wrapper.md`** (Task 2 後の新名)
   - L1: `# ADR-0001: queryOneShot を agent-runner と分離した独立関数として導入する`
   - → `# queryOneShot を agent-runner と分離した独立関数として導入する`

2. **`specrunner/adr/2026-05-19-baseline-header-consistency-check.md`** (Task 2 後の新名)
   - L1: `# ADR-0004: Baseline Header Consistency Check as Defense-in-Depth Layer in spec-merge`
   - → `# Baseline Header Consistency Check as Defense-in-Depth Layer in spec-merge`

**検証**: `grep -rE 'ADR-[0-9]{4}' specrunner/adr/` で 0 件

## Task 4: ビルド・テスト検証 ✅

```bash
bun run typecheck && bun run test
```

ADR 命名固有の unit test は現状存在しない（`tests/core/pipeline/pipeline.test.ts` に ADR 関連アサーションなし）。既存テストが全て green であることを確認。

## 依存関係

```
Task 1 (prompt) ── 独立
Task 2 (rename) ── 独立
Task 3 (内部参照) ── Task 2 に依存（rename 後のファイルを編集）
Task 4 (検証) ── Task 1, 2, 3 全完了後
```
