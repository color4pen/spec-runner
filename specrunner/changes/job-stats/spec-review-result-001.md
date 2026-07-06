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
| 1 | LOW | Spec inconsistency | design.md D8 vs tasks.md T-02 | `deriveRunStat` の引数定義が食い違う。design.md D8 は `deriveRunStat(state, usageFile \| null, reviewerNames)` と第 3 引数を列挙するが、tasks.md T-02 は `deriveRunStat(state: NormalizedJobState, usageFile: UsageFile \| null)` の 2 引数とし、reviewer 名は `state.reviewers?.map(r => r.name)` で内部導出すると明記する。tasks.md の定義が正しく（state から直接得られる）、design.md は古い草稿の名残。 | tasks.md を正とし、実装は 2 引数で進める。design.md D8 の記述は「（reviewer 名は state から導出）」程度の注記を付加すれば充分で実装ブロックにはならない。 |
| 2 | LOW | Edge case unspecified | spec.md / tasks.md T-02 | `durationSec` の導出（`max(endedAt) - min(startedAt)`）でクロックスキューや journal 破損により差分が負になるケースが未定義。現状の仕様では「有効 timestamp が無ければ null」しか明示されていない。 | 実装時に「差分 < 0 は null 扱い」とするのが自然な防御実装。spec に明示がなくてもテストで固定できる。実装ブロックにならない。 |

## Notes

- **コード参照の検証**: request.md が引用する参照箇所（`event-journal.ts:31-53`, `fold()` の `FoldResult`, `usage/types.ts`, `computeCostUsd`, `job-show.ts:computeStepCosts`, `paths.ts:usageJsonPath`）をすべて確認。実コードと一致。`usageJsonPath(slug)` = `specrunner/changes/<slug>/usage.json`（per-run）であることも確認。
- **`readUsageFile` on ENOENT**: 実装は `{ commandInvocations: [] }` を返す（null ではない）。T-04 の「usage.json 不在なら `usageFile = null`」は changeDir が null のケースを指しており、changeDir が存在する場合は readUsageFile が空ファイル扱いで戻る。どちらも priced pair = 0 → `costUsd = null` に帰結するため振る舞いは仕様と一致。
- **セキュリティ**: read-only コマンドでネットワーク通信なし。ファイルパスはシステム内部の slug 解決から導出され、CLI 引数（`--json` boolean のみ）に外部文字列は含まれない。シェルインジェクション・パストラバーサル・JSON インジェクションの経路なし。OWASP Top 10 該当項目なし。
- **受け入れ基準の網羅性**: request.md の 5 つの受け入れ基準（fixture テスト固定、欠損 3 種の fail 回避、JSON キー集合固定、既存テスト green、typecheck && test green）はいずれも tasks.md T-02〜T-06 でカバーされている。
- **HIGH / CRITICAL 所見なし**。上記 LOW 2 件は実装で自然に対処できる細部であり、実装開始をブロックしない。
