# Code Review Feedback — request-review-detect-baseline-edit-intent — iter 1

## Findings Summary

| # | Severity | File / Location | Description |
|---|----------|-----------------|-------------|
| 1 | MEDIUM | `docs/adr/` (missing) | ADR が未作成。request.md に `adr: true` / AC[9] に「intent ベース検出への抽象化判断・verb 列挙 patchwork 廃止の思想・issue #299/#349 retrospective・LLM 不確定性への根本対策」記録が明示要件として記載されているが、`docs/adr/` 配下に該当ファイルが存在しない。 |
| 2 | LOW | `tests/unit/command/request-review.test.ts` TC-RR-013 | 観測ケース fixture 文字列が不在。test-cases.md TC-RRI-012 は「`L555: A → B` 形式・全行 grep 命令・completeness 要求を含む request 文面を fixture として」を要求しているが、テストには説明コメントのみで定数化された fixture 文字列がない。 |
| 3 | LOW | `tests/unit/command/request-review.test.ts` TC-RR-013 | `not.toContain("MODIFIED, ADDED")` は連結文字列での負例アサーション。TC-RRI-010 は `"MODIFIED"` 単独・`"ADDED"` 単独の個別 negative assertion を要求しているが、現実装は結合文字列のみのチェック。 |

---

## Detail

### Finding 1 (MEDIUM): ADR 未作成

request.md メタに `adr: true` が設定されており、受け入れ基準 AC[9] にも:

> ADR に「intent ベース検出への抽象化判断」「verb 列挙の patchwork 累積を断つ思想」「issue #299 / #349 観測連鎖の retrospective」「pattern 列挙回避による LLM 不確定性への根本対策の姿勢」を記録

と明示されている。`git diff main...HEAD --name-only` で `docs/adr/` 配下のファイルは 0 件。実装は正しく完了しているが、意思決定の記録が残らない。

### Finding 2 (LOW): 観測ケース fixture 文字列の欠如

test-cases.md TC-RRI-012:

> THEN「行番号指定 + 矢印（`L555: A → B`）形式の書き換え指示」「全行 grep 命令」「completeness 要求」等の観測ケース風パターンを、intent 判定ベースのルールが catch できる設計であることを静的に検証できる assertion が存在する

TC-RR-013 の `it("contains 3-category intent classification...")` 内コメントには:
```
// Covers observation cases: line-number rewrites, arrow notation, grep commands, completeness
// demands — all are caught by agent intent judgment rather than pattern matching
```
と記載されているが、実際の fixture 定数（`const OBSERVATION_CASE_FIXTURE = "..."` など）は存在せず、assertion もコメントに留まる。fixture 文字列を定数化することで「どのパターンが問題だったか」が仕様として読み取れるようになる。

### Finding 3 (LOW): 個別動詞の negative assertion 不足

TC-RRI-010:

> `"MODIFIED"` が Step 2 の検出 verb として含まれないことを assert するテストが存在する  
> `"ADDED"` が Step 2 の検出 verb として含まれないことを assert するテストが存在する

実装:
```ts
expect(REQUEST_REVIEW_SYSTEM_PROMPT).not.toContain("MODIFIED, ADDED");
```

`"MODIFIED, ADDED"` という連結文字列が存在しないことのみを確認する。`"MODIFIED"` 単体が prompt に残存しても通過してしまう。現行 prompt には実際には含まれていないが、テストの意図を完全に満たすには個別チェックが必要。

---

## Positive Observations

- `src/prompts/request-review-system.ts` の変更は設計意図を正確に実装: intent 3 分類・旧 verb 列挙の削除・recommendation 文・Severity Scope Constraint の更新、すべて AC を満たす。
- delta spec の Requirement ヘッダーが baseline と完全一致し、MODIFIED 自動分類の条件を満たす。
- baseline spec (`specrunner/specs/request-authoring-guard/spec.md`) はブランチ内で変更なし（TC-RRI-018 ✓）。
- `validation-tc.test.ts` の `active` → `drafts` パス修正は適切な scope-adjacent fix。
- typecheck / test 2454 件 green（verification-result.md 確認済）。

---

## Verdict

- **verdict**: needs-fix

ADR 未作成（MEDIUM）のため needs-fix。Finding 2・3 は LOW だが、Finding 2 の fixture 文字列は「観測連鎖の再発防止」という本 request の主眼を仕様として残す観点で意味がある。Finding 3 は 1 行の修正で完了する。
