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

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.95

## Summary

4 点の ADR 未達（P0-1 HEAD-green 未実測 / P0-2 scenario 二層凍結未検証 / P0-3 type↔strategy 未整合 / P1 specReview verdict 未検証）を同一 seam（`deriveAchievedAssurance`）で一括修正。

### 主要確認事項

**P0-1 HEAD-green 実測（D1）**: base-red 確立後に `runTestsAtCommit(finalHeadOid, materializedTestFiles)` を追加。base-red と対称の完全被覆チェック（`headPassedByFile.get(f) !== true` → absent）。unavailable / 部分 red / 欠落 → fail-closed。TC-001 integration に破壊確認コメントあり（"removing HEAD-green check → exitCode 0"）。✓

**P0-2 scenario 二層凍結（D2）**: (a) `readFileAtCommit(finalHeadOid, "<slug>/events.jsonl")` → `fold` → test-case-gen lineage → frozen hash non-null、(b) `readFileAtCommit(finalHeadOid, "<slug>/test-cases.md")` → hash 計算 → frozen と一致、(c) 既存 blob freeze の 3 条件全て必須。slug 欠落 / unavailable / null / 不一致 → fail-closed。TC-003/TC-004 unit に破壊確認コメントあり。✓

**P0-3 type gate（D3）**: `FORWARD_TYPES` を `gate.ts:29` で export し archive と共有（単一 source）。non-forward type は biteEvidence I/O をスキップ → absent。testDerivation / specReview は type gate 対象外。TC-004/TC-005 integration で固定。✓

**P1 specReview approved（D4）**: `state.steps?.[STEP_NAMES.SPEC_REVIEW]?.at(-1)?.outcome?.verdict === "approved"` のみ `"required"`。run 存在 / needs-fix / escalation / null → absent。TC-005〜TC-007 unit で全分岐固定。✓

**CommitFileResult primitive（D5）**: `git ls-tree → endsWith("/" + pathSuffix) || endsWith("-" + pathSuffix)` フィルタ → 0 件 / ≥2 件 → unavailable（fail-closed）→ `git show <oid>:<path>` → content 返却。ManagedRuntime は常に unavailable。RealRuntimeStrategy intersection に required 追加。TC-008/TC-009/TC-017/TC-018/TC-019 で網羅。✓

**P1-low testHash doc（T-06）**: `BiteEvidenceRecord.testHash` と `gate.ts` コメントを「gate 実行時の worktree 内容 digest（baseOid 内容でない）」に修正。behavior 不変。✓

### 非ブロッキング観察

- **suffix matching**: `endsWith("-" + pathSuffix)` でスーパーセット slug（例: "b" と "super-b"）が複数一致しうる。設計 D5 が「複数一致 → unavailable（fail-closed）」として明示的に受け入れ済み。fail-closed 側に倒れるため安全。
- **TC 番号の衝突**: 旧 floor provenance テスト TC-001（unavailable → fail-closed）と新 integration テスト TC-001（HEAD:red → fail-closed）が同番号。ファイル分離されており機能的問題なし。
- **`materializedTestFiles.length === 0` 重複チェック**: base-red / HEAD-green 判定内で再チェックしているが L212-215 で既に early return 済みで到達不能。防御的コードとして許容範囲。

### Verification

```
bun run typecheck: green (0 errors)
bun run test:      green (535 test files, 7325 tests)
```

全 must TC（TC-001〜TC-009）カバー済み。T1/T3 破壊確認コメント存在確認済み。backward-compat 無変更 green 確認済み。
