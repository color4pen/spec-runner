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
| 1 | LOW | Test cleanup | `tests/finish-orchestrator.test.ts` L91-92 | `makeStubFs` に `if (p.includes("specs")) return Promise.resolve(false); // specs/ dir check → false (skip merge)` が残る。T-04 は L73 コメントのみを対象としているため、このスタブコメントは stale になる。テスト失敗には至らない。 | T-04 の scope に L91-92 のコメント更新を含めるか、実装時に合わせて整理する。 |
| 2 | LOW | Requirement gap | `README.md` | Requirement 4 は README から delta→baseline 反映記述を除く旨だが、現 README の `job finish` 説明（L83）はすでに "Squash-merge PR + archive" のみで spec-merge への言及がない。該当タスクは不要。 | 対応不要。AC「README の finish 説明に delta→baseline 反映の記述が無い」は現状で既に充足。 |
| 3 | LOW | Baseline staleness (by design) | `specrunner/specs/request-authoring-guard/spec.md` L76 | T-05 で prompt の recommendation 文言が変わった後、baseline spec L76（"authority spec は finish の spec-merge が delta から自動更新すること"）の記述が実態と乖離する。ただし baseline corpus の更新は ADR D4 / baseline-capability-consolidation スコープ外と明示済み。 | 対応不要（本 request のスコープ外）。baseline-capability-consolidation で整理する。 |

## Review Notes

- **設計整合性**: design.md D1〜D8 はすべて tasks.md T-01〜T-08 に対応しており、撤去・更新対象ファイルに漏れなし。
- **テスト整合性**: TC-RR-014 が `spec-merge` 文字列をアサートしているが、T-04 で明示的に更新対象として指定されている。T-05 と T-04 の実行順序依存はなく、独立して対応可能。
- **受け入れ基準の検証可能性**: `grep -r "spec-merge\|mergeSpecsForChange\|baseline-headers" src/` による自動確認が T-08 に明示されており、AC 全項目が機械検証可能。
- **セキュリティ**: 機能削除のみ。新規 attack surface・入力バリデーション変更・認証経路の変更なし。OWASP 観点で懸念事項なし。
- **スコープ妥当性**: baseline corpus の更新（ADR D4）を明示的に除外し、本 request の scope を spec-merge 撤去に絞っている。境界が明確。
