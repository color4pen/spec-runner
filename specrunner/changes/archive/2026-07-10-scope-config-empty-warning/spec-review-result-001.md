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
| 1 | LOW | Robustness | tasks.md / runner.ts | T-02「Step 5 直前」の配置位置が buildPipelineForJob を包む try-catch の外側に置かれた場合、`getPipelineDescriptor` が未知の pipeline id でスローすると pipeline エラーハンドラに補足されず execute() 外に伝播する。実際には pipeline id は prepare() 段階で検証済みのため実害はないが、記述が曖昧。 | T-02 の「Step 5 直前」の実装を try-catch の内側（`const pipeline = buildPipelineForJob(...)` の直前行）に置くよう補足するか、実装者判断に委ねて注記を省略。どちらでも挙動は同一。ブロッカーではない。 |
| 2 | LOW | Documentation | spec.md | Scenario 群が "run 準備" の文言で書かれており、resume 経路でも warning が出ることが Scenario に明示されていない（design.md の D3 には記載あり）。 | 任意対応。spec 内に「resume も scoped pipeline の実行であるため warning が出る」旨の Note を 1 行追加するか、design.md 参照を Scenario に添える。機能正確性には影響なし。 |

## Summary

コードベースの前提確認（`registry.ts:155-161`、`resolve-scope.ts:31-49`、`schema.ts:1285-1293`、`runner.ts:205-241`）をすべて行い、request・design・spec・tasks の整合性を検証した。

**設計の妥当性**:
- 判定述語 `descriptor.permissionScope !== undefined && forbidden.length === 0` は `runtime-capability-gate.ts` の presence ベース設計と完全に一致し、profile 名依存を排除している。
- `scope-warning.ts` を純粋モジュールとして分離し、emission を `execute()` の run 準備点（Step 5 直前）に 1 箇所置く構造は、モジュール state フラグ不要・テスト独立性・1 run 1 回保証の 3 つを一挙に満たす。
- `vi.mock("../pipeline/index.js")` によるテスト隔離を `scope-warning.js` の直接 import で回避する判断は既存テスト保護として正確で、D5 の Mitigation として適切。
- `applyScopeConfig` の pure 変換契約は一切触れず、既存テスト（`resolve-scope.test.ts`）が無変更で green を維持できる。

**セキュリティ評価**:
- 新規攻撃面なし。警告文言は `descriptor.id`（静的レジストリ由来）のみを埋め込み、ユーザー入力は含まない。
- 認証・認可・ストレージ・ネットワーク経路の変更なし。OWASP Top 10 の適用面なし。

受け入れ基準 7 項目の全カバレッジが tasks で確認できる。実装を進めて問題ない。
