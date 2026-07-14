# Code Review Feedback — postwork-no-tool-fix — iter 1

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
| 1 | low | maintainability | tests/unit/core/step/post-work-prompt-invariant.test.ts:31 | `containsForbiddenMarker` 内の `m.toLowerCase()` は `FORBIDDEN_MARKERS` 要素が既にすべて小文字のため常に no-op。機能上の問題はないが冗長。 | 現状のまま問題ない。将来マーカーに大文字が混在する可能性を想定して残すなら、その旨のコメントを添えると意図が明確になる。 | no |
| 2 | low | testing | tests/unit/core/step/post-work-prompt-invariant.test.ts | TC-007（「report_result を追加すると歯が fail する」priority:must）は永続化ネガティブテストとして実装されていない。tasks.md T-04 が「一時的な混入で fail を確認、混入は戻す」という開発者検証として位置付けており、正のアサーションが論理的にネガティブケースを保証するため、観測上の問題はない。 | スコープ外。受入基準は永続化ネガティブテストを要求していない。 | no |
| 3 | low | style | tests/unit/core/step/post-work-prompt-invariant.test.ts:45,64 | `makeMinimalState` / `makeMinimalDeps` の request.type に `"feature"` を使用している。specrunner の標準 type 値（`"new-feature"` 等）ではないが、schema が `type: string` を受け入れるため typecheck・test は通る。 | 機能上問題ない。気になれば `"new-feature"` など実在する type 値に揃えると標準値で読みやすくなる。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.2

## Summary

変更範囲は `src/core/step/code-review.ts`（`followUpPrompt` から `report_result` 関連の 3 行を外すだけ）と新規テストファイル 1 本のみ。設計意図（post-work turn が tool call を捕捉しないという adapter の不変）に正確に対応した最小変更であり、スコープ逸脱なし。

受入基準 4 項目すべて充足:
- `followUpPrompt` に `report_result` 語が含まれないことをテストで固定
- 越境不変の歯（全 agent step post-work prompt 走査）が registry 由来の動的列挙で実装され green
- code-review の verdict 導出・Markdown result file 検査の観測挙動が無変更（既存テストファイル変更ゼロ、6739 tests passing）
- typecheck clean・test green

特筆事項:
- `collectUniqueAgentSteps` がハードコード列挙を使わず registry 由来で動的に step を列挙しており、新規 agent step 追加時に自動的に走査対象に含まれる設計になっている
- T-03 lock test が main work turn 完了契約（system prompt + report tool description）への typed findings 担保残存を機械的に固定しており、将来の不注意な削除を検出できる

