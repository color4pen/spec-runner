# Spec Review Result: merge-transient-retry (Round 3)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-26

---

## 前回レビュー (spec-review-result-002.md) の修正確認

| 指摘 | 修正状況 |
|------|---------|
| F1: tasks.md Task 3c の log 形式 `retrying (<attempt>/4)` → `(/3)` | ✅ FIXED — tasks.md Task 3c が `"GitHub PR merge retry: <message>, retrying (<attempt>/3)...\n"` に修正済み |

---

## 総評

全 3 ラウンドの必須修正 (F1×2, F2×1) はすべて解消済み。request.md / design.md / tasks.md / delta spec の間で数値・ログ形式・責務分離の記述が一貫しており、implementer が迷わず実装に入れる状態に達した。

---

## 整合性確認サマリ

| 観点 | request.md | design.md | tasks.md | delta spec |
|------|-----------|-----------|----------|------------|
| maxAttempts | 3 retries → 4 試行 | D2: default 4 "初回 + retry 3 回" | Task 1: `default: 4` / Task 3c: `maxAttempts: 4` / TC-PM-013: "× 4 回" | N/A |
| log denominator | `(N/3)` | D5: `(1/3)` | Task 3c: `(<attempt>/3)` | `({attempt}/3)` |
| 5xx 除外 | 受け入れ基準に 5xx なし | D6: `request()` 層でカバー済 | (D6 に従う) | N/A |
| adapter 配置 | 案 (a) 推奨 | D1: `github-client.ts` | Task 3 | "GitHub PR merge retry" prefix |
| transient 対象 | 405×2 + 423 | D3 | Task 3b/3c | シナリオ網羅 |

---

## 残存 advisory (修正必須ではない)

### A1 (継続): delta spec の "3 attempts total" / "all 3 attempts" が ambiguous

前回から持ち越しの advisory。delta spec の以下の文言は「3 retries」と「3 total executions」の両義性がある:

- Requirement 本文: `"up to 3 attempts total"`
- Scenario: Transient retry exhausted: `"for all 3 attempts"`

tasks.md TC-PM-013 が "× 4 回 → exhausted" と明示しているため実装側の意図は明確。delta spec の文言は `"up to 3 retries"` / `"for all 3 retries"` に揃えると後続の読み手の負荷が下がる。必須ではないが次回の delta spec 更新機会に合わせて修正を推奨。

### A2 (継続): `isMergeTransientFailure` の `"locked"` 部分一致

tasks.md Task 3b の `msg.includes("locked")` は 423 判定に message 文字列を使う。"Branch is locked by administrator" 等の永続的 lock メッセージにも誤 match するリスクがある。実装時に `status === 423` 直接チェックへの変更を検討することを推奨 (round 1 A2 と同じ指摘)。

---

## セキュリティレビュー

前回と変化なし。問題なし。

- **入力バリデーション**: retry logic は内部制御フロー。外部入力は GitHub API response (status + message string) のみ
- **ログ出力**: merge エラーメッセージを stdout に書くが、秘密情報は含まれない
- **API 呼び出し量**: maxAttempts=4 の bounded retry。rate-limit / DoS リスクは低い
- **判定ロジック**: `msg.toLowerCase().includes(...)` は ReDoS リスクなし
- **二重 retry**: 5xx を対象外とする設計が design.md D6 で明示されており、既存 `request()` 層との二重 retry は回避される
- **OWASP Top 10**: 該当なし
