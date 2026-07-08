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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | architecture | `src/core/step/verification.ts` | スコープ外の動作変更: ワークツリーの `.specrunner/config.json` を再読み込みするロジックが追加されているが、request.md に記載された 5 件のバグ修正に含まれず、design.md・tasks.md・test-cases.md にも記述がない。既存テストは `loadConfig` 未モックのため新しい挙動を検証しておらず、ワークツリー設定が有効になるパスに到達していない。 | 変更を削除して本 PR スコープに戻すか、別 request として切り出す。残す場合はワークツリー設定優先を検証するテストと tasks.md への記述追加が必要。 | yes |
| 2 | high | architecture | `src/core/doctor/types.ts`, `src/core/doctor/checks/config/file-exists.ts`, `tests/core/doctor/checks/config/file-exists.test.ts` | spec.md の MUST 要件（`ctx.config.loadErrorPath` を hint 生成に使う）が未実装。`DoctorConfig` に `loadErrorPath` フィールドが存在せず、実装は代わりに `file-exists.ts` がエラーメッセージ文字列を直接解析して `ctx.cwd` からパスを導出している。TC-073 フィクスチャも `loadErrorPath` を設定していない（spec シナリオの GIVEN 条件と不一致）。`loadConfigWithOverlay` のエラーメッセージ変更時にサイレントなフォールバックが起きる。 | A. 設計通り: `DoctorConfig` に `loadErrorPath?: string` 追加 → `doctor.ts` catch で設定 → `file-exists.ts` で `ctx.config.loadErrorPath ?? configPath` 使用。TC-073 に `loadErrorPath` フィクスチャ追加。B. 設計改訂: spec.md/design.md の `loadErrorPath` 記述を現実装（エラー文字列解析 + ctx.cwd）に合わせて更新。どちらかを選択して一貫させる。 | yes |
| 3 | low | maintainability | `src/core/verification/changed-line-coverage.ts` | `below-threshold` 失敗メッセージに tasks.md 指定の `(X/Y changed DA lines executed)` 生カウントが含まれない（`33% coverage of changed DA lines (threshold 80%)` になっている）。request.md の受け入れ基準（実行率と閾値）は満たしており non-blocking。 | 本 PR では対応任意。対応する場合は `FailedFile` に `executedCount`/`totalCount` を追加してメッセージ生成で使用。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 6 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.75

## Summary

T-01（root 渡し）、T-02（below-threshold 区別）、T-03（ADR 修正）、T-05a/b（無効テスト修正）は正確に実装され、全 6186 テストが green。

ブロッカーは 2 件。F-01 はリクエスト定義外の動作変更（`VerificationStep` へのワークツリー設定読み込み追加）でテストなし。F-02 は spec.md が `ctx.config.loadErrorPath` を MUST 要件として定義しているにもかかわらず `DoctorConfig` にフィールドが存在せず、実装がエラーメッセージ文字列解析に代替している。TC-073 フィクスチャも spec シナリオと乖離している。両件は実装またはドキュメントを一貫させることで解消できる。

