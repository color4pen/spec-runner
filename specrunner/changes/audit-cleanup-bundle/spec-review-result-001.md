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
| 1 | LOW | test-design | `tasks.md` T-01 | TC-CLG-GATE-ROOT-01 の記述が "spawn 引数に vi.fn() ラッパを注入し" となっているが、`RunGateOptions.spawn` は git 操作用 (`SpawnFn`) であり coverage コマンド実行の `spawnCommand` (commands.ts) とは別物。この記述どおりに実装すると、coverage コマンドの PATH には root が渡っているか検証できない偽陽性テストになる。受け入れ基準「coverage command の spawn に root が渡されることをテストで固定する」は明確なので実装上は問題ないが、タスク記述の `spawn` が指す対象を明確にするとよい。 | 実装者は `vi.mock("../../../../src/core/verification/commands.js")` で `spawnCommand` をモックして4番目引数 `root` を検証するか、coverage コマンドに `"printenv PATH"` 等を使ってプロセス出力で検証する。タスク記述の "spawn 引数" の意味は実装判断で問題なし。 |
| 2 | LOW | spec | `design.md` D4 | `configLoadError.includes("project local config")` によるエラーメッセージ文字列マッチングは、`parseAndMigrate` のラベル文字列（`store.ts`）と暗黙の契約を持つ。設計書はこのリスクを承知で採用しており、最小スコープとして妥当。ただし、バリデーションエラー（`validateAndWrap` 由来）はラベルを持たないため `loadErrorPath` が `undefined` のままになり、従来どおり user-global を案内する。これは非回帰だが動作として記録しておく。 | 現状維持でよい。将来的に `parseAndMigrate` ラベルを変更する場合は `doctor.ts` の文字列定数と同時変更すること。 |

## 検証サマリ

5 件の不具合はすべて実際のコードで確認済み:

1. **root 未渡し** — `changed-line-coverage.ts:210-214` で `spawnCommand(commandStr, cwd, env)` が第 4 引数なし。`runner.ts:373` は root を渡している（不一致確認）
2. **reason/message 混在** — `evaluateChangedLineCoverage` の threshold branch（lines 119-130）で `reason: "unexecuted"` を使用。stdout 生成（lines 145-151）も `"unexecuted"` と `"not-loaded"` の 2 分岐のみ（`"below-threshold"` なし）
3. **ADR 例 config 不整合** — ADR line 57 に `"minChangedLineCoverage": 0`。schema（`schema.ts:887`）は `gt(0)` で 0 を拒否するため validation エラーになる
4. **doctor hint 誤案内** — `file-exists.ts:22` が `configPath`（常に `homeDir/.config/specrunner/config.json`）をハードコード。project-local 読み込み失敗時も user-global を案内する
5a. **TC-032 mock 無効** — `vi.mock("../../../src/cli/ps.js")` は `runPs` 内部の `checkPrMerged` 束縛に介在しない。assertion も `not.toContain` の消極形のみ（コメント自認）
5b. **T-PMI-01 同語反復** — `expect(FAKE_ESCALATION).toContain("MERGED")` はテスト内定数を assert する同語反復（実装出力を検証していない）

設計判断（D1–D5）はいずれも適切。型拡張（`FailReason`）は switch exhaustiveness チェックで回帰を検出可能。セキュリティ観点（OWASP Top 10）: 今回変更はすべて CLI 内部（developer tool）でネットワーク入力・認証・データストアへの影響なし。doctor hint にファイルパスが露出するが、これは元々 configPath として露出しており変化なし。
