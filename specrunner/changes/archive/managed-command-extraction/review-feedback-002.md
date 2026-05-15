# Review Feedback: managed-command-extraction

- **iteration**: 2
- **verdict**: needs-fix

## Summary

iteration 1 の MAJOR / MINOR 指摘は全て解消されている。

- ✅ **MAJOR fix**: `bin/specrunner.ts` の親コマンドエラーメッセージが `${command}` を動的に使うよう修正済み
- ✅ **MAJOR fix**: `tests/unit/cli/managed.test.ts` が 341 行・12 件に拡充（TC-MS-002/004/005、TC-MST-001、TC-MR-002/003/004/007 を含む全 must カバー）
- ✅ **MINOR fix**: stale な `'Run 'specrunner init''` ヒントが `getAgentId.ts`、`store.ts`、`agent-runner.ts` で `'specrunner managed setup'` に更新済み
- ✅ **MINOR fix**: `saveConfig` (store.ts:98) が `anthropic` フィールドを一元的に strip するよう修正済み

ただし以下の 2 点が未対応のまま残っており、どちらも `must` 優先の受け入れ基準・test-cases.md 要件を満たしていない。

## Findings

### ERROR: TC-DR-006 — doctor の managedChecks に provider 側 API 検証がない

- **file**: `src/core/doctor/checks/agents/agents-registered.ts`、`src/core/doctor/checks/agents/environment-registered.ts`
- **severity**: error
- **test-case**: TC-DR-006 (must)
- **issue**: delta-spec.md L128-129 は `managedChecks` の説明として「agents / environment の **provider 側生存**」を明示する。request.md 受け入れ基準も「active provider の API 経由で agent ID / environment ID を検証する」と規定している。しかし現実装では `agentsRegisteredCheck` と `environmentRegisteredCheck` は config のフィールド存在確認に留まり、Anthropic API へのアクセスを行わない。`anthropicKeyValidCheck` が `GET /v1/models` で疎通確認をするのと同水準の重い検証（`beta.agents.retrieve(agentId)` / `beta.environments.retrieve(envId)` 相当）が欠けている。
- **root cause**: design.md D10 が `agentsRegisteredCheck` / `environmentRegisteredCheck` に「hint を 'managed setup' に書き換え」とだけ指示し、新規 provider-side check の追加手順を記載しなかった設計記述の不足。実装は design.md の文言に忠実だが、delta-spec.md / test-cases.md との間に gap が生じた。
- **suggestion**: `managedChecks` に新規 check (例: `agentProviderAliveCheck`、`environmentProviderAliveCheck`) を追加するか、既存 check を拡張して config に登録された `agentId` / `environment.id` に対して `ctx.fetch` 経由で `GET /v1/beta/agents/{id}` / `GET /v1/beta/environments/{id}` を呼び出す。401 / 404 / timeout は `anthropicKeyValidCheck` と同じハンドリングパターンを踏襲する。`DoctorContext.env["SPECRUNNER_API_KEY"]` が未設定なら skip 相当の warn を返す。

---

### ERROR: TC-MR-006 / TC-HELP-004 — `managed reset --help` が未実装

- **file**: `src/cli/command-registry.ts`（reset subcommand 定義）
- **severity**: error
- **test-case**: TC-MR-006 (must)、TC-HELP-004 (must)
- **issue**: `reset` サブコマンドに `--help` フラグも `usage` フィールドも定義されていない。`specrunner managed reset --help` を実行すると `bin/specrunner.ts` の subcommand dispatch が `FlagParseError`（unknown flag）で exit 2 する。request.md 受け入れ基準は「`managed reset --help` に agent は Anthropic 側に orphan として残る旨を明記する」と規定し、test-cases.md TC-MR-006 / TC-HELP-004 はどちらも must 優先。orphan 警告は成功パスの stdout には出力されるが (TC-MR-004 は ✅)、help text には出ていない。
- **suggestion**: `finish` コマンドと同じパターン（`help: { type: "boolean" }` フラグ + handler 内での `if (parsed.flags["help"])` 分岐）を reset subcommand に追加するか、`ParentCommandDef` のサブコマンドに `usage?: string` フィールドを追加してサブコマンドディスパッチ内で `--help` を処理する。help テキスト例:
  ```
  Usage: specrunner managed reset [--force]

  Delete the Anthropic Environment from the provider and clear managed config.

  Note: Anthropic-side agent resources are NOT deleted (no agent delete API available)
        and remain as orphans on the provider side.

  Options:
    --force   Skip confirmation prompt
  ```

---

### INFO: DoctorConfig JSDoc の example が旧 field 名を参照したまま

- **file**: `src/core/doctor/types.ts:110`
- **severity**: info
- **issue**: iteration 1 から引き継ぎ。`DoctorConfig.get()` の JSDoc コメントが `e.g. "anthropic.apiKey"` のままで、schema から削除済みの field を例示している。
- **suggestion**: `e.g. "github.accessToken"` または `"agents.design.agentId"` に置換する（1 行修正）。

---

## Iteration 1 との差分サマリ

| Finding (iter 1) | Status |
|------------------|--------|
| MAJOR: bin subcommand エラーメッセージ hardcode | ✅ fixed |
| MAJOR: managed.test.ts テスト不足 | ✅ fixed |
| MINOR: stale `init` ヒント残存 | ✅ fixed |
| MINOR: anthropic フィールド strip 漏れ | ✅ fixed |
| INFO: DoctorConfig JSDoc | 未修正（本 feedback に再掲） |

| Finding (iter 2) | Verdict impact |
|------------------|---------------|
| ERROR: TC-DR-006 provider-side doctor check 欠如 | needs-fix |
| ERROR: TC-MR-006 managed reset --help 未実装 | needs-fix |
| INFO: DoctorConfig JSDoc | approved 阻害なし |
