# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.00

## Summary

### iteration 001 所見の対応確認

**HIGH (security) — `buildDetail` token scrubbing 欠如**（iteration 001 finding #1）: **解消済み**

- `src/adapter/claude-code/provider-readiness-probe.ts:135–143` の `buildDetail` に token scrubbing が実装された。truncation より前に `msg.replaceAll(tokenValue, "[REDACTED]")` を実行する順序も正しい。
- `tests/adapter/claude-code/provider-readiness-probe.test.ts` TC-015 に「SDK エラーメッセージが token 値を含む場合でも detail に現れない」ケース（line 319–333）が追加され、`[REDACTED]` への置換もアサートしている。

### 受け入れ基準評価

- **T1（変更前失敗）**: TC-001/002 — gate が `prepare()` より前に exit 1 し `setupWorkspace` 未呼び出しを確認。TC-003 破壊確認（gate 除去 → `prepare()` が呼ばれる）で load-bearing を検証。✓
- **T2（種別の区別）**: TC-004 — 4 種別が distinct message + distinct hint、hint が `PROVIDER_READINESS_HINTS` と一致。TC-005（hint-command-existence.test.ts）で `specrunner login` の実在を機械検証。✓
- **T3（一度だけ）**: TC-006 — counting probe で 1 回のみ呼び出しを固定。✓
- **T4（生エラー非露出）**: classifier 層は prescriptive first sentence + detail 分離（TC-007）。probe 層は `buildDetail` scrubbing 実装 + TC-015 probe test（token 埋め込みエラーメッセージケース）で歯化。✓
- **T5（実 token 不要）**: 全新規テストが injected fake のみ使用。`resume.test.ts` が `createClaudeProviderReadinessProbe` を vi.mock でオーバーライド。attach-resume e2e も ready probe を注入。✓
- **T6（managed 不変）**: `ManagedRuntime.assertProviderReadiness` は no-op（TC-009 確認）。managed 既存テストに変更なし。✓
- **T7**: verification-result.md — build / typecheck / test / lint / changed-line-coverage 全フェーズ passed。✓

### 設計適合性

- **D1（配置）**: `execute()` 冒頭の `if (this.runtime.assertProviderReadiness)` ガードが `prepare()` より前に発火。run/resume 両経路をカバー。✓
- **D2（mechanism）**: live probe 方式。`maxTurns:1`・`allowedTools:[]`・wall-clock timeout・early abort のコスト制限が実装されている。✓
- **D3（injectable seam）**: `RuntimeStrategy` では optional、`RealRuntimeStrategy` では required、`LocalRuntimeOptions.providerReadinessProbe` で注入可能。`assertNoDuplicateLiveJob` パターンの正確な踏襲。✓
- **D4（message shape）**: prescriptive first sentence と PROVIDER_READINESS_HINTS の 4 エントリが種別ごとに distinct。`describeGitFetchFailure` パターンを忠実に実装。✓
- **D5（error surfacing）**: `logError` + `stderrWrite("Hint: ...")` → `return 1`。`RunResultContract` JSON は emit されない（TC-016 確認）。✓

### アーキテクチャ

- `src/core/port/provider-readiness.ts` は adapter/ / core/runtime/ への back-edge なし（TC-010 確認）。✓
- `runner.ts` の `process.env` 直渡しは B-6 allowlist に `B6-runner-readiness-port-call` として登録済み。コメントも適切（adapter 側が `stripSecrets` を呼ぶ）。✓
- arch-allowlist.ts は CODEOWNERS ゲート下の `ONLY shrinks` ポリシー準拠。エントリ追加に tracking ID あり。✓

### 観察事項（ブロッカーなし）

- probe model `"claude-haiku-4-5"` は固定定数。将来モデル廃止時は更新が必要だが、seam と test coverage には影響しない。
- `abortController.signal.aborted` check（catch ブロック冒頭）と `isAbortError` check（`classifyError` 内）は補完的で重複なし。timeout abort と非 timeout の AbortError が両経路とも `unreachable` に分類される設計は正しい。
