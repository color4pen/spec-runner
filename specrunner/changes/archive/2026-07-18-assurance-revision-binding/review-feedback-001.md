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
| 1 | LOW | Naming | `achieved-assurance-revision-binding-unit.test.ts` | "Never throws" ブロックの describe 名が `"TC-017 invariant"` になっているが、TC-017 は「blob freeze が独立した歯として存置」であり別テスト。コードを追う際に誤解を招く。 | describe 名を `"never throws invariant (backward-compat)"` 等に変更する。assertions / 機能への影響なし。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.9

## Summary

実装は spec・design・tasks.md の記述と完全に一致しており、受け入れ基準 T1〜T7 をすべて充足している。
production 変更は `src/core/archive/achieved-assurance.ts` の 1 ファイルに閉じ（port / runtime / caller 無変更）、
`fold` / `event-journal` import は撤去済み。537 テストファイル / 7358 テスト全 green。

### 受け入れ基準の充足確認

**T1（scenario time-boundary 歯）**: TC-001（unit） + TC-008（integration）が `testCaseGenOid` 跨ぎ比較で hash 不一致 → fail-closed を固定。両ファイルに `DESTRUCTIVE INVARIANT` コメント（同一 commit 復帰で通ってしまう旨）あり。✓

**T2（協調改竄の歯 — #850 の穴）**: TC-002（unit）+ TC-009（integration）が events.jsonl@HEAD を S' に書き換えても commit-OID 束縛で fail-closed を固定。破壊確認コメントあり。✓

**T3（scenario positive E2E）**: TC-013（`bite-evidence-e2e-gate.test.ts`）が別 repo に `spec-review → test-case-gen → test-materialize → implementer → tamper-scenario → tamper-spec` の実 git commit 系列を構築。`finalHeadOid = implementer commit`（anchor と別 commit）で `biteEvidence=required` かつ `specReview=required` 成立を実 LocalRuntime で確認。✓

**T4（specReview time-boundary 歯）**: TC-005（unit）が `spec.md` 不一致 → absent を固定。TC-006（unit）・TC-010（integration）が positive（spec.md 不変 + approved → exitCode 0 + merge）も固定。✓

**T5（fail-closed 網羅）**: TC-004 (i)〜(v)（unit）が testCaseGenOid 欠落・commitOid なし・anchor unavailable・HEAD unavailable・slug 欠落の 5 ケースを固定。TC-007 (i)〜(iii) が specReviewOid 欠落・spec.md@anchor unavailable・spec.md@HEAD unavailable を固定。TC-011 (i)〜(vi)（integration）が各 exitCode 1 を固定。✓

**T6（実 config anti-regression）**: TC-012 が `runTestsAtCommit` unavailable（scopedTestCommand 未設定相当）で exitCode 1 を固定。#848 の歯を退行させていない。✓

**T7（backward-compat）**: 既存テストは「意味が変わる期待更新（scenario-freeze 系・specReview 束縛系）」のみ更新し、他 assertions は無変更で green。537 ファイル / 7358 テスト全 green（verification-result.md）。production 変更 1 ファイルのみ。✓

### 実装の正確性

- **D1（scenario 凍結 OID 束縛）**: `testCaseGenOid` → `slug` → `readFileAtCommit×2` → content hash 比較の制御フローが fail-closed 前例と一致。events.jsonl 依存なし（import 撤去を grep で確認）。blob freeze は独立した歯として存置。✓
- **D2（specReview revision 束縛）**: `floor.specReview !== undefined` のときのみ実行。verdict approved → specReviewOid → finalHeadOid → runtime.readFileAtCommit → slug → `spec.md` 両 OID 取得 → hash 一致のすべてが揃ったときのみ `specReview = "required"`。いずれか欠落で fail-closed。early-return しないため後続の bite/derivation 評価に影響なし。✓
- **fail-closed**: 全 return パスで該当次元が absent に倒れる。fail-open を生む経路なし。✓
- **never throws**: try/catch + diagnostic で全ブロック保護。✓

### スコープ確認

- journal agent-write 保護 / 全 step epistemic-contract 監査 / per-scenario 実行: いずれも Non-Goals に理由付きで明示。歯を黙って削っていない。✓
- `isSpecRequired` による束縛緩和なし（TC-019 で歯化）。✓
