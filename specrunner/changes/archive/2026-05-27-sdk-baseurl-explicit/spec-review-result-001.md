# Spec Review Result: sdk-baseurl-explicit

- **verdict**: approved

## Summary

仕様・設計・タスクの一貫性に問題なし。変更対象が正確に特定されており、実装範囲が最小限に収まっている。

## Findings

### 事実確認

- `new Anthropic(` の出現は `src/adapter/managed-agent/client.ts:9` と `src/adapter/managed-agent/anthropic-client.ts:72` の 2 箇所のみ（grep で確認）
- request/design/tasks がすべてこの 2 箇所を指定しており、漏れなし

### セキュリティ評価

- **脅威は実在する**: `ANTHROPIC_BASE_URL` env が設定されると Anthropic SDK が内部でそれを使い、API key を任意エンドポイントに送出する。CI/CD 環境で攻撃者が env を注入できる場合、資格情報漏洩になる。
- **修正は構造的に正しい**: `baseURL` をコンストラクタ引数で明示することで、env の値より引数が優先され（SDK 仕様）、env override が構造的に無効化される。
- **ハードコードの正当性**: 本 project の Anthropic API 接続先は常に `https://api.anthropic.com` であり、可変にする理由がない。設定可能にすると同じ attack surface が再現するため、固定が正しい。
- **OWASP A05 (Security Misconfiguration)**: 修正はこのリスクを閉じる方向に作用する。

### 設計・仕様面

- delta spec なし（設計判断として明記）: `baseURL` の追加はコード引数の変更であり、既存の spec 要件の振る舞いに影響しない。妥当。
- type: bug-fix は適切。セキュリティ上の欠陥修正。
- tasks の受け入れ基準が明確で、実装者が迷う余地がない。

### 懸念点

なし。
