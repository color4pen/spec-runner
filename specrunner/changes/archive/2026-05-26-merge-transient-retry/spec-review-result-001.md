# Spec Review Result: merge-transient-retry

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-26

---

## 総評

設計方針は妥当。adapter 内に retry を閉じる判断・汎用 `retryWithBackoff` の API 設計・二重 retry 回避の分析はすべて正しい。ただし **implementer が迷わず実装できる精度に達していない箇所が 2 件** あり、修正が必要。

---

## 必須修正 (needs-fix)

### F1: maxAttempts と "3 retries / 7 秒" の矛盾

**場所**: request.md 要件 1 ↔ design.md D2

request.md 要件 1:
> retry pattern: `1s → 2s → 4s` の **3 段 backoff** (= 合計最大 7 秒待ち)
> retry 上限 **3 回**

design.md D2:
> `maxAttempts` = 試行上限 (初回含む)。**3 なら初回 + retry 2 回 = 最大 3 回実行**

「3 回 retry」と「maxAttempts=3 (初回含む) = 2 回 retry」は矛盾する。

| 解釈 | total executions | delays | 合計待ち |
|------|-----------------|--------|---------|
| request.md (3 retries) | 4 | 1s + 2s + 4s | 7s |
| design.md (maxAttempts=3) | 3 | 1s + 2s | 3s |

tasks.md Task 1 の delay 式も "attempt=1→1s, 2→2s, **3→4s**" を列挙しているが、maxAttempts=3 では attempt=3 の delay は実行されない。tasks.md Task 4 TC-PM-013 も "× 3 回 → exhausted" と書いており、3 回の失敗を前提にしているが maxAttempts=3 で 3 回の失敗が起きるのは一致している (= 初回+2retry の 3 回目失敗で exhausted)。

**合理的な解釈**: 「3 retries」＝ retry 3 回 = maxAttempts=4。7 秒待ちはこちらが正しい。design.md D2 の「3 なら初回 + retry 2 回」という説明が誤り。

**修正方針**: design.md D2 の `maxAttempts` デフォルト値を **4** に変更し、「初回 + retry 3 回 = 最大 4 回実行」と記述し直す。tasks.md Task 1 の opts に `maxAttempts: 4` を明示する。受け入れ基準の TC-PM-013 も "× 4 回" に揃える。

---

### F2: 受け入れ基準に 5xx が transient retry 対象として列挙されている

**場所**: request.md 受け入れ基準 1 行目

```
- [ ] `mergePullRequest()` 実行時、transient failure (405 + "Base branch was modified" / 405 + "unstable state" / 423 / 5xx) を検出すると ...
```

しかし要件 2 は:
> **5xx は対象外**: 既存 `request()` 層で吸収済のため、本 request では扱わない

design.md D6 も同じ理由で 5xx を明示的に対象外としている。受け入れ基準の `/ 5xx` は誤記。そのまま渡すと implementer が `isTransientError` で 5xx を retry する実装を書き、二重 retry バグを引き込むリスクがある。

**修正方針**: 受け入れ基準 1 行目の `/ 5xx` を削除する。

---

## 軽微な指摘 (advisory — 修正必須ではないが推奨)

### A1: 受け入れ基準のログ prefix が設計と不一致

受け入れ基準:
> `"Phase 3 merge retry: ..., retrying (N/3)..."` 形式

design.md D5 / tasks.md Task 3c:
> `"GitHub PR merge retry: ..."` (adapter 配置のため phase 概念を持たない)

受け入れ基準は設計決定 D1 (adapter 配置) を前提とした記述に修正することを推奨。

### A2: `isMergeTransientFailure` の `"locked"` 部分一致

tasks.md Task 3b の実装案:
```ts
msg.includes("locked")
```

"Branch is locked by administrator" 等、永続的な lock を示すメッセージにも誤 match する可能性がある。423 の transient 判定は message より `status === 423` を直接確認する方が堅牢。設計の変更は不要だが、implementer へのコメントとして残す。

---

## セキュリティレビュー

- **入力バリデーション**: retry logic は内部制御のみ。外部入力はなし
- **ログ出力**: GitHub の error message を stdout に書くが、merge エラーメッセージに秘密情報は含まれない
- **API 呼び出し量**: 最大 3〜4 回の bounded retry。DoS/rate-limit リスクは低い
- **判定ロジック**: `msg.toLowerCase().includes(...)` は string の case-insensitive 部分一致。ReDoS 等のリスクなし
- **OWASP Top 10**: 該当なし

セキュリティ上の問題なし。

---

## 修正が必要なファイル

| ファイル | 修正内容 |
|---------|---------|
| `request.md` | 受け入れ基準 1 行目の `/ 5xx` を削除。受け入れ基準のログ prefix を `"GitHub PR merge retry"` に修正 |
| `design.md` | D2 の `maxAttempts` デフォルト値を 4 に修正。「3 なら初回 + retry 3 回 = 最大 4 回実行」に記述修正 |
| `tasks.md` | Task 1 の opts `maxAttempts: 3` → `maxAttempts: 4`。TC-PM-013 "× 3 回" → "× 4 回 exhausted" に修正 |
