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
| 1 | low | testing | tests/attach/attach-integration.test.ts | TC-INT-005 は `resolveJobStateBySlug` を呼ばず受け入れ基準「attach → resume が成立する経路をテストで固定する（must）」を間接的にしか担保していない。テストは worktree の state.json と sidecar の形状を確認するが、実際の `resolveJobStateBySlug` 呼び出しを省略している。またテストのコメントが「listWithSourceDirs は main checkout の specrunner/changes/ だけをスキャンする」と記述しているが、実際には `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` も走査する（job-catalog.ts L98-99）。実装は正しく、発見メカニズムは job-state-store-list-with-source-dirs.test.ts で別途検証済みだが、テスト名と承認基準の明示的な要求とが一致していない。 | TC-INT-005 内で `resolveJobStateBySlug(SLUG, targetDir)` を呼び出し、返り値が `awaiting-resume` の状態を持つことをアサートする。コメントの誤記（スキャン範囲）も修正する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.9

## Summary

実装は設計仕様（ADR-20260715、design.md）に忠実で品質が高い。

**正しく実装されている点:**

- `verifyCheckpoint` は純粋な判定関数として分離されており、materialize 前に throw することで「検証を通過してから初めてローカル状態を作る」順序が制御フロー上の構造で保証されている（D2）。
- 検証項目 (a)-(e) が設計どおりの順序で実装されており、各項目が独立した typed error で拒否される。
- `composeSplitLayoutFromContent` の抽出は挙動不変リファクタとして正確に行われており、既存の `composeSplitLayout` / `loadSplitLayout` は薄いラッパに振替えられた。
- `attach-from-checkpoint` plan variant は追加のみで既存 4 arm に一切触れない最小侵襲な実装。arm 内で seed / updateJobState / recopyDraftToChangeFolder を呼ばないことも正しい。
- `writeLivenessSidecar(slug, jobId, worktreePath, null)` で pid=null が付与され、D3（reconstruction contract）を満たす。
- `checkpoint-ref.ts` が `src/core/` / `src/adapter/` を import していない層制約を遵守。
- TypeCheck + 510 ファイル / 7013 テスト全て green。

**唯一の指摘 (low / no-fix):**

TC-INT-005 が `resolveJobStateBySlug` を直接呼ばず承認基準「attach → resume が成立する経路をテストで固定する（must）」を間接的にしか担保していない。実装の正しさは他のテスト（listWithSourceDirs のスキャン挙動）で担保されているため、マージブロックにはしないが、後続 PR での補完を推奨する。テストコメントの誤記（スキャン範囲）も併せて修正されると望ましい。
