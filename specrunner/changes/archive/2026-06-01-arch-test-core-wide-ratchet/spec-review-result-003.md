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
| 1 | MEDIUM | Consistency | tasks.md (T-01, T-02) | T-01 は `src/core/runtime/local.ts` と `src/core/runtime/managed.ts` の adapter import を **B-1** 違反として allowlist に登録しているが、T-02 の layer-mapping は `src/core/runtime/` を **composition-root** に分類し B-1 スキャンから明示除外している（"`src/core/`（runtime 除く）が `adapter/` を import していないことを assert"）。composition-root → adapters は §3 closure model で ✓ の許容 edge であるため、これらは真の B-1 違反ではない。テストが runtime を B-1 スキャン対象外とする以上、allowlist の当該エントリは永久に exercised されず phantom エントリになる。ratchet の「allowlist は機械的に消費され縮んでいく」原則と矛盾する。 | 実装時に以下のいずれかで対処する。(A) T-01 の runtime B-1 エントリの invariant を `"B-1"` から `"composition-root-design"` または削除（allowed edge のため allowlist 不要）に変更し、B-2 エントリ（SDK 直 import）のみ残す。(B) `model.md` §3 上 composition-root → adapters が forbidden である（port 経由を強制する）ならば T-02 の B-1 スキャン対象に runtime を含め、allowlist エントリが実際に exercised されるようにする。どちらを選ぶかは実装者判断で可。|
| 2 | LOW | Completeness | tasks.md (T-03) | B-5 テストの grep スコープが「verdict / transition / spec-rules 相当ファイルで」と記述されているが、実装者がこれらのファイルをプログラム的に特定する方法（glob パターン、明示的ファイルリスト、ディレクトリ prefix）が未定義。現状 B-5 違反がゼロなら全 `src/core/` をスキャンしても問題ないが、`src/core/` 内の他ファイル（finish/ や step/executor.ts 等）が fs API を正当な目的で使っている場合に false positive が出るリスクがある。 | 実装時に B-5 grep スコープを `src/core/pipeline/` と `src/core/step/spec-rules/` 相当のディレクトリに限定するか、全 `src/core/` をスキャンして false positive が出ないことを確認してからパターン確定する。違反ゼロなら影響なし。 |

## Review Notes

### spec-review-002 findings の解消確認

- [x] Finding 1 (HIGH): T-03 に B-5 タスク箇条書きが追加された（`readFile\b|readFileSync\b|readdir\b|existsSync\b|statSync\b`、`__tests__/` 除外、fs seam 経由許容）→ **解消済み**
- [x] Finding 2 (LOW): T-03 B-7 パターンが `process\.(stdout|stderr)\.write\s*\(` の call-site 限定になり JSDoc false positive を回避 → **解消済み**

### セキュリティレビュー

本 change は enforcement test の追加のみ。auth / network access / user input を一切持たない。OWASP Top 10 該当なし。B-6（raw process.env 禁止）・B-7（raw stdout/stderr 禁止）の enforcement 自体がセキュリティ seam を強化する方向性であり適切。
