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

## Summary

request → design → spec → tasks の一貫性は高い。受け入れ基準がすべて具体的な実装パス（D1–D5 / T-01–T-04）に対応しており、セキュリティ上の修正意図と実装スコープのバランスが取れている。request-review の finding #1・#2 はいずれも design / tasks で対処済み。

## Coherence

| 層 | 評価 | 備考 |
|----|------|------|
| request → design | ✅ | 要件 1–4 が D1–D5 に対応。request-review finding #1 → D3 共有述語、finding #2 → Non-Goals + tasks 禁止事項で対処 |
| design → spec | ✅ | D4 の「B-6 grep 歯無変更」が spec §4 の MUST NOT に落とされ、受け入れ基準が機械検証可能な形で固定されている |
| spec → tasks | ✅ | TC-OSQ-ENV-01/02/03 が各 Scenario を網羅。既存 TC-* と名前空間が分離されている |

## Security review

**問題の実在性**
`query-one-shot.ts:130-141`（コード確認済み）に `env` キーが無く、SDK が `process.env`（`GH_TOKEN`・`ANTHROPIC_API_KEY` 等を含みうる）を無条件継承する構造的な穴が存在する。現状の唯一の呼び出し元は `allowedTools: []` で走るが、デフォルト `allowedTools: ["Read", "Bash", "Grep", "Glob"]` が `bypassPermissions` と組み合わさる将来の呼び出し元では env 経由の credential 参照が顕在化しうる。修正の必要性は妥当。

**修正方式の妥当性**
`env: stripSecrets(process.env as Record<string, string | undefined>)` をインラインで渡す（D1）。中間変数 `const sdkEnv` を持たないことで `CLAUDE_CODE_OAUTH_TOKEN` 注入ブロックのコピーペースト混入を構造的に防ぐ設計は適切。`agent-runner.ts` の参照実装と同一 seam を使うため経路が統一される。

**既存 B-6 grep 歯への影響**
新しい行は `process.env` と `stripSecrets` を両方含む。`core-invariants.test.ts:356` の `!m.content.includes("stripSecrets")` フィルタに自動除外されるため新規 violation は生じない。`arch-allowlist.ts` の追記も不要。コードで確認済み。

**behavioral 捕捉の適切性**
env-omission はキーの「不在」であり grep では頑健に検出できない。注入 `queryFn` で `options.env` を直接捕捉し `toEqual(stripSecrets(process.env))` で固定する方式は偽陰性がなく、env を消せば `undefined` として即 red になる。

**`envOmissionViolations` 述語のカバレッジ**
述語は `SECRET_DENYLIST` のみを対象とし、パターンマッチ除去（`*_TOKEN` 等）はカバーしない。ただし TC-OSQ-ENV-01 の `toEqual(stripSecrets(process.env))` が完全な strip 結果と比較するため、パターン除去済みキーの混入も実挙動テストで検出される。述語と `toEqual` テストが相補的に機能する設計として問題ない。

**CLAUDE_CODE_OAUTH_TOKEN 混入防止**
Non-Goals・D1・tasks 禁止事項の三箇所で明示されており、実装者が意図を見落とすリスクは低い。

## Implementation risk

スコープは 2 ファイル（`src/adapter/claude-code/query-one-shot.ts` に import 1 行 + options 1 property、`tests/unit/adapter/claude-code/query-one-shot.test.ts` に述語関数 + 3 テスト）に限定。CODEOWNERS ゲート下ファイル（`core-invariants.test.ts` / `arch-allowlist.ts` / `architecture/**`）は無変更。TC-SB-05・TC-FW-07 は特定キーの有無のみを検査するため `env` キー追加の影響を受けない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Robustness | tasks.md T-02 | `PATH` が存在しない CI 環境で TC-OSQ-ENV-02 が不安定になりうる | 設計が言及する「制御された非 secret マーカーキー」方式（例 `SPECRUNNER_TEST_NONSECRET=1` を明示設定してその保持を assert）を実装者が採用すれば解決。task 記載の通りで対応可能 |
