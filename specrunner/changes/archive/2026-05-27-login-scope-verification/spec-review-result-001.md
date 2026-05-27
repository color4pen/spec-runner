# Spec Review Result: login-scope-verification

- **verdict**: approved

## Summary

scope 即時検証の追加という変更は設計的に妥当。実装面・セキュリティ面ともに問題なし。

---

## Findings

### [pass] 技術的正確性

- `runDeviceFlow()` は `{ accessToken, scopes: token.scope.split(",").map(s => s.trim()) }` を返す。`scopes` は Device Flow 成功時に常に定義済み（undefined にならない）。✓
- `GITHUB_SCOPE = "repo"` が確認済み。GitHub が scope を返さない fallback 時は `["repo"]` が確定するため、D3（fallback で warning なし）は正しく機能する。✓
- `scopes.includes("repo")` は trim 済み配列に対して確実に動作する。✓

### [pass] セキュリティ

- 新たな認証フローや外部入力処理を導入しない。attack surface の増加なし。
- warning メッセージはハードコード文字列のみ — ユーザー入力を反映しないため injection リスクなし。
- token は scope 不足でも保存する設計は適切（token 自体の有効性は scope と独立）。
- `logWarn` は stderr 出力 — CLI 出力チャネル規約（Requirement: CLI 出力チャネル規約）に準拠。`logWarn` は default レベル以上で出力される（quiet 時は抑制）。✓

### [pass] delta spec 形式

- `### Requirement:` header が baseline と完全一致 → MODIFIED として正しく分類される。
- 全 Scenario が When/Then 形式で記述されている。
- normative keyword（MUST/SHALL）を本文に含む。
- `delta-spec-validation-result.md` が approved。

### [pass] request / design / tasks / spec の整合性

- request の受け入れ基準 4 項目 → design D1–D4 → tasks T-01/T-02/T-03 → delta spec scenarios が一貫して対応している。
- tasks T-01 のコードスニペット（`if (!result.scopes.includes("repo")) { logWarn(...) }`）は design D4 の「1 行で済む」方針と整合。

### [info] baseline との差分（背景情報）

baseline の通常成功フローシナリオは "`config` に `github.accessToken` / `tokenObtainedAt` / `scopes` を保存" と記述されているが、実装は credentials file に保存する形に既に移行済み。delta spec がこれを "credentials file" に訂正している点は副次的な正確化として適切。

### [info] T-02 テストケース `scopes: []`

`runDeviceFlow()` が実際に `[]` を返すことはないが（fallback で必ず `["repo"]` になる）、unit test として `runDeviceFlow` を mock して `[]` を返す場合の `runLogin()` 挙動を検証することは契約のドキュメント化として有効。実装上の問題なし。
