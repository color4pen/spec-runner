# Cross-Boundary Invariants Review — postwork-no-tool-fix — iter 1

- **reviewer**: cross-boundary-invariants
- **verdict**: approved

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope

```
src/core/step/code-review.ts                          |  7 +-
tests/unit/core/step/post-work-prompt-invariant.test.ts | 262 ++++++++++++
```

---

## 検査した不変条件と境界

### 境界 A: `followUpPrompt`（core step 層）→ `postWorkPrompts`（adapter 層実行時）

`step-context-builder.ts:86-90` が `getFollowUpPrompt?.(state, deps) ?? followUpPrompt` を `allFollowUpPrompts` に組み込み、adapter（`agent-runner.ts:727-733`）が `mcpServers` を外して same-session follow-up として実行する。  
**この turn では captured typed tool（`report_result`）が捕捉されない** が前提。

変更前の `code-review.ts:followUpPrompt` はこの境界を越えて `report_result` 修正を指示しており、adapter が受け取れない結果を要求するという契約欠陥だった。

**変更後の確認**:
- 削除された 3 行（`report_result の findings 配列が提出されているか` / sub-bullet 2 件）および末尾変更（`report_result findings を修正してください` → `review-feedback ファイルを修正してください`）により、`followUpPrompt` に `report_result` の語が存在しない。
- adapter 側（`agent-runner.ts:724-733`）は無変更。post-work turn で `mcpServers` を削除する設計は維持されている。
- **境界違反は解消されており、adapter の未変更前提は保たれている。**

### 境界 B: `postWorkPrompts` の全注入経路 ↔ T-04 テストの走査対象

`step-context-builder.ts` が `postWorkPrompts` を組み立てる経路は 2 本:
1. `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt` — T-04 が registry 経由で網羅
2. `buildRulesFollowUpPrompts(ruleContents)` — wrapper 定型枠を T-04 が確認、実際の rules file 内容は走査対象外

T-04 の `buildRulesFollowUpPrompts` 検査はサンプル文字列（`report_result` 非包含）で wrapper テンプレート（`WRAP_PREFIX` / `WRAP_SUFFIX`）のみを検証する設計。  
実際の `specrunner/rules/**/*.md` ファイル群に `report_result` が含まれないことを grep で確認した（現時点でヒットなし）。  
走査対象外であることは design.md の Open Questions に明示されており、意図的な受容限界。

### 境界 C: T-04 デデュプリケーション ↔ pipeline registry の step 同一性

`collectUniqueAgentSteps` は `step.name` で重複排除する。`STANDARD_DESCRIPTOR` と `FAST_DESCRIPTOR` は同じ step インスタンスを import しており、name で dedup しても同一 `followUpPrompt` が 2 回評価されるだけなので問題なし。step 追加時は registry へ追加すれば T-04 が自動的に対象に含める設計も維持されている。

### 境界 D: T-03 lock test ↔ main work turn 完了契約の現状

`CODE_REVIEW_SYSTEM_PROMPT` および `CODE_REVIEW_REPORT_TOOL.description` は無変更。  
T-03 の assert が期待する文字列:
- `/findings.*配列.*必ず/` → `src/prompts/code-review-system.ts:68` の「`findings` 配列を必ず含めてください」で満たされる
- `"findings: []"` → 同:93 の「`findings: []` を渡してください」で満たされる
- `"REQUIRED when ok=true"` → `report-tool.ts:149` の description で満たされる

source に変更はなく、lock test は現状と整合している。

---

## Findings

### F-001 [info] rules file content は T-04 の静的走査対象外

- **境界**: `buildRulesFollowUpPrompts(ruleContents)` の `ruleContents`（filesystem 由来）→ `postWorkPrompts`
- **状況**: T-04 は wrapper 定型枠のみ検査し、実際の rules ファイル内容は走査しない。現時点でファイル群に `report_result` はない。
- **評価**: 設計の Open Questions に明記された受容限界。本変更が導入した脆弱性ではなく、pre-existing の走査ギャップ。block しない。

---

## 総評

`code-review.ts` の `followUpPrompt` から `report_result` 参照が正しく除去され、adapter 側（`agent-runner.ts`）の post-work turn で tool が捕捉されないという境界前提は保たれている。T-04 が registry 由来で全 agent step を網羅する設計、T-03 が main work turn 完了契約を lock する設計ともに正しく機能する。既存テストは無変更で green（verification-result.md 確認済み）。cross-boundary 新規違反はない。
