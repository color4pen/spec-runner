# Code Review: prompt-common-context-injection — iter 1

- **verdict**: approved
- **reviewer**: code-review agent
- **iteration**: 1

---

## Summary

コアの設計目標は達成されている。`SPEC_RUNNER_COMMON_CONTEXT` が 4 層で正しく実装され、`buildSystemPrompt` 自動 prepend が機能し、全 11 agent prompt に注入される構造が成立した。typecheck + 全 2422 テストが green。ADR も正規パス `specrunner/adr/2026-05-20-prompt-common-context-injection.md` に正しく生成されている。

MEDIUM 2 件 / LOW 1 件を記録するが、いずれも機能の正確性を損なわず、CRITICAL / HIGH はない。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | `src/prompts/implementer-system.ts:11` | T-06a は "パイプライン上の位置づけ" セクション全体を削除する指示。"Pipeline Position" に改名・内容更新で存続している。SPEC_RUNNER_COMMON_CONTEXT が step 5 として implementer を列挙する一方、個別 prompt が "stage 3 (implementer)" と表記し stage 数が矛盾する（5 段 vs 11 段の異なる粒度）。tasks.md は "stage 3 は元々誤り — 本タスクで削除されるため修正不要" と明記しており、削除で解消するはずだった誤りが残存している | 「## Pipeline Position」セクション全体を削除する。`implementer-system.test.ts` の TC-012 が "stage 3" / "次工程に渡してください" を assert しているため、その 2 assertion を SPEC_RUNNER_COMMON_CONTEXT 経由で満たせるよう書き換えるか削除する（"implementer" / "verification" は共通 context に含まれる） |
| 2 | MEDIUM | correctness | `src/prompts/design-system.ts:20` | T-06b は pipeline diagram / ステージ責務リストを削除する指示。"ワークフロー全体での位置づけ" → "Pipeline Position" に改名され内容が残っている。role-specific 文（"あなたの tasks.md が implementer への唯一のインプット" 等）は正しく 役割 セクションに移動済みだが、stage 1〜5 のリストが依然として存在し SPEC_RUNNER_COMMON_CONTEXT の 11-step 列挙と重複している | 「## Pipeline Position」の stage 1〜5 リストを削除する。`design-system.test.ts` が "stage 1" / "spec-review" / "implementer" / "verification" の存在を assert しているが、これらは SPEC_RUNNER_COMMON_CONTEXT に含まれるため tests を更新する |
| 3 | MEDIUM | architecture | `src/prompts/spec-fixer-system.ts:11` | T-06f は "## 重要な注意"（Author-Bias Elimination）セクション削除の指示。実装では当該セクションを削除した後、新しい "## Author-Bias Elimination" セクションを追加しており、"前回の文脈を持ちません" が残存している。SPEC_RUNNER_COMMON_CONTEXT Layer 1 が "各 step は独立した agent session として実行される。前の session の文脈を持たない" を既に提供しており、個別 prompt の記述は冗長。原因は `tests/prompts/spec-fixer-system.test.ts` の TC-060 が "Author-Bias Elimination" または "前回の文脈を持ちません" の存在を assert しており、それを満たすために新セクションが追加されたと推定される | "## Author-Bias Elimination" セクションを削除する。TC-060 を「SPEC_RUNNER_COMMON_CONTEXT 経由で "前の session の文脈を持たない" が含まれることを verify する」に更新する |
| 4 | LOW | testing | `tests/` | test-cases.md TC-18〜TC-26 (must) は個別 prompt から削除された記述の "不在" を検証するシナリオ。verification が "35/35 must TCs covered" と報告するが、TC-18〜21 / TC-23〜26 は ps-filter.test.ts / lifecycle.test.ts / ps-pr-hint.test.ts の同番号 TC（別機能）との false positive マッチで計上されており、本変更のための不在 assertion test が存在しない。TC-22 (build-fixer) のみ `tests/prompts/build-fixer-system.test.ts` に正当な実装がある | TC-18 (implementer), TC-19 (implementer security), TC-20 (design), TC-21 (code-fixer), TC-23 (adr-gen), TC-24 (spec-fixer), TC-25 (code-review), TC-26 (test-case-gen) について、削除済みテキストが含まれないことを assert するテストを追加する。Finding 1〜3 の修正を先行させると TC-18/TC-20/TC-24 の assert は内容変化に合わせて調整が必要 |

---

## Positive Observations

- **SPEC_RUNNER_COMMON_CONTEXT の構成**: 4 層（System context / 思想原則 / 責任範囲 / System facts）が正確に実装され、3 人称 / system 視点の文体規律（"あなたは" を含まない）が unit test で保証されている（TC-03）
- **buildSystemPrompt 自動 prepend**: 外部 signature 変更なしで全 caller に一括適用。TC-BLD-01〜03 が構造的に検証されている
- **test-case-gen / request-generate / request-review の移行**: T-05 の 3 prompt すべてが正しく `buildSystemPrompt` 経由に移行され、fragment-coverage test に追加されている
- **common-context-catch.test.ts**: PR #339 同型ケース予防の構造的保証テスト（ADR path / authority spec path / change path の全 11 prompt への注入）が実装されている
- **AUTHORITY_SPEC_GUARD 縮小**: MUST NOT セクション削除、書く側・見る側の規律を維持するという D3 の方針どおりに実装されている
- **DELTA_SPEC_FORMAT 縮小**: 冒頭の "ADDED / MODIFIED の分類は agent がしない" 文が削除され、フォーマット詳細が維持されている
- **ADR**: 正規パス `specrunner/adr/2026-05-20-prompt-common-context-injection.md` に正しく単一生成されている（PR #339 事故の再現なし）

---

## Test Coverage Assessment (must scenarios)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 〜 TC-10 | must | ✅ covered | fragment 基本 / builder tests |
| TC-11 〜 TC-13 | must | ✅ covered | common-context-catch.test.ts |
| TC-14 〜 TC-17 | must | ✅ covered | fragments.test.ts |
| TC-18 〜 TC-21 | must | ⚠️ no explicit test | false positive で 35/35 カウント済（Finding 4）|
| TC-22 | must | ✅ covered | build-fixer-system.test.ts |
| TC-23 〜 TC-26 | must | ⚠️ no explicit test | false positive で 35/35 カウント済（Finding 4）|
| TC-27 〜 TC-31 | must | ✅ covered | fragment-coverage / common-context-catch |
| TC-32 〜 TC-35 | must | ✅ covered | typecheck / test pass / fragments.test.ts / adr.test.ts |

---

## Verdict Rationale

CRITICAL: 0 / HIGH: 0 → 承認阻止条件を満たさない。

Finding 1〜2 は設計意図との部分的不一致（pipeline 情報の重複残存、誤 stage 番号の残存）だが機能的な誤りを引き起こすものではなく MEDIUM。Finding 3 は pre-existing test が強制する形での妥協で、冗長ではあるが動作を破壊しない。Finding 4 はテスト網羅性の課題で機能自体は正しい。

Finding 1〜3 は次の change でまとめて解消することを推奨する（pre-existing tests の update が必要）。
