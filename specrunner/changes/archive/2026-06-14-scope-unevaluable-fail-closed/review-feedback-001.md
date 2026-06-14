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
| 1 | low | maintainability | `src/core/step/scope-check.ts` | モジュール冒頭の "Wiring" コメント（step 2: "Fetch changed files"）と関数 JSDoc の "Returns" 節が、新設の fail-closed 分岐（predicate=false → UNKNOWN finding を返す）を記述していない。将来の読者が predicate チェックを見落とす可能性がある。 | Wiring を 5 ステップに更新（1.Guard / 2.predicate=false→UNKNOWN / 3.listChangedFiles / 4.deriveScopeBreach / 5.synthesize）。`computeExtraScopeFindings` の JSDoc "Returns" 節に「canDeriveChangedFiles()===false のとき UNKNOWN finding を返す」行を追記する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.55

## Summary

実装は仕様・設計と完全に整合している。以下の観点を確認した。

**正確性（10）**

- `canDeriveChangedFiles?.() === false` による fail-closed 分岐が `listChangedFiles` 呼び出し前に置かれ、設計 D6 の「`listChangedFiles` を呼ばず」AC を満たしている。
- `synthesizeScopeUnverifiableFinding` は `origin:"scope"` / `resolution:"decision-needed"` / `severity:"high"` / 決定的ファイルアンカー（`specrunner/changes/${slug}/request.md`）で合成され、設計 D5 に沿っている。
- predicate absent / `true` → `=== false` が偽 → 既存経路（`listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings`）へ完全フォールスルー。#689 との parity が T-07 テストで固定されている。
- 解決済み UNKNOWN finding は `filterUndecidedFindings` で除外 → `deriveJudgeVerdict` が `approved` → re-escalation ゼロが T-06 テストで確認済み。

**セキュリティ（9）**

- 本変更自体が fail-open → fail-closed のセキュリティハードニング。managed 上で `permissionScope` を宣言した profile が「評価できなかった」を「スコープ内だった」に畳む穴を塞いでいる。
- `options` に「リスク受容で前進する」を含め、人間が意思決定して脱出できる逃げ道を残している（D6 の「出口は人間へ」）。
- local の git エラー由来 `[]`（状態 (b)）は依然 fail-open だが、これは明示的スコープ外（既知 debt）。

**アーキテクチャ（10）**

- `canDeriveChangedFiles` を port の optional predicate として追加し、domain（scope-check.ts）が `LocalRuntime` / `ManagedRuntime` の具象クラスを直接 import しない。B-1（domain→adapter 非依存）を遵守。
- `RealRuntimeStrategy = RuntimeStrategy & { canDeriveChangedFiles(): boolean }` により `src/core/runtime/` 具象クラスが predicate 実装を省略するとコンパイル時に落ちる（型レベル pin）。
- B-11 arch test が `src/core/runtime/` 内の bare `implements RuntimeStrategy` 不在を grep で固定（bypass 封じ）。
- `synthesizeScopeUnverifiableFinding` は `src/core/pipeline/scope.ts`（pure module, no fs/child_process）に追加。B-5 call-site invariant が自動でカバー。
- DSM closure テストが green。B-1〜B-11 全 pass。

**パフォーマンス（10）**

- predicate=false のとき `listChangedFiles`（git spawn）を呼ばず即 return するため、managed での不要な git 操作が構造的に消える。

**保守性（8）**

- finding #1（低）：`scope-check.ts` の module doc "Wiring" コメントと関数 JSDoc "Returns" 節が新設 fail-closed 分岐を記述していない。コードの正確性・動作には無影響だが、将来読者の理解コストが上がる。非ブロッキングで次の機会に対応すれば十分。

**テスト（10）**

- `tests/unit/core/step/scope-escalation.test.ts` に T-06（fail-closed integration）・T-07（#689 parity）を追加。全 must テストケース 22 件が automated で網羅されている。
- `tests/unit/runtime/list-changed-files.test.ts` に `canDeriveChangedFiles` unit test（TC-004）を追加。
- `tests/unit/architecture/core-invariants.test.ts` に B-11（bare implements 不在 pin + regression guard + false-positive テスト）3 件を追加。
- `bun run typecheck && bun run test` が green（394 ファイル / 5206 テスト全 pass）。
- 既存テストは無変更で green（activation テスト / decision-ledger テスト / FindingResolution 不変テスト を含む）。
