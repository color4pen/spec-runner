# Spec Review Result: npm-package-setup

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-27

---

## Summary

request / design / tasks / spec の整合性は高く、セキュリティ上の問題もない。実装に進んでよい。

---

## Findings

### ✅ 設計の妥当性

| 観点 | 評価 |
|---|---|
| `files` ホワイトリスト vs `.npmignore` | ✅ ホワイトリスト方式を採用。将来のファイル追加で漏れない設計として適切 |
| `publishConfig.registry` で npmjs.com への誤 publish を防止 | ✅ `private: true` 削除のリスクを `publishConfig` で相殺している |
| `rootDir: "."` を維持する理由の説明 | ✅ bin/ を含む構造でのパス破壊リスクを説明済み。belt-and-suspenders の exclude 追加は妥当 |
| tag push トリガーのみ（branch push なし） | ✅ 意図しない publish を防ぐ。手動 `npm version` + `git tag` 運用と整合 |

### ✅ セキュリティ

- **GitHub Token スコープ**: `permissions.packages: write` + `contents: read` の最小権限構成。`secrets.GITHUB_TOKEN` を使用し外部 PAT 不要。標準的かつ適切。
- **publish ゲート**: build → typecheck → test が全 green でなければ publish に進まない。壊れたパッケージの誤 publish を防ぐ。
- **`--frozen-lockfile`**: CI での依存ドリフト防止。適切。
- **OWASP A08 (Software and Data Integrity)**: supply chain 観点で Actions のバージョンが `@v4` / `@v2` のミュータブルタグ。ピン止め（SHA）の方がより安全だが、private 内部ツールとしては許容範囲。

### ✅ 仕様間の整合性

- request → design → tasks → spec の要件が 1:1 で対応している。
- `repository` フィールドの形式: request.md では URL 文字列、design/tasks では `{ "type": "git", "url": "..." }` オブジェクト形式。design/tasks の形式が npm の正式スキーマであり、こちらが実装上の正解。齟齬ではなく詳細化と判断する。

### ✅ 受け入れ基準の網羅性

- `npm pack --dry-run` / `dist/` の汚染確認 / CI ファイルの存在 / typecheck・test green — すべて検証可能な基準として定義されている。

---

## 実装上の注意点（ブロッカーなし）

1. **`exports` の用途**: CLI ツールとしての位置付けを踏まえると `{ ".": "./dist/bin/specrunner.js" }` は bin エントリと一致しており適切。将来 API として import される場合は別途 `exports` を拡張すること。
2. **Actions バージョンピン止め**: セキュリティ要件が高まった場合は `actions/checkout@v4` → `actions/checkout@<SHA>` に変更を検討する。現時点ではスコープ外。
