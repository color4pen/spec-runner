# Code Review Feedback — iteration 001

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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `tests/unit/core/design-layer/orchestrator-hook.test.ts` | TC-010（must）未充足: `commitArchive` をモック化しているため「fake が書いた state ファイルが feature ブランチの archive コミットに含まれる」というアサーションが存在しない。design.md D6 が「実 temp git repo」統合テストを要求している。 | 実 temp git リポジトリを使う統合テストを追加する。fake SpawnFn が `mark implemented` 呼び出し時に recordDir にファイルを書いて exit 0 を返し、`commitArchive` は実際の git を呼ぶ（またはモックせず）。テスト末に `git show --name-only HEAD` を実行し、当該ファイルがコミットに含まれることをアサートする。 | yes |
| 2 | medium | correctness | `src/core/design-layer/mark-hook.ts:82` + `src/core/archive/orchestrator.ts:297` | `unknown-slug`（exit 1）時に全く同一の警告文字列が 2 回 stderr に出力される。`mark-hook.ts` が `stderrWrite` を呼んだ後、orchestrator も同じメッセージを `stderrWrite` する。 | `mark-hook.ts` の `stderrWrite(...)` 呼び出し（exit 1 分岐、行 82–85）を削除し、orchestrator 側に一元化する。対応するユニットテスト（TC-HOOK-003）の「stderrWrite が呼ばれる」アサーションも削除する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.35

## Summary

実装の骨格は設計判断（architect 決定）に忠実で、opt-in 設計・provider-agnostic 命名・exit code ルーティング・no-op 無効パスの保全はすべて正しく実装されている。verification（build/typecheck/test 5733 件/lint）も全 green。

2 件の指摘を修正して再提出を求める。

**F-01（high）** TC-010 の「コミットに含まれる」アサーションが missing。must 受け入れ基準の核心部分（archive コミットへのファイル包含）は、現行テストでは mock により確認されていない。実 git repo を使う統合テストを追加する必要がある。

**F-02（medium）** exit 1 時の警告が `mark-hook.ts` と `orchestrator.ts` の両方から同一文字列で出力される。`MarkHookResult` の設計意図（呼び出し元が副作用を決める）と矛盾しており、ユーザーに重複メッセージを見せる。hook 側の `stderrWrite` 呼び出しを削除して orchestrator 側に一元化する。

