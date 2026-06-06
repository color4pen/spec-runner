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
| 1 | LOW | Implementation Detail | tasks.md T-01 | `fs.existsSync` と `isStaleRunning` の呼び出しがループ内で全 job に対して実行される記述になっており、非 `running` job にも `existsSync` が走る。`isStaleRunning` が非 `running` で即 `false` を返すため正確性への影響はなく、`existsSync` のコストも無視できる。 | 実装時に `job.status === "running"` ガードを追加すれば不要な syscall を省けるが、仕様修正は不要。 |

## Review Notes

**review-001 の指摘（MEDIUM）は解消済み**

前回指摘の「design D3 が常に sidecarPath を渡すため Priority 3 に到達できない」問題は、design D3 に `fs.existsSync(sidecarCandidate) ? sidecarCandidate : undefined` の条件分岐が追記されており解消している。sidecar ファイルが不在の場合は `undefined` を渡すことで `isStaleRunning` の Priority 3（15 分 time fallback）が正しく適用される。spec.md の「pid / sidecar なし・15 分以内 → not stale」「15 分超過 → stale」シナリオおよび tasks.md T-02 のテストケースはいずれも設計と整合している。

**一貫性チェック**

- request.md 要件 1–3 → spec.md Scenario 1–5 → design D1–D4 → tasks T-01–T-03 の対応が完結している。
- `isStaleRunning`（`safety.ts`）の実装（Priority 1: state.pid probe → Priority 2: sidecar pid probe → Priority 3: 15 min fallback）は設計の記述と一致している。
- `livenessJsonPath` は `src/util/paths.ts` から export 済み、`getJobSlug` は `ps.ts` で既に import 済みであり、T-01 の import 指示は正確。
- `formatJobRow` への `isStale: boolean` 追加（デフォルト `false`）により既存呼び出し元の後方互換が保たれる。

**`resume.ts` との意図的な挙動差異**

`resume.ts` は slug が判明すれば常に sidecarPath を渡す（sidecar 不在 → 即 stale = 回復が必要）。`ps.ts`（本変更後）は `existsSync` ガードにより sidecar 不在時は time fallback を使う（表示のみ・15 分猶予）。この差異は design D3 Rationale で明示・正当化されており、request.md 要件 3 と整合している。

**セキュリティ**

- sidecar path は `repoRoot + livenessJsonPath(getJobSlug(job))` で内部構築されており、ユーザー入力は経路に含まれない（Path Traversal リスクなし）。
- `process.kill(pid, 0)` は probe のみでシグナル送信を行わず、EPERM（プロセス存在・権限なし）を alive 扱いする既存の安全側実装を再利用する。
- OWASP Top 10 該当なし。
