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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Implementation guidance | tasks.md / T-03 | T-03 の grep パターンは `implements RuntimeStrategy` を検出しつつ `implements RealRuntimeStrategy` を誤検出しない正規表現が必要。`grep -E` は否定先読みを持たないため、パターン例として `implements RuntimeStrategy([^A-Za-z_]|$)` か、マッチ後に `RealRuntimeStrategy` を含む行を除外するフィルタ（`isCommentLine` 相当）を使う実装が安全。タスクは明示しているが、実装時の注意点として記録する。 | T-03 の grep 実装で `RealRuntimeStrategy` を含む行を除外するポストフィルタを追加するか、単語境界正規表現を使う。既存 `core-invariants.test.ts` の `isCommentLine` / `filterViolations` ヘルパと同型で実装可能。 |
| 2 | LOW | Correctness note | spec.md / design.md (D5) | `synthesizeScopeUnverifiableFinding` の `title` が breach finding（"Scope exceeded: ..."）と字句的に異なることが `computeFindingKey` の衝突防止の前提。spec はこれを固定文言で担保しているが、実装時に breach finding の title を誤流用すると decision-ledger の cross-suppression（UNKNOWN 解決が breach をも抑止する）が起きる。 | title を "Scope unverifiable: changed-files cannot be derived in this runtime" 等の固定文（breach title と完全に異なる文字列）にする。T-04 の unit test で `computeFindingKey` の非衝突を assert することで機械的に担保される。 |

## 総評

仕様の前提（`listChangedFiles` の 3 状態折り畳み・managed の構造的 `[]`・activation 消費者の fail-safe）はコードで全件確認済み（request.md 末尾の「起票時 main 照合」）。設計判断はすべて根拠が明示されており、代替案（B・C）の棄却理由も妥当。

主要な観点を確認:

- **後方互換性**: `canDeriveChangedFiles` を optional にし absent → フォールスルーとすることで、≈10 の既存 test fake は一切無変更。#689 挙動と `true`/absent ケースが完全一致することを受け入れ基準で固定している。
- **型安全性**: `RealRuntimeStrategy` intersection 型で実 runtime の predicate 実装漏れをコンパイル時に検出。grep backstop（bare `implements RuntimeStrategy` の不在）で type alias の迂回を封じる二重構造は十分。
- **DSM 適合**: `synthesizeScopeUnverifiableFinding` は `src/core/pipeline/scope.ts`（domain）に置き、B-5 の既存 fs/child_process grep が自動カバー。scope-check（domain）は port 越しに predicate を呼び、runtime 具象に触れない（B-1 適合）。
- **決定性**: `computeFindingKey = step|file|line|title|rationale` で UNKNOWN finding は固定文言・固定 anchor により同一条件で同一 key を持ち、decision-ledger による再 escalate 抑止が機能する。
- **セキュリティ**: predicate は引数なしの boolean 返却で注入面なし。UNKNOWN finding の title/rationale/options は固定文字列（ユーザー入力非依存）。`slug` を anchor パスに埋め込む点は既存 `synthesizeScopeFindings` と同型で、`scope.ts` は fs アクセスを持たないため path traversal のリスクは実質なし。

指摘 2 件はいずれも LOW（実装時の注意点）で、受け入れ基準の unit test（T-04・T-06）が合成後に機械検証するため、仕様としてはブロッカーなし。
