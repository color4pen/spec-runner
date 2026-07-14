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
| 1 | LOW | Test Coverage | tasks.md / T-07 | TC-FCA-09 の valid ケース更新（git 実リポジトリを tempdir で構築）は実装が非自明。既存テストが fail した場合に「更新不足」と「実装バグ」の切り分けが遅延するリスク。 | 先に T-07 を実装してテストが red になることを確認してから T-01〜T-06 を実装する TDD 順序を採用すると原因切り分けが容易。受け入れ基準には影響しない。 |
| 2 | LOW | Observability | design.md / D5 | D5 残余（uncommitted working-tree 変化は捕捉しない）は design.md に明記されているが、stale directive テキスト（T-06）にはこの残余が反映されない。design は「source revision 変化」を stale 理由として表示するが、「uncommitted 変化は対象外」は agent には伝わらない。 | T-06 のテキスト更新で「commit 済み source 変化」と明示するか、design-system の attestation guidance に注記を加えることで agent の誤解を防げる。任意改善であり非ブロッキング。 |

## 評価サマリ

### 技術正当性

**D1（source-scoped revision）** は設計上の核心。`git rev-list -1 HEAD -- . ':(exclude)specrunner/changes'` により、pipeline の metadata commit（`specrunner/changes/` のみ変更）を跨いでも値が安定する一方、実 source commit には反応する。design.md に実測値（`407fa8b93` vs `90179c532`）が示されており、推測ではなく観測に基づく判断である。

**fail-safe の方向性**は一貫している。欠落・null・不一致はすべて stale（verify-all）に倒れ、valid の方向には緩まない。旧 attestation（`sourceRevision` 無し）を stale 扱いにする後方互換設計も正しい。

**call site 分析**: `evaluateFactCheckAttestation` の生産コード呼び出しは `src/core/step/design.ts:121` のみ。テスト側は T-07 で網羅的に更新対象が列挙されており、漏れなし。

### セキュリティ

- **Injection**: `sourceRevision` は `gitExec` が返す trimmed sha（hex 文字列）。ユーザー制御入力なし。message への埋め込み・JSON 比較のいずれにも injection 経路なし。
- **pathspec**: `:(exclude)specrunner/changes` は `changesDirRel()` 定数由来で固定。外部入力なし。
- **fail-safe 方向**: 取得失敗は stale（再検証増加）方向のみ。false-valid は発生しない。
- OWASP Top 10 該当なし（CLI ツール、web 非公開、認証変更なし）。

### 仕様の整合性

request.md・design.md・tasks.md・spec.md の 4 文書間に矛盾なし。受け入れ基準 1–5 は spec.md のシナリオと tasks.md の AC に 1-1 で対応している。`typecheck && test` が最終ゲートとして正しく設定されている。
