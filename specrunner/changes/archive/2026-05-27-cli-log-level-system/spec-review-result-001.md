# Spec Review Result

- **change**: cli-log-level-system
- **verdict**: approved

## Summary

設計は健全。4 段階ログレベル体系・優先順位チェーン・後方互換性の扱いはすべて明確に定義されており、実装可能な状態。セキュリティ上の懸念なし。以下の minor findings を記録するが、いずれも blocking ではない。

---

## Findings

### F1: `isLevelAtLeast` が spec 内で未定義（design D8）

**場所**: design.md § D8

design D8 は `ProgressDisplay` 内で以下を参照する:

```typescript
isLevelAtLeast(this.options.logLevel, "verbose")
```

しかし `isLevelAtLeast(a: LogLevel, b: LogLevel): boolean` という関数は tasks.md・specs のどこにも定義されていない。`isLevelEnabled(level)` はグローバルな `currentLevel` を参照するモジュール関数であり、`ProgressDisplay` が自分の `options.logLevel` と比較する用途には使えない。

design D8 の別の箇所には「`logLevel === "default"` のときのみ `\r` overwrite」と具体的な条件が書かれているため実装者は意図を推論できるが、`isLevelAtLeast` を追加 export とするか LEVEL_ORDER をインライン使用するかが不明瞭。

**推奨**: D8 の prose を「`this.options.logLevel === "default"` のときのみ TTY overwrite」と揃えるか、もしくは `isLevelAtLeast` を Task 1 に明示的に追加する。Task 8 の補足注記には正しい答えが書かれているため、実装者は誘導できる。

### F2: module-level `currentLevel` の初期化タイミングと DEBUG 早期起動

**場所**: design.md § D1, tasks.md Task 1

design は `let currentLevel: LogLevel = "default"` をモジュール初期値とする。現状の `logDebug` は `process.env["DEBUG"]` を呼び出しタイミングで参照するため初期化不要。新設計では `isLevelEnabled("debug")` を参照するため、`setLogLevel()` が呼ばれる前に `logDebug` が実行された場合（CLI flags 解析前の早期起動ログ）、`DEBUG` 環境変数が設定されていても出力されない。

実用上は CLI 起動直後に `setLogLevel()` が呼ばれるため問題が顕在化する経路は限定的だが、モジュールロード時に `let currentLevel: LogLevel = resolveLogLevel({})` と初期化すれば完全に防げる。設計がこの選択を明示していない。

**推奨**: Task 1 の初期値を `resolveLogLevel({})` とするか、あるいは「早期起動ログは setLogLevel 呼び出し前は default レベルで動作」と明記して意図的な挙動として文書化する。

### F3: `--debug` rejection のテストケースが未記載

**場所**: tasks.md Task 9

Task 5 の注意書きで「`debug` を `flagDefs` に追加しない（`--debug` は Unknown flag エラーにする）」と明示されているが、Task 9 のテストリストにこの挙動を検証するケースが含まれていない。

**推奨**: Task 9 に「`--debug` フラグを渡すと `FlagParseError: Unknown flag(s): --debug` になること」を追加する。

### F4: テスト isolation — `currentLevel` のリセット

**場所**: tasks.md Task 3, Task 9

`currentLevel` はモジュールレベルの可変状態。Task 3 step 4 で `setLogLevel("debug")` を `beforeEach` に追加するよう指示されているが、テスト後に `"default"` へ戻す `afterEach` の記載がない。他テストスイートへの汚染リスクがある。

**推奨**: Task 3・Task 9 の新規テストに `afterEach(() => setLogLevel("default"))` を追加するよう明記する。

---

## Security Review

- `resolveLogLevel()` は `SPECRUNNER_LOG_LEVEL` の不正値（unknown string）を無視して `default` に fallback するため、入力検証は安全。
- `logDebug` / `logWarn` 等の出力は既存の `maskSensitive()` を通過するため、機密情報マスクは維持される。
- `-q`/`-v`/`-vv` は enum-constrained ではないが、flag-parser の short alias 処理でリテラル一致のみ受け入れるため injection 経路なし。
- OWASP Top 10 該当なし（外部入力のログ出力・認証・権限昇格のいずれにも非該当）。

---

## Notes

- delta spec の記法（`## Requirements`, `### Requirement:`, `#### Scenario:`, MUST/SHALL normative keyword）は両ファイルとも適合。
- `delta-spec-validation-result.md`: approved 済み。
- request type `spec-change` として適切（設計追加を含む）。
- スコープ外（exit code, JSON Lines, ログ永続化）の境界は明確。
