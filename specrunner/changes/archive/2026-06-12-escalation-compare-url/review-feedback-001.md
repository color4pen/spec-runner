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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | src/core/notify/issue-notifier.ts | `buildCompareUrl` は export されているが、現在の呼び出し元は同ファイルの `buildEscalationComment` のみ。外部テストで直接インポートしているため export は妥当。問題なし。 | n/a | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.65

## Summary

実装は design.md の D1/D2/D3 に忠実に対応している。

**D1（base-branch の state 永続化）**: `RequestInfo.baseBranch?: string | null` を optional で追加し、backward compat を保持。`pipeline-run.ts:89` で `baseBranch: request.baseBranch` を `bootstrapJob` に渡す 1 行追加のみ。`...params.request` spread により `buildInitialJobState` は変更不要、`...s.request` spread により `local.ts` / `managed.ts` の resume 経路も保全される。

**D2（`buildCompareUrl` の純関数化）**: `buildCompareUrl(owner, repo, base, branch): string` は副作用なし・テスト容易・SSOT。URL 形式の変更点が 1 箇所に集約されている。

**D3（branch null 時の省略）**: `if (state.branch)` で null と空文字を両方 falsy として扱い、URL 行を省略。`state.request.baseBranch ?? "main"` で legacy state の欠落を吸収。

**受け入れ基準の充足**:
- TC-001（must）→ TC-N-013: branch 確定時の URL 含有を固定 ✅
- TC-002（must）→ TC-N-014: branch null 時の URL 省略を固定 ✅
- TC-003（must）→ TC-N-015: base-branch 非 main（develop）の反映を固定 ✅
- TC-005（must）→ TC-BB-001: baseBranch の persist→load round-trip を固定 ✅
- TC-006（must）→ TC-BB-002: legacy state（baseBranch 欠落）の load を固定 ✅
- TC-009（must）→ TC-PN-002 line 239: pipeline 経路の通知 body に compare URL が含まれることを固定 ✅
- TC-010（must）→ TC-N-013: 既存要素（marker/step/reason/resume）が URL 追加後も保持されることを固定 ✅
- `typecheck && test` green（verification-result.md にて確認済み）✅

DSM 境界（`core/notify` は `core/port` / `state` / `logger` のみ import）は維持されている。
