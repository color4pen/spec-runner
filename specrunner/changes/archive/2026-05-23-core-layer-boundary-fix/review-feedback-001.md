# Code Review: core-layer-boundary-fix — Iteration 1

- **verdict**: approved
- **date**: 2026-05-22
- **reviewer**: code-reviewer agent

---

## Summary

3 件の module-boundary 違反すべてが正しく解消されている。設計に従った実装で、テストは 2599/2599 pass、typecheck clean。細かい AC スコープの不一致が 2 件あるが、いずれも pre-existing / コメント起因であり、blockerではない。

---

## Findings

| # | Severity | Category | Location | Description |
|---|----------|----------|----------|-------------|
| 1 | LOW | ac-scope | `src/core/runtime/local.ts`, `managed.ts` | AC `grep -rE "from ['\"](\.\./)*adapter/" src/core/` が 0 件 はこの PR 単体では満たせない（`core/runtime/` に pre-existing adapter import が残る）。regression test は `core/request/` に限定しており、ファイル冒頭に「core/runtime/ violations are tracked separately」と明記されている。実装の正しさには影響なし |
| 2 | LOW | ac-literal | `src/core/runtime/factory.ts:6-7` | AC `grep -rn "cli/" src/core が 0 件` は文字どおりに実行すると factory.ts のコメント行 2 件がヒットする。import 依存ではないため実質問題なし。regression test は `src/core/request/` で 0 件を確認 |
| 3 | INFO | delta-spec | `specs/one-shot-query/spec.md` | TC-44 は「delta spec が queryOneShot Requirement を保持している」と要求するが、delta spec は変更点のみ記載する規約のため明示的な Requirement 見出しはない。本文中に「queryOneShot() 関数自体は adapter 内に存続する」と記述されており意図は伝わる |

---

## TC Coverage Check (must scenarios)

| TC | Description | Result |
|----|-------------|--------|
| TC-01 | `grep -rn "cli/" src/core` = 0 | △ コメント 2 件ヒット（finding #2）、import 依存はゼロ |
| TC-02 | `grep adapter/ src/core` = 0 | △ `core/runtime/` に pre-existing 違反（finding #1）、今回対象の `core/request/` は 0 |
| TC-03 | `grep @anthropic-ai/claude-agent-sdk src/core/request` = 0 | ✓ |
| TC-04 | runner.ts に cli/progress import なし | ✓ |
| TC-05 | reviewer.ts に adapter import なし | ✓ |
| TC-06 | manager.ts に SDK/adapter import なし | ✓ |
| TC-07 | generator.ts に SDK import なし | ✓ |
| TC-08〜10 | OneShotQueryClient port interface | ✓ |
| TC-12〜14 | ClaudeCodeOneShotQueryClient | ✓ |
| TC-16〜21 | runReview/manager/generator の port 依存化 | ✓ |
| TC-23〜26 | EventBus コンストラクタ注入 | ✓ |
| TC-27〜29 | wireProgressDisplay / run.ts / resume.ts | ✓ |
| TC-30〜33 | executeReview/executeCreate composition point + default fallback 削除 | ✓ |
| TC-34〜37 | regression test 追加 | ✓ |
| TC-38〜40 | test seam migration | ✓ |
| TC-42〜45 | delta spec | ✓（TC-44 は INFO #3 参照） |
| TC-50〜51 | typecheck + test green | ✓ |

---

## Positive Observations

- **design に忠実**: D1〜D6 すべての設計判断がコードに反映されている。`wireProgressDisplay` factory、`super(runtime, events)` 注入、default fallback 完全削除など、設計意図との乖離なし。
- **composition point の確立**: `command-registry.ts` が `loadConfig()` → `new ClaudeCodeOneShotQueryClient(config)` → `executeReview/executeCreate` と正しく配線。core 関数内の config 重複読み込みも除去されている。
- **regression test の自己説明性**: `tests/unit/architecture/module-boundary.test.ts` のファイル冒頭コメントがスコープ制限とその理由（`core/runtime/` violations tracked separately）を明記しており、finding #1 の意図的な選択が追跡可能。
- **テスト seam 移行**: AsyncGenerator mock から `{ run: vi.fn().mockResolvedValue(...) }` へのシンプルな移行が完了し、テストの可読性が向上している。
- **delta spec の矛盾解消**: `one-shot-query/spec.md` の「queryOneShot を直 import する義務」が削除され、module-boundary との矛盾が解消された。
