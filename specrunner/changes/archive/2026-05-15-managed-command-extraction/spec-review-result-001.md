# Spec Review Result: managed-command-extraction

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-15
- **verdict**: approved

## Summary

request.md / design.md / tasks.md / delta-spec.md の 4 ファイルを既存コードベースと照合しレビューした。全体の品質は高く、コードベースへの参照（ファイル・行番号・SDK 型）は全て正確。設計判断は一貫しており、セキュリティ改善（API key の config → env var 移行）は適切。ブロッキング issue なし。

## Verification Results

### Codebase claims — 全て正確

| Claim | Status |
|-------|--------|
| `AnthropicConfig` interface at schema.ts L47-49 | ✅ |
| `SpecRunnerConfig.anthropic` at L102 | ✅ |
| `RawConfig.anthropic?` at L142 | ✅ |
| D7 comment at L95 | ✅ |
| `checkConfigComplete` managed checks at L360-373 | ✅ |
| `validateConfig` apiKey check at L192-203 | ✅ |
| OpenAI rejection at L337-342 | ✅ |
| `migrate.ts` L112-113 runtime default `"managed"` | ✅ |
| `migrate.ts` L117-125 anthropic construction | ✅ |
| `config.anthropic.apiKey` in rm.ts:58, run.ts:48, bootstrap.ts:35 | ✅ |
| `beta.environments.delete` exists in SDK types | ✅ |
| `beta.agents` has no `delete` method (only archive) | ✅ |
| `DoctorContext` has `env: Record<string, string \| undefined>` | ✅ |

### Design coherence

- request → design の要件マッピングは完全（D1-D11 が要件 1-11 をカバー）
- design → tasks のマッピングも完全（Phase 1-9 が D1-D11 を実装順に再配置）
- tasks の依存グラフは正しく、Phase 1（型の土台）→ Phase 9（green 確認）の直列化が適切
- delta-spec の MODIFY / ADD は既存 spec の該当要件を正しく特定している

### Security review

| Concern | Assessment |
|---------|------------|
| API key storage | **改善**: config file → env var。`managed status` は存在有無のみ表示、値は非表示 |
| 0600 permission warning | 維持（`github.accessToken` が残るため適切） |
| env var leakage (child process) | CLI ツールとして許容範囲。env var は shell session に閉じる |
| `SPECRUNNER_API_KEY` format validation | SDK に委譲（適切 — CLI 側で独自 format check をする理由がない） |
| Input validation on `managed reset` | `--force` or confirmation prompt で保護 |
| OWASP Top 10 | CLI ツールのため web attack surface なし。該当項目なし |

## Advisory Notes

### A1: delta-spec のサブコマンド数

delta-spec の MODIFY:

> `specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor`、`finish`、`managed` の 7 サブコマンドを提供する

現在の `command-registry.ts` には `rm`、`resume`、`request` (parent) も登録されている。これは**既存 spec の gap を継承**している（base spec も "6 つ" と記載し rm/resume/request を含めていない）。本 change のスコープでは managed の追加のみが責務なので blocking にはしないが、cli-command-hierarchy change でサブコマンド数を正規化する際に合わせて修正すべき。

### A2: `checkRuntimePrereqs` の agent チェック範囲

request.md: 「必須 step の `agents.<step>.agentId` の揃い」（複数形）
design.md D9: `requiredSteps = ["design"] as const`（design のみ）

`managed setup` が `AgentSyncer.syncAll()` で全 agent を一括作成するため、design だけチェックすれば「setup 未実行」を検知できるという判断は合理的。ただし request の文言とは乖離がある。実装時にコメントで「setup は全 agent を一括作成するため、design の存在で setup 実行済みを代表チェック」と意図を明記することを推奨。

### A3: `managed reset` の environment 404 ハンドリング

Environment が Anthropic 側で既に削除されている場合、`beta.environments.delete(id)` が 404 を返す可能性がある。reset は「idempotent に clean state にする」コマンドなので、404 は成功扱いにするのが自然。design/tasks では明示されていないが、実装時に 404 → warn + continue のハンドリングを入れることを推奨。

### A4: `managed setup` rollback テストの不足

tasks.md Task 8.2 の `runManagedSetup` テストケースに rollback シナリオ（Environment 作成失敗 → agent archive）が列挙されていない。request の受け入れ基準には「Environment 作成失敗時の rollback」がある。実装時にテストケースを追加すべき。

## Conclusion

設計は堅実で、既存コードベースとの整合性が取れている。`SPECRUNNER_API_KEY` による provider-agnostic な key 管理、idempotent reconciliation モデル、`checkRuntimePrereqs` による責務分離はいずれも適切な判断。Advisory notes は実装フェーズで対応可能な範囲に留まる。
