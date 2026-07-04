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
| 1 | high | testing | tests/unit/core/runtime/local.test.ts | TC-025/TC-026 未カバー: LocalRuntime の統合ワイヤリングを検証するテストがない。`workspaceSetup=["uv sync"]` 注入時に manager.create の末尾 plan が `{ kind:"commands" }` になること（TC-025）、`workspaceSetup` 未注入＋痕跡あり時に `{ kind:"detect-install" }` になること（TC-026）が test-cases.md で must と定義されているが実装されていない | manager mock を注入した LocalRuntime テストを local.test.ts に追加し、`create` 呼び出しの末尾引数（plan）を assert する | yes |
| 2 | high | testing | tests/core/worktree/manager.test.ts | TC-002 未カバー: 複数コマンドの fail-fast（cmd1 失敗→cmd2 が spawn されない）を検証するテストがない。test-cases.md で must と定義されている | plan.commands に 2 件設定し cmd1 が exit 1 を返すケースで `sh -c cmd2` が呼ばれないことを assert するテストを追加する | yes |
| 3 | high | testing | tests/unit/core/runtime/ または tests/unit/core/runtime/factory.test.ts | TC-028 未カバー: `createRuntime(config, ...)` で `config.workspace.setup` が `LocalRuntime.workspaceSetup` に配線されることを検証するテストがない。test-cases.md で must と定義されている | factory 呼び出しテストを追加し、config に `workspace.setup=["uv sync"]` を含む場合に LocalRuntime が正しい `workspaceSetup` を持つことを確認する（setupWorkspace 経由で manager.create の plan を観察する形でも可） | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.60

## Summary

実装の品質は高い。`WorkspaceSetupPlan` union による責務分離、`detect-install` デフォルトによる後方互換、`cleanupWorktree` ヘルパーの共有集約、`VerificationCommand = ShellCommand` alias の維持、すべて設計 D1–D6 に忠実。verification (build / typecheck / test / lint) も全 green。

ブロッカーはテスト契約の未達成のみ。F-1/F-2/F-3 はいずれも test-cases.md が `must` と定義した coverage 要件であり、実装変更なしにテストコード追加だけで解消できる。実装のバグは見当たらない。

### Non-blocking observations

- **`resolveSetupPlan()` が毎呼び出し FS 読み**: recreate / null-resume / run の 3 経路ごとに `existsSync` を最大 6 回実行する。実用上は無視できるが、constructor で 1 回キャッシュする設計も選択肢。今 request スコープ外。
- **`npm install failed` メッセージ**: `npm ci` 失敗時に `"npm install failed"` と表示される。`installCmd = "npm"` に固定文字列を結合する pre-existing 動作で今 request の問題ではない。
