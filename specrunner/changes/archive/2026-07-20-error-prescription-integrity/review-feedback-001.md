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
| 1 | low | maintainability | `src/core/doctor/checks/config/file-exists.ts` | コメントが「fallback for backward-compat」と説明するが実際の fallback コードは存在しない。`configPath` は `DoctorContext` の必須フィールド（型保証あり）なので実害は無いが、コメントが誤解を招く | コメントを削除または「`ctx.configPath` を使用（必須フィールド）」に簡略化する | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.55

## Summary

T1〜T9 の受け入れ基準をすべて満たしている。

**T1（origin 処方）**: `originNotConfiguredError()` factory を `errors.ts` に追加、`remote.ts` の 2 箇所を置換。hint に `git remote add` を含み `cd into a git repository` を含まない。TC-001/TC-002/TC-017 が破壊確認を含めてカバー。

**T2（廃止コマンド機械検査）**: `hint-command-references.test.ts` が `src/**/*.ts` 全 hint を `COMMANDS` レジストリと静的に突き合わせる歯を確立。`specrunner ps` / `specrunner managed setup` / `specrunner job list` はすべて現行コマンドへ置換済み。TC-004 の破壊確認も適切。

**T3/T4/T5（next steps）**: `next-steps.ts` の純関数 `deriveNextSteps` が RULES 表から依存順に steps を導出。`formatHuman` が Summary 後に非空のときのみ `Next steps:` 節を追記。`formatJson` は完全無変更。TC-008/TC-009/TC-010 がすべての組み合わせを固定。

**T6（XDG）**: `DoctorContext.configPath: string` を必須フィールドとして追加。`doctor.ts` が `getConfigPath()` で注入。`file-exists.ts` が `ctx.configPath` を参照。`mock-context.ts` の既定値がデフォルトパスを持つ。TC-011/TC-012/TC-021（統合）で XDG 尊重を end-to-end に固定。破壊確認も配備済み。

**T7（--help）**: `DOCTOR_USAGE` 定数（`--json` 明記）を registry に追加、`doctor` エントリに付与。既存の `emitHelp` 経路がそのまま機能。TC-013/TC-020 でカバー。

**T8（auth エラー wrap）**: `git-fetch-error.ts` の `describeGitFetchFailure` が 4 パターンを大小文字無視で判定。認証系は第一文が `specrunner login` 処方、元 stderr を詳細として保持。非認証系は現行文字列と bit-identical。TC-014/TC-015/TC-019 でカバー。

**T9（README + green）**: 参加者向け `### Joining an existing project` セクション追記済み。verification-result.md が 559 test files / 7584 tests all passed を記録。

ブロッキング findings なし。非ブロッキング観察（misleading comment、orphan-sidecars.test.ts 削除）はいずれも実害なし。

