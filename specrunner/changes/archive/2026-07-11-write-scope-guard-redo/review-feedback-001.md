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

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/adapter/claude-code/agent-runner.ts` | follow-up retry ループのコメント "Remove MCP server from retry options" が、実際には `delete` を行っていない実装と矛盾している。postWork / outputVerification では正しく `delete` しているため、読者が誤解するリスクがある。 | コメントを「mcpServers はそのまま残す — retry turn で agent が report_result を呼べるようにする」旨に修正する。 | no |
| 2 | low | testing | `scripts/probes/write-scope-guard-probe.ts` | scenario 3 の verdict 出力行で `canUseTool=not-consulted` がハードコードされており、canUseTool が実際に MCP ツールに対して呼ばれなかったことは計測していない。PASS 判定は `handlerInvoked=true` のみに依存している。 | 証拠の完全性としては許容範囲内。probe を拡張する場合は、MCP ツール呼び出し時も `record.fired` を更新するよう `makeTrackedGuard` を修正する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.85

## Summary

### 受け入れ基準チェック

| AC | 内容 | 結果 |
|----|------|------|
| AC1 | workspace 外 Edit/Write → deny を canUseTool 単体テストで固定 | ✅ TC-FW-01, TC-FW-02 |
| AC2 | workspace 内 Edit/Write・他 tool → allow を単体テストで固定 | ✅ TC-FW-03, TC-FW-04 |
| AC3 | allowedTools に Edit/Write 非含有、reportTool 構成時 MCP 名含有、permissionMode "default" を凍結 | ✅ TC-FW-06, TC-FW-07, TC-023 更新 |
| AC4 | probe スクリプト存在・design.md に実行生ログ（3 シナリオ PASS）記録 | ✅ |
| AC5 | cross-boundary-invariants paths に `src/adapter/**` 追加 | ✅ |
| AC6 | one-shot 系既存凍結テスト無変更で green | ✅ 6430/6430 |
| AC7 | TC-023 更新は permissionMode 1 行のみ（原文） | ⚠️ 2 行変更・design.md §D7 で正当化済み |
| AC8 | `typecheck && test` green | ✅ 全フェーズ green |

### AC7 逸脱について

AC7 原文は「permissionMode assertion 1 行のみ更新」だが、実際には `allowedTools` の assertion も更新が必要で 2 行変更になった。設計文書 §D7 がこれを明示的に認定・説明している（「allowedTools 行を見落としていた。正直な最小修正は 2 行」）。追加の `TC-FW-*` テスト群が新 contract を独立して固定しており、paper-over にはあたらない。逸脱は正当・透明であり、ブロッカーではない。

### 核心の評価

前回失敗（#766）の二重欠陥 —（a）`dontAsk` による report_result deny、（b）allowedTools への Edit/Write 残留による guard 不発火 — は、実測済み SDK 挙動に基づいた設計で両方とも解消されている。`permissionMode: "default"` への切り替え・allowedTools から Edit/Write を除外・MCP ツール pre-approve・`allowUnsandboxedCommands: false` は仕様の要件を正確に実装している。probe の実行ログが evidence として repo に残り、同種の失敗再発を抑制する構造が確立された。
