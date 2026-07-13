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
| 1 | low | maintainability | `tests/unit/step/executor-resume-context.test.ts` | ファイル先頭 line 7 のコメント「TC-RC-004: deps.resumePrompt is consumed (cleared) after the agent step executes」が旧挙動を記述したまま。describe/it ブロックは正しく反転済みで動作上の問題はないが、ドキュメントとして誤解を招く。 | `TC-RC-004: deps.resumePrompt is preserved (NOT cleared) — one-shot is Pipeline's responsibility` 等に更新する。 | no |
| 2 | low | testing | `src/core/command/__tests__/resume-member-context.test.ts` | TC-012（should）: `--from <member>` が coordinator へ写像されかつ resumePoint が同 member というシナリオに対する明示的テストが不在。コードトレースでロジックの正しさは確認済み。 | TC-MC-001 に `from: MEMBER_NAME` オプションを追加したバリアントを追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.1

## Summary

実装は design.md の D1〜D3 に忠実に沿っており、3 つの核心的な変更がすべて正しく適用されている。

**D1 (one-shot 所有権を Pipeline へ移す)**: `executor.ts` から `deps.resumePrompt = undefined; deps.resumeContext = undefined;` の in-place クリアブロックを完全削除。`Pipeline.runInternal` が `depsWithoutResume` + `firstUnitExecuted` フラグで one-shot を実現している。coordinator fan-out と逐次分岐の両方に `effectiveDeps` が一貫して適用されている。

**D2 (round が readonly な execution input を構築)**: `ParallelReviewRound.run` が `Promise.allSettled` fan-out 前に `const roundDeps: PipelineDeps = { ...deps }` を構築し、全 member が共有 orchestration `deps` ではなく `roundDeps` を受け取る。`buildResumePrompt` の既存 gate（human note = ungated / automatic context = step-gated）により配布差が自然に実現される。

**D3 (member→coordinator 写像後も context を保持)**: `mapMemberToCoordinator` を export し、`resume.ts` の automatic context gate を `startStep === mappedResumeStep` に変更。`resumePoint` 自体は元の member 名を保持するため、`ParallelReviewRound` 内の `buildResumePrompt` gate（`resumePoint.step === stepName`）が正しく target member を特定できる。

**テストカバレッジ**: must 13/13、should 2/2（うち TC-012 は明示的テスト不在だが info のみ）。`typecheck && test` green（486 test files / 6617 tests）。`architecture/` 配下の変更なし。既存 in-place クリア機構を assert していた旧テスト群は、新しい「executor が deps を変更しない」挙動を assert するよう正しく更新されている。

info 指摘 2 件はいずれも non-blocking。
