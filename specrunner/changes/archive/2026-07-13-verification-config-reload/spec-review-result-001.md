# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Testability | tasks.md T-05 | T-05 は `VerificationStep.run` を実呼び出しするが、`runVerification` がシェルコマンドを実行するパス（build/test 等）のモック手段を明示していない。`getChangedFilesAndLines` のみモック対象として挙げられており、commands 実行層を回避する方法（例: `verification.commands` を no-op にする、`runVerification` 自体を partial mock にする）の記述が不足。実装時に環境依存 or テスト複雑化が起きうる。 | T-05 の構成説明に「`runVerification` の commands 実行はモック or 空 commands で短絡する」旨を 1 文追加する。spec の受け入れ基準（exclude が反映されて pass）には影響しないため HIGH 昇格不要。 |
| 2 | LOW | Clarity | design.md D4 | design は「`resolveRepoRoot(deps.cwd)` で worktree root を得る」と述べるが、git linked worktree では `git rev-parse --show-toplevel` が worktree パスを返す（main checkout ルートではない）ことを明示していない。spec 読者が main checkout と混同する余地がある。 | D4 の rationale に「git linked worktree では `git rev-parse --show-toplevel` は worktree パスを返す。したがって `loadConfig(repoRoot)` が参照するのは `<worktree>/.specrunner/config.json` = build-fixer が編集するファイルであり、整合する」と補足する。動作は正しいため blocking なし。 |

## Summary

**問題の特定と設計の対応は正確。** `deps.config` が job 開始時に一度だけ load される構造、build-fixer が worktree の project-local config を編集する topology、そして `runVerification` への `coverage` 引数 pass がいずれもコードと一致している（`verification.ts:36`, `runner.ts:329`）。

**設計判断（D1–D5）は一貫していて妥当。**
- D2（`coverage` 1 フィールドのみ差し替え）で gate 弱体化面を最小化。`commands` を再 load 対象から外す理由（build-fixer がテストコマンド自体を除去できる攻撃面）が明示されており、セキュリティ観点で適切。
- D3（fail-safe to job-start config）で `reloadCoverageConfig` が例外を外に出さない設計は、verification の crash 防止として正しい。
- D4（project-local 存在 gate）が managed runtime での regression を防ぐ。

**受け入れ基準・シナリオは spec.md で網羅的に固定されている。** 「in-memory ではなく disk 再解決に由来する pass」を明示する T-05 の構成は、self-heal の因果を実証する良い設計。

**セキュリティ**（OWASP 観点での主要リスク）:
- config 注入: `loadConfig` は `JSON.parse` + schema validation を経由し、生データを直接評価しない。不正 JSON → fail-safe。
- gate 弱体化: `commands` 非再 load + PR 経路不変 + `evaluateChangedLineCoverage` 変更なし（スコープ外厳守）で経路が閉じている。
- 境界外ファイルアクセス: `resolveRepoRoot` は git に委任し `cwd` 以外を探索しない。path traversal 面なし。

LOW 2 件はいずれも docs / test 実装の補足であり、動作の正しさには影響しない。仕様として実装可能な状態にある。
