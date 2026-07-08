# Code Review Feedback — iteration 002

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
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/core/command/resume.ts:89-91` | design.md D4 は `worktreeGuardError("job resume", mainCheckoutPath)` の message/hint を流用する方針だが、実装は inline 文言（"job resume cannot be run from inside a specrunner worktree." / "Hint: Run from the main worktree checkout: cd …"）を直接出力している。CLI dispatch 層の汎用メッセージ（"This command cannot be run from inside a worktree."）と文言が乖離しており、将来の文言統一時に漏れ場所になりやすい。機能的には正しく non-blocking | `worktreeGuardError("job resume", mainCheckoutPath)` が返す `SpecRunnerError` の `.message` / `.hint` を `logError` / `stderrWrite` に渡す形に変更する。slug を hint に含めたい場合は worktreeGuardError の hint に追記する形で対応可能 | no |
| 2 | low | testing | `tests/unit/core/step/fast-scope-checkpoint.test.ts`, `tests/unit/core/pipeline/resolve-scope.test.ts`, `tests/core/worktree/detection.test.ts` | TC-002（should）未追加：no-breach describe 内のテストは全て `FAST_SCOPE_EMPTY`（empty forbidden）を使っており、`makeFastScopeFromConfig()`（4 surfaces 宣言済み）で safe ファイルのみを changed files に与えたとき guard-config 起因の false positive が起きないことが未検証。また TC-007（should: 無関係パス）・TC-009（should: fail-open for nonexistent cwd）も detection.test.ts に未追加 | fast-scope-checkpoint.test.ts の no-breach describe に `makeFastScopeFromConfig()` + safe file（例: `src/cli/index.ts`）のテストを 1 件追加。TC-007/TC-009 は detection.test.ts に追加する。いずれも should 優先度 | no |
| 3 | low | maintainability | `tests/unit/core/step/fast-scope-checkpoint.test.ts:2-6,210`, `tests/unit/core/pipeline/resolve-scope.test.ts:10,354,357` | surface 数が guard-config 追加により 4 になったが、コメント・describe 名・fixture コメントが引き続き「3 surfaces」「3 dogfooding surfaces」と記載されている | 該当箇所を「4 surfaces」に更新する | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.55

## Summary

review-001 のブロッキング指摘（F-001, high: `detectSpecrunnerWorktree` の直接単体テスト欠如）が解消された。

**修正確認済み:**
- `tests/core/worktree/detection.test.ts` に `detectSpecrunnerWorktree` describe が追加され、TC-005（worktree 内パスを `isSpecrunnerWorktree: true` と判定し `mainCheckoutPath === await fs.realpath(tmpDir)` を assert）と TC-006（main checkout パスを `isSpecrunnerWorktree: false` と判定）が実装済み。

**受け入れ基準 全 5 項目 充足:**
- fast job が `.specrunner/config.json` を変更した fixture で conformance が breach を検出（fast-scope-checkpoint.test.ts の guard-config breach テスト 2 件 green）
- dogfooding テストが guard-config surface の id と path を固定（resolve-scope.test.ts lines 425–438）
- worktree 内 cwd からの `job resume` が config 読み込み前に exit 2 で拒否（TC-WORKTREE-GUARD の 3 ケース green）
- main checkout からの resume は既存テスト無変更で green
- `typecheck && test`: verification-result が passed を記録

残存指摘（F-1〜F-3）は全て low 優先度で機能的な正確性に影響しない。merge を止める理由はない。

