# Code Review Feedback — request-review-complexity-eval — iter 1

## Findings Summary

| # | Severity | Category | Description | Location | Recommendation |
|---|----------|----------|-------------|----------|----------------|
| 1 | HIGH | delta-spec | delta spec が `## Requirements` セクションヘッダーを欠く | `specrunner/changes/request-review-complexity-eval/specs/request-authoring-guard/spec.md` | ファイル先頭に `## Requirements` を追加し、その配下に `### Requirement:` エントリを置く |
| 2 | MEDIUM | test-coverage | TC-RR-018（must）のユニットテストが未実装 | `tests/unit/command/request-review.test.ts` | `"The final decision remains with the request author"` の contains assertion を TC-RR-018 として追加する |

---

## Finding #1: Delta spec に `## Requirements` ヘッダーがない

`specrunner/changes/request-review-complexity-eval/specs/request-authoring-guard/spec.md` の現在の内容:

```markdown
### Requirement: Request Review Prompt Complexity Evaluation Perspectives
...
### Requirement: Request Review Prompt Multi-Approach Recommendation Rule
...
```

`rules.md` の delta spec 記法は `## Requirements` セクション配下に `### Requirement:` を置くことを要求している。
このヘッダーが存在しないと `mergeSpecsForChange` ツールが delta を正しくパースできず、spec merge 時に Requirement が baseline に反映されない。
TC-RR-024（must）でも `## Requirements` セクションの存在を検証しているが、現状ではこのテストが失敗する状態になっている。

修正方法:

```markdown
## Requirements

### Requirement: Request Review Prompt Complexity Evaluation Perspectives
...
### Requirement: Request Review Prompt Multi-Approach Recommendation Rule
...
```

---

## Finding #2: TC-RR-018 の unit test が未実装

test-cases.md は TC-RR-018 を must priority として定義している:

> **THEN** 最終判断を request 作成者に委ねる旨の記述が含まれている（例: "The final decision remains with the request author"）

`request-review-system.ts` の Step 5 には当該テキストが存在する（line 55）。ただし `tests/unit/command/request-review.test.ts` に TC-RR-018 のアサーションがなく、テストケース仕様との乖離がある。

修正方法: TC-RR-016 の describe ブロックに続けて以下を追加する:

```typescript
// ---------------------------------------------------------------------------
// TC-RR-018: REQUEST_REVIEW_SYSTEM_PROMPT — final decision deferred to request author
// ---------------------------------------------------------------------------
describe("TC-RR-018: REQUEST_REVIEW_SYSTEM_PROMPT defers final decision to request author", () => {
  it("states that the final decision remains with the request author", () => {
    expect(REQUEST_REVIEW_SYSTEM_PROMPT).toContain("The final decision remains with the request author");
  });
});
```

---

## 確認済み（問題なし）

- `src/prompts/request-review-system.ts`: Step 5 の内容は tasks.md / design.md の仕様と完全一致
- TC-RR-015, 016, 017: 実装・テスト済み、green 確認
- TC-RR-020: 全 267 テストファイル / 3004 テスト green
- TC-RR-021: verdict 体系（approve / needs-discussion / reject）変更なし
- TC-RR-022: `src/prompts/` で変更されたのは `request-review-system.ts` のみ
- TC-RR-023: typecheck green
- Step 5 の配置: Step 4 末尾の直後・`## Severity Scope Constraint` の前（TC-RR-019 相当）
- Exclusion Clause との整合: Step 5 はリクエストレベルのスコープ評価（"Does the *request* duplicate mechanisms?"）であり、実装 trade-off 指摘とは区別されている。MEDIUM 上限の明示で design agent への越境を防ぐ設計は妥当

---

## Verdict

```
- **verdict**: needs-fix
```

Finding #1（delta spec の `## Requirements` 欠落）は `specrunner finish` の spec-merge が失敗する構造的欠陥。Finding #2（TC-RR-018 未実装）は must priority のテストカバレッジ漏れ。両修正は軽微であり、実装意図・prompt 内容自体は仕様と適合している。
