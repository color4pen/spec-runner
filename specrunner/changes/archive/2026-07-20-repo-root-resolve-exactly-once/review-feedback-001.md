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
| 1 | low | testing | tests/unit/cli/repo-root-exactly-once.test.ts | TC-007 は「always GREEN」と自己コメントしており、mutation check としての実効性がない。T2 破壊確認は TC-015（core-invariants.test.ts）が担っているので必須要件上の問題はないが、TC-007 自体は revert を検出しない文書テストになっている | TC-007 を「revert したとき TC-003 が落ちることを示すコメント」に読み替えるか、dispatch 経路で cancel を revert したときの TC-003 落ちに言及するコメントを追加する（次 PR での改善余地） | no |
| 2 | low | testing | tests/unit/cli/repo-root-exactly-once.test.ts | TC-008 に `job attach` outside-repo の dispatch テストがない。TC-024（requiresRepo: true 構造確認）と TC-027（cwd/repoRoot 分離）で構造的には保証されているが、dispatch guard の行動を直接 assert していない | TC-008 に `["job", "attach", "--branch", "dummy"]` outside-repo ケースを追加する（次 PR） | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.5

## Summary

全受け入れ基準 T1–T5 を満たしており、verification 全フェーズ green。マージ可。

**T1（転換の同値性）**: 9 ハンドラ全てで handler 内 re-resolution が除去され、dispatch-resolved `ctx.repoRoot` を使う形に正しく転換されている。`init` / `inbox` / `prune` / `cancel` / `attach` は `requiresRepo: true` 経由で dispatch guard が効き、`job-show` / `config-effective` / `bootstrap` / `ps` は DI パラメータで受け取る形に変換済み。behavioral tests（TC-001/002/006/008/019/021/022/023）で挙動を固定済み。

**T2（exactly-once の歯）**: `core-invariants.test.ts` に grep-based confinement invariant（TC-003/004/005）と regression guard（TC-015、inbox と cancel で合成注入 flagging / ps で抑制）を追加。設計 D5 の要件を完全に満たしている。

**T3（allowlist 縮小）**: `CWD-init-git-spawn` / `CWD-job-show-root-resolve` / `CWD-inbox-debt` / `CWD-config-effective-di-default` の 4 エントリが削除されており、追加エントリなし。`CWD-ps-root-resolve` / `CWD-job-show-print-default` 維持。TC-009/016 で自動検証済み。

**T4（識別子一意）**: ADR の `B-13` 参照（4 箇所）が `CWD invariant (T-05)` に置き換えられており、repo-wide で `B-13` は StepExecutor single-writer コンテキストのみに残存。TC-010/018 で自動検証済み。

**T5（typecheck && test）**: 561 test files / 7666 tests all green、typecheck clean、lint clean。

所見 2 件はいずれも low severity で次 PR での改善余地。今回の必須要件には影響しない。
