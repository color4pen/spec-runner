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
| — | — | — | — | None | — |

## Notes

### Architecture

- **B-9 naming** (D1): 既存 B-1〜B-8 の連番として自然。`arch-allowlist.ts` の `invariant` フィールド形式と一致し、既存フィルタ（`e.invariant === "B-X"`）との整合も問題なし。
- **grep パターン** (D2): `transitionJob` は `status: to`（変数）を使うため D2 の JobStatus リテラルパターンには hit しない。canonical 経路が自然に除外される設計は正しい。実コードで確認済み（`src/state/lifecycle.ts:113` — `{ ...updated, status: to, ... }`）。
- **スキャンスコープ** (D3): `src/store/` + `src/core/` で実在する 3 bypass（`job-state-store.ts:249`, `exit-guard.ts:24`, `local.ts:395`）を全件捕捉できることを grep で確認。`src/core/verification/runner.ts:357` の `status: "failed"` は `PhaseResult` であり `src/core/verification/` 除外で正しく排除される。
- **create() 除外** (D4): `job-state-store.ts:77` の `status: "running"` は create() 初期化。allowlist に入れず test 内フィルタで除外する判断は governance rule（"ONLY shrinks"）との整合上正しい。`"running"` リテラルの新規 bypass が同ファイルで追加された場合のリスクは design で認識・受容済み。
- **既存パターン踏襲** (D5): `core-invariants.test.ts` + `arch-allowlist.ts` への追記で完結。CODEOWNERS-gated な governance が自動適用される。

### Correctness

- **allowlist パターン特定性**: Entry 1（`"failed" as JobStatus`）、Entry 3（`"awaiting-resume" as const`）は十分に一意。Entry 2（`"awaiting-resume"`、ファイル `exit-guard.ts`）は file-path 条件で `local.ts` とは区別される。`isAllowlisted` の `endsWith + includes` セマンティクスと照合して漏れ・誤マッチなし。
- **3 bypass 網羅**: 実 grep 結果と design の bypass リストが一致。`src/adapter/managed-agent/` の `status: "terminated"` はスキャン対象外（`src/adapter/` は非対象）で正しく除外。

### Completeness (task decomposition)

- T-01 → 要件 2（allowlist grandfather）
- T-02 → 要件 1（歯の実装）
- T-03 → 要件 3（regression guard 実証）
- T-04 → AC 4（verification green）

全受け入れ基準がタスクで網羅されている。
