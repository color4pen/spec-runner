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
| 1 | LOW | Security | specs/credential-store/spec.md | B-10（host↔token 束縛）は env var レベルのみで enforce される。GHES host 設定時に `credentials.json` の `github.token` が fallback 4 として引き続き返されるため、`specrunner login` で取得した github.com トークンが GHES へ送信されうる。D4 設計の intentional 選択（"env 段階の後は共通フロー"）だが spec に明示されていない。 | credential-store delta spec の当該 Requirement に「credentials.json のフォールバックは host に関わらず共通」という known limitation を 1 文追記し、B-10 の適用境界を明示する。実装変更は不要。 |
| 2 | LOW | Scope | request.md / tasks.md | `parseRemoteUrl` の設定 host 対応（D6 / T-08）が request.md の要件番号リストに記載されていない。design.md・tasks.md・delta spec（repository-identification）には完全に記述されており、機能的整合性のために必要な変更。 | 次回 request 作成時の参考として記録。今回は design・tasks・delta spec が揃っているため実装ブロックなし。 |
| 3 | LOW | Security | specs/cli-config-store/spec.md | `github.host` の validation は非空文字列チェックのみ。`@` や protocol prefix を含む値（例: `evil@corp.com`）を受け入れると URL 構築で予期しない結果になりうる。開発者ツールの local config であり実害は限定的。 | 実装時に `resolveGitHubApiBaseUrl` / `getDeviceCodeUrl` で `new URL(...)` を通じた構築をするか、hostname validation（英数字・ドット・ハイフンのみ）を `validateConfig` に追加することを検討する。spec 変更は不要。 |
