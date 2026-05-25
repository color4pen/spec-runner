# Spec Review Result: merge-transient-retry (Round 2)

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-26

---

## 前回レビュー (spec-review-result-001.md) の修正確認

| 指摘 | 修正状況 |
|------|---------|
| F1: maxAttempts 矛盾 (design.md D2 "3 なら…" → "4 なら…") | ✅ FIXED — design.md D2 が "4 なら初回 + retry 3 回 = 最大 4 回実行" に修正済み |
| F1: tasks.md Task 1 `maxAttempts: 3 → 4` | ✅ FIXED — `maxAttempts: 4` に修正済み |
| F1: TC-PM-013 "× 3 回" → "× 4 回" | ✅ FIXED — "× 4 回 → exhausted" に修正済み |
| F2: 受け入れ基準の `/ 5xx` 削除 | ✅ FIXED — 削除済み |
| A1 (advisory): 受け入れ基準のログ prefix を "GitHub PR merge retry" に | ✅ FIXED — 修正済み |

---

## 総評

前回の F1/F2 は解消済み。ただし修正の過程で **tasks.md のログ形式だけが更新されずに残り、request.md / delta spec と数値の矛盾が発生**した。1 件の必須修正あり。

---

## 必須修正 (needs-fix)

### F1: tasks.md Task 3c の log 形式が `/4` — request.md / delta spec の `/3` と不一致

**場所**: tasks.md Task 3c

tasks.md Task 3c の log 形式:
```
log 形式: `"GitHub PR merge retry: <message>, retrying (<attempt>/4)...\n"`
```

request.md 受け入れ基準:
```
- [ ] retry 中に log が出力される (`"GitHub PR merge retry: ..., retrying (N/3)..."` 形式)
```

delta spec (specs/github-api-lib/spec.md) の Scenario: Merge retry logging:
```
"GitHub PR merge retry: {message}, retrying ({attempt}/3)..." before sleeping
```

maxAttempts=4 (初回 + retry 3 回) のとき、denominator に入るべき数は:

| 解釈 | denominator | ログ例 |
|------|------------|-------|
| max retries (= maxAttempts - 1) | 3 | `retrying (1/3)...` |
| maxAttempts (= total executions) | 4 | `retrying (1/4)...` |

request.md と delta spec は両方とも `(N/3)` / `({attempt}/3)` を採用している。これが受け入れ基準となるため、tasks.md が `/4` を指示すると implementer が `/4` のログを実装し、受け入れ基準のログ形式チェックで不一致となる。

**修正方針**: tasks.md Task 3c の log 形式を `"retrying (<attempt>/3)...\n"` に修正する。

---

## 軽微な指摘 (advisory — 修正必須ではないが推奨)

### A1: delta spec "3 attempts total" / "all 3 attempts" の文言が ambiguous

**場所**: specs/github-api-lib/spec.md — Requirement 本文 + Scenario: Transient retry exhausted

Requirement 本文:
```
SHALL be retried with exponential backoff (1s, 2s, 4s) up to 3 attempts total.
```

Scenario: Transient retry exhausted:
```
- **WHEN** `mergePullRequest()` receives transient failures for all 3 attempts
```

"3 attempts" は文脈から「3 回の retry 試行」を指すと解釈できるが、「3 回の総実行数 (= maxAttempts=3, retry 2 回)」と読む可能性もある。tasks.md TC-PM-013 は「× 4 回 → exhausted」と明示しており、「4 回実行 = 初回 + 3 retries」の意図は明確。delta spec の "3 attempts" が "3 retries" を意図しているなら、"up to 3 retries" / "for all 3 retries" と表記する方が ambiguity が消える。

---

## セキュリティレビュー

- **入力バリデーション**: retry logic は内部制御フロー。外部入力は GitHub API response のみ (status code + message string)
- **ログ出力**: GitHub error message を stdout に書くが、merge エラーメッセージに秘密情報は含まれない
- **API 呼び出し量**: maxAttempts=4 の bounded retry。rate-limit / DoS リスクは低い
- **判定ロジック**: `msg.toLowerCase().includes(...)` は case-insensitive 部分一致。ReDoS リスクなし
- **二重 retry**: 5xx を `isTransientError` から除外する設計が明示されており、既存 `request()` 層との二重 retry は回避される
- **OWASP Top 10**: 該当なし

セキュリティ上の問題なし。

---

## 修正が必要なファイル

| ファイル | 修正内容 |
|---------|---------|
| `tasks.md` | Task 3c の log 形式の denominator を `/4` → `/3` に修正 |
