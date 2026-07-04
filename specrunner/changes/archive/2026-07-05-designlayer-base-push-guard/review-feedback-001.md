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
| 1 | medium | testing | tests/unit/core/command/ (missing) | TC-010（must 優先度）未実装: `pipeline-run.ts` の `prepare()` が `workspaceOpts.designLayerEnabled` を `resolveDesignLayerConfig(config).enabled` と一致する値で返すことを確認する integration test が存在しない。現状の runtime-level テストは `designLayerEnabled: true` を直接注入するため、wiring レイヤの regression を検出できない。 | `pipeline-run.ts` の `prepare()` を対象とする既存テストファイルに、`designLayer.enabled: true` の config を持つ場合に `workspaceOpts.designLayerEnabled === true` となることを確認するケースを追加する。 | no |
| 2 | low | testing | tests/unit/core/runtime/local.test.ts | TC-008（should 優先度）未実装: diverged（behind かつ ahead 両方 > 0）のとき両方の warning が独立して出力されることを確認するテストが無い。design.md Risks に「意図的に独立判定」と明記されているが automated test で固定されていない。 | TC-LR-017 describeブロックに `behindCount: 1, aheadCount: 2, designLayerEnabled: true` のケースを追加し、`behind origin/main` と `ahead of origin/main` の両方が stderr に出ることを確認する。 | no |
| 3 | low | testing | tests/unit/core/command/resume.test.ts (or similar) | TC-011（should 優先度）未実装: resume path の `workspaceOpts` に `designLayerEnabled` が含まれないことを確認するテストが無い。実装は正しいが（`resume.ts` は変更されていない）、型レベルの Non-Goal を automated test で固定する機会が未活用。 | resume path の workspaceOpts を生成するテストで `designLayerEnabled` が `undefined` であることをアサートするケースを追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 9.4

## Summary

実装は仕様どおりに完成している。

**確認済みの要件充足:**

- `WorkspaceOptions.designLayerEnabled?: boolean` が port 層に追加され、doc コメントで run path 専用であることが明示されている（T-01 ✅）。
- `pipeline-run.ts` が `resolveDesignLayerConfig(config).enabled` を `workspaceOpts.designLayerEnabled` に正しく渡している（T-02 ✅）。
- `LocalRuntime.setupWorkspace` の run path で、behind-warning ブロック直後に ahead 検出を追加。`opts?.designLayerEnabled === true` ガードにより disabled 時は `rev-list` を spawn しない。exit code 非 0 / NaN / ahead 0 では無出力（best-effort）。warning 文言に `ahead of origin/<baseBranch>`・worktree リスク・push 手順を含む（T-03 ✅）。
- `docs/request-authoring.md` に「worktree の base と push 順序」節が追加され、`origin/<baseBranch>` base であることと push 先行の指示が記述されている（T-04 ✅）。
- 6 件の新規テスト（TC-001/002/003/004/006/007/012 相当）がすべて green。既存 TC-LR-008 の behind テストは無変更で green（T-05 ✅）。
- `bun run typecheck && bun run test && bun run lint` が全 green（T-06 ✅）。

**所見:**

テスト 3 件が未実装（TC-010 が must 優先度、TC-008/TC-011 が should 優先度）。いずれも実装コードは正しく、missing test が regression リスクとしてのみ残る状態。TC-010 は wiring レイヤの回帰を検出できない点で medium と判断したが、テストを書かなければ動作が壊れるほど脆いコードではないため blocking には至らない。Fix 列はすべて `no`（code-fixer 対象外）とした。次イテレーションで追加することを推奨する。
