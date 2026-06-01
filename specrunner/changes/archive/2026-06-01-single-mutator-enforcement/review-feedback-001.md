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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | tests/unit/architecture/arch-allowlist.ts | B-9 エントリが B-1 と B-3 の間（行 89〜123）に配置されており、ファイル先頭の governance コメント「Ordered by invariant, then by file」と順序が不一致。数値順では B-9 は B-3 より後に置くべき。 | B-9 セクションを B-3 セクションの後ろに移動する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.15

## Summary

### 受け入れ基準の確認

- [x] 「status 直書きは `transitionJob` 経由のみ」の歯が存在し、現状 bypass を allowlist で凍結して suite が green  
  → B-9 describe ブロック + filterViolations により 3 件の bypass を凍結。verification で全 3283 テスト pass 確認済み。

- [x] allowlist に無い新規 status 直書きを足すと suite が red（regression guard を実テストで実証）  
  → T-04 セクションに 2 件の B-9 regression guard を追加。inject パターンで検出・suppression の両方を実証。

- [x] bypass エントリが grep authoritative に全件列挙されている  
  → 実際に `grep -rEn` を手動実行して確認: `store/job-state-store.ts:249`, `exit-guard.ts:24`, `local.ts:395` の 3 件が全件マッチ。`src/adapter/` の `SessionResult.status: "terminated"` は JobState mutation ではなく除外正当（設計 D3 に明記）。

- [x] プロジェクト標準 verification が green  
  → verification-result.md: build/typecheck/test/lint すべて exit 0。

### 実装の検証

**grep パターン網羅性**: `status:\s*"(running|failed|awaiting-resume|awaiting-merge|terminated|archived|canceled)"` は `src/state/schema.ts` の `JobStatus` 型定義（7 値）と完全一致。JobStatus 値の追加漏れなし。

**allowlist パターン精度**:
- B9-store-fail: `"failed" as JobStatus` → `store/job-state-store.ts:249` に一致 ✓
- B9-exit-guard: `"awaiting-resume"` + file=exit-guard.ts → `exit-guard.ts:24` のみに一致 ✓（local.ts はファイルチェックで除外）
- B9-signal-handler: `"awaiting-resume" as const` + file=local.ts → `local.ts:395` のみに一致 ✓

**false positive の排除**:
- `src/core/finish/job-state-update.ts:4` — ` * TC-029: awaiting-merge → status: "archived"...` は JSDoc コメント行（`*` 始まり）→ `isCommentLine()` が正しく除外
- `src/core/verification/runner.ts:357` — `PhaseResult.status: "failed"` は `core/verification/` フィルタで除外
- `store/job-state-store.ts:77` — `status: "running"` は `create()` 初期化として `"running"` + store フィルタで除外

**設計判断の一貫性**: B-9 の命名・allowlist 追加方式・regression guard パターンが既存 B-1〜B-8 と統一されており、CODEOWNERS-gated な `tests/unit/architecture/` に正しく配置されている。

### 非ブロッキング指摘

- **allowlist 順序（F-1）**: 機能的問題はない。ゴミ拾い程度の修正。fixer に渡す必要なし。
