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
| 1 | HIGH | spec-gap | `specs/credential-store/spec.md` | T-05 は `requirements.ts` の `envVar` を `GITHUB_TOKEN` → `GH_TOKEN` に変更するが、delta spec に「Runtime ごとの必要 credential は declarative に定義される」の MODIFIED エントリが無い。`specrunner finish` 後に authority spec のテーブルが `GITHUB_TOKEN` のままになり、コードとの乖離が生じる。 | delta spec に `### Requirement: Runtime ごとの必要 credential は declarative に定義される` の MODIFIED エントリを追加し、テーブルの GitHub `env var` 列を `GH_TOKEN`（primary）に更新する。 |
| 2 | MEDIUM | spec-quality | `specs/credential-store/spec.md` | Requirement ヘッダー「Resolver は credentials → env → error の優先順位で解決する」は変更前の順序を示しており、変更後の実際の優先順（env → gh → credentials → error）と乖離する。MODIFIED として取り込まれても、authority spec のヘッダーが永続的に誤解を招く。 | `## Renamed` セクションで `"Resolver は credentials → env → error の優先順位で解決する" → "Resolver は env → gh auth → credentials → error の優先順位で解決する"` を宣言し、`## Requirements` 内のヘッダーを新名称に変更する。 |
| 3 | LOW | spec-gap | `tasks.md` | request.md の外部制約に「解決した token の出力は B-7（logger.maskSensitive）経由でのみ行う」とあるが、tasks.md に対応タスクがない。`source: "gh"` パスの token が preflight の logInfo 等でマスクされているかを明示的に確認する経路が無い。 | T-02 か独立タスクに「`source: "gh"` で解決した token が logger.maskSensitive を通じてのみログに出る（token 値を直接ログしない）ことを確認する」を追記する。 |
