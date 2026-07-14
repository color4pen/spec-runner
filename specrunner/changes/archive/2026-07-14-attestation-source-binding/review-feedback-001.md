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
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.0

## Summary

全 5 件の受け入れ基準を満たし、test-cases.md の 22 ケース全件をカバー。`typecheck && test` グリーン確認済み。

### 設計核心の検証

D1（metadata commit 除外）の核心ロジックを重点検証した。

- `readSourceRevision` は `git rev-list -1 HEAD -- . ':(exclude)specrunner/changes'` を使用し、change folder のみを変更した commit（= request-review 自身の metadata commit）を読み飛ばして source commit sha を安定的に返す。
- 除外パスは `changesDirRel()` から導出されており、文字列リテラルのハードコードがない（D2 の drift 防止を実装で保証）。
- TC-FCA-09 valid ケースは「source commit → change folder commit（request-review 相当）」という 2 commit 構造の一時 git repo で `enrichContext` が valid を返すことを end-to-end で検証しており、D1 の本質を正しく固定している。
- TC-SRC の pathspec 不変条件テストは、source commit → change folder commit → 別 source commit という 3 commit 系列で `readSourceRevision` の値変化を追跡し、除外パスが正しく機能することを確認している。

### 各受け入れ基準の対応

| AC | 実装 | テスト |
|----|------|--------|
| source 一致 → valid | `evaluateFactCheckAttestation` step 4 | TC-FCA-04 / TC-FCA-09 valid |
| source 不一致 → stale（核心） | step 3 `parsed.sourceRevision !== currentSourceRevision` | TC-FCA-04 "sourceRevision differs" / TC-FCA-09 stale-rev |
| 旧 attestation（sourceRevision 欠落）→ stale（fail-safe） | step 3 `parsed.sourceRevision === undefined` | TC-FCA-04 "no sourceRevision" / TC-FCA-09 stale-nosource |
| requestHash 不一致・codeAssertionsVerified false → stale（既存保存） | step 2（変更なし） | TC-FCA-04 hash/verified variants |
| typecheck && test グリーン | — | verification-result.md: 6915 tests passed, 0 type errors |

### 軽微な観察（ブロックなし）

- **TC-FCA-09 "stale when attestation has no sourceRevision (old attestation, non-git dir)"**: 非 git tempDir を使用しており、`currentSourceRevision === null`（fail-safe path）と `parsed.sourceRevision === undefined`（旧 attestation path）の 2 条件を同時に試している。結果は同一（stale）なので正しいが、条件の分離には若干の曖昧さがある。別の独立テストに分けると読解性が上がる可能性があるが、機能的には問題なし。
- **`buildRequestReviewInitialMessage` の sourceRevision 埋め込み**: JSON テンプレート中の `sourceRevision` 値を文字列補間で挿入している（`"${sourceRevision}"`）。sha 値はバイナリ安全な hex 文字列であり JSON インジェクションの余地はないため許容範囲。
