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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Design/Risk | design.md | subcommand dispatch で worktree guard を parseFlags の後ろへ移動すると、guarded subcommand（start/resume/archive）に invalid flag を渡した場合のエラーメッセージが guard エラーから FlagParseError に変わる。design.md Risks で言及済みだが spec.md にシナリオがないため、実装者が意図を見落とすリスクがある。 | 対応不要（risks に明記済み、非ゼロ exit という実害は不変）。必要なら spec.md に regression guard シナリオを追加する。 |
| 2 | LOW | Spec completeness | spec.md | `specrunner run --help`（normal dispatch の required positional コマンド）に対応するシナリオが spec.md に存在しない。T-04 のテストケースには記載されているが、Layer-1 振る舞いとして spec.md に明示されていない。 | 対応不要（T-04 でカバー済み）。spec.md への追記は任意。 |
| 3 | LOW | Implementation note | tasks.md T-03 | `stdoutWrite` が command-registry.ts の他の handler（archive の catch ブロック等）でも使われており、T-03 の「未使用なら整理」という記述が曖昧。import 削除の前に他用途を確認する手順が未記載。 | 対応不要（implementer が判断する範囲）。必要なら T-03 チェックリストに確認手順を追記。 |

## 検証メモ

- **D1（--help 予約）**: flag-parser.ts L85-88 の unknown flag throw より前に `flagName === "help"` を short-circuit する設計は実コードと整合している。`--help=anything` シナリオも `eqIdx` による flagName 算出後に予約判定が入るため正しく動作する。
- **D2（positional スキップ）**: L127 の `positionalDef?.required` 条件を `&& !flags["help"]` に変更するだけで要件を満たす。count 対応（L128）も同条件で自然にスキップされる。
- **D3（dispatch 共通 help 処理）**: bin/specrunner.ts の subcommand 経路（現 L54 guard → L66 parseFlags）と normal 経路（現 L84 parseFlags → L86 guard）の両方で、parseFlags 直後・guard 前に help 判定を差し込む構造が明確に記述されている。
- **D4（RUNTIME_RESET_USAGE 後方互換）**: runtime reset subDef は現在 `usage` フィールドを持たず（L561-573 確認）、handler にハードコードされている。T-03 で subDef に `usage: RUNTIME_RESET_USAGE` を追加してから handler 内分岐を除去する手順は正しく、backward compat を保つ。
- **セキュリティ**: usage 文字列はコード定数から取得し、ユーザー入力を反映しない。`process.stdout.write(usage)` / `process.exit(0)` に injection リスクはない。OWASP Top 10 の該当項目なし。
- **spec.md 規則適合**: 全 Requirement が `### Requirement:` ヘッダ・`#### Scenario:` ・`SHALL`/`MUST` 正規語を持ち、規則に適合している。
