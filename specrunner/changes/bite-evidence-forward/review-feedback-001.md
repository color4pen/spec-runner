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
| testing | 8 | 0.10 |

- **total**: 8.9

## Summary

base/candidate OID capture と forward strategy BiteEvidence gate の R4 MVP 実装を審査した。
typecheck・全テスト（7172件、521ファイル）グリーン。設計判断 D1–D8 への忠実な実装を確認。

### 評価ポイント

**正確性・設計**: `commitOid` の journal 永続化（StepAttemptRecord → fold round-trip）が正しく実装されており、resume 跨ぎの保持を保証している。gate 決定ロジック（gate.ts）は pure module に閉じており、I/O を RuntimeStrategy ports 後ろに委譲する設計は既存の ports-and-adapters パターンに忠実。空洞テスト検出（base-green を fail-closed で拒否）は要件の核心であり正しく実装されている。

**テストカバレッジ**: 17 件の must 受け入れ基準すべてに対応するテストが存在する。TC-001〜TC-010・TC-012・TC-019・TC-022・TC-026・TC-030〜TC-032 を確認。episode-reset.test.ts が strategy-deferred passthrough として既存テストを保持しており行動保存を担保。

**スコープ遵守**: 他 category strategy（refactoring/security/config）・assurance 参照・FAST_DESCRIPTOR 変更・R2/R5/R6 は全て未実装でスコープ外として正しく除外されている。

### 非ブロッキング所見

1. **"should" 優先 TC の明示ラベル欠け**: TC-013（parallel reviewer に commitOid 未設定）、TC-015（multi-run 最新 OID）、TC-024（runTestsAtCommit unavailable → defer）、TC-025（materialize 済みファイル 0 件 → failed）、TC-028（parseResult 3値マッピング）の明示的テストなし。コード実装は正しい。R4-follow-up で補完可能。

2. **`bun test` ハードコード**: `runTestsAtCommit` が `verification.commands` 未設定時に `bun test <file>` をデフォルト使用（local.ts:909-916）。SpecRunner 自身は Bun プロジェクトであり実用上問題なし。design.md Open Questions に記録済みで MVP スコープ内。

3. **Tamper 検知の fail-open on missing lineage**: frozen hash 不在時は inconclusive（fail-open）。base/candidate 歯は inconclusive でも執行されるため受け入れ可能なトレードオフ。design.md D6 Risks に記録済み。

