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
| 1 | LOW | Format | `specs/cli-commands/spec.md` | `## Removed` セクションが Requirement 名ではなく Scenario 名を列挙している（"scope 不足（repo scope なし）"、"scope fallback..."）。delta spec rules では `## Removed` は Requirement ヘッダ名のみ受け付ける。実害なし（MODIFIED requirement が scenario を除外済みのため tool 処理上は無効化される）。 | Scenario 削除は MODIFIED requirement 内で暗黙に完結しているため `## Removed` セクション自体を削除するか、Requirement 名のみを残す。 |
| 2 | LOW | Reference | `request.md` | 背景セクションが `architecture/adr/2026-06-02-github-auth-host-decoupling.md` を参照しているが、このプロジェクトの正規 ADR パスは `specrunner/adr/{YYYY-MM-DD}-{slug}.md`。request.md の参照であり実装指示ではないため機能影響はない。 | 参照元ドキュメントを `specrunner/adr/` に移動するか、参照パスを修正する（次 request での対応で可）。 |

## Summary

**対象スコープ**: `github-device-flow-auth` delta spec / `cli-commands` delta spec / design / tasks

### Design Decisions（承認）

- **D1**: doctor check を `GET /user` HTTP status のみで判定する設計は正当。GitHub App user token は `X-OAuth-Scopes` を返さないため scope 検査の完全除去が正解。
- **D2**: `runDeviceFlow` 返り値から `scopes` を除去し `{ accessToken: string }` に絞る判断は正当。`data.scope ?? GITHUB_SCOPE` フォールバックが `"repo"` を偽装するバグを修正する。
- **D3**: port interface `verifyTokenScopes()` シグネチャを維持する判断は妥当（breaking change のコストと対比して）。名前の不一致は将来 request で対応可能。
- **D4**: `login.ts` の scope 警告ブロック全削除は正当。GitHub App token に classic scope は存在しない。

### Delta Spec 確認

**github-device-flow-auth**: requirement ヘッダがベースラインと完全一致（MODIFIED 自動分類される）。normative keyword あり（MUST/SHALL）。3 scenarios 存在。scope パラメータ除去・ghu_ user access token・GitHub App 前提への書き換えが適切。

**cli-commands**: login requirement ヘッダがベースラインと完全一致。scope 検査・警告・fallback シナリオを除去した MODIFIED requirement は正当。doctor の `github-token-valid` 責務説明を "scope 検証" → "token 有効性検証" に変更した記述は正確。

### セキュリティレビュー

- **認証**: GitHub App への移行は GitHub 公式推奨。`ghu_` prefix token は user-to-server token として適切。
- **トークン検証**: `GET /user` 200 = 有効な認証情報 の判定は標準的。401 で fail、タイムアウトで warn の 3 分岐はリスク分類として妥当。
- **トークンマスキング**: `ghu_` prefix は既存 `maskSensitive` のマスクパターンに登録済み（cli-commands spec の "GitHub App token と fine-grained PAT がマスクされる" シナリオで確認済み）。
- **classic PAT リスク**: design.md で明示的に文書化済み（env var 直接設定ユーザーへの scope 不検出）。ランタイム時の 401 で検出されるという mitigation は受容可能。
- **OWASP Top 10**: path traversal (slug validation 既存)、credential exposure (masking 既存) に新たなリスク追加なし。

### Tasks との整合

T-01〜T-08 はすべて delta spec・design と整合しており、実装範囲・acceptance criteria が具体的。TC-023 のテスト変更（200 + no repo scope → fail から pass へ）は設計変更を正確に反映している。
