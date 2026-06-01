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

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | architecture | design.md § D2 | D2 は `prereqs` 関数を `core/preflight.ts` へ移設する方針だが、`checkRuntimePrereqs`（`cfg.runtime === "managed"` 分岐）と `resolveRuntimeCredentials`（`config.runtime !== "managed"` 分岐）はいずれも B-8 grep パターン `(config\|cfg)\.runtime` にマッチする。B-8 テストは `src/core/` 全体（`core/runtime/` を除く）をスキャンするため、`preflight.ts` への移設は allowlist 無しで即座に B-8 違反を 3 件生じる。`prereqs.ts` 自身の docstring にも「Extracted from preflight.ts to confine config.runtime branching to the core/runtime/ composition-root (B-8 invariant)」と明記されており、移設先としての `preflight.ts` は設計上の退行である。受け入れ基準「B-1〜B-9 が無改変で green」と矛盾する。 | D2 の移設先を見直す。候補: (a) `prereqs` を `core/runtime/` に残したまま DSM violation を解消する別アプローチを採用（例: `RuntimePrereqChecker` port interface を新設し `preflight.ts` が port 経由で呼ぶ）、(b) `prereqs` 関数から `config.runtime` 分岐を除去して runtime-agnostic にし domain 層に置けるようにする（feasibility 要確認）。いずれにせよ B-8 を壊さない移設先を design で確定した上で再提出すること。 |
