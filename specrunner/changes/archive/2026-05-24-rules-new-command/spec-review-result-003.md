# Spec Review Result: rules-new-command

- **verdict**: approved
- **iteration**: 3
- **reviewer**: spec-reviewer

---

## 概要

review-001・review-002 の全 blocking 指摘が解消されていることを確認。  
新たな blocking ギャップはなし。

---

## review-002 指摘の解消確認

| 指摘 | 解消状況 |
|---|---|
| 指摘 1: `specrunner rules --help` 表示メカニズムが tasks に欠落 | tasks.md Task 3-5 (`bin/specrunner.ts` 親コマンドの `--help` 対応) 追加 ✅ |

tasks.md Task 3-5 に示されたコードは review-002 の修正案と一致しており、`--help` / `-h` / サブコマンドなし (`!sub`) の 3 ケースを stdout + exit 0 で処理する。

---

## セキュリティ確認 (OWASP 観点含む)

本機能はローカル CLI ツールであり Web サービスではないため OWASP Top 10 の大部分は適用外。ローカルファイル操作の観点を重点確認した。

| 観点 | 評価 |
|---|---|
| path traversal (step-name) | `AGENT_STEP_NAMES` allowlist (`AGENT_STEP_NAMES` = 9 要素の固定配列) で検証。`verification` / `pr-create` / `delta-spec-validation` は `CLI_STEP_NAMES` に分離されており `AGENT_STEP_NAMES` に含まれない。allowlist 以外の値がパス構築に使われることはない ✅ |
| path traversal (rule-slug) | `SLUG_REGEX` `/^[a-z0-9][a-z0-9-]{0,63}$/` により `.` `/` `..` `%` 等を完全排除。`_` / 空白は `-` 変換後に同 REGEX で再検証 ✅ |
| ファイル上書き | 衝突チェック → exit 1 で防護。`writeFile` は衝突確認後にのみ実行 ✅ |
| `parseInt` NaN 伝播 | tasks.md 2-3 に `filter(n => !isNaN(n))` 明記。TC-RULES-011 でテスト保証 ✅ |
| 認証・ネットワーク・DB | 該当なし (ローカル scaffold のみ) |

---

## 全体整合性確認

| 観点 | 評価 |
|---|---|
| request.md ↔ spec.md 網羅性 | 全 12 要件が spec.md の Requirement / Scenario として記述されている ✅ |
| spec.md ↔ tasks.md 実装パス | Task 1 (flag-parser) → Task 2 (executeRulesNew) → Task 3 (registry) の順序で全要件を実装可能 ✅ |
| `AGENT_STEP_NAMES` single source | `src/core/step/step-names.ts` で確認。9 agent step を保持。CLI steps は `CLI_STEP_NAMES` に分離 ✅ |
| `CommandDef.positional` 型 | Task 3-0 に `count?: number` 追加ステップ明記。typecheck が通る ✅ |
| `positionals[0]` 後方互換 | `positional?: string` をエイリアスとして残す設計。既存ハンドラ変更不要 ✅ |
| テストカバレッジ | TC-RULES-001〜011 + flag-parser 追加ケースで全要件網羅 ✅ |
| template embedded const | D2 に従い source code 内 string const として定義 ✅ |
| delta-spec-validation | approved 済み ✅ |

---

## 非 blocking 観察事項 (実装者への参考)

- **stdout 出力パス**: design.md RN-1 step 7 は `filePath` (絶対パス)、tasks.md 2-3 step 8 は `relativePath` と表記が異なる。spec は "stdout に作成パスを出力" と定義しており、UX 上は `cwd` からの相対パスが望ましい。実装者の判断で `relativePath` (= `path.relative(cwd, filePath)`) を採用して問題ない。
- **RULES_USAGE の動的生成**: Task 3-2 は "AGENT_STEP_NAMES から動的生成" と記載しているが、`AGENT_STEP_NAMES` は compile-time const であるため、module 初期化時のテンプレートリテラルで生成すれば文字列 const として成立する。ハードコード回避と const 保持は矛盾しない。
