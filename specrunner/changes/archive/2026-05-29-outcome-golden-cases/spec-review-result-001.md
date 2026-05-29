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
| 1 | LOW | completeness | tasks.md / T-02 | import パスが相対パスなしで `src/core/parser/review-findings.js` と記載されている。実際の import では `tests/unit/contract/` から3階層上の `../../../src/core/parser/review-findings.js` が必要。他のテストファイルの慣習と同じ形式。 | 実装時に `../../../src/core/parser/review-findings.js` を使うだけで解決。spec の修正は不要。 |

## Review Notes

### Architecture

**ファイル配置（D1）**: `tests/unit/contract/golden-cases.test.ts` は既存の `tests/unit/<domain>/` 慣習に合致。`contract/` ドメインとして独立させることで床の所在が discoverable になる。問題なし。

**責務分離**: テストは純粋に消費者側（契約を守るテスト）として機能し、`contract/` 配下は一切変更しない。out-of-loop な authority を pipeline 側から触らない設計原則に忠実。

**依存方向**: `tests/unit/contract/` → `src/core/parser/` と `src/core/step/` への単方向依存。循環なし。

### Correctness

**T-02 `parseFixableFindings`**: 実装を確認した。`/^##\s+Findings\s*$/m` でセクションを検出し、`"fix"` (case-insensitive) のカラムヘッダを探す。タスク記載の入力 (`Fix` 列に `yes`) は正確に count > 0 を返す。空文字列・Findings なし・Fix 列なしの各ケースも実装の返り値 `0` と一致する。テストケースが実装の動作を正確に pin している。

**T-03 `VerificationStep.parseResult`**: 実装を確認した。
```ts
const match = /^## Verdict: (passed|failed)$/m.exec(content);
const verdict = match?.[1] as "passed" | "failed" | undefined;
return { verdict: verdict ?? null, findingsPath };
```
`parseResult` が使うのは `deps.slug` のみ（`verificationResultPath(deps.slug)` の計算用）。`config`・`request` は未参照。最小スタブ + `as StepDeps` キャストで副作用なしにテスト可能。タスク記載の 3 ケース（`failed` / `passed` / 行なし→null）はすべて実装の挙動と一致する。

**T-04 green 確認**: 振る舞い変更ゼロのテスト追加なので、既存テストへの影響は発生しない。
