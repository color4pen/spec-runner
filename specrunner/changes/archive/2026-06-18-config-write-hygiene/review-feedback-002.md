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

_No findings._

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 10 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.90

## Summary

Iteration 1 の 3 件の指摘がすべて解消された。

**Finding 1（TC-001/TC-002 unit テスト欠落）**: `tests/config/store.test.ts` に `describe("saveConfig")` ブロックが追加され、TC-001（GHES host config が保持される）・TC-002（legacy `agent`/`timeout`/`anthropic` が strip される）の両 must ケースが実装された。

**Finding 2（login.ts の存在チェック手法の不整合）**: `login.ts` の scaffold 判定が `loadConfig()` try/catch から `fs.access(configPath)` に切り替えられ、`init.ts` と同一の手法に統一された。malformed config を scaffold で上書きするエッジケースが解消された。

**Finding 3（冗長な loadConfig 呼び出し）**: scaffold セクションが `fs.access` 単体のロジックになったことで scaffold 目的の `loadConfig()` は消滅。`loadConfig()` は GitHub host 解決（line 60 の best-effort call）のみで残り、冗長性はない。

### 受け入れ基準の確認

| 基準 | 確認結果 |
|------|----------|
| GHES host 設定が init/login 実行後に保持される | ✅ T-01 で `delete toSave["github"]` 除去、T-02/T-03 で round-trip 廃止 |
| 既存 config がある状態で init を実行してもファイルが書き換わらない | ✅ `fs.access` チェック → configExists=true → loadConfig/saveConfig をスキップ |
| 既存 config がある状態で login を実行しても config が書き換わらない | ✅ `fs.access` チェック → scaffold をスキップ、token は credentials.json のみ |
| config が存在しない状態で init/login を実行すると scaffold が生成される | ✅ `!configExists` / catch ブランチで従来の scaffold ロジックを実行 |
| typecheck && test が green | ✅ verification-result.md で全フェーズ passed |

### テストカバレッジ

| TC | 優先度 | カバー状況 |
|----|--------|-----------|
| TC-001 GHES config survives saveConfig | must | ✅ `tests/config/store.test.ts` |
| TC-002 Legacy fields are still stripped | must | ✅ `tests/config/store.test.ts` |
| TC-003 First-time init creates global config | must | ✅ `tests/init.test.ts` ("creates a config file with version:1") |
| TC-004 Repeated init does not overwrite | must | ✅ `tests/init.test.ts` ("2 回目実行後も config.json のコンテンツが変わらない") |
| TC-005 Project scaffold is created regardless | should | ✅ `tests/init.test.ts` ("config が存在する場合でも project scaffold は作成される") |
| TC-006 login with no existing config creates scaffold | must | ✅ TC-LOGIN-015 |
| TC-007 login with existing config preserves it | must | ✅ TC-LOGIN-014 |
| TC-008 Stale comment is absent | could/manual | ✅ "without github field" はコード上で消滅確認 |
| TC-009 login — config 存在時に saveConfig 非呼出 | should | ✅ TC-LOGIN-014 |
| TC-010 login — config 非存在時に saveConfig 呼出 | should | ✅ TC-LOGIN-015 |
| TC-011 managed setup regression | should | managed.ts は変更なし・既存 managed tests pass でリグレッションなし |

must 6/6・should 4/4 をテストでカバー。TC-011（should/integration）は対象コードが scope 外（managed.ts 不変）のため新規テスト不要。
